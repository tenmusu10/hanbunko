// ウェブ版をホーム画面に追加したときのアイコン（icons/）を icon.svg から作る。icon.svg を変えたら node tools/make-pwa-icons.js
// any：角丸の icon.svg そのまま。maskable・apple-touch-icon：角丸を取って端まで背景色で塗る（OS が丸や角丸に切る）
const fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const svg = fs.readFileSync('icon.svg', 'utf8');
const full = svg.replace(/ rx="[^"]*"/, ''); // 絵は中央 56% にあり、maskable の安全な円（80%）に収まる
const out = [['icon-192.png', 192, svg], ['icon-512.png', 512, svg], ['maskable-512.png', 512, full], ['apple-touch-icon.png', 180, full]];
(async () => {
  const b = await pw.chromium.launch(), p = await b.newPage();
  fs.mkdirSync('icons', { recursive: true });
  for (const [name, size, s] of out) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${s}`);
    await p.screenshot({ path: `icons/${name}`, omitBackground: true });
    console.log(`icons/${name}`);
  }
  await b.close();
})();
