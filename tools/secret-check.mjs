// 秘密ファイルのうっかりコミットを止める：署名鍵・サービスアカウントの鍵・.env・デプロイ鍵をファイル名と中身で探す
// 単体でも動く：node tools/secret-check.mjs（見つかれば一覧を出して終了コード1）。CI が毎回回す（metabo-burst から流用）
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// .gitignore と同じ並び。名前だけで秘密と分かるもの（google-services.json は公開用の値だけでも、CLAUDE.md の決まりでコミットしない）
const SECRET_NAME = /(^|\/)(.*\.(jks|keystore|p12|pfx)|keystore\.properties|\.env(\..*)?|.*service-account.*\.json|google-services\.json|GoogleService-Info\.plist|deploy(\.pub)?)$/i;
// 中身：PEM の秘密鍵（改行そのもの か JSON の \n のあとに本体が続くもの）。説明文やテストの「-----BEGIN」だけは引っかけない
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----(\r?\n|\\n)[A-Za-z0-9+/=]{40,}/;
const MAX_SCAN = 2 << 20; // 2MB を超えるもの（画像・音）は中身を見ない

// files：調べるパスの一覧、read：中身を返す関数（読めない・大きすぎるときは null）
export function secretProblems(files, read) {
  const out = [];
  for (const f of files) {
    if (SECRET_NAME.test(f)) { out.push(`${f}：秘密ファイルの名前です（コミットせず、GitHub の Secrets に入れる）`); continue; }
    const s = read(f);
    if (s != null && PRIVATE_KEY.test(s)) out.push(`${f}：秘密鍵の中身が入っています`);
  }
  return out;
}

// git が追跡しているファイル＋まだ追加していない新しいファイル（.gitignore で除いたものは見ない）
export function candidateFiles() {
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
  return [...new Set((git('ls-files') + git('ls-files', '--others', '--exclude-standard')).split('\n').filter(Boolean))];
}

function readSmall(f) {
  try { return statSync(f).size > MAX_SCAN ? null : readFileSync(f, 'utf8'); } catch { return null; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const probs = secretProblems(candidateFiles(), readSmall);
  if (probs.length) {
    console.error('秘密ファイルが見つかりました：\n' + probs.map(p => '  - ' + p).join('\n'));
    console.error('git rm --cached <ファイル> で外し、鍵が push 済みなら作り直してください');
    process.exit(1);
  }
  console.log('秘密ファイルは見つかりませんでした');
}
