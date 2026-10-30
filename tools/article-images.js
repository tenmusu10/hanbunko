// X 用の記事の画像を作る：node tools/article-images.js [出力先]（既定 docs/images/article-x-pair-testing）
// もとは tools/article-images.html。字は Google Fonts の Zen Maru Gothic を読むのでネットが要る
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const out = process.argv[2] || 'docs/images/article-x-pair-testing';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1700, height: 1000 } });
  await page.goto('file://' + path.resolve(__dirname, 'article-images.html'));
  await page.evaluate(() => document.fonts.ready);
  for (const el of await page.$$('section.fig')) {
    const id = await el.getAttribute('id');
    await el.screenshot({ path: path.join(out, id + '.png') });
    console.log(id);
  }
  await browser.close();
})();
