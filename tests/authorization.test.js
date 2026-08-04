const assert = require('assert');
const { requireRole, requireVendorOwner } = require('../middleware/auth');

module.exports = async function (it) {
  await it('should permit user with matching RBAC role', async () => {
    const middleware = requireRole('admin');
    const req = { user: { role: 'admin' } };
    let calledNext = false;
    const res = { status: () => res, json: () => res };
    const next = () => { calledNext = true; };

    middleware(req, res, next);
    assert.strictEqual(calledNext, true);
  });

  await it('should reject user with non-matching RBAC role', async () => {
    const middleware = requireRole('admin');
    const req = { user: { role: 'vendor' } };
    let statusCode = 0;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: () => res
    };

    middleware(req, res, () => {});
    assert.strictEqual(statusCode, 403);
  });

  await it('should permit vendor owner accessing their own resource', async () => {
    const req = { user: { vendor_id: 1, role: 'vendor' }, params: { vendorId: 1 } };
    let calledNext = false;
    const res = { status: () => res, json: () => res };
    const next = () => { calledNext = true; };

    requireVendorOwner(req, res, next);
    assert.strictEqual(calledNext, true);
  });

  await it('should reject vendor trying to access another vendor resource (IDOR Protection)', async () => {
    const req = { user: { vendor_id: 1, role: 'vendor' }, params: { vendorId: 2 } };
    let statusCode = 0;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: () => res
    };

    requireVendorOwner(req, res, () => {});
    assert.strictEqual(statusCode, 403);
  });
};
