/**
 * Kiem thu logic cho su co server Render dang ngu:
 * - /api/auth/me loi mang/timeout thi giu nguyen dang nhap, chi ve khach khi
 *   server noi ro (401 hoac user:null).
 * - Thu lai tang dan, toi da ~90 giay, khong thu lai khi offline hay khi server
 *   da tra loi ro rang.
 */
import assert from 'node:assert/strict';

import {
  WAKE_MAX_DELAY_MS,
  WAKE_RETRY_MS,
  isRetriableError,
  resolveAccountUser,
  retryWhileWaking,
} from '../public/js/wake.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  not ok - ${name}`);
    console.log(String(error?.stack || error));
  }
}

const user = { id: 'u1', username: 'meo_alpha', displayName: 'Mèo Alpha' };
const networkError = Object.assign(new Error('network'), { code: 'NETWORK', status: 0 });
const authError = Object.assign(new Error('auth'), { code: 'AUTH_REQUIRED', status: 401 });

console.log('wake retry');

await test('network error is retriable but 4xx is not', () => {
  assert.equal(isRetriableError(networkError), true);
  assert.equal(isRetriableError(Object.assign(new Error('x'), { code: 'HTTP_0', status: 0 })), true);
  assert.equal(isRetriableError(Object.assign(new Error('x'), { status: 502 })), true);
  assert.equal(isRetriableError(Object.assign(new Error('x'), { status: 429 })), false);
  assert.equal(isRetriableError(authError), false);
  assert.equal(isRetriableError(null), false);
});

await test('refreshAccount keeps the logged-in user on network/timeout errors', () => {
  assert.equal(resolveAccountUser(user, null, networkError), user);
  assert.equal(
    resolveAccountUser(user, null, Object.assign(new Error('slow'), { status: 503 })),
    user
  );
});

await test('refreshAccount only becomes guest on 401 or explicit user:null', () => {
  assert.equal(resolveAccountUser(user, null, authError), null);
  assert.equal(resolveAccountUser(user, { user: null }, null), null);
  assert.equal(resolveAccountUser(user, { user }, null), user);
  assert.equal(resolveAccountUser(null, null, networkError), null);
});

await test('retries with increasing backoff until the server wakes', async () => {
  const delays = [];
  let calls = 0;
  let waits = 0;
  const result = await retryWhileWaking(
    async () => {
      calls += 1;
      if (calls < 4) throw networkError;
      return { user };
    },
    {
      onWait: () => {
        waits += 1;
      },
      sleepFn: async (ms) => {
        delays.push(ms);
      },
    }
  );
  assert.deepEqual(result, { user });
  assert.equal(calls, 4);
  assert.equal(waits, 1);
  assert.deepEqual(delays, [1200, 1920, 3072]);
  assert.ok(delays[0] < delays[1] && delays[1] < delays[2]);
  assert.ok(delays.every((ms) => ms <= WAKE_MAX_DELAY_MS));
});

await test('gives up after about 90 seconds and keeps throwing the last error', async () => {
  let clock = 0;
  let calls = 0;
  const delays = [];
  await assert.rejects(
    retryWhileWaking(
      async () => {
        calls += 1;
        throw networkError;
      },
      {
        now: () => clock,
        sleepFn: async (ms) => {
          delays.push(ms);
          clock += ms;
        },
      }
    ),
    (error) => error === networkError
  );
  assert.ok(clock >= WAKE_RETRY_MS, `elapsed ${clock}`);
  assert.ok(clock - WAKE_RETRY_MS < WAKE_MAX_DELAY_MS, `elapsed ${clock}`);
  assert.ok(calls > 5);
  assert.equal(delays.at(-1), WAKE_MAX_DELAY_MS);
});

await test('does not retry when the browser reports offline', async () => {
  let calls = 0;
  await assert.rejects(
    retryWhileWaking(
      async () => {
        calls += 1;
        throw networkError;
      },
      { isOnline: () => false }
    ),
    (error) => error === networkError
  );
  assert.equal(calls, 1);
});

await test('does not retry a clear 4xx answer from the server', async () => {
  let calls = 0;
  const error = Object.assign(new Error('invalid'), { code: 'RESET_TOKEN_INVALID', status: 400 });
  await assert.rejects(
    retryWhileWaking(async () => {
      calls += 1;
      throw error;
    }),
    (thrown) => thrown === error
  );
  assert.equal(calls, 1);
});

await test('successful tasks are not delayed', async () => {
  let slept = 0;
  const result = await retryWhileWaking(() => Promise.resolve({ ok: true }), {
    sleepFn: async () => {
      slept += 1;
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(slept, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
