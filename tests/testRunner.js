const assert = require('assert');

/**
 * Enterprise Production Test Runner & Reporter.
 * Zero external dependency test harness supporting async unit & integration test suites.
 */
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.total = 0;
    this.suites = [];
  }

  async runSuite(name, fn) {
    console.log(`\n🧪 Running Test Suite: [${name}]`);
    console.log(`--------------------------------------------------`);
    const suiteResult = { name, passed: 0, failed: 0, tests: [] };

    const it = async (testName, testFn) => {
      this.total += 1;
      try {
        await testFn();
        this.passed += 1;
        suiteResult.passed += 1;
        console.log(`  ✅ PASS: ${testName}`);
        suiteResult.tests.push({ name: testName, status: 'PASS' });
      } catch (err) {
        this.failed += 1;
        suiteResult.failed += 1;
        console.error(`  ❌ FAIL: ${testName}`);
        console.error(`     Error: ${err.message}`);
        suiteResult.tests.push({ name: testName, status: 'FAIL', error: err.message });
      }
    };

    try {
      await fn(it);
    } catch (suiteErr) {
      console.error(`  💥 Suite Error in ${name}:`, suiteErr.message);
    }

    this.suites.push(suiteResult);
  }

  report() {
    console.log(`\n==================================================`);
    console.log(`📊 TEST COVERAGE SUMMARY REPORT`);
    console.log(`==================================================`);
    console.log(` Total Suites : ${this.suites.length}`);
    console.log(` Total Tests  : ${this.total}`);
    console.log(` Passed Tests : ${this.passed}`);
    console.log(` Failed Tests : ${this.failed}`);
    const passRate = this.total > 0 ? ((this.passed / this.total) * 100).toFixed(1) : 0;
    console.log(` Pass Rate    : ${passRate}%`);
    console.log(`==================================================\n`);

    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

const runner = new TestRunner();

async function executeAllTests() {
  const authTests = require('./auth.test');
  const authzTests = require('./authorization.test');
  const ordersTests = require('./orders.test');
  const paymentsTests = require('./payments.test');
  const adminTests = require('./admin.test');

  await runner.runSuite('Authentication System', authTests);
  await runner.runSuite('Authorization & IDOR Guards', authzTests);
  await runner.runSuite('Orders & Authoritative Pricing', ordersTests);
  await runner.runSuite('Payment Signature & Security', paymentsTests);
  await runner.runSuite('Admin System & RBAC Authorization', adminTests);

  runner.report();
}

if (require.main === module) {
  executeAllTests();
}

module.exports = { runner, executeAllTests };
