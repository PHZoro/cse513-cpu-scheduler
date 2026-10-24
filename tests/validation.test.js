const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, simulate } = require('../src/scheduler.js');

const errorsFor = (processes, options) => validate(processes, options).errors;

test('valid form input (strings) is accepted and normalized', () => {
  const result = validate([{ id: ' P1 ', arrival: '0', burst: '3' }], { algorithm: 'RR', quantum: '2' });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.processes, [{ id: 'P1', arrival: 0, burst: 3, index: 0 }]);
  assert.equal(result.quantum, 2);
});

test('an empty process list is rejected', () => {
  assert.deepEqual(errorsFor([]), ['Add at least one process.']);
});

test('duplicate IDs are rejected with both row numbers', () => {
  const errors = errorsFor([
    { id: 'P1', arrival: 0, burst: 1 },
    { id: 'P1', arrival: 1, burst: 1 },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Row 2.*"P1".*row 1/);
});

test('a missing ID is rejected', () => {
  assert.match(errorsFor([{ id: '  ', arrival: 0, burst: 1 }])[0], /process ID is required/);
});

test('negative arrival times are rejected', () => {
  assert.match(errorsFor([{ id: 'P1', arrival: -1, burst: 1 }])[0], /arrival time must be 0 or greater/);
});

test('zero and negative bursts are rejected', () => {
  assert.match(errorsFor([{ id: 'P1', arrival: 0, burst: 0 }])[0], /CPU burst must be at least 1/);
  assert.match(errorsFor([{ id: 'P1', arrival: 0, burst: '-2' }])[0], /CPU burst must be at least 1/);
});

test('non-integer and non-numeric values are rejected', () => {
  for (const bad of [1.5, '2.0', 'abc', '1e3', NaN, Infinity]) {
    const errors = errorsFor([{ id: 'P1', arrival: bad, burst: 1 }]);
    assert.match(errors[0], /must be a whole number/, `arrival ${bad}`);
  }
});

test('empty numeric fields are reported as required', () => {
  assert.match(errorsFor([{ id: 'P1', arrival: '', burst: 1 }])[0], /arrival time is required/);
});

test('round robin requires a positive integer quantum', () => {
  const p = [{ id: 'P1', arrival: 0, burst: 1 }];
  assert.match(errorsFor(p, { algorithm: 'RR', quantum: 0 })[0], /Time quantum must be at least 1/);
  assert.match(errorsFor(p, { algorithm: 'RR', quantum: '' })[0], /Time quantum is required/);
  assert.match(errorsFor(p, { algorithm: 'RR', quantum: 1.5 })[0], /whole number/);
  // Other algorithms ignore the quantum.
  assert.deepEqual(errorsFor(p, { algorithm: 'FCFS', quantum: 0 }), []);
});

test('an unknown algorithm is rejected', () => {
  assert.match(errorsFor([{ id: 'P1', arrival: 0, burst: 1 }], { algorithm: 'LIFO' })[0], /Unknown algorithm/);
});

test('all problems are reported at once', () => {
  const errors = errorsFor([
    { id: 'P1', arrival: -1, burst: 0 },
    { id: 'P1', arrival: 'x', burst: 2 },
  ]);
  assert.equal(errors.length, 4);
});

test('simulate refuses invalid input and exposes the error list', () => {
  assert.throws(
    () => simulate([{ id: 'P1', arrival: 0, burst: 0 }], 'FCFS'),
    (error) => Array.isArray(error.errors) && /CPU burst/.test(error.errors[0]),
  );
});
