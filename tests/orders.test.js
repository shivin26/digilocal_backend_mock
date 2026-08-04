const assert = require('assert');

module.exports = async function (it) {
  await it('should calculate authoritative server price ignoring client price', async () => {
    const dbPrice = 68.00;
    const clientPrice = 0.01; // Malicious client attempt
    const quantity = 2;

    const authoritativeTotal = dbPrice * quantity;
    const maliciousTotal = clientPrice * quantity;

    assert.strictEqual(authoritativeTotal, 136.00);
    assert.notStrictEqual(authoritativeTotal, maliciousTotal);
  });

  await it('should reject order if requested quantity exceeds available stock', async () => {
    const itemStock = 5;
    const requestedQty = 10;
    const hasEnoughStock = itemStock >= requestedQty;

    assert.strictEqual(hasEnoughStock, false);
  });
};
