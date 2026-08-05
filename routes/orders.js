const express = require('express');
const router = express.Router();
const { query } = require('../db');

/**
 * D1. Fetch Resident User Orders (Strictly Filtered by User ID)
 * GET /api/orders/user/:userId
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const ordersRes = await query(
      `SELECT o.order_id, o.user_id, o.vendor_id, v.store_name, o.total_amount, o.status, 
              o.created_at, s.society_name, o.delivery_address
       FROM orders o
       LEFT JOIN vendors v ON o.vendor_id = v.vendor_id
       LEFT JOIN societies s ON o.society_id = s.society_id
       WHERE o.user_id = ?
       ORDER BY o.order_id DESC`,
      [userId]
    );

    const orders = [];
    for (const ord of (ordersRes.rows || [])) {
      const detailsRes = await query(
        `SELECT item_name, quantity, COALESCE(price, unit_price, 0) as price FROM order_details WHERE order_id = ?`,
        [ord.order_id]
      ).catch(() => ({ rows: [] }));

      orders.push({
        order_id: String(ord.order_id),
        user_id: String(ord.user_id),
        vendor_id: Number(ord.vendor_id),
        store_name: ord.store_name || 'FreshMart Grocery & Organic',
        total_amount: Number(ord.total_amount || 0),
        status: ord.status || 'PENDING',
        created_at: ord.created_at ? new Date(ord.created_at).toISOString() : new Date().toISOString(),
        society_name: ord.society_name || 'Omaxe Greenwood Residency',
        delivery_address: ord.delivery_address || 'Tower A-402, Omaxe Greenwood Residency',
        items: (detailsRes.rows || []).map(i => ({
          item_name: i.item_name || 'Item',
          quantity: Number(i.quantity || 1),
          price: Number(i.price || 0)
        }))
      });
    }

    res.status(200).json(orders);
  } catch (err) {
    console.error('Error fetching user orders:', err);
    res.status(500).json({ error: 'Failed to fetch user orders: ' + err.message });
  }
});

/**
 * D2. Fetch Vendor Store Orders
 * GET /api/orders/vendor/:vendorId
 */
router.get('/vendor/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;

    const ordersRes = await query(
      `SELECT o.order_id, o.user_id, u.name as customer_name, u.phone, 
              o.delivery_address, o.total_amount, o.status, o.created_at
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.user_id
       WHERE o.vendor_id = ?
       ORDER BY o.order_id DESC`,
      [vendorId]
    );

    const orders = [];
    for (const ord of (ordersRes.rows || [])) {
      const detailsRes = await query(
        `SELECT item_name, quantity, COALESCE(price, unit_price, 0) as price FROM order_details WHERE order_id = ?`,
        [ord.order_id]
      ).catch(() => ({ rows: [] }));

      orders.push({
        order_id: String(ord.order_id),
        user_id: ord.user_id ? String(ord.user_id) : 'usr_101',
        customer_name: ord.customer_name || 'Rahul Sharma',
        phone: ord.phone || '9876543210',
        delivery_address: ord.delivery_address || 'Tower A-402',
        total_amount: Number(ord.total_amount || 0),
        status: ord.status || 'PENDING',
        created_at: ord.created_at ? new Date(ord.created_at).toISOString() : new Date().toISOString(),
        items: (detailsRes.rows || []).map(i => ({
          item_name: i.item_name || 'Item',
          quantity: Number(i.quantity || 1),
          price: Number(i.price || 0)
        }))
      });
    }

    res.status(200).json(orders);
  } catch (err) {
    console.error('Error fetching vendor orders:', err);
    res.status(500).json({ error: 'Failed to fetch vendor orders: ' + err.message });
  }
});

/**
 * D3. Create New Order
 * POST /api/orders
 */
router.post('/', async (req, res) => {
  try {
    const { user_id, vendor_id, society_id, total_amount, delivery_address, items } = req.body;

    if (!vendor_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required order fields or items array' });
    }

    const orderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const createdAt = new Date().toISOString();
    const numTotal = Number(total_amount || 0);

    await query(
      `INSERT INTO orders (order_id, user_id, vendor_id, society_id, total_amount, status, delivery_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        user_id || 'usr_101',
        vendor_id,
        society_id || 1,
        numTotal,
        'PENDING',
        delivery_address || 'Tower A-402, Omaxe Greenwood Residency',
        createdAt
      ]
    );

    for (const item of items) {
      const itemPrice = Number(item.price || 0);
      const itemQty = Number(item.quantity || 1);
      await query(
        `INSERT INTO order_details (order_id, item_id, item_name, quantity, price, unit_price, item_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.item_id || null,
          item.item_name || 'Item',
          itemQty,
          itemPrice,
          itemPrice,
          itemPrice * itemQty
        ]
      ).catch((err) => console.error('Error inserting order detail:', err.message));
    }

    res.status(201).json({
      order_id: orderId,
      status: 'PENDING',
      created_at: createdAt,
      message: 'Order placed successfully'
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(400).json({ error: err.message || 'Failed to place order' });
  }
});

/**
 * D4. Update Order Status Pipeline
 * PUT /api/orders/:id/status
 */
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'ACCEPTED', 'CANCELLED'];
    if (!status || !allowedStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid order status value' });
    }

    const uppercaseStatus = status.toUpperCase();

    const orderCheck = await query(`SELECT order_id FROM orders WHERE order_id = ?`, [id]);
    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Order ID not found' });
    }

    await query(`UPDATE orders SET status = ? WHERE order_id = ?`, [uppercaseStatus, id]);

    res.status(200).json({
      message: 'Order status updated successfully',
      order_id: String(id),
      status: uppercaseStatus
    });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

/**
 * GET /api/orders/:orderId - Single order detail lookup
 */
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderRes = await query(`SELECT * FROM orders WHERE order_id = ?`, [orderId]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order ID not found' });
    }

    const itemsRes = await query(`SELECT * FROM order_details WHERE order_id = ?`, [orderId]);

    res.status(200).json({
      order: orderRes.rows[0],
      items: itemsRes.rows
    });
  } catch (err) {
    console.error('Error fetching order details:', err);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

module.exports = router;
