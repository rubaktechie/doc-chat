import test from 'node:test';
import assert from 'node:assert/strict';

// Config reads env at import time, so pin the limit before importing.
process.env.TOKEN_LIMIT_PER_HOUR = '100';
const { checkBudget, recordUsage } = await import('../src/services/usage.js');

const HOUR = 60 * 60 * 1000;

test('budget allows until the hourly limit is reached', () => {
  const t0 = 1_000_000;
  assert.equal(checkBudget(1, t0).allowed, true);
  recordUsage(1, 60, t0);
  assert.equal(checkBudget(1, t0).allowed, true);
  recordUsage(1, 50, t0);
  assert.equal(checkBudget(1, t0).allowed, false);
  assert.equal(checkBudget(1, t0).remaining, 0);
});

test('budget resets after the window elapses', () => {
  const t0 = 2_000_000;
  recordUsage(2, 200, t0);
  assert.equal(checkBudget(2, t0).allowed, false);
  assert.equal(checkBudget(2, t0 + HOUR).allowed, true);
});

test('budgets are per user', () => {
  const t0 = 3_000_000;
  recordUsage(3, 200, t0);
  assert.equal(checkBudget(3, t0).allowed, false);
  assert.equal(checkBudget(4, t0).allowed, true);
});
