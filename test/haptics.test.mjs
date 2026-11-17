/**
 * Kiem thu rung nhac luot. Khong goi thiet bi that: navigator gia.
 */
import assert from 'node:assert/strict';
import {
  TURN_VIBRATION_MS,
  vibrateTurn,
  vibrationSupported,
} from '../public/js/haptics.js';

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(error);
  }
}

function fakeNavigator(result = true) {
  const calls = [];
  return {
    calls,
    vibrate(pattern) {
      calls.push(pattern);
      return result;
    },
  };
}

await check('haptics: thiet bi ho tro thi rung mot lan voi pattern ngan', () => {
  const nav = fakeNavigator(true);
  assert.equal(vibrationSupported(nav), true);
  assert.equal(vibrateTurn({ nav }), true);
  assert.deepEqual(nav.calls, [TURN_VIBRATION_MS]);
  assert.ok(TURN_VIBRATION_MS > 0 && TURN_VIBRATION_MS <= 50);
});

await check('haptics: tat trong cai dat thi khong goi vibrate', () => {
  const nav = fakeNavigator();
  assert.equal(vibrateTurn({ enabled: false, nav }), false);
  assert.equal(nav.calls.length, 0);
});

await check('haptics: tab an thi khong rung', () => {
  const nav = fakeNavigator();
  assert.equal(vibrateTurn({ visible: false, nav }), false);
  assert.equal(nav.calls.length, 0);
});

await check('haptics: trinh duyet khong ho tro thi im lang, khong loi', () => {
  assert.equal(vibrationSupported(), false); // Node khong co navigator.vibrate
  assert.equal(vibrateTurn(), false);
  assert.equal(vibrateTurn({ nav: null }), false);
  assert.equal(vibrationSupported({}), false);
});

await check('haptics: vibrate tra false hoac nem loi deu khong lam vo game', () => {
  assert.equal(vibrateTurn({ nav: fakeNavigator(false) }), false);
  const throwing = {
    vibrate() {
      throw new Error('blocked');
    },
  };
  assert.equal(vibrateTurn({ nav: throwing }), false);
});

console.log(`\nTat ca ${passed} test rung deu thanh cong`);
if (failed) {
  console.error(`${failed} test rung that bai`);
  process.exit(1);
}
