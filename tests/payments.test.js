const assert = require('assert');
const { verifyRazorpaySignature } = require('../utils/payment');

module.exports = async function (it) {
  await it('should verify valid HMAC-SHA256 Razorpay signature', async () => {
    const crypto = require('crypto');
    const secret = 'test_razorpay_secret';
    const orderId = 'order_12345';
    const paymentId = 'pay_67890';
    const payload = `${orderId}|${paymentId}`;
    const validSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const isValid = verifyRazorpaySignature(orderId, paymentId, validSignature, secret);
    assert.strictEqual(isValid, true);
  });

  await it('should reject spoofed/invalid Razorpay signature', async () => {
    const secret = 'test_razorpay_secret';
    const orderId = 'order_12345';
    const paymentId = 'pay_67890';
    const spoofedSignature = 'a1b2c3d4e5f60000111122223333444455556666777788889999000011112222';

    const isValid = verifyRazorpaySignature(orderId, paymentId, spoofedSignature, secret);
    assert.strictEqual(isValid, false);
  });
};
