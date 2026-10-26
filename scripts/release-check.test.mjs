import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problems } from './release-check.mjs';

test('位置・既読・解析・ストリーク・管理者を見つける', () => {
  const bad = [
    'navigator.geolocation.getCurrentPosition(f)',
    'const it = { readAt: Date.now() }',
    'el.textContent = "既読"',
    'import { getAnalytics } from "firebase/analytics"',
    'const streak = 3',
    'user.isAdmin = true',
    'showTotal(); count(items)',
  ];
  for (const line of bad) assert.equal(problems([['x.js', line]]).length > 0, true, line);
});

test('ふつうのコードと、理由付きの例外は通す', () => {
  assert.deepEqual(problems([['x.js', 'Store.add("kurou", { text })']]), []);
  assert.deepEqual(problems([['x.js', 'const typingDelay = 1']]), []);
  assert.deepEqual(problems([['x.js', 'count(x) // release-check: ok 文字数を数えるだけ']]), []);
});
