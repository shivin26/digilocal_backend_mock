const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

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
  if (pgConnectionString || process.env.PGHOST) {
    try {
      pgPool = new Pool({
        connectionString: pgConnectionString,
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'digilocal',
        max: 20, // Production connection limit
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });

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
  console.log('[Database] Initializing SQLite fallback database at digilocal.sqlite...');
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
      console.log('[Database] SQLite foreign key enforcement enabled.');
      resolve();
    });
  });

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
      const pgSql = sqlText.replace(/\?/g, () => `$${++paramCount}`);
      
      pgPool.query(pgSql, params, (err, result) => {
        if (err) {
          console.error('[DB Query Error - PostgreSQL]:', err.message, '| Query:', sqlText);
          return reject(new DatabaseError('PostgreSQL query execution failed', err, sqlText));
        }
        resolve({
          rows: result.rows || [],
          rowCount: result.rowCount || 0,
          insertId: result.rows[0]?.id || result.rows[0]?.vendor_id || result.rows[0]?.order_id || result.rows[0]?.item_id || null
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
        const pgSql = sqlText.replace(/\?/g, () => `$${++paramCount}`);
        client.query(pgSql, params, (err, result) => {
          if (err) return reject(new DatabaseError('PG Transaction Query Failed', err, sqlText));
          resolve({
            rows: result.rows || [],
            rowCount: result.rowCount || 0,
            insertId: result.rows[0]?.id || result.rows[0]?.vendor_id || result.rows[0]?.order_id || null
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
      try { await query('ROLLBACK'); } catch (_) {}
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
  console.log('[Database] Performance indexes verified.');
}

/**
 * Setup PostgreSQL Tables using schema.sql.
 */
async function setupTablesPg() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await pgPool.query(schemaSql);
    await seedInitialData();
  }
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
      public_id TEXT,
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
      store_name TEXT NOT NULL,
      logo TEXT DEFAULT 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=200&auto=format&fit=crop&q=80',
      description TEXT DEFAULT 'Welcome to our store on DigiLocal!',
      opening_timing TEXT DEFAULT '08:00 AM',
      closing_timing TEXT DEFAULT '10:00 PM',
      min_order_value REAL DEFAULT 0.00,
      max_quantity_limit INTEGER DEFAULT 10,
      delivery_charge REAL DEFAULT 0.00,
      gst_percentage REAL DEFAULT 5.00,
      service_charge_percentage REAL DEFAULT 0.00,
      status TEXT DEFAULT 'PENDING',
      public_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      address TEXT NOT NULL,
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
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      order_id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER REFERENCES vendors(vendor_id) ON DELETE CASCADE,
      customer_id INTEGER REFERENCES customers(customer_id) ON DELETE CASCADE,
      order_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'PLACED',
      total_amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_details (
      order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(item_id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      item_total REAL NOT NULL,
      PRIMARY KEY (order_id, item_id)
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
        `ALTER TABLE vendors ADD COLUMN opening_timing TEXT DEFAULT '08:00 AM'`,
        `ALTER TABLE vendors ADD COLUMN closing_timing TEXT DEFAULT '10:00 PM'`,
        `ALTER TABLE vendors ADD COLUMN min_order_value REAL DEFAULT 0.00`,
        `ALTER TABLE vendors ADD COLUMN max_quantity_limit INTEGER DEFAULT 10`,
        `ALTER TABLE vendors ADD COLUMN delivery_charge REAL DEFAULT 0.00`,
        `ALTER TABLE vendors ADD COLUMN gst_percentage REAL DEFAULT 5.00`,
        `ALTER TABLE vendors ADD COLUMN service_charge_percentage REAL DEFAULT 0.00`,
        `ALTER TABLE societies ADD COLUMN public_id TEXT`,
        `ALTER TABLE vendors ADD COLUMN public_id TEXT`
      ];

      for (const colSql of columns) {
        try {
          await new Promise(res => sqliteDb.run(colSql, () => res()));
        } catch (_) {}
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
  } catch (_) {}

  const socCheck = await query('SELECT COUNT(*) as count FROM societies');
  const count = parseInt(socCheck.rows[0]?.count || 0);

  if (count === 0) {
    console.log('[Database] Seeding initial DigiLocal data...');
    await query(`INSERT INTO societies (society_name, location, public_id) VALUES 
      ('Greenwood Residency', 'Block A, Sector 62, Noida', '${genPublicId(5)}'),
      ('Palm Meadows Apartment', 'Phase 2, Whitefield, Bangalore', '${genPublicId(5)}'),
      ('Sunrise Heights', 'Powai, Mumbai', '${genPublicId(5)}'),
      ('Royal Garden Enclave', 'Viman Nagar, Pune', '${genPublicId(5)}')
    `);

    await query(`INSERT INTO vendors (society_id, vendor_name, gst_number, phone_number, email, password, store_name, logo, description, status, public_id) VALUES 
      (1, 'Rajesh Sharma', '07AAACR12341Z5', '9876543210', 'freshmart@gmail.com', 'vendor123', 'FreshMart Grocery & Organic', 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=300&auto=format&fit=crop&q=80', 'Your neighborhood fresh fruits, organic vegetables & daily dairy essentials.', 'ACTIVE', '${genPublicId(6)}'),
      (1, 'Anil Kumar', '07BBBDS98762Z1', '9812345678', 'bakesandbites@gmail.com', 'vendor123', 'Bakes & Bites Bakery', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300&auto=format&fit=crop&q=80', 'Artisanal breads, fresh cakes, pastries and tea-time snacks delivered warm to your door.', 'ACTIVE', '${genPublicId(6)}'),
      (2, 'Meena Swaminathan', '29CCCCK54321Z9', '9745612300', 'southspice@gmail.com', 'vendor123', 'South Spice Daily Kitchen', 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=300&auto=format&fit=crop&q=80', 'Homemade authentic South Indian batters, podis, and fresh breakfast meals.', 'ACTIVE', '${genPublicId(6)}'),
      (3, 'Sanjay Gupta', '27DDDDM11223Z8', '9988776655', 'metrochemists@gmail.com', 'vendor123', 'Metro Pharmacy & Wellness', 'https://images.unsplash.com/photo-1576602976047-174e57a47881?w=300&auto=format&fit=crop&q=80', '24x7 Prescription medicines, health supplements, and baby care products.', 'ACTIVE', '${genPublicId(6)}')
    `);

    const today = new Date();
    const nextYear = new Date();
    nextYear.setFullYear(today.getFullYear() + 1);

    const todayStr = today.toISOString().split('T')[0];
    const nextYearStr = nextYear.toISOString().split('T')[0];

    for (let vId = 1; vId <= 4; vId++) {
      await query(`INSERT INTO subscriptions (vendor_id, start_date, end_date, status) VALUES (?, ?, ?, 'ACTIVE')`, [vId, todayStr, nextYearStr]);
      await query(`INSERT INTO payments (subscription_id, vendor_id, amount, payment_method, transaction_id, status) VALUES (?, ?, 2999.00, 'Razorpay (UPI)', ?, 'SUCCESS')`, [vId, vId, `TXN_INIT_${Date.now()}_${vId}`]);
    }

    await query(`INSERT INTO vendors (society_id, vendor_name, gst_number, phone_number, email, password, store_name, logo, description, status, public_id) VALUES 
      (4, 'Pooja Verma', '27EEEEV99887Z3', '9123456789', 'royalcleaners@gmail.com', 'vendor123', 'Royal Laundry & Dry Cleaning', 'https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?w=300&auto=format&fit=crop&q=80', 'Eco-friendly dry cleaning, steam ironing, and shoe cleaning services.', 'PENDING', '${genPublicId(6)}')
    `);
    await query(`INSERT INTO subscriptions (vendor_id, start_date, end_date, status) VALUES (5, NULL, NULL, 'PENDING')`);
    await query(`INSERT INTO payments (subscription_id, vendor_id, amount, payment_method, transaction_id, status) VALUES (5, 5, 2999.00, 'Razorpay (Card)', 'TXN_PENDING_REQ_5', 'SUCCESS')`);

    await query(`INSERT INTO items (vendor_id, item_name, description, price, stock, category, unit, is_available, image_url) VALUES 
      (1, 'Farm Fresh Organic Milk (1L)', 'Pure whole cow milk sourced directly from local dairy farms.', 68.00, 50, 'Dairy', '1 Litre', 1, 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300&auto=format&fit=crop&q=80'),
      (1, 'Fresh Alphonso Mangoes (1kg)', 'Sweet hand-picked premium Ratnagiri Alphonso mangoes.', 240.00, 25, 'Fruits', '1 kg', 1, 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=300&auto=format&fit=crop&q=80'),
      (1, 'Organic Brown Eggs (Pack of 6)', 'Free-range cage-free nutrient rich brown eggs.', 75.00, 40, 'Dairy & Eggs', '6 pcs', 1, 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=300&auto=format&fit=crop&q=80'),
      (1, 'Whole Wheat Sourdough Bread', 'Freshly baked artisanal 100% whole wheat sourdough loaf.', 110.00, 15, 'Bakery', '400g', 1, 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?w=300&auto=format&fit=crop&q=80'),
      (1, 'Exotic Hass Avocado', 'Ready-to-eat ripe avocado perfect for salads and toast.', 99.00, 0, 'Fruits', '1 pc', 0, 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=300&auto=format&fit=crop&q=80')
    `);

    await query(`INSERT INTO items (vendor_id, item_name, description, price, stock, category, unit, is_available, image_url) VALUES 
      (2, 'Belgian Chocolate Truffle Cake', 'Rich 500g dark chocolate layer cake topped with ganache.', 550.00, 10, 'Cakes', '500g', 1, 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=300&auto=format&fit=crop&q=80'),
      (2, 'Butter Croissants (Pack of 2)', 'Flaky, buttery French golden croissants.', 140.00, 20, 'Pastries', '2 pcs', 1, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=300&auto=format&fit=crop&q=80'),
      (2, 'Blueberry Cheesecake Slice', 'Classic New York style creamy cheesecake slice with fruit compote.', 180.00, 12, 'Desserts', '1 slice', 1, 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=300&auto=format&fit=crop&q=80')
    `);

    await query(`INSERT INTO customers (customer_name, phone_number, address) VALUES 
      ('Rahul Verma', '9898989898', 'Flat 402, Tower B, Greenwood Residency')
    `);

    await query(`INSERT INTO orders (vendor_id, customer_id, status, total_amount) VALUES (1, 1, 'PLACED', 308.00)`);
    await query(`INSERT INTO order_details (order_id, item_id, quantity, unit_price, item_total) VALUES 
      (1, 1, 1, 68.00, 68.00),
      (1, 2, 1, 240.00, 240.00)
    `);

    console.log('[Database] Seeding completed successfully.');
  }
}

/**
 * Closes database connections cleanly during process termination.
 */
async function closeDb() {
  if (isPg && pgPool) {
    console.log('[Database] Closing PostgreSQL connection pool...');
    await pgPool.end();
  } else if (sqliteDb) {
    console.log('[Database] Closing SQLite database connection...');
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
