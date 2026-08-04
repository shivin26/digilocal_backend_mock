const { query, withTransaction } = require('../db');
const paymentService = require('./paymentService');

/**
 * Service handling Vendor Profile, Store Settings, Subscription Renewals, and Dashboard Data.
 */
class VendorService {
  /**
   * Fetches full vendor dashboard data (Profile, Items, Orders, Subscription, Payments).
   */
  async getVendorDashboard(vendorId) {
    const vendorRes = await query(
      `SELECT v.*, s.society_name, s.location 
       FROM vendors v 
       JOIN societies s ON v.society_id = s.society_id 
       WHERE v.vendor_id = ?`,
      [vendorId]
    );

    if (vendorRes.rows.length === 0) {
      return null;
    }

    const vendor = vendorRes.rows[0];
    delete vendor.password; // Never expose password hash

    // Fetch vendor menu items
    const itemsRes = await query(`SELECT * FROM items WHERE vendor_id = ? ORDER BY item_id DESC`, [vendorId]);

    // Fetch vendor orders
    const ordersRes = await query(`
      SELECT o.*, c.customer_name, c.phone_number, c.address
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      WHERE o.vendor_id = ?
      ORDER BY o.order_id DESC
    `, [vendorId]);

    // Batch load order details to prevent N+1 queries
    const orderIds = ordersRes.rows.map(o => o.order_id);
    let orderDetailsMap = {};
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      const detailsRes = await query(`
        SELECT od.*, i.item_name, i.unit 
        FROM order_details od
        JOIN items i ON od.item_id = i.item_id
        WHERE od.order_id IN (${placeholders})
      `, orderIds);

      detailsRes.rows.forEach(dt => {
        if (!orderDetailsMap[dt.order_id]) orderDetailsMap[dt.order_id] = [];
        orderDetailsMap[dt.order_id].push(dt);
      });
    }

    const orders = ordersRes.rows.map(o => ({ ...o, items: orderDetailsMap[o.order_id] || [] }));

    // Fetch subscription and payments
    const subRes = await query(`SELECT * FROM subscriptions WHERE vendor_id = ? ORDER BY subscription_id DESC LIMIT 1`, [vendorId]);
    const payRes = await query(`SELECT * FROM payments WHERE vendor_id = ? ORDER BY payment_id DESC`, [vendorId]);

    return {
      vendor,
      items: itemsRes.rows,
      orders,
      subscription: subRes.rows[0] || null,
      payments: payRes.rows
    };
  }

  /**
   * Updates store profile, business hours, GST, delivery charges, and store status.
   */
  async updateStoreSettings(vendorId, settings) {
    const {
      store_name, logo, description, phone_number, gst_number,
      opening_timing, closing_timing, min_order_value, max_quantity_limit,
      delivery_charge, gst_percentage, service_charge_percentage
    } = settings;

    const defaultLogo = 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=200&auto=format&fit=crop&q=80';
    const logoUrl = logo && logo.trim() !== '' ? logo : defaultLogo;

    await query(
      `UPDATE vendors 
       SET store_name = ?, logo = ?, description = ?, phone_number = ?, gst_number = ?,
           opening_timing = ?, closing_timing = ?, min_order_value = ?, max_quantity_limit = ?,
           delivery_charge = ?, gst_percentage = ?, service_charge_percentage = ?
       WHERE vendor_id = ?`,
      [
        store_name, logoUrl, description || '', phone_number || '', gst_number || '',
        opening_timing || '08:00 AM', closing_timing || '10:00 PM', min_order_value || 0,
        max_quantity_limit || 10, delivery_charge || 0, gst_percentage || 5, service_charge_percentage || 0,
        vendorId
      ]
    );
    return { logo: logoUrl };
  }

  /**
   * Processes subscription renewal safely via PaymentService signature verification.
   */
  async renewSubscription(vendorId, paymentMethod, transactionId, extraPaymentDetails = {}) {
    const paymentResult = await paymentService.verifyAndProcessPayment({
      vendor_id: vendorId,
      amount: 2999.00,
      payment_method: paymentMethod || 'Razorpay (UPI)',
      transaction_id: transactionId,
      razorpay_order_id: extraPaymentDetails.razorpay_order_id,
      razorpay_payment_id: extraPaymentDetails.razorpay_payment_id || transactionId,
      razorpay_signature: extraPaymentDetails.razorpay_signature
    });

    return {
      startDateStr: paymentResult.start_date,
      endDateStr: paymentResult.end_date
    };
  }
}

module.exports = new VendorService();
