const assert = require('assert');
const { generateTokens, verifyJwt } = require('../utils/auth');
const authConfig = require('../config/auth');

module.exports = async function adminTests(it) {
  await it('should generate admin token with admin role', async () => {
    const adminUser = { id: 99, email: 'admin@digilocal.com', role: 'admin' };
    const tokens = generateTokens(adminUser);

    assert.ok(tokens.accessToken, 'Access token should be generated');
    const decoded = verifyJwt(tokens.accessToken, authConfig.jwt.secret);

    assert.strictEqual(decoded.role, 'admin', 'Decoded token role should be admin');
  });

  await it('should differentiate vendor vs admin tokens in role check', async () => {
    const vendorUser = { id: 1, email: 'vendor@digilocal.com', role: 'vendor', vendor_id: 1 };
    const tokens = generateTokens(vendorUser);

    const decoded = verifyJwt(tokens.accessToken, authConfig.jwt.secret);

    assert.strictEqual(decoded.role, 'vendor', 'Decoded token role should be vendor');
    assert.notStrictEqual(decoded.role, 'admin', 'Vendor role should not match admin');
  });
};
