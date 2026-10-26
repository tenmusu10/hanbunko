// 反束縛チェック：相手を確かめる道具になる機能や、使い方を集める仕組みが入っていないかを調べる
// 単体でも動く：node scripts/release-check.mjs（見つかれば一覧を出して終了コード1）。CI で PR ごとに回す
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 見つけたら止める言葉。理由はそのまま利用者への約束（CLAUDE.md の「反束縛の原則」）
export const RULES = [
  [/navigator\.geolocation|ACCESS_(FINE|COARSE|BACKGROUND)_LOCATION|@capacitor\/geolocation/, '位置情報を使っている（原則1：位置は共有しない）'],
  [/\b(readAt|seenAt|lastSeen|lastActive|lastLogin|isOnline|onlineAt|typing)\b/, '既読・最終ログイン・オンライン状態を持とうとしている（原則1）'],
  [/既読|オンライン中|最終ログイン|入力中/, '既読やオンライン状態を画面に出している（原則1）'],
  [/\bstreak\b|連続記録|日連続/, '連続記録（ストリーク）を作っている（原則2：強制しない）'],
  [/firebase\/analytics|getAnalytics|gtag\(|googletagmanager|google-analytics|mixpanel|amplitude|segment\.(io|com)|@capacitor-firebase\/analytics/, '使い方を集める解析 SDK が入っている（原則1）'],
  [/\b(count|total|ranking|score)\s*\(/i, '回数・合計・ランキングを出す関数がある（原則3：比べない）。数える理由があるなら CLAUDE.md の原則と照らして相談する'],
  [/isAdmin|role\s*[:=]\s*['"]admin/, '片方だけの管理者権限を作っている（原則6：2人は対等）'],
];

// 調べる場所と、調べない場所（このチェック自体・テスト・生成物）
const ROOTS = ['index.html', 'js', 'android/app/src/main', 'capacitor.config.json', 'firestore.rules', 'package.json'];
const SKIP = /node_modules|\/build\/|\.png$|\.webp$|\.jpg$|\.woff2?$/;

function files(p) {
  if (!existsSync(p) || SKIP.test(p)) return [];
  return statSync(p).isDirectory() ? readdirSync(p).flatMap(f => files(join(p, f))) : [p];
}

export function problems(texts) {
  const out = [];
  for (const [file, text] of texts) text.split('\n').forEach((line, i) => {
    if (/release-check: ok/.test(line)) return; // どうしても必要な行は理由を書いてこの印を付ける
    if (/^\s*(\/\/|\*|<!--)/.test(line)) return; // 「持たない」と書いた説明のコメントは数えない
    for (const [re, why] of RULES) if (re.test(line)) out.push(`${file}:${i + 1}：${why}\n    ${line.trim().slice(0, 120)}`);
  });
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const list = problems(ROOTS.flatMap(files).map(f => [f, readFileSync(f, 'utf8')]));
  if (list.length) { console.error('反束縛チェックで止めました：\n' + list.join('\n')); process.exit(1); }
  console.log('反束縛チェック：問題なし');
}
