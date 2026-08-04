const assert = require('assert');
const { hashPassword, comparePassword, generateTokens, verifyJwt, generateOTP, verifyOTP } = require('../utils/auth');
const authConfig = require('../config/auth');

module.exports = async function (it) {
  await it('should hash password with scrypt format', async () => {
    const rawPass = 'SecretVendorPassword123';
    const hash = await hashPassword(rawPass);
    assert.strictEqual(hash.startsWith('$scrypt$'), true);
  });

  await it('should compare and match correct scrypt password', async () => {
    const rawPass = 'SecretVendorPassword123';
    const hash = await hashPassword(rawPass);
    const result = await comparePassword(rawPass, hash);
    assert.strictEqual(result.matches, true);
  });

  await it('should reject incorrect password comparison', async () => {
    const hash = await hashPassword('CorrectPassword');
    const result = await comparePassword('WrongPassword', hash);
    assert.strictEqual(result.matches, false);
  });

  await it('should match legacy plaintext password and signal needsRehash', async () => {
    const legacyPass = 'vendor123';
    const result = await comparePassword('vendor123', legacyPass);
    assert.strictEqual(result.matches, true);
    assert.strictEqual(result.needsRehash, true);
  });

  await it('should generate valid JWT access and refresh tokens', async () => {
    const user = { vendor_id: 1, email: 'freshmart@gmail.com', role: 'vendor' };
    const tokens = generateTokens(user);
    assert.ok(tokens.accessToken);
    assert.ok(tokens.refreshToken);

    const decoded = verifyJwt(tokens.accessToken, authConfig.jwt.secret);
    assert.strictEqual(decoded.vendor_id, 1);
    assert.strictEqual(decoded.email, 'freshmart@gmail.com');
  });

  await it('should generate and verify 6-digit numeric OTP', async () => {
    const email = 'testvendor@digilocal.in';
    const otp = generateOTP(email);
    assert.strictEqual(otp.length, 6);

    const verification = verifyOTP(email, otp);
    assert.strictEqual(verification.valid, true);
  });
};
