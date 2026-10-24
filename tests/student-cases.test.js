// The three additional workloads required by the assignment (section 5).
// Data and hand-calculated expectations live in student-cases.data.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate } = require('../src/scheduler.js');
const { workload, timeline } = require('./helpers.js');
const CASES = require('./student-cases.data.js');

const round2 = (x) => Math.round(x * 100) / 100;

for (const c of CASES) {
  for (const [algorithm, expected] of Object.entries(c.expected)) {
    test(`${c.name}: ${algorithm}`, () => {
      const result = simulate(workload(c.processes), algorithm, { quantum: 2 });
      assert.equal(timeline(result), expected.timeline);
      assert.deepEqual(
        Object.fromEntries(Object.entries(result.averages).map(([k, v]) => [k, round2(v)])),
        expected.averages,
      );
      assert.deepEqual(result.violations, []);
    });
  }
}
