// secret-check.mjs のテスト：node --test tools/secret-check.test.mjs（npm test と CI が回す）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secretProblems } from './secret-check.mjs';

// 本物そっくりの鍵をリポジトリに置かないよう、テストの中で組み立てる
const pem = '-----BEGIN ' + 'PRIVATE KEY-----\n' + 'A'.repeat(64) + '\n-----END PRIVATE KEY-----\n';
const none = () => null;

test('署名鍵・.env・サービスアカウント・google-services.json・デプロイ鍵は名前で止める', () => {
  for (const f of ['hanbunko.jks', 'android/app/upload.keystore', 'android/keystore.properties', '.env', '.env.local',
    'play-service-account.json', 'firebase-service-account.json', 'android/app/google-services.json', 'ios/App/GoogleService-Info.plist', 'deploy', 'deploy.pub', 'cert.p12']) {
    assert.equal(secretProblems([f], none).length, 1, f);
  }
});

test('ふつうのファイルは通す', () => {
  assert.deepEqual(secretProblems(['js/remote.js', 'js/firebase-config.js', 'firestore.rules', '.github/workflows/ci.yml', 'environment.md', 'deploy.md'], none), []);
});

test('中身に秘密鍵があれば名前に関係なく止める（PEM・JSON の \\n どちらも）', () => {
  assert.equal(secretProblems(['notes.txt'], () => pem).length, 1);
  const json = JSON.stringify({ type: 'service_account', private_key: pem });
  assert.equal(secretProblems(['x.json'], () => json).length, 1);
});

test('説明文やテストの「-----BEGIN」だけでは止めない', () => {
  const doc = 'echo "-----BEGIN OPENSSH ' + 'PRIVATE KEY----- から -----END OPENSSH PRIVATE KEY----- までを貼る"';
  assert.deepEqual(secretProblems(['ci.yml'], () => doc), []);
  assert.deepEqual(secretProblems(['t.mjs'], () => JSON.stringify({ private_key: '-----BEGIN' })), []);
});
