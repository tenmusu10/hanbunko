// firestore.rules のテスト：Firestore エミュレータで「2人だけ」「誰がどの欄を書けるか」を確かめる
// 使い方：npm run rules:test（firebase-tools・@firebase/rules-unit-testing・firebase と Java 21 が必要）
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, arrayUnion, arrayRemove } from 'firebase/firestore';

let env;
const DAY = '2026-10-26';
const db = uid => env.authenticatedContext(uid).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-hanbunko', firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
after(async () => { await env.cleanup(); });

async function pair(id) {
  await assertSucceeds(setDoc(doc(db('a'), 'pairs', id), { members: ['a'], day: DAY }));
  await assertSucceeds(updateDoc(doc(db('b'), 'pairs', id), { members: arrayUnion('b') }));
}

test('ペア：作る・入る・3人目は入れない・外の人は読めない', async () => {
  await assertFails(setDoc(doc(db('a'), 'pairs', 'p0'), { members: ['a', 'x'], day: DAY }));
  await assertFails(setDoc(doc(db('a'), 'pairs', 'p0'), { members: ['a'], day: DAY, admin: 'a' }));
  await pair('p1');
  await assertFails(updateDoc(doc(db('c'), 'pairs', 'p1'), { members: arrayUnion('c') }));
  await assertFails(getDoc(doc(db('c'), 'pairs', 'p1')));
  await assertSucceeds(getDoc(doc(db('b'), 'pairs', 'p1')));
});

test('ペア：自分だけ抜けられる・相手を外せない', async () => {
  await pair('p2');
  await assertFails(updateDoc(doc(db('a'), 'pairs', 'p2'), { members: arrayRemove('b') }));
  await assertSucceeds(updateDoc(doc(db('b'), 'pairs', 'p2'), { members: arrayRemove('b') }));
  await assertFails(getDoc(doc(db('b'), 'pairs', 'p2')));
});

test('中身：2人だけが読み書き・平文の欄は kind/by/day だけ', async () => {
  await pair('p3');
  const it = (uid, id) => doc(db(uid), 'pairs', 'p3', 'items', id);
  await assertSucceeds(setDoc(it('a', 'i1'), { kind: 'kurou', by: 'a', day: DAY, c: 'xxx' }));
  await assertFails(setDoc(it('a', 'i2'), { kind: 'kurou', by: 'b', day: DAY, c: 'xxx' }));
  await assertFails(setDoc(it('a', 'i3'), { kind: 'kurou', by: 'a', day: DAY, c: 'xxx', readAt: 1 }));
  await assertFails(setDoc(it('a', 'i4'), { kind: 'location', by: 'a', day: DAY, c: 'xxx' }));
  await assertFails(setDoc(it('c', 'i5'), { kind: 'kurou', by: 'c', day: DAY, c: 'xxx' }));
  await assertFails(getDoc(it('c', 'i1')));
  await assertSucceeds(getDoc(it('b', 'i1')));
});

test('中身：作った人は c だけ、相手は r だけ・消せるのは作った人だけ', async () => {
  await pair('p4');
  const it = uid => doc(db(uid), 'pairs', 'p4', 'items', 'i1');
  await assertSucceeds(setDoc(it('a'), { kind: 'kakera', by: 'a', day: DAY, c: 'xxx' }));
  await assertSucceeds(updateDoc(it('b'), { r: 'guess' }));
  await assertFails(updateDoc(it('b'), { c: 'rewrite' }));
  await assertFails(updateDoc(it('a'), { r: 'fake' }));
  await assertSucceeds(updateDoc(it('a'), { c: 'revealed' }));
  await assertFails(updateDoc(it('a'), { day: '2000-01-01' }));
  await assertSucceeds(updateDoc(it('b'), { r: deleteField() })); // 抜けるときに自分の返事を消す
  await assertFails(deleteDoc(it('b')));
  await assertSucceeds(deleteDoc(it('a')));
});
