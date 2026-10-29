// アプリのアイコンと起動画面を icon.svg から作る（Capacitor の初期のアイコンを置きかえる）
// 使い方：npm run icons   （Playwright と Chromium が必要。何度実行しても同じ画像になる）
// icon.svg の最初の <rect> の色を地の色、残りを絵柄として、次を出力する
//   android/app/src/main/res/mipmap-*/ic_launcher.png・ic_launcher_round.png・ic_launcher_foreground.png・ic_launcher_monochrome.png
//   android/app/src/main/res/values/ic_launcher_background.xml（アダプティブアイコンの地の色）
//   android/app/src/main/res/drawable*/splash.png（起動画面。地の色の真ん中に絵柄）
//   store/icon-512.png（Play の掲載用。角は Play が丸めるので四角いまま）
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const res = p => path.join(root, 'android/app/src/main/res', p);

export function splitIcon(svg) {
  const rect = svg.match(/<rect\b[^>]*\/>/);
  if (!rect) throw new Error('icon.svg に地の <rect> が見つかりません');
  const bg = rect[0].match(/fill="(#[0-9a-fA-F]{6})"/)?.[1];
  if (!bg) throw new Error('icon.svg の <rect> に fill="#rrggbb" がありません');
  const body = svg.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(rect[0], '');
  return { bg: bg.toUpperCase(), motif: body };
}

// 絵柄を size 四方に描く。scale は絵柄の大きさ（1 で icon.svg と同じ割合）。shape は地の形
function page(motif, bg, w, h, { scale = 1, shape = 'square', mono = false } = {}) {
  const s = Math.min(w, h) * scale;
  const ground = shape === 'none' ? '' : shape === 'circle'
    ? `<circle cx="50" cy="50" r="50" fill="${bg}"/>`
    : shape === 'rounded' ? `<rect width="100" height="100" rx="23" fill="${bg}"/>` : '';
  const art = mono ? motif.replace(/(fill|stroke)="#[0-9a-fA-F]{6}"/g, '$1="#000000"') : motif;
  return `<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;background:${shape === 'square' ? bg : 'transparent'};display:flex;align-items:center;justify-content:center">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${s}" height="${s}">${shape === 'square' ? '' : ground}${art}</svg></body></html>`;
}

const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SPLASH = { mdpi: [480, 320], hdpi: [800, 480], xhdpi: [1280, 720], xxhdpi: [1600, 960], xxxhdpi: [1920, 1280] };

async function main() {
  // Playwright は画像を作るときだけ読む（tools/ready-check.mjs は splitIcon だけ使う）
  let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
  const { bg, motif } = splitIcon(readFileSync(path.join(root, 'icon.svg'), 'utf8'));
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const shot = async (file, w, h, opts) => {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(page(motif, bg, w, h, opts));
    await p.screenshot({ path: file, omitBackground: opts?.shape !== 'square' });
    console.log(path.relative(root, file), `${w}x${h}`);
  };
  for (const [d, k] of Object.entries(DPI)) {
    const n = Math.round(48 * k), f = Math.round(108 * k);
    await shot(res(`mipmap-${d}/ic_launcher.png`), n, n, { shape: 'rounded' });
    await shot(res(`mipmap-${d}/ic_launcher_round.png`), n, n, { shape: 'circle' });
    // アダプティブアイコンは 108dp のうち真ん中の直径 66dp しか必ずは見えない。icon.svg の絵柄はおよそ 56%（約 60dp）に収まる
    await shot(res(`mipmap-${d}/ic_launcher_foreground.png`), f, f, { shape: 'none' });
    await shot(res(`mipmap-${d}/ic_launcher_monochrome.png`), f, f, { shape: 'none', mono: true });
    const [lw, lh] = SPLASH[d];
    await shot(res(`drawable-land-${d}/splash.png`), lw, lh, { scale: 0.35 });
    await shot(res(`drawable-port-${d}/splash.png`), lh, lw, { scale: 0.35 });
  }
  await shot(res('drawable/splash.png'), 480, 320, { scale: 0.35 });
  await shot(path.join(root, 'store/icon-512.png'), 512, 512, {});
  await browser.close();
  writeFileSync(res('values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${bg}</color>\n</resources>\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
