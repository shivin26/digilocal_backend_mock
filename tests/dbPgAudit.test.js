const { initDb, query, withTransaction, getDbType, closeDb } = require('../db');
const assert = require('assert');

async function runPgAuditTest() {
  console.log('🧪 Running PostgreSQL Query & DB Interface Verification...');

  try {
    await initDb();
    console.log(`  ℹ️ Database Engine active: [${getDbType().toUpperCase()}]`);

    // 1. Test basic ping query
    const ping = await query('SELECT 1 as alive');
    assert.strictEqual(ping.rows.length, 1);
    assert.strictEqual(ping.rows[0].alive, 1);
    console.log('  ✅ PASS: Basic SELECT query execution');

    // 2. Test Society INSERT & insertId extraction
    const socRes = await query(
      `INSERT INTO societies (society_name, location, public_id) VALUES (?, ?, ?)`,
      ['Test Community', 'Sector 100, Noida', 'TST01']
    );
    assert.ok(socRes.insertId !== null && socRes.insertId !== undefined, 'Society insertId should be defined');
    console.log(`  ✅ PASS: Society INSERT & insertId extraction (ID: ${socRes.insertId})`);

    // 3. Test Vendor INSERT inside transaction & RETURNING clause resolution
    let vendorId;
    await withTransaction(async (txQuery) => {
      const vRes = await txQuery(
        `INSERT INTO vendors (society_id, vendor_name, email, password, store_name, public_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [socRes.insertId, 'Test Merchant', `testmerchant_${Date.now()}@gmail.com`, 'hash123', 'Test Corner Store', 'VNDTST']
      );
      assert.ok(vRes.insertId !== null, 'Vendor insertId should be resolved inside transaction');
      vendorId = vRes.insertId;

      const subRes = await txQuery(
        `INSERT INTO subscriptions (vendor_id, status) VALUES (?, 'ACTIVE')`,
        [vendorId]
      );
      assert.ok(subRes.insertId !== null, 'Subscription insertId should be resolved');
    });
    console.log(`  ✅ PASS: Transaction INSERTs & insertId propagation (Vendor ID: ${vendorId})`);

    // 4. Test numeric field precision
    const itemRes = await query(
      `INSERT INTO items (vendor_id, item_name, price, stock, category) VALUES (?, ?, ?, ?, ?)`,
      [vendorId, 'Fresh Apples', 149.99, 30, 'Fruits']
    );
    assert.ok(itemRes.insertId !== null, 'Item insertId resolved');

    const itemFetch = await query(`SELECT * FROM items WHERE item_id = ?`, [itemRes.insertId]);
    assert.strictEqual(itemFetch.rows.length, 1);
    assert.strictEqual(typeof itemFetch.rows[0].price, 'number', 'Price column should return as JS number');
    assert.strictEqual(itemFetch.rows[0].price, 149.99, 'Price value matching inserted value');
    console.log('  ✅ PASS: Numeric/Decimal field precision & type parsing');

    // Clean up test data in order
    await query(`DELETE FROM items WHERE item_id = ?`, [itemRes.insertId]);
    await query(`DELETE FROM subscriptions WHERE vendor_id = ?`, [vendorId]);
    await query(`DELETE FROM vendors WHERE vendor_id = ?`, [vendorId]);
    await query(`DELETE FROM societies WHERE society_id = ?`, [socRes.insertId]);
    console.log('  ✅ PASS: Database cleanup after verification');

    console.log('🎉 All PostgreSQL Database Interface Checks Passed Successfully!\n');
  } catch (err) {
    console.error('❌ FAIL: Database audit test failed:', err);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

runPgAuditTest();
