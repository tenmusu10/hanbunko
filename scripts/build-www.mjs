// アプリに入れるファイルを www/ にまとめる（Capacitor の webDir。metabo-burst の build-www.mjs と同じ形）
// --release：反束縛チェックと秘密ファイルチェックに通らなければ中止し、通れば試作用の表示（SHOW_TEST）を消して出力する
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const release = process.argv.includes('--release');
if (release) {
  for (const s of ['scripts/release-check.mjs', 'tools/secret-check.mjs']) {
    if (!existsSync(s)) continue;
    try { execFileSync('node', [s], { stdio: 'inherit' }); } catch { console.error(`${s} で止まったので、公開用の www/ は作りません`); process.exit(1); }
  }
}
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
// アプリ本体だけを入れる（site/・store/・tools/ などは入れない）。icon.svg はあれば。sw.js はウェブ版の通知用（アプリ版では使わない）
for (const p of ['index.html', 'style.css', 'js', 'icon.svg', 'sw.js']) if (existsSync(p)) cpSync(p, `www/${p}`, { recursive: true });
// アプリ版のまとめ通知は google-services.json（Firebase の Android 用設定。コミットしない）があるときだけ
if (existsSync('android/app/google-services.json')) {
  const f = 'www/js/config.js';
  writeFileSync(f, readFileSync(f, 'utf8').replace('const NATIVE_PUSH = false;', 'const NATIVE_PUSH = true;'));
}
if (release) {
  const f = 'www/js/config.js', s = readFileSync(f, 'utf8');
  if (!/const SHOW_TEST = (true|false);/.test(s)) { console.error('js/config.js の SHOW_TEST が見つかりません'); process.exit(1); }
  writeFileSync(f, s.replace(/const SHOW_TEST = true;/, 'const SHOW_TEST = false;'));
}
console.log(release ? 'www/ を公開用に作成しました' : 'www/ を作成しました');
