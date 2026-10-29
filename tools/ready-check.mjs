// リリースの下準備のうち、リポジトリの中で確かめられるものを見る（人の作業は APP.md の「人がやること」）
// 使い方：npm run ready   （CI でも動く。1つでも NG なら止まる）
//   アイコン・起動画面が Capacitor の初期のままでないか、Play に上げる画像の大きさ、掲載文の文字数、
//   プライバシーポリシーに削除の案内（#delete）があり TODO が残っていないか、公開用ビルドで試作用の表示が消えるか
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { splitIcon } from './make-icons.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const f = p => path.join(root, p);
const res = p => f(`android/app/src/main/res/${p}`);

// PNG の幅と高さ（ヘッダーの IHDR を読む）
export function pngSize(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} は PNG ではありません`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const results = [];
const ok = (name, pass, hint = '') => results.push({ name, pass: !!pass, hint });
const size = (p, w, h) => existsSync(f(p)) && pngSize(f(p)).join('x') === `${w}x${h}`;

// アイコン：icon.svg の地の色がアダプティブアイコンの地になっていて、テーマ別（モノクロ）アイコンもある
const { bg } = splitIcon(readFileSync(f('icon.svg'), 'utf8'));
const color = readFileSync(res('values/ic_launcher_background.xml'), 'utf8').match(/#[0-9A-Fa-f]{6}/)?.[0]?.toUpperCase();
ok('アイコンの地の色が icon.svg と同じ', color === bg, `npm run icons（いまは ${color}、icon.svg は ${bg}）`);
for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'])
  ok(`mipmap-${d} にモノクロのアイコンがある`, existsSync(res(`mipmap-${d}/ic_launcher_monochrome.png`)), 'npm run icons');
ok('アダプティブアイコンがモノクロを使う', /ic_launcher_monochrome/.test(readFileSync(res('mipmap-anydpi-v26/ic_launcher.xml'), 'utf8')), 'mipmap-anydpi-v26/ic_launcher.xml に <monochrome>');

// Play に上げる画像
ok('store/icon-512.png が 512×512', size('store/icon-512.png', 512, 512), 'npm run icons');
ok('store/feature.png が 1024×500', size('store/feature.png', 1024, 500), 'npm run store');
const shots = existsSync(f('store/screenshots')) ? readdirSync(f('store/screenshots')).filter(n => n.endsWith('.png')) : [];
ok(`スクショが2〜8枚（いま ${shots.length} 枚）`, shots.length >= 2 && shots.length <= 8, 'npm run store');
for (const n of shots) ok(`スクショ ${n} が 1080×1920`, size(`store/screenshots/${n}`, 1080, 1920), 'npm run store');

// 掲載文の文字数（tools/store-check.mjs）
let store = true; try { execFileSync('node', [f('tools/store-check.mjs'), f('STORE.md')], { stdio: 'pipe' }); } catch { store = false; }
ok('STORE.md の文字数が上限に収まる', store, 'npm run store:check');

// 紹介ページ：Play に登録するプライバシーポリシーとアカウント削除の URL
const privacy = existsSync(f('site/privacy.html')) ? readFileSync(f('site/privacy.html'), 'utf8') : '';
ok('site/privacy.html に削除の案内（id="delete"）がある', /id="delete"/.test(privacy), 'Play の「アカウントの削除」に privacy.html#delete を登録するため');
for (const p of ['site/index.html', 'site/privacy.html', 'site/terms.html']) {
  const s = existsSync(f(p)) ? readFileSync(f(p), 'utf8') : null;
  ok(`${p} があり TODO が無い`, s !== null && !/TODO/.test(s), 'pages.yml は TODO があると LP を出さない');
}

// 公開用ビルドで試作用の表示が消える（scripts/build-www.mjs --release が置きかえる形のまま）
ok('js/config.js の SHOW_TEST が置きかえられる形', /const SHOW_TEST = (true|false);/.test(readFileSync(f('js/config.js'), 'utf8')), 'scripts/build-www.mjs');

for (const r of results) console.log(`${r.pass ? 'OK  ' : 'NG  '} ${r.name}${r.pass || !r.hint ? '' : `　→ ${r.hint}`}`);
const bad = results.filter(r => !r.pass).length;
console.log(bad ? `\n${bad} 件 NG` : '\nリポジトリ側の下準備はそろっています。残りは APP.md の「人がやること」です');
process.exit(bad ? 1 : 0);
