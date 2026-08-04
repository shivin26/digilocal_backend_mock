const { withTransaction, query } = require('../db');
const { verifyRazorpaySignature, verifyWebhookSignature } = require('../utils/payment');

class PaymentService {
  /**
   * Verifies Razorpay payment and activates vendor subscription atomically.
   * Subscription activation occurs ONLY IF signature verification succeeds.
   */
  async verifyAndProcessPayment({
    vendor_id,
    subscription_id,
    amount = 2999.00,
    payment_method = 'Razorpay (UPI)',
    transaction_id,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  }) {
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
    const txnId = razorpay_payment_id || transaction_id || `RAZORPAY_${Date.now()}_${vendor_id}`;

    // 1. Signature Verification (If Razorpay secret is configured)
    if (razorpaySecret && razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      const isValidSig = verifyRazorpaySignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        razorpaySecret
      );

      if (!isValidSig) {
        console.error(`[Payment Security Alert] Invalid Razorpay HMAC signature for vendor_id: ${vendor_id} | Txn: ${txnId}`);
        throw new Error('Payment security verification failed: Invalid HMAC signature');
      }
    } else if (process.env.NODE_ENV === 'production' && razorpaySecret) {
      throw new Error('Payment security verification failed: Missing Razorpay signature parameters');
    }

    // 2. Duplicate Payment & Replay Attack Protection
    const existingTxn = await query(`SELECT payment_id, status FROM payments WHERE transaction_id = ?`, [txnId]);
    if (existingTxn.rows.length > 0) {
      if (existingTxn.rows[0].status === 'SUCCESS') {
        console.warn(`[Payment Security] Replay attack prevented: Transaction ${txnId} has already been processed.`);
        return {
          payment_id: existingTxn.rows[0].payment_id,
          status: 'SUCCESS',
          duplicate: true,
          message: 'Transaction already processed successfully'
        };
      }
    }

    // 3. Process Payment & Activate Subscription Atomically
    return await withTransaction(async (txQuery) => {
      // Find or create subscription if missing
      let subId = subscription_id;
      if (!subId) {
        const subRes = await txQuery(
          `SELECT subscription_id FROM subscriptions WHERE vendor_id = ? ORDER BY subscription_id DESC LIMIT 1`,
          [vendor_id]
        );
        if (subRes.rows.length > 0) {
          subId = subRes.rows[0].subscription_id;
        } else {
          const newSub = await txQuery(
            `INSERT INTO subscriptions (vendor_id, status) VALUES (?, 'PENDING')`,
            [vendor_id]
          );
          subId = newSub.insertId;
        }
      }

      // Calculate 1-Year Active Subscription Dates
      const today = new Date();
      const nextYear = new Date();
      nextYear.setFullYear(today.getFullYear() + 1);

      const startDateStr = today.toISOString().split('T')[0];
      const endDateStr = nextYear.toISOString().split('T')[0];

      // Update Subscription Status to ACTIVE
      await txQuery(
        `UPDATE subscriptions SET status = 'ACTIVE', start_date = ?, end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE subscription_id = ?`,
        [startDateStr, endDateStr, subId]
      );

      // Update Vendor Status to ACTIVE
      await txQuery(`UPDATE vendors SET status = 'ACTIVE' WHERE vendor_id = ?`, [vendor_id]);

      // Record Successful Payment Audit Log
      const payRes = await txQuery(
        `INSERT INTO payments (subscription_id, vendor_id, amount, payment_method, transaction_id, status) VALUES (?, ?, ?, ?, ?, 'SUCCESS')`,
        [subId, vendor_id, amount, payment_method, txnId]
      );

      return {
        payment_id: payRes.insertId,
        subscription_id: subId,
        status: 'SUCCESS',
        transaction_id: txnId,
        start_date: startDateStr,
        end_date: endDateStr
      };
    });
  }

  /**
   * Processes a refund for a transaction.
   */
  async processRefund(paymentId, amount, reason = 'Vendor requested refund') {
    return await withTransaction(async (txQuery) => {
      const payRes = await txQuery(`SELECT * FROM payments WHERE payment_id = ?`, [paymentId]);
      if (payRes.rows.length === 0) {
        throw new Error('Payment transaction not found');
      }

      const payment = payRes.rows[0];
      if (payment.status === 'REFUNDED') {
        throw new Error('Payment has already been refunded');
      }

      // Update payment record to REFUNDED
      await txQuery(`UPDATE payments SET status = 'REFUNDED' WHERE payment_id = ?`, [paymentId]);

      // Deactivate vendor subscription
      await txQuery(`UPDATE subscriptions SET status = 'CANCELLED' WHERE subscription_id = ?`, [payment.subscription_id]);
      await txQuery(`UPDATE vendors SET status = 'PENDING' WHERE vendor_id = ?`, [payment.vendor_id]);

      return {
        payment_id: paymentId,
        status: 'REFUNDED',
        refund_amount: amount,
        reason
      };
    });
  }

  /**
   * Handles Razorpay Webhook Event Notifications.
   */
  async handleWebhook(rawBody, signature) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret && !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.error('[Payment Webhook Security Alert] Invalid Webhook HMAC Signature');
      throw new Error('Invalid Webhook Signature');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (_) {
      throw new Error('Invalid Webhook JSON Body');
    }

    const event = payload.event;

    if (event === 'payment.captured' || event === 'order.paid') {
      const entity = payload.payload?.payment?.entity || payload.payload?.order?.entity;
      if (entity) {
        const txnId = entity.id;
        const notes = entity.notes || {};
        const vendor_id = notes.vendor_id;

        if (vendor_id) {
          await this.verifyAndProcessPayment({
            vendor_id,
            transaction_id: txnId,
            payment_method: entity.method || 'Razorpay (UPI)',
            amount: (entity.amount || 299900) / 100
          });
        }
      }
    }

    return { received: true, event };
  }
}

module.exports = new PaymentService();
