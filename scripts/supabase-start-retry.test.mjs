import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startWithRetry } from './supabase-start-retry.mjs';

test('retries startup with cleanup, distinct configuration and backoff', () => {
  const calls = [];
  let attempt = 0;
  startWithRetry({
    configure: n => calls.push(`config ${n}`),
    start: () => { calls.push('start'); if (++attempt < 3) throw new Error('start failed'); },
    cleanup: () => calls.push('cleanup'),
    wait: ms => calls.push(`wait ${ms}`),
  });
  assert.deepEqual(calls, ['config 1', 'start', 'cleanup', 'wait 2000', 'config 2', 'start', 'cleanup', 'wait 4000', 'config 3', 'start']);
});

test('stops after three failures and propagates the last error', () => {
  let starts = 0; let cleanups = 0;
  assert.throws(() => startWithRetry({ configure: () => {}, start: () => { starts += 1; throw new Error('failure'); }, cleanup: () => { cleanups += 1; }, wait: () => {} }), /failure/);
  assert.equal(starts, 3); assert.equal(cleanups, 2);
});

test('stops immediately if cleanup fails', () => {
  let starts = 0;
  assert.throws(() => startWithRetry({ configure: () => {}, start: () => { starts += 1; throw new Error('start'); }, cleanup: () => { throw new Error('cleanup'); }, wait: () => {} }), /cleanup/);
  assert.equal(starts, 1);
});
