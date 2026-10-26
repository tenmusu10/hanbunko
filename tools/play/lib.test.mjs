// Play リリースの下準備のテスト：npm run play:test（metabo-burst から流用）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGradleVersion, writeGradleVersion, bumpPatch, nextVersion, cleanSubject, politeSubject, releaseNotes, storeListing, storeFields, checkServiceAccount } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gradle = 'defaultConfig {\n        versionCode 7\n        versionName "1.0.6"\n}\n';

test('build.gradle の番号を読み書きする', () => {
  assert.deepEqual(readGradleVersion(gradle), { code: 7, name: '1.0.6' });
  const out = writeGradleVersion(gradle, { code: 12, name: '1.1.0' });
  assert.deepEqual(readGradleVersion(out), { code: 12, name: '1.1.0' });
  assert.match(out, /^ {8}versionCode 12$/m);
  assert.throws(() => readGradleVersion('versionCode x'), /見つかりません/);
  // 本物の build.gradle も読める
  const real = readGradleVersion(fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8'));
  assert.ok(real.code >= 1);
});

test('versionCode は前回より必ず上がる', () => {
  const g = { code: 7, name: '1.0.6' };
  // 手で上げてあればそのまま
  assert.deepEqual(nextVersion({ gradle: g, lastTag: 6 }), { code: 7, name: '1.0.6', bumped: false });
  // 同じ番号なら +1、名前の最後の数字も上げる
  assert.deepEqual(nextVersion({ gradle: g, lastTag: 7 }), { code: 8, name: '1.0.7', bumped: true });
  // 何回か自動で上げた後（build.gradle は 7 のまま、前回 10）
  assert.deepEqual(nextVersion({ gradle: g, lastTag: 10 }), { code: 11, name: '1.0.10', bumped: true });
  // タグが無い
  assert.equal(nextVersion({ gradle: g, lastTag: null }).code, 7);
  // 名前を指定
  assert.equal(nextVersion({ gradle: g, lastTag: 7, nameOverride: ' 1.1.0 ' }).name, '1.1.0');
  assert.throws(() => nextVersion({ gradle: g, lastTag: 7, nameOverride: '1.1"; rm' }), /使えない文字/);
  assert.throws(() => bumpPatch('beta', 1), /数字ではない/);
});

test('新機能の文：入力欄 → ファイル → コミットの件名', () => {
  const subjects = ['5面を追加 (#64)', '4面を追加 (#63)', '4面を追加 (#63)'];
  assert.deepEqual(releaseNotes({ input: '1行目\\n2行目', file: 'ファイル', fileChanged: true, subjects }), { text: '1行目\n2行目', source: '入力欄' });
  assert.equal(releaseNotes({ file: ' ファイル\n', fileChanged: true, subjects }).text, 'ファイル');
  // 書き換えていないファイルは古いので使わない
  assert.equal(releaseNotes({ file: '古い', fileChanged: false, subjects }).text, '・5面を追加\n・4面を追加');
  assert.equal(releaseNotes({}).text, '細かな修正をしました。');
  assert.throws(() => releaseNotes({ input: 'あ'.repeat(501) }), /500 字/);
  assert.equal(cleanSubject('修正 (#12) '), '修正');
});

test('件名の言い切りを「〜しました」にする', () => {
  const cases = {
    '縦シューに慣れていない人向けに「かんたんモード」を追加する': '縦シューに慣れていない人向けに「かんたんモード」を追加しました',
    'タイトルの文字が折り返さないようにする': 'タイトルの文字が折り返さないようにしました',
    '実績の解除通知をまとめて出す': '実績の解除通知をまとめて出しました',
    '狙い線が顔に届くと「当たる！」で知らせる': '狙い線が顔に届くと「当たる！」で知らせました',
    '全面突破すると実績「かんたん帰宅」が取れる': '全面突破すると実績「かんたん帰宅」が取れるようにしました',
    'ドリンク広告を直す': 'ドリンク広告を直しました',
    'ボスの体力が減る': 'ボスの体力が減りました',
    'ボス前に空白を入れる': 'ボス前に空白を入れました',
    'ストーリーの文を文節で折り返す（熟語の途中で改行しない）': 'ストーリーの文を文節で折り返しました（熟語の途中で改行しない）',
    'エンディングの画面を見る': 'エンディングの画面を見ました',
    // 動詞で終わらないもの・もう丁寧なもの・否定はそのまま
    '4面を追加': '4面を追加',
    '2本目の指の長押しで狙い撃ち': '2本目の指の長押しで狙い撃ち',
    'versionCode を上げました': 'versionCode を上げました',
    'tools/ だけの変更は数えない': 'tools/ だけの変更は数えない',
  };
  for (const [from, to] of Object.entries(cases)) assert.equal(politeSubject(from), to, from);
  assert.equal(releaseNotes({ subjects: ['5面を追加する (#64)'] }).text, '・5面を追加しました');
});

test('コミットが多いときは 500 字に収めて「ほか N 件」', () => {
  const subjects = Array.from({ length: 60 }, (_, i) => `変更その${i}をしました`);
  const { text } = releaseNotes({ subjects });
  assert.ok(text.length <= 500, text.length);
  const m = text.match(/ほか (\d+) 件の修正$/);
  assert.ok(m);
  assert.equal(text.split('\n').length - 1 + Number(m[1]), 60);
});

// はんぶんこの STORE.md と同じ形の小さな見本
const store = (title = 'はんぶんこ - ふたりで仕上げる共有アプリ', extra = '') => `# ストア掲載文\n\n説明\n\n---\n\n## Google Play\n\n### アプリ名（30字まで）\n\n\`\`\`text\n${title}\n\`\`\`\n\n### 短い説明（80字まで）\n\n\`\`\`text\n半分だけ渡して残りは2人で埋める。\n\`\`\`\n\n### 詳しい説明（4000字まで）\n\n\`\`\`text\n決めるのは、半分だけ。\n\n■ 半分の予定\n\`\`\`\n${extra}\n## App Store\n\n### 名前（30字まで）\n\n\`\`\`text\n別の名前\n\`\`\`\n`;

test('STORE.md から Google Play の掲載文を取り出す', () => {
  const l = storeListing(store());
  assert.equal(l.title, 'はんぶんこ - ふたりで仕上げる共有アプリ');
  assert.equal(l.short, '半分だけ渡して残りは2人で埋める。');
  assert.equal(l.full, '決めるのは、半分だけ。\n\n■ 半分の予定');
  assert.throws(() => storeListing(store('あ'.repeat(31))), /30 字/);
  assert.throws(() => storeListing('## Google Play\n### アプリ名\n```text\nx\n```\n'), /短い説明/);
  // App Store の欄は Play に混ざらない
  assert.equal(storeFields(store())['App Store/名前'], '別の名前');
  assert.throws(() => storeListing(store('1行目\n2行目')), /1行/);
});

test('リポジトリに STORE.md があれば、Play の上限に収まっている', () => {
  const f = path.join(ROOT, 'STORE.md');
  if (!fs.existsSync(f)) return; // 紹介ページ・ストア素材の PR が入るまでは無い
  const l = storeListing(fs.readFileSync(f, 'utf8'));
  assert.ok(l.title && l.short && l.full);
});

test('サービスアカウントの鍵の形', () => {
  const ok = JSON.stringify({ type: 'service_account', client_email: 'a@b.iam.gserviceaccount.com', private_key: '-----BEGIN' });
  assert.deepEqual(checkServiceAccount(ok), { email: 'a@b.iam.gserviceaccount.com' });
  assert.throws(() => checkServiceAccount('{'), /JSON として読めません/);
  assert.throws(() => checkServiceAccount('{"type":"authorized_user"}'), /サービスアカウント/);
  // エラーに鍵の中身を出さない
  try { checkServiceAccount('{"type":"service_account","client_email":"x","private_key":""}'); } catch (e) { assert.doesNotMatch(e.message, /BEGIN/); }
});
