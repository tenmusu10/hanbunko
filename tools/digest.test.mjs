// まとめ通知の宛先選び（tools/digest.mjs の plan）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, jstDays, message, BODY } from './digest.mjs';

test('日本の暦で昨日と今日', () => {
  assert.deepEqual(jstDays(new Date('2026-10-27T12:00:00Z')), ['2026-10-26', '2026-10-27']);
  assert.deepEqual(jstDays(new Date('2026-10-31T16:00:00Z')), ['2026-10-31', '2026-11-01']); // 日本では11月1日の1時
});

test('相手から新しく届いたものがある人にだけ送る・自分の投稿では送らない', () => {
  const r = plan(['a', 'b'], [{ uid: 'a', t: 'ta' }, { uid: 'b', t: 'tb' }], [{ id: 'i1', by: 'a' }]);
  assert.deepEqual(r.map(p => [p.uid, p.send]), [['a', false], ['b', true]]);
});

test('一度お知らせしたものでは二度送らない・新しいものが増えたら送る', () => {
  const items = [{ id: 'i1', by: 'a' }];
  assert.equal(plan(['a', 'b'], [{ uid: 'b', t: 'tb', sent: ['i1'] }], items)[0].send, false);
  const r = plan(['a', 'b'], [{ uid: 'b', t: 'tb', sent: ['i1'] }], [...items, { id: 'i2', by: 'a' }])[0];
  assert.equal(r.send, true); assert.deepEqual(r.sent, ['i1', 'i2']);
  // 古いものは sent から落とす（持ち続けない）
  assert.deepEqual(plan(['a', 'b'], [{ uid: 'b', t: 'tb', sent: ['i0'] }], [])[0], { uid: 'b', token: 'tb', send: false, sent: [], changed: true });
});

test('ひとりのペア・ペアの外の宛先には送らない', () => {
  assert.deepEqual(plan(['a'], [{ uid: 'a', t: 'ta' }], [{ id: 'i1', by: 'b' }]), []);
  assert.deepEqual(plan(['a', 'b'], [{ uid: 'x', t: 'tx' }], [{ id: 'i1', by: 'a' }]), []);
});

test('通知の文は決まった一文だけ（数・中身・催促を含まない）', () => {
  const m = JSON.stringify(message('t'));
  assert.ok(m.includes(BODY));
  assert.ok(!/\d+(件|個|つ)|まだ|返事|未回答|既読/.test(BODY));
});
