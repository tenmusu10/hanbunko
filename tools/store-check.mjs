// ストア掲載文の確認：STORE.md の各項目が文字数の上限に収まっているか、空でないかを見る
// 使い方：node tools/store-check.mjs [STORE.md のパス]
import { readFileSync } from 'node:fs';

// 見出し → 上限の文字数。Play も App Store も文字数で数える
const LIMITS = {
  'Google Play/アプリ名': 30,
  'Google Play/短い説明': 80,
  'Google Play/詳しい説明': 4000,
  'Google Play/新機能': 500,
  'App Store/名前': 30,
  'App Store/サブタイトル': 30,
  'App Store/プロモーションテキスト': 170,
  'App Store/キーワード': 100,
};

// ## で店、### で項目。項目の直後の ```text ブロックが中身
export function parseStore(md) {
  const out = {};
  let shop = '', field = '';
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('## ')) { shop = l.slice(3).replace(/（.*$/, '').trim(); field = ''; }
    else if (l.startsWith('### ')) field = l.slice(4).replace(/（.*$/, '').trim();
    else if (l === '```text' && field) {
      const body = [];
      for (i++; i < lines.length && lines[i] !== '```'; i++) body.push(lines[i]);
      out[`${shop}/${field}`] = body.join('\n');
      field = '';
    }
  }
  return out;
}

// 「- id: 見出し｜小見出し」の一覧（スクショとフィーチャーグラフィック用）
export function parseCaptions(md, section) {
  const start = md.indexOf(`## ${section}`);
  if (start < 0) return [];
  const rest = md.slice(start).split('\n').slice(1);
  const end = rest.findIndex(l => l.startsWith('## ') || l.startsWith('---'));
  return rest.slice(0, end < 0 ? undefined : end)
    .map(l => l.match(/^- ([\w-]+): (.+?)｜(.+)$/))
    .filter(Boolean)
    .map(([, id, title, sub]) => ({ id, title, sub }));
}

const len = s => [...s].length;

if (import.meta.url === `file://${process.argv[1]}`) {
  const md = readFileSync(process.argv[2] || 'STORE.md', 'utf8');
  const fields = parseStore(md);
  let bad = 0;
  for (const [key, max] of Object.entries(LIMITS)) {
    const v = fields[key];
    if (v === undefined || !v.trim()) { console.log(`NG   ${key}：見つからないか空です`); bad++; continue; }
    const n = len(v);
    console.log(`${n <= max ? 'OK  ' : 'NG  '} ${key}：${n} / ${max}字`);
    if (n > max) bad++;
  }
  const kw = fields['App Store/キーワード'] || '';
  if (/[、\s]/.test(kw)) { console.log('NG   App Store/キーワード：区切りは半角カンマだけにしてください'); bad++; }
  const shots = parseCaptions(md, 'スクショの見出し');
  console.log(`${shots.length >= 2 ? 'OK  ' : 'NG  '} スクショの見出し：${shots.length}枚（Play は2枚以上）`);
  if (shots.length < 2) bad++;
  process.exit(bad ? 1 : 0);
}
