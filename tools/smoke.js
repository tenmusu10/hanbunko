// 動作確認（スモークテスト）：3機能を2人の視点で一通り動かし、エラーが出ないか・束縛につながる表示がないかを見る
// 使い方：node tools/smoke.js [index.html のパス]   （Playwright と Chromium が必要。BROWSER=webkit / firefox でほかのブラウザ）
const path = require('path'), fs = require('fs'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const file = path.resolve(process.argv[2] || 'index.html');
// アクセシビリティの自動チェック（axe-core）。CI では必ず回し、手元で入っていなければ飛ばす
let axeSrc = null; try { axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch (e) { if (process.env.CI) throw e; console.log('SKIP axe-core が無いのでアクセシビリティの自動チェックは飛ばす（npm i --no-save axe-core）'); }
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fails++; };
(async () => {
  // 端末差を見るため、BROWSER=webkit（iPhone の Safari に近い）や firefox でも同じ手順を回せる
  const browser = process.env.BROWSER || 'chromium';
  console.log(`ブラウザ：${browser}`);
  const b = await pw[browser].launch();
  // file:// だとブラウザによって暗号化（crypto.subtle）や localStorage が使えないので、手元に小さなサーバーを立てて開く
  const dir = path.dirname(file), TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/' + path.basename(file)));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_FILE/.test(m.text())) errs.push(m.text()); });
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.evaluate(() => localStorage.clear()); await p.reload();
  const axe = async label => {
    if (!axeSrc) return;
    await p.addScriptTag({ content: axeSrc });
    for (const colorScheme of ['light', 'dark']) {
      await p.emulateMedia({ colorScheme });
      const v = (await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }))).violations;
      ok(!v.length, `アクセシビリティ（${label}・${colorScheme === 'dark' ? 'ダーク' : 'ライト'}）` + v.map(x => `：${x.id} ${x.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`).join(''));
    }
    await p.emulateMedia({ colorScheme: 'light' });
  };
  // hidden を付けたのに見えているもの（CSS の display に負けている）
  const shownHidden = () => p.evaluate(() => [...document.querySelectorAll('[hidden]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.className));
  // 最初はペアづくりの画面。試作では「1台で試す」でこの端末の中だけで動かす
  ok(!(await shownHidden()).length, '最初の画面：隠したはずの欄（招待コード・試作の視点切り替え）が見えていない');
  await axe('最初の画面');
  ok(!(await p.locator('#pairScreen').isHidden()) && await p.locator('#mainScreen').isHidden(), '最初はペアづくりの画面');
  ok(await p.locator('#pInvite').isHidden() && await p.locator('#devBar').isHidden(), '最初の画面では、招待コードの欄も試作の視点切り替えも出ていない');
  ok(await p.evaluate(async () => {
    const k = Crypt.newKey(), key = await Crypt.key(k), s = await Crypt.enc(key, { text: 'ひみつ' });
    const inv = Crypt.parseInvite(Crypt.invite('A'.repeat(20), k));
    const msg = Crypt.parseInvite(`はんぶんこの招待コード：\n${Crypt.invite('B'.repeat(20), k)}\n`);
    return !s.includes('ひみつ') && (await Crypt.dec(key, s)).text === 'ひみつ' && inv && inv.key === k && msg && msg.pairId === 'B'.repeat(20) && !Crypt.parseInvite('abc') && !Crypt.parseInvite('x' + Crypt.invite('A'.repeat(20), k));
  }), '暗号化と招待コード：鍵で戻せる・平文が残らない・届いた文ごと貼っても読める・形の違うコードは受け付けない');
  await p.click('#pDemo');
  ok(!(await p.locator('#mainScreen').isHidden()), '「1台で試す」で3つのタブが出る');
  ok(!(await shownHidden()).length, '3つのタブ：隠したはずのものが見えていない');
  ok(await p.locator('#notifyRow').isHidden(), '1台で試すときは、まとめ通知の設定を出さない');
  // ホーム画面に追加するための manifest：書いてあるアイコンが全部ある
  const appDir = dir, man = JSON.parse(fs.readFileSync(path.join(appDir, 'manifest.webmanifest'), 'utf8'));
  ok(man.display === 'standalone' && man.icons.length >= 2 && man.icons.every(i => fs.existsSync(path.join(appDir, i.src))) && fs.existsSync(path.join(appDir, 'icons/apple-touch-icon.png')), 'ホーム画面に追加：manifest とアイコンがそろっている');
  // ひと休み：届いたものを隠し、開き直しても休んだまま。終えるともとに戻る
  await p.click('#restBtn');
  ok(await p.locator('#mainScreen').isHidden() && !(await p.locator('#restScreen').isHidden()), 'ひと休み：届いたものが見えなくなる');
  await p.reload();
  ok(await p.locator('#mainScreen').isHidden() && !(await p.locator('#restScreen').isHidden()), 'ひと休み：開き直しても休んだまま');
  await p.click('#restEnd');
  ok(!(await p.locator('#mainScreen').isHidden()) && await p.locator('#restScreen').isHidden(), 'ひと休み：終えるともとに戻る');
  ok(await p.evaluate(() => { const d = new Date(); return Store.today() === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }), '作った日は端末の暦の日付（時刻は持たない）');
  const as = async me => p.click(me === 'a' ? '#asA' : '#asB');
  const tab = async t => p.click(`#tabs [data-tab=${t}]`);
  const count = sel => p.locator(sel).count();

  // 今日のかけら：［］の中が隠れ、相手が想像を返し、渡した側の答え合わせで全部見える
  await p.fill('#kText', '今日は［ラーメン］を食べた'); await p.click('#kakeraForm button[type=submit]');
  ok(await p.locator('#kakeraList .body').innerText() === '今日は＿＿＿＿を食べた', 'かけら：［］の中が隠れる');
  await as('b');
  ok(await count('#kakeraList .rBtn') === 0 && await count('#kakeraList .del') === 0, 'かけら：相手は答え合わせも削除もできない');
  await p.fill('#kakeraList .gIn', 'カレー？'); await p.click('#kakeraList .gBtn');
  ok((await p.locator('#kakeraList .guess').innerText()).includes('カレー？'), 'かけら：想像の一言を返せる');
  await as('a'); await p.click('#kakeraList .rBtn');
  ok(await p.locator('#kakeraList .body').innerText() === '今日はラーメンを食べた', 'かけら：答え合わせで全部見える');
  // 写真：ぼかした版と元の版ができ、答え合わせまではぼかした版だけが見える
  // 細かい市松模様で、ぼかした版から模様が読み取れないことも見る。canvas の filter が効かない Safari をまねて、filter は何もしないようにしておく
  await p.evaluate(() => {
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', { configurable: true, get: () => 'none', set: () => {} });
    const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d');
    for (let y = 0; y < 300; y += 10) for (let x = 0; x < 400; x += 10) { g.fillStyle = (x + y) % 20 ? '#000' : '#fff'; g.fillRect(x, y, 10, 10); }
    const img = new Image(); img.onload = () => Kakera.setPhoto(img); img.src = c.toDataURL();
  });
  await p.waitForTimeout(300);
  ok(!(await p.locator('#kBlurRow').isHidden()), 'かけら：写真を選ぶとぼかしの見本が出る');
  // となりの画素との差の平均（模様がくっきりしているほど大きい）
  const edge = async src => p.evaluate(src => new Promise(res => {
    const img = new Image(); img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let sum = 0, n = 0;
      for (let i = 0; i < d.length - 4; i += 4) { sum += Math.abs(d[i] - d[i + 4]); n++; }
      res(sum / n);
    }; img.src = src;
  }), src);
  ok(await edge(await p.evaluate(() => document.getElementById('kPreview').toDataURL())) < 12, 'かけら：ぼかしの見本で模様が読み取れない');
  await p.click('#kakeraForm button[type=submit]');
  const shot = await p.evaluate(() => { const it = Store.list('kakera')[0]; return { blur: it.blur, photo: it.photo }; });
  const sharp = await edge(shot.photo), soft = await edge(shot.blur);
  ok(sharp > 20 && soft < sharp / 6, `かけら：渡したぼかしの版で模様が読み取れない（元 ${sharp.toFixed(1)} → ぼかし ${soft.toFixed(1)}）`);
  ok(await p.evaluate(() => { const it = Store.list('kakera')[0]; return it.photo && it.blur && it.photo !== it.blur && document.querySelector('#kakeraList img').src === it.blur; }), 'かけら：写真はぼかした版だけ見える');
  // 写真は決まった日数で消え、一言は残る
  // とても細かい大きな写真（ざらざらのノイズ）でも、暗号化したあと Firestore の1件の上限（ルールで 900KB 未満）に収まる
  await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 3000; c.height = 2250; const g = c.getContext('2d'), d = g.createImageData(c.width, c.height);
    for (let i = 0; i < d.data.length; i++) d.data[i] = i % 4 === 3 ? 255 : Math.random() * 256;
    g.putImageData(d, 0, 0); const img = new Image(); img.onload = () => Kakera.setPhoto(img); img.src = c.toDataURL('image/jpeg', 0.95);
  });
  await p.waitForFunction(() => !document.getElementById('kBlurRow').hidden, null, { timeout: 15000 });
  await p.click('#kakeraForm button[type=submit]');
  const size = await p.evaluate(async () => { const it = Store.list('kakera')[0], key = await Crypt.key(Crypt.newKey()); return (await Crypt.enc(key, { text: it.text, blur: it.blur, photo: it.photo, seq: it.seq })).length; });
  ok(size < 900000, `かけら：大きく細かい写真でも1件の上限に収まる（暗号化後 ${Math.round(size / 1000)}KB）`);
  ok(await p.evaluate(() => { Store.list('kakera').forEach(i => Store.update(i.id, { day: '2000-01-01' })); Kakera.render(); const l = Store.list('kakera'); return l.every(i => !i.photo && !i.blur) && l.some(i => i.text); }), 'かけら：古い写真は消え、一言は残る');

  // 半分の予定：全部埋めると置けない。相手だけが残りを埋められ、埋まると「決まり」
  await tab('yotei');
  await p.fill('#yWhen', '土曜の夕方'); await p.fill('#yWhere', '駅前'); await p.fill('#yWhat', 'ごはん'); await p.click('#yoteiForm button[type=submit]');
  ok(!(await p.locator('#yErr').isHidden()) && await count('#yoteiList .item') === 0, '予定：全部埋めると置けない');
  await p.fill('#yWhere', ''); await p.fill('#yWhat', ''); await p.click('#yoteiForm button[type=submit]');
  ok(await count('#yoteiList .item') === 1 && await count('#yoteiList .fill') === 0, '予定：半分だけ置ける（置いた人は残りを埋められない）');
  await as('b');
  const fills = p.locator('#yoteiList .fill'); await fills.nth(0).fill('駅前'); await fills.nth(1).fill('ごはん'); await p.click('#yoteiList .fBtn');
  ok(await count('#yoteiList .done') === 1, '予定：相手が埋めると「決まり」');
  // 埋まらない予定は日がたつと消え、決まった予定は残る
  await p.evaluate(() => { Store.add('yotei', { when: 'いつか', where: '', what: '' }); Store.list('yotei').forEach(i => Store.update(i.id, { day: '2000-01-01' })); Yotei.render(); });
  ok(await count('#yoteiList .item') === 1 && await count('#yoteiList .done') === 1, '予定：埋まらない予定は消え、決まった予定は残る');

  // 見えない苦労：相手は「ありがとう」だけ返せる
  await tab('kurou'); await as('a');
  await p.fill('#kuText', '排水口の掃除をしておいた'); await p.click('#kurouForm button[type=submit]');
  await as('b'); await p.click('#kurouList .tBtn');
  ok(await count('#kurouList .thanks') === 1 && await count('#kurouList .tBtn') === 0, '苦労：ありがとうを一度だけ返せる');
  // ID から書いた時刻が分からない（原則1）。同じ日の中は置いた順に新しいものが上
  await p.fill('#kuText', '2つめ'); await p.click('#kurouForm button[type=submit]');
  ok(await p.locator('#kurouList .item .body').first().innerText() === '2つめ', '苦労：同じ日の中でも新しいものが上');
  ok(await p.evaluate(() => Store.list('kurou').every(i => Math.abs(parseInt(i.id.slice(0, 8), 36) - Date.now()) > 864e5)), 'ID に書いた時刻が入っていない');
  await p.click('#kurouList .del');
  // 相手から届いた中身で画面が壊れない（写真の欄に変なものが入っていても出さない）
  ok(await p.evaluate(() => { Store.add('kakera', { text: 'x', photo: 'x" onerror="window.__x=1', blur: 'javascript:1' }); Kakera.render(); return !window.__x && !document.querySelector('#kakeraList img[onerror]') && ![...document.querySelectorAll('#kakeraList img')].some(i => !i.src.startsWith('data:image/jpeg')); }), 'かけら：写真の欄に変なものが入っていても出さない');
  // 自分のものだけ消せる
  await as('a'); await p.click('#kurouList .del');
  ok(await count('#kurouList .item') === 0, '苦労：自分のカードは消せる');

  // ペアの解消は2回押しで、理由は聞かずに最初の画面へ戻る
  await p.click('#leaveBtn');
  ok(await p.locator('#pairScreen').isHidden() && (await p.locator('#leaveBtn').innerText()).includes('もう一度'), '解消：1回目は確かめるだけ');
  await p.click('#leaveBtn');
  ok(!(await p.locator('#pairScreen').isHidden()), '解消：2回目で最初の画面に戻る');
  await p.click('#pDemo');
  ok(await p.evaluate(() => [...document.querySelectorAll('input:not([type=file]):not([type=checkbox]), textarea, select')].every(e => parseFloat(getComputedStyle(e).fontSize) >= 16)), '入力欄の文字は 16px 以上（iPhone でタップしても画面が拡大されない）');
  // キーボードだけでも使える：写真を選ぶ欄にフォーカスでき、想像の一言は Enter で返せる
  await p.click('#tabs [data-tab=kakera]');
  await p.focus('#kPhoto'); ok(await p.evaluate(() => document.activeElement.id === 'kPhoto'), 'キーボード：写真を選ぶ欄にフォーカスできる');
  await p.fill('#kText', '［キー］で'); await p.click('#kakeraForm button[type=submit]'); await as('b');
  await p.fill('#kakeraList .gIn', 'エンター'); await p.press('#kakeraList .gIn', 'Enter');
  ok((await p.locator('#kakeraList .guess').first().innerText()).includes('エンター'), 'キーボード：想像の一言は Enter で返せる');
  await axe('今日のかけら・相手の視点');
  await as('a'); await p.click('#tabs [data-tab=yotei]'); await p.fill('#yWhat', 'さんぽ'); await p.click('#yoteiForm button[type=submit]'); await as('b');
  await axe('半分の予定・相手の視点');
  // 束縛につながる表示が画面のどこにもない
  const text = await p.evaluate(() => document.body.innerText);
  ok(!/既読|オンライン|最終ログイン|入力中|連続|回目|合計/.test(text), '画面に既読・オンライン・回数の表示がない');
  ok(await p.evaluate(() => !JSON.stringify(localStorage).match(/readAt|seenAt|lastSeen|"at":\d/)), '保存データに既読や時刻を持たない');
  ok(errs.length === 0, 'ページのエラーなし' + (errs.length ? '：' + errs.join(' / ') : ''));
  // iPhone の Safari では、ペアになる前にホーム画面へ追加する案内を出す（Safari とホーム画面版で鍵の置き場所が分かれるため）
  const ios = await b.newPage({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ios.goto(`http://127.0.0.1:${server.address().port}/`); await ios.evaluate(() => localStorage.clear()); await ios.reload();
  ok(!(await ios.locator('#iosPairHint').isHidden()) && await p.locator('#iosPairHint').isHidden(), 'iPhone の Safari だけ、ペアになる前にホーム画面へ追加する案内を出す');
  await b.close(); server.close();
  console.log(fails ? `\n${fails} 件失敗` : '\nすべて OK'); process.exit(fails ? 1 : 0);
})();
