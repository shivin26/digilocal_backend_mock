const crypto = require('crypto');

/**
 * Enterprise Payment Security Utilities.
 * Handles HMAC-SHA256 signature verification for Razorpay checkout payments and webhooks.
 */

/**
 * Verifies Razorpay checkout signature.
 * @param {string} orderId - Razorpay Order ID (or transaction reference)
 * @param {string} paymentId - Razorpay Payment ID
 * @param {string} signature - Razorpay Signature provided by client
 * @param {string} secret - Razorpay Key Secret
 */
function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
  if (!signature || !secret || !orderId || !paymentId) {
    return false;
  }

  const payload = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Verifies Razorpay Webhook signature over raw payload.
 * @param {string} rawBody - Raw HTTP body string
 * @param {string} signature - Header 'x-razorpay-signature'
 * @param {string} webhookSecret - Razorpay Webhook Secret
 */
function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!rawBody || !signature || !webhookSecret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

module.exports = {
  verifyRazorpaySignature,
  verifyWebhookSignature
};
