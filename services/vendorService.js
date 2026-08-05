const { query, withTransaction } = require('../db');
const paymentService = require('./paymentService');

/**
 * Service handling Vendor Profile, Store Settings, Subscription Renewals, and Dashboard Data.
 */
class VendorService {
  /**
   * Fetches full vendor dashboard data (Profile, Items, Orders, Subscription, Payments).
   * Supports numeric vendor_id, string vendor_id, or public_id (e.g., "v_1785912204092" or "UB8UKK").
   */
  async getVendorDashboard(vendorIdParam) {
    const rawIdStr = String(vendorIdParam || '').trim();
    const isPureNum = /^\d+$/.test(rawIdStr);

    let vendorRes;
    if (isPureNum) {
      const numId = parseInt(rawIdStr, 10);
      vendorRes = await query(
        `SELECT v.*, s.society_name, s.location 
         FROM vendors v 
         LEFT JOIN societies s ON v.society_id = s.society_id 
         WHERE v.vendor_id = ?`,
        [numId]
      );
    } else {
      vendorRes = await query(
        `SELECT v.*, s.society_name, s.location 
         FROM vendors v 
         LEFT JOIN societies s ON v.society_id = s.society_id 
         WHERE v.public_id = ? OR CAST(v.vendor_id AS TEXT) = ?`,
        [rawIdStr, rawIdStr]
      );
    }

    if (!vendorRes.rows || vendorRes.rows.length === 0) {
      return null;
    }

    const vendor = vendorRes.rows[0];
    delete vendor.password;

    const actualVendorId = Number(vendor.vendor_id);

    // Fetch vendor menu items
    const itemsRes = await query(
      `SELECT * FROM items WHERE vendor_id = ? ORDER BY item_id DESC`,
      [actualVendorId]
    ).catch(() => ({ rows: [] }));

    // Fetch vendor orders safely using LEFT JOIN
    const ordersRes = await query(
      `SELECT o.order_id, o.user_id, o.vendor_id, 
              COALESCE(u.name, c.customer_name, 'Resident User') as customer_name,
              COALESCE(u.phone, c.phone_number, '9876543210') as phone,
              COALESCE(o.delivery_address, c.address, 'Tower A-402') as delivery_address,
              o.total_amount, o.status, COALESCE(o.created_at, o.order_timestamp) as created_at
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.user_id
       LEFT JOIN customers c ON o.customer_id = c.customer_id
       WHERE o.vendor_id = ?
       ORDER BY o.order_id DESC`,
      [actualVendorId]
    ).catch(() => ({ rows: [] }));

    // Batch load order details
    const orderIds = (ordersRes.rows || []).map(o => o.order_id);
    let orderDetailsMap = {};
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      const detailsRes = await query(
        `SELECT od.*, COALESCE(od.item_name, i.item_name, 'Item') as item_name
         FROM order_details od
         LEFT JOIN items i ON od.item_id = i.item_id
         WHERE od.order_id IN (${placeholders})`,
        orderIds
      ).catch(() => ({ rows: [] }));

      (detailsRes.rows || []).forEach(dt => {
        if (!orderDetailsMap[dt.order_id]) orderDetailsMap[dt.order_id] = [];
        orderDetailsMap[dt.order_id].push(dt);
      });
    }

    const orders = (ordersRes.rows || []).map(o => ({ ...o, items: orderDetailsMap[o.order_id] || [] }));

    // Fetch subscription and payments
    const subRes = await query(
      `SELECT * FROM subscriptions WHERE vendor_id = ? ORDER BY subscription_id DESC LIMIT 1`,
      [actualVendorId]
    ).catch(() => ({ rows: [] }));

    const payRes = await query(
      `SELECT * FROM payments WHERE vendor_id = ? ORDER BY payment_id DESC`,
      [actualVendorId]
    ).catch(() => ({ rows: [] }));

    return {
      vendor,
      items: itemsRes.rows || [],
      orders,
      subscription: subRes.rows[0] || null,
      payments: payRes.rows || []
    };
  }

  /**
   * Updates store profile, business hours, GST, delivery charges, and store status.
   */
  async updateStoreSettings(vendorIdParam, settings) {
    const rawIdStr = String(vendorIdParam || '').trim();
    const isPureNum = /^\d+$/.test(rawIdStr);
    const numId = isPureNum ? parseInt(rawIdStr, 10) : 0;

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
       WHERE vendor_id = ? OR public_id = ?`,
      [
        store_name, logoUrl, description || '', phone_number || '', gst_number || '',
        opening_timing || '08:00 AM', closing_timing || '10:00 PM', min_order_value || 0,
        max_quantity_limit || 10, delivery_charge || 0, gst_percentage || 5, service_charge_percentage || 0,
        numId, rawIdStr
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
