// ストア素材の自動生成：実際の画面にサンプルのやり取りを置いて撮り、見出し付きの台紙に載せる（metabo-burst の make-store.js と同じ考え方）
// 使い方：node tools/make-store.mjs [アプリのフォルダ]   （Playwright と Chromium が必要）
// 出力：store/screenshots/*.png（1080×1920）、store/feature.png（1024×500）、site/img/*.png（LP 用の画面だけの画像）、site/img/ogp.png（1200×630）
// 見出しの「／」は改行になる。見出しは STORE.md の「スクショの見出し」から読む。文言はそちらを直す。何度実行しても同じ画像になる
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseCaptions } from './store-check.mjs';

const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const appDir = path.resolve(process.argv[2] || root);
const md = readFileSync(path.join(root, 'STORE.md'), 'utf8');
const shots = parseCaptions(md, 'スクショの見出し');
const [feature] = parseCaptions(md, 'フィーチャーグラフィックの文言');
const out = p => { const f = path.join(root, p); mkdirSync(path.dirname(f), { recursive: true }); return f; };

const FONTS = 'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&family=Noto+Sans+JP:wght@400;700&display=block';
const C = { bg: '#faf6f1', paper: '#ffffff', ink: '#3a3129', muted: '#8a7d70', line: '#e8dfd4', accent: '#d9825b', soft: '#f7e4da' };
// 日付は撮った日にする（古い日付だと、予定や苦労が期限切れとして消えるため）
const today = new Date().toISOString().slice(0, 10);
const it = (id, kind, by, data) => ({ id, kind, by, day: today, ...data });

// かけらの写真の代わり（夕方の道と金木犀っぽい絵）。どうせぼかすので形は大まかでよい
function drawPhoto() {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 480); sky.addColorStop(0, '#f2b880'); sky.addColorStop(1, '#8a9a6a'); g.fillStyle = sky; g.fillRect(0, 0, 640, 480);
  g.fillStyle = '#4f6b3f'; g.beginPath(); g.ellipse(200, 300, 220, 160, 0, 0, Math.PI * 2); g.fill();
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#f39a2b'; for (let i = 0; i < 260; i++) { g.beginPath(); g.arc(40 + r() * 340, 170 + r() * 260, 4 + r() * 5, 0, Math.PI * 2); g.fill(); }
  const b = document.createElement('canvas'); b.width = 640; b.height = 480; const bg = b.getContext('2d'); bg.filter = 'blur(12px)'; bg.drawImage(c, 0, 0);
  return { photo: c.toDataURL('image/jpeg', 0.8), blur: b.toDataURL('image/jpeg', 0.7) };
}

// 場面ごとに、置くデータ・視点・タブ・撮る前の操作を決める。視点はいつも「わたし（a）」
const SCENES = {
  'yotei-half': {
    tab: 'yotei',
    items: [it('1', 'yotei', 'b', { when: '', where: '', what: '映画を観る' })],
    before: async p => { await p.fill('#yWhen', '土曜の夕方'); },
  },
  'yotei-done': {
    tab: 'yotei', hideCompose: true,
    items: [
      it('2', 'yotei', 'a', { when: '日曜の朝', where: '川沿いのパン屋', what: '朝ごはん' }),
      it('3', 'yotei', 'b', { when: '来月の連休', where: '', what: '温泉' }),
      it('1', 'yotei', 'a', { when: '', where: '駅前の古本屋', what: '' }),
    ],
    before: async p => { await p.fill('#yoteiList .fill[data-k=where]', '箱根あたり？'); },
  },
  kakera: {
    tab: 'kakera', hideCompose: true,
    items: [
      it('2', 'kakera', 'b', { text: '帰り道、［金木犀］の匂いがした' }),
      it('1', 'kakera', 'a', { text: 'お昼は［オムライス］にした', guess: 'カレーでしょ？' }),
    ],
    photoOn: '2',
    before: async p => { await p.fill('#kakeraList .gIn', '焼き芋の屋台？'); },
  },
  kurou: {
    tab: 'kurou', hideCompose: true,
    items: [
      it('3', 'kurou', 'b', { text: '排水口の掃除、実はやっておいた' }),
      it('2', 'kurou', 'a', { text: 'トイレットペーパー、買い足しておいた', thanks: true }),
      it('1', 'kurou', 'b', { text: '洗濯ネット、新しいのにしておいた', thanks: true }),
    ],
  },
};

// 画面の代わりに「しないこと」を並べる場面
const SHINAI = ['位置の共有', '既読・オンライン表示', '連続記録と催促の通知', '投稿数や家事量の比較', 'どちらかだけの管理者権限'];

const halfMark = (size, color = C.accent) => `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="${color}" stroke-width="6" stroke-dasharray="9 8"/><path d="M50 6 A44 44 0 0 0 50 94 Z" fill="${color}"/></svg>`;

const base = `<link rel="stylesheet" href="${FONTS}"><style>
*{box-sizing:border-box}html,body{margin:0}
body{background:${C.bg};color:${C.ink};font-family:"Zen Maru Gothic",sans-serif;overflow:hidden}
</style>`;

function framePage({ title, sub }, inner) {
  return `<!doctype html><meta charset="utf-8">${base}<style>
.f{width:1080px;height:1920px;display:flex;flex-direction:column;align-items:center;padding:80px 70px 0}
.f>svg{margin-bottom:28px}
h1{font-size:68px;line-height:1.4;margin:0 0 22px;text-align:center;font-weight:700;word-break:keep-all}
p.sub{font-size:38px;line-height:1.6;color:${C.muted};margin:0 0 56px;text-align:center;font-weight:500;text-wrap:balance}
.phone{width:800px;flex:1;border:14px solid ${C.ink};border-bottom:0;border-radius:72px 72px 0 0;overflow:hidden;background:${C.bg}}
.phone img{width:100%;display:block}
</style><div class="f">${halfMark(72)}<h1>${title.replace(/／/g, '<br>')}</h1><p class="sub">${sub}</p>${inner}</div>`;
}

function shinaiPage(cap) {
  const rows = SHINAI.map(s => `<li><span>${s}</span><b>なし</b></li>`).join('');
  return framePage(cap, `<style>
ul{list-style:none;margin:20px 0 0;padding:0;width:860px;display:grid;gap:26px}
li{display:flex;justify-content:space-between;align-items:center;background:${C.paper};border:3px solid ${C.line};border-radius:36px;padding:40px 52px;font-size:46px;font-weight:500}
li b{color:${C.accent};font-size:40px;border:3px solid ${C.accent};border-radius:999px;padding:4px 30px}
.ok{margin-top:56px;font-size:40px;line-height:1.7;color:${C.muted};text-align:center}
</style><ul>${rows}</ul><p class="ok">自分の投稿はいつでも消せて、<br>休憩も退会も、ひとりですぐにできます。</p>`);
}

function bannerPage(w, h, { title, sub }) {
  return `<!doctype html><meta charset="utf-8">${base}<style>
.b{width:${w}px;height:${h}px;display:flex;align-items:center;gap:${h * 0.1}px;padding:0 ${w * 0.09}px;position:relative;overflow:hidden}
.b::after{content:"";position:absolute;right:-${h * 0.35}px;top:-${h * 0.2}px;width:${h * 1.4}px;height:${h * 1.4}px;border-radius:50%;background:${C.soft};z-index:-1}
svg{flex-shrink:0}h1{font-size:${h * 0.2}px;margin:0;letter-spacing:.06em;line-height:1.2;white-space:nowrap}
p{font-size:${h * 0.075}px;margin:${h * 0.04}px 0 0;color:${C.muted};font-weight:500}
</style><div class="b">${halfMark(h * 0.42)}<div><h1>${title}</h1><p>${sub}</p></div></div>`;
}

(async () => {
  const browser = await pw.chromium.launch();
  const app = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 3, colorScheme: 'light' });
  const errs = []; app.on('pageerror', e => errs.push(e.message));
  await app.goto('file://' + path.join(appDir, 'index.html'));

  async function capture(name, sc) {
    await app.evaluate(({ items, photoOn, draw }) => {
      if (photoOn) { const ph = new Function(`return (${draw})()`)(); Object.assign(items.find(i => i.id === photoOn), ph); }
      localStorage.setItem('hanbunko-v1', JSON.stringify({ items }));
    }, { items: sc.items, photoOn: sc.photoOn, draw: drawPhoto.toString() });
    await app.reload();
    await app.addStyleTag({ url: FONTS });
    // 試作用の視点切り替えは写さない。入力欄の文字は Android の標準に近い Noto Sans JP で
    await app.addStyleTag({ content: `#devBar{display:none!important}body{font-family:"Noto Sans JP",sans-serif}${sc.hideCompose ? '.compose{display:none!important}' : ''}` });
    await app.evaluate(tab => { App.setMe('a'); App.show(tab); }, sc.tab);
    if (sc.before) await sc.before(app);
    await app.evaluate(() => document.activeElement && document.activeElement.blur()); // 入力中の枠を写さない
    await app.evaluate(() => document.fonts.ready);
    await app.waitForTimeout(150);
    const png = await app.screenshot();
    await app.screenshot({ path: out(`site/img/${name}.png`), scale: 'css' });
    return png;
  }

  const frame = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  let n = 0;
  for (const cap of shots) {
    n++;
    let html;
    if (cap.id === 'shinai') html = shinaiPage(cap);
    else if (SCENES[cap.id]) {
      const png = await capture(cap.id, SCENES[cap.id]);
      html = framePage(cap, `<div class="phone"><img src="data:image/png;base64,${png.toString('base64')}"></div>`);
    } else { console.error(`場面がありません：${cap.id}（tools/make-store.mjs の SCENES に足してください）`); process.exitCode = 1; continue; }
    await frame.setContent(html, { waitUntil: 'networkidle' });
    await frame.evaluate(() => document.fonts.ready);
    const f = out(`store/screenshots/${String(n).padStart(2, '0')}-${cap.id}.png`);
    await frame.screenshot({ path: f });
    console.log('書き出し', path.relative(root, f));
  }

  for (const [w, h, p] of [[1024, 500, 'store/feature.png'], [1200, 630, 'site/img/ogp.png']]) {
    await frame.setViewportSize({ width: w, height: h });
    await frame.setContent(bannerPage(w, h, feature), { waitUntil: 'networkidle' });
    await frame.evaluate(() => document.fonts.ready);
    await frame.screenshot({ path: out(p) });
    console.log('書き出し', p);
  }
  await browser.close();
  if (errs.length) { console.error('画面でエラー：\n' + errs.join('\n')); process.exitCode = 1; }
})();
