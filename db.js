const { Pool, types } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure PostgreSQL NUMERIC/DECIMAL types (OID 1700) parse as JS floats
types.setTypeParser(1700, parseFloat);

let pgPool = null;
let sqliteDb = null;
let isPg = false;

/**
 * Custom Error class for Database exceptions.
 */
class DatabaseError extends Error {
  constructor(message, originalError = null, queryText = '') {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
    this.queryText = queryText;
  }
}

/**
 * Generates a unique alphanumeric public ID (e.g., GW4K2, VND9A).
 * Omits ambiguous characters (I, O, 0, 1).
 */
function genPublicId(length = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < length; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/**
 * Returns current database dialect.
 */
function getDbType() {
  return isPg ? 'postgres' : 'sqlite';
}

/**
 * Initializes Database connection with pooling, fallback mechanisms, and indexes.
 */
async function initDb() {
  const pgConnectionString = process.env.DATABASE_URL || process.env.PG_URI;
  const pgHost = process.env.PGHOST;

  const usePostgres = process.env.USE_POSTGRES === 'true' || Boolean(pgConnectionString) || Boolean(pgHost);

  if (usePostgres) {
    try {
      const isCloudOrRender = pgConnectionString && (
        pgConnectionString.includes('render.com') ||
        pgConnectionString.includes('sslmode=require') ||
        process.env.PGSSL === 'true' ||
        process.env.NODE_ENV === 'production'
      );

      const sslOption = isCloudOrRender ? { rejectUnauthorized: false } : undefined;

      const poolConfig = pgConnectionString
        ? {
            connectionString: pgConnectionString,
            ssl: sslOption,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
          }
        : {
            host: process.env.PGHOST || 'localhost',
            port: parseInt(process.env.PGPORT || '5432', 10),
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD || 'postgres',
            database: process.env.PGDATABASE || 'digilocal',
            ssl: sslOption,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
          };

      pgPool = new Pool(poolConfig);

      // Handle background client errors cleanly
      pgPool.on('error', (err) => {
        console.error('[PostgreSQL Pool Error] Unexpected error on idle client:', err.message);
      });

      // Test connection
      const client = await pgPool.connect();
      client.release();
      isPg = true;
      console.log('[Database] Connected to PostgreSQL successfully (Pool max: 20).');
      await setupTablesPg();
      await createIndexes();
      return;
    } catch (err) {
      console.warn('[Database] PostgreSQL connection failed, falling back to SQLite:', err.message);
    }
  }

  // Fallback SQLite setup
  const dbPath = path.join(__dirname, 'digilocal.sqlite');
  sqliteDb = new sqlite3.Database(dbPath);
  isPg = false;

  // Enable Foreign Keys in SQLite
  await new Promise((resolve, reject) => {
    sqliteDb.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) {
        console.error('[Database Error] Failed to enable SQLite foreign keys:', err.message);
        return reject(err);
      }
      resolve();
    });
  });

  console.log('Connected to SQLite database successfully.');

  await setupTablesSqlite();
  await createIndexes();
}

/**
 * Unified database query execution wrapper returning Promise<{ rows, rowCount, insertId }>.
 */
function query(sqlText, params = []) {
  return new Promise((resolve, reject) => {
    if (isPg && pgPool) {
      // Convert ? placeholders to $1, $2, ... for PostgreSQL
      let paramCount = 0;
      let pgSql = sqlText.replace(/\?/g, () => `$${++paramCount}`);

      // Automatically append RETURNING * for PostgreSQL INSERT queries if not present
      const trimmed = pgSql.trim();
      if (/^INSERT\s+INTO/i.test(trimmed) && !/RETURNING/i.test(trimmed)) {
        pgSql += ' RETURNING *';
      }

      pgPool.query(pgSql, params, (err, result) => {
        if (err) {
          console.error('[DB Query Error - PostgreSQL]:', err.message, '| Query:', sqlText);
          return reject(new DatabaseError('PostgreSQL query execution failed', err, sqlText));
        }
        const firstRow = result.rows && result.rows[0] ? result.rows[0] : null;
        const insertedId = firstRow ? (
          firstRow.society_id || firstRow.vendor_id || firstRow.customer_id ||
          firstRow.order_id || firstRow.item_id || firstRow.subscription_id ||
          firstRow.payment_id || firstRow.id || null
        ) : null;

        resolve({
          rows: result.rows || [],
          rowCount: result.rowCount || 0,
          insertId: insertedId
        });
      });
    } else {
      // SQLite execution
      if (!sqliteDb) {
        return reject(new DatabaseError('SQLite database instance is not initialized'));
      }
      const trimmed = sqlText.trim().toUpperCase();
      if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('WITH') || trimmed.startsWith('EXPLAIN')) {
        sqliteDb.all(sqlText, params, (err, rows) => {
          if (err) {
            console.error('[DB Query Error - SQLite]:', err.message, '| Query:', sqlText);
            return reject(new DatabaseError('SQLite query execution failed', err, sqlText));
          }
          resolve({ rows: rows || [], rowCount: (rows || []).length, insertId: null });
        });
      } else {
        sqliteDb.run(sqlText, params, function (err) {
          if (err) {
            console.error('[DB Query Error - SQLite]:', err.message, '| Query:', sqlText);
            return reject(new DatabaseError('SQLite execution failed', err, sqlText));
          }
          resolve({ rows: [], rowCount: this.changes || 0, insertId: this.lastID || null });
        });
      }
    }
  });
}

/**
 * Helper to execute multiple operations within an ACID transaction.
 * @param {Function} callback - Async function receiving (txQuery)
 */
async function withTransaction(callback) {
  if (isPg && pgPool) {
    const client = await pgPool.connect();
    const txQuery = (sqlText, params = []) => {
      return new Promise((resolve, reject) => {
        let paramCount = 0;
        let pgSql = sqlText.replace(/\?/g, () => `$${++paramCount}`);

        // Automatically append RETURNING * for PostgreSQL INSERT queries if not present
        const trimmed = pgSql.trim();
        if (/^INSERT\s+INTO/i.test(trimmed) && !/RETURNING/i.test(trimmed)) {
          pgSql += ' RETURNING *';
        }

        client.query(pgSql, params, (err, result) => {
          if (err) return reject(new DatabaseError('PG Transaction Query Failed', err, sqlText));
          const firstRow = result.rows && result.rows[0] ? result.rows[0] : null;
          const insertedId = firstRow ? (
            firstRow.society_id || firstRow.vendor_id || firstRow.customer_id ||
            firstRow.order_id || firstRow.item_id || firstRow.subscription_id ||
            firstRow.payment_id || firstRow.id || null
          ) : null;

          resolve({
            rows: result.rows || [],
            rowCount: result.rowCount || 0,
            insertId: insertedId
          });
        });
      });
    };

    try {
      await client.query('BEGIN');
      const result = await callback(txQuery);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    // SQLite Transaction
    try {
      await query('BEGIN TRANSACTION');
      const result = await callback(query);
      await query('COMMIT');
      return result;
    } catch (err) {
      try { await query('ROLLBACK'); } catch (_) { }
      throw err;
    }
  }
}

/**
 * Safely creates missing database indexes for optimized query lookup.
 */
async function createIndexes() {
  const indexQueries = [
    `CREATE INDEX IF NOT EXISTS idx_vendors_email ON vendors(email)`,
    `CREATE INDEX IF NOT EXISTS idx_vendors_society ON vendors(society_id)`,
    `CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status)`,
    `CREATE INDEX IF NOT EXISTS idx_items_vendor ON items(vendor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(vendor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
    `CREATE INDEX IF NOT EXISTS idx_subscriptions_vendor ON subscriptions(vendor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_vendor ON payments(vendor_id)`,
    `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number)`
  ];

  for (const q of indexQueries) {
    try {
      await query(q);
    } catch (err) {
      // Ignore existing index warnings across DB drivers
    }
  }
}

/**
 * Setup PostgreSQL Tables using schema.sql.
 */
async function setupTablesPg() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await pgPool.query(schemaSql);
  }

  // Safe column migration for existing PostgreSQL databases
  const columns = [
    `ALTER TABLE societies ADD COLUMN IF NOT EXISTS pincode VARCHAR(10) DEFAULT '201310'`,
    `ALTER TABLE societies ADD COLUMN IF NOT EXISTS total_flats INT DEFAULT 850`,
    `ALTER TABLE societies ADD COLUMN IF NOT EXISTS rwa_phone VARCHAR(20) DEFAULT '9876543210'`,
    `ALTER TABLE societies ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800'`,
    `ALTER TABLE societies ADD COLUMN IF NOT EXISTS banner_image TEXT DEFAULT 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200'`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS opening_time VARCHAR(20) DEFAULT '08:00 AM'`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS closing_time VARCHAR(20) DEFAULT '10:00 PM'`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS opening_timing VARCHAR(20) DEFAULT '08:00 AM'`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS closing_timing VARCHAR(20) DEFAULT '10:00 PM'`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS min_order_value DECIMAL(10,2) DEFAULT 0.00`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS max_quantity_limit INT DEFAULT 10`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS delivery_charge DECIMAL(10,2) DEFAULT 0.00`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gst_percentage DECIMAL(5,2) DEFAULT 5.00`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS service_charge_percentage DECIMAL(5,2) DEFAULT 0.00`,
    `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
    `ALTER TABLE orders ALTER COLUMN order_id TYPE VARCHAR(100) USING order_id::text`,
    `ALTER TABLE order_details ALTER COLUMN order_id TYPE VARCHAR(100) USING order_id::text`,
    `ALTER TABLE order_details ADD COLUMN IF NOT EXISTS item_name VARCHAR(255)`,
    `ALTER TABLE order_details ADD COLUMN IF NOT EXISTS price DECIMAL(10,2)`,
    `ALTER TABLE items ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS society_id INT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT`
  ];

  for (const colSql of columns) {
    try { await pgPool.query(colSql); } catch (_) { }
  }

  // Backfill public_id if missing
  const socRows = await query(`SELECT society_id FROM societies WHERE public_id IS NULL`);
  for (const r of (socRows.rows || [])) {
    let pid = genPublicId(5);
    await query(`UPDATE societies SET public_id = ? WHERE society_id = ?`, [pid, r.society_id]);
  }
  const venRows = await query(`SELECT vendor_id FROM vendors WHERE public_id IS NULL`);
  for (const r of (venRows.rows || [])) {
    let pid = genPublicId(6);
    await query(`UPDATE vendors SET public_id = ? WHERE vendor_id = ?`, [pid, r.vendor_id]);
  }

  await seedInitialData();
}

/**
 * Setup SQLite Tables with proper foreign key cascades.
 */
async function setupTablesSqlite() {
  const createTablesSql = `
    CREATE TABLE IF NOT EXISTS societies (
      society_id INTEGER PRIMARY KEY AUTOINCREMENT,
      society_name TEXT NOT NULL,
      location TEXT NOT NULL,
      pincode TEXT DEFAULT '201310',
      total_flats INTEGER DEFAULT 850,
      rwa_phone TEXT DEFAULT '9876543210',
      image_url TEXT DEFAULT 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800',
      banner_image TEXT DEFAULT 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200',
      public_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      society_id INTEGER REFERENCES societies(society_id),
      flat TEXT,
      joined_date TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vendors (
      vendor_id INTEGER PRIMARY KEY AUTOINCREMENT,
      society_id INTEGER REFERENCES societies(society_id) ON DELETE CASCADE,
      vendor_name TEXT NOT NULL,
      gst_number TEXT,
      phone_number TEXT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      password_hash TEXT,
      store_name TEXT NOT NULL,
      opening_time TEXT DEFAULT '08:00 AM',
      closing_time TEXT DEFAULT '10:00 PM',
      opening_timing TEXT DEFAULT '08:00 AM',
      closing_timing TEXT DEFAULT '10:00 PM',
      logo TEXT DEFAULT 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=200&auto=format&fit=crop&q=80',
      description TEXT DEFAULT 'Quality goods & daily essentials delivered within society via WhatsApp.',
      min_order_value REAL DEFAULT 0.00,
      max_quantity_limit INTEGER DEFAULT 10,
      delivery_charge REAL DEFAULT 0.00,
      gst_percentage REAL DEFAULT 5.00,
      service_charge_percentage REAL DEFAULT 0.00,
      status TEXT DEFAULT 'ACTIVE',
      public_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items (
      item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER REFERENCES vendors(vendor_id) ON DELETE CASCADE,
      item_name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      stock INTEGER DEFAULT 100,
      category TEXT DEFAULT 'General',
      unit TEXT DEFAULT 'piece',
      is_available INTEGER DEFAULT 1,
      in_stock INTEGER DEFAULT 1,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS catalog_items (
      item_id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER REFERENCES vendors(vendor_id) ON DELETE CASCADE,
      item_name TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT,
      description TEXT,
      image_url TEXT,
      in_stock INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      user_id TEXT,
      vendor_id INTEGER REFERENCES vendors(vendor_id) ON DELETE CASCADE,
      customer_id INTEGER,
      society_id INTEGER,
      order_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'PENDING',
      total_amount REAL NOT NULL,
      delivery_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_details (
      order_id TEXT NOT NULL,
      item_id INTEGER,
      item_name TEXT,
      quantity INTEGER NOT NULL,
      price REAL DEFAULT 0,
      unit_price REAL DEFAULT 0,
      item_total REAL DEFAULT 0,
      PRIMARY KEY (order_id, item_name)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      subscription_id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER REFERENCES vendors(vendor_id) ON DELETE CASCADE,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER REFERENCES subscriptions(subscription_id) ON DELETE CASCADE,
      vendor_id INTEGER REFERENCES vendors(vendor_id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'Razorpay (UPI)',
      transaction_id TEXT UNIQUE,
      status TEXT DEFAULT 'SUCCESS',
      paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_config (
      config_key TEXT PRIMARY KEY,
      config_value TEXT NOT NULL
    );
  `;

  return new Promise((resolve, reject) => {
    sqliteDb.exec(createTablesSql, async (err) => {
      if (err) return reject(err);

      // Safe column migration for existing SQLite databases
      const columns = [
        `ALTER TABLE societies ADD COLUMN pincode TEXT DEFAULT '201310'`,
        `ALTER TABLE societies ADD COLUMN total_flats INTEGER DEFAULT 850`,
        `ALTER TABLE societies ADD COLUMN rwa_phone TEXT DEFAULT '9876543210'`,
        `ALTER TABLE societies ADD COLUMN image_url TEXT DEFAULT 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800'`,
        `ALTER TABLE societies ADD COLUMN banner_image TEXT DEFAULT 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200'`,
        `ALTER TABLE vendors ADD COLUMN opening_time TEXT DEFAULT '08:00 AM'`,
        `ALTER TABLE vendors ADD COLUMN closing_time TEXT DEFAULT '10:00 PM'`,
        `ALTER TABLE vendors ADD COLUMN opening_timing TEXT DEFAULT '08:00 AM'`,
        `ALTER TABLE vendors ADD COLUMN closing_timing TEXT DEFAULT '10:00 PM'`,
        `ALTER TABLE vendors ADD COLUMN min_order_value REAL DEFAULT 0.00`,
        `ALTER TABLE vendors ADD COLUMN max_quantity_limit INTEGER DEFAULT 10`,
        `ALTER TABLE vendors ADD COLUMN delivery_charge REAL DEFAULT 0.00`,
        `ALTER TABLE vendors ADD COLUMN gst_percentage REAL DEFAULT 5.00`,
        `ALTER TABLE vendors ADD COLUMN service_charge_percentage REAL DEFAULT 0.00`,
        `ALTER TABLE societies ADD COLUMN public_id TEXT`,
        `ALTER TABLE vendors ADD COLUMN public_id TEXT`,
        `ALTER TABLE items ADD COLUMN in_stock INTEGER DEFAULT 1`,
        `ALTER TABLE orders ADD COLUMN user_id TEXT`,
        `ALTER TABLE orders ADD COLUMN society_id INTEGER`,
        `ALTER TABLE orders ADD COLUMN delivery_address TEXT`
      ];

      for (const colSql of columns) {
        try {
          await new Promise(res => sqliteDb.run(colSql, () => res()));
        } catch (_) { }
      }

      // Backfill public_id if missing
      const socRows = await query(`SELECT society_id FROM societies WHERE public_id IS NULL`);
      for (const r of (socRows.rows || [])) {
        let pid = genPublicId(5);
        await query(`UPDATE societies SET public_id = ? WHERE society_id = ?`, [pid, r.society_id]);
      }
      const venRows = await query(`SELECT vendor_id FROM vendors WHERE public_id IS NULL`);
      for (const r of (venRows.rows || [])) {
        let pid = genPublicId(6);
        await query(`UPDATE vendors SET public_id = ? WHERE vendor_id = ?`, [pid, r.vendor_id]);
      }

      await seedInitialData();
      resolve();
    });
  });
}

/**
 * Seed initial platform data if empty.
 */
async function seedInitialData() {
  try {
    const logoCheck = await query(`SELECT config_value FROM platform_config WHERE config_key = 'platform_logo'`);
    if (!logoCheck.rows || logoCheck.rows.length === 0) {
      await query(`INSERT INTO platform_config (config_key, config_value) VALUES ('platform_logo', 'https://imgh.in/host/ucila6')`);
    }
    const nameCheck = await query(`SELECT config_value FROM platform_config WHERE config_key = 'platform_name'`);
    if (!nameCheck.rows || nameCheck.rows.length === 0) {
      await query(`INSERT INTO platform_config (config_key, config_value) VALUES ('platform_name', 'DigiLocal')`);
    }
  } catch (_) { }

  const { hashPassword } = require('./utils/auth');
  const pwdHash = await hashPassword('password123');
  const vendorPwdHash = await hashPassword('vendor123');

  const usrCheck = await query(`SELECT user_id FROM users WHERE user_id = ?`, ['usr_101']);
  if (!usrCheck.rows || usrCheck.rows.length === 0) {
    await query(`INSERT INTO users (user_id, name, email, phone, password_hash, society_id, flat, joined_date, avatar) VALUES
      ('usr_101', 'Rahul Sharma', 'rahul.sharma@gmail.com', '9876543210', '${pwdHash}', 1, 'Tower A-402', 'August 2026', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200')
    `).catch(() => {});
  }

  const vCheck = await query(`SELECT vendor_id FROM vendors WHERE vendor_id = 1`);
  if (!vCheck.rows || vCheck.rows.length === 0) {
    await query(`INSERT INTO vendors (vendor_id, society_id, vendor_name, gst_number, phone_number, email, password, password_hash, store_name, opening_time, closing_time, logo, description, status, public_id) VALUES 
      (1, 1, 'Rajesh Sharma', '07AAACR12341Z5', '9876543210', 'vendor@digilocal.com', 'vendor123', '${vendorPwdHash}', 'FreshMart Grocery & Organic', '08:00 AM', '10:00 PM', 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200', 'Quality goods & daily essentials delivered within society via WhatsApp.', 'ACTIVE', '${genPublicId(6)}')
    `).catch(() => {});
  }

  const itemCheck = await query(`SELECT item_id FROM items WHERE item_id = 101`);
  if (!itemCheck.rows || itemCheck.rows.length === 0) {
    const boolTrue = isPg ? 'TRUE' : '1';
    await query(`INSERT INTO items (item_id, vendor_id, item_name, description, price, stock, category, unit, is_available, in_stock, image_url) VALUES 
      (101, 1, 'Fresh Organic Milk (1L)', 'Pure farm fresh whole cow milk pouch.', 68.00, 50, 'Dairy & Milk', '1 Litre', ${boolTrue}, ${boolTrue}, 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400'),
      (102, 1, 'Fresh Butter 500g', 'Pure unsalted cream butter block.', 180.00, 30, 'Dairy & Milk', '500g', ${boolTrue}, ${boolTrue}, 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400'),
      (103, 1, 'Multigrain Bread', 'Fresh 100% multigrain brown bread loaf.', 50.00, 20, 'Bakery', '400g', ${boolTrue}, ${boolTrue}, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400'),
      (105, 1, 'Organic Honey (250g)', 'Raw unpasteurized forest honey.', 240.00, 15, 'Organic', '250g', ${boolTrue}, ${boolTrue}, 'https://images.unsplash.com/photo-1587049352847-4a222e784d38?w=400')
    `).catch((err) => console.error('Error seeding items:', err.message));

    await query(`INSERT INTO catalog_items (item_id, vendor_id, item_name, price, category, description, image_url, in_stock) VALUES 
      (101, 1, 'Fresh Organic Milk (1L)', 68.00, 'Dairy & Milk', 'Pure farm fresh whole cow milk pouch.', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400', ${boolTrue}),
      (102, 1, 'Fresh Butter 500g', 180.00, 'Dairy & Milk', 'Pure unsalted cream butter block.', 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400', ${boolTrue}),
      (103, 1, 'Multigrain Bread', 50.00, 'Bakery', 'Fresh 100% multigrain brown bread loaf.', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400', ${boolTrue}),
      (105, 1, 'Organic Honey (250g)', 240.00, 'Organic', 'Raw unpasteurized forest honey.', 'https://images.unsplash.com/photo-1587049352847-4a222e784d38?w=400', ${boolTrue})
    `).catch((err) => console.error('Error seeding catalog_items:', err.message));
  }

  const ordCheck = await query(`SELECT order_id FROM orders WHERE order_id = ?`, ['ORD-9842']);
  if (!ordCheck.rows || ordCheck.rows.length === 0) {
    await query(`INSERT INTO orders (order_id, user_id, vendor_id, society_id, total_amount, status, delivery_address) VALUES 
      ('ORD-9842', 'usr_101', 1, 1, 236.00, 'DELIVERED', 'Tower A-402, Omaxe Greenwood Residency'),
      ('ORD-9843', 'usr_101', 1, 1, 180.00, 'PENDING', 'Tower A-402')
    `).catch((err) => console.error('Error seeding orders:', err.message));

    await query(`INSERT INTO order_details (order_id, item_id, item_name, quantity, price, unit_price, item_total) VALUES 
      ('ORD-9842', 101, 'Fresh Organic Milk (1L)', 2, 68.00, 68.00, 136.00),
      ('ORD-9842', 103, 'Multigrain Bread', 1, 50.00, 50.00, 50.00),
      ('ORD-9843', 102, 'Fresh Butter 500g', 1, 180.00, 180.00, 180.00)
    `).catch((err) => console.error('Error seeding order_details:', err.message));
  }
}

/**
 * Closes database connections cleanly during process termination.
 */
async function closeDb() {
  if (isPg && pgPool) {
    await pgPool.end();
  } else if (sqliteDb) {
    await new Promise((resolve) => sqliteDb.close(() => resolve()));
  }
}

module.exports = {
  initDb,
  query,
  withTransaction,
  closeDb,
  genPublicId,
  getDbType,
  DatabaseError
};
