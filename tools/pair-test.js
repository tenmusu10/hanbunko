// 2台を想定したテスト：エミュレータの Firebase で、招待 → ペア → やり取り → 解消 までを2つのブラウザで動かす
// 使い方：npm run pair:test（中で firebase emulators:exec を使う。SDK は node_modules/firebase の同じ版をネットの代わりに返す）
const path = require('path'), fs = require('fs'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const root = path.resolve(__dirname, '..');
const sdkDir = path.dirname(require.resolve('firebase/package.json', { paths: [root] }));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fails++; };
// アプリは本番と同じ projectId でエミュレータにつなぐので、中身もその名前の下に入る
const PROJECT = fs.readFileSync(path.join(root, 'js/firebase-config.js'), 'utf8').match(/projectId: '([^']+)'/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const b = await pw.chromium.launch();
  const open = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    // gstatic の SDK は、インストール済みの同じ版で返す
    await ctx.route(/www\.gstatic\.com\/firebasejs\/[^/]+\/(firebase-[a-z]+\.js)/, (route, req) => {
      const file = path.join(sdkDir, req.url().split('/').pop());
      route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
    });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(url); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('hanbunko-emulator', '1'); }); await p.reload();
    return { p, errs, ctx };
  };
  const A = await open(), B = await open();
  const until = async (p, fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };

  await A.p.click('#pCreate');
  ok(await until(A.p, () => /^[A-Za-z0-9]{20}\.[A-Za-z0-9_-]{43}$/.test(document.getElementById('pCode').value)), 'A：招待コードができる');
  const code = await A.p.inputValue('#pCode');
  await B.p.fill('#pJoinIn', code); await B.p.click('#pJoin');
  ok(await until(B.p, () => !document.getElementById('mainScreen').hidden), 'B：招待コードでペアになる');
  ok(await until(A.p, () => !document.getElementById('mainScreen').hidden), 'A：相手が入るとそのままはじまる');

  // 苦労カード：A が渡す → B に届いてありがとう → A に届く
  await A.p.click('#tabs [data-tab=kurou]'); await B.p.click('#tabs [data-tab=kurou]');
  await A.p.fill('#kuText', '排水口の掃除をしておいた'); await A.p.click('#kurouForm button[type=submit]');
  ok(await until(B.p, () => document.querySelector('#kurouList .body')?.textContent === '排水口の掃除をしておいた'), 'B：A の苦労カードが届く');
  await B.p.click('#kurouList .tBtn');
  ok(await until(A.p, () => !!document.querySelector('#kurouList .thanks')), 'A：ありがとうが届く');
  // 相手の返事で、作った人の欄（中身・書いた人）を書き換えられない
  await B.p.evaluate(() => { const it = Store.list('kurou')[0]; Store.update(it.id, { text: '書き換え', by: Store.me }); });
  await A.p.waitForTimeout(800);
  ok(await A.p.evaluate(() => document.querySelector('#kurouList .body').textContent === '排水口の掃除をしておいた' && !!document.querySelector('#kurouList .item.mine')), 'A：B の返事で A のカードの中身や書いた人は変わらない');

  // 半分の予定：A が半分 → B が残りを埋める → A で「決まり」
  await A.p.click('#tabs [data-tab=yotei]'); await B.p.click('#tabs [data-tab=yotei]');
  await A.p.fill('#yWhen', '土曜の夕方'); await A.p.click('#yoteiForm button[type=submit]');
  ok(await until(B.p, () => document.querySelectorAll('#yoteiList .fill').length === 2), 'B：空いた欄だけ埋められる');
  const f = B.p.locator('#yoteiList .fill'); await f.nth(0).fill('駅前'); await f.nth(1).fill('ごはん'); await B.p.click('#yoteiList .fBtn');
  ok(await until(A.p, () => !!document.querySelector('#yoteiList .done')), 'A：B が埋めると「決まり」になる');

  await B.p.click('#tabs [data-tab=kurou]'); await B.p.fill('#kuText', 'B から：洗濯物をたたんだ'); await B.p.click('#kurouForm button[type=submit]');
  ok(await until(A.p, () => document.querySelectorAll('#kurouList .item').length === 2), 'A：B の苦労カードも届く');
  // サーバーに置かれたものは暗号化されていて、平文の欄は kind・by・day だけ
  const dump = await new Promise(res => http.get('http://127.0.0.1:8080/v1/projects/' + PROJECT + '/databases/(default)/documents/pairs/' + code.split('.')[0] + '/items', { headers: { Authorization: 'Bearer owner' } }, r => { let d = ''; r.on('data', c => { d += c; }); r.on('end', () => res(d)); }));
  const docs = JSON.parse(dump).documents || [];
  ok(docs.length === 3 && !/排水口|土曜|駅前|ごはん|洗濯物/.test(dump), 'サーバーの中身は暗号化されていて読めない');
  ok(docs.every(d => Object.keys(d.fields).every(k => ['kind', 'by', 'day', 'c', 'r'].includes(k))), 'サーバーの平文の欄は kind・by・day だけ');
  ok(docs.every(d => Math.abs(parseInt(d.name.split('/').pop().slice(0, 8), 36) - Date.now()) > 864e5), 'サーバーの ID から書いた時刻が分からない');

  // まとめ通知の宛先：ウェブ版は公開鍵が無いあいだ設定を出さない。宛先を置いたら、抜けるときに一緒に消える
  const tokenDoc = () => new Promise(res => http.get('http://127.0.0.1:8080/v1/projects/' + PROJECT + '/databases/(default)/documents/pairs/' + code.split('.')[0] + '/tokens/' + B.uid, { headers: { Authorization: 'Bearer owner' } }, r => res(r.statusCode)));
  ok(await B.p.locator('#notifyRow').isHidden(), 'B：通知を受けられない環境では、まとめ通知の設定を出さない');
  B.uid = await B.p.evaluate(async () => { await Remote.saveToken('test-token-b'); return Store.me; });
  ok(await tokenDoc() === 200, 'B：まとめ通知の宛先を置ける');
  // ひと休み：B の画面だけが休み、まとめ通知の宛先も外れる。A の画面は何も変わらない
  await B.p.evaluate(() => localStorage.setItem('hanbunko-notify', '1'));
  const aBefore = await A.p.evaluate(() => document.body.innerText);
  await B.p.click('#restBtn');
  ok(await until(B.p, () => !document.getElementById('restScreen').hidden && document.getElementById('mainScreen').hidden), 'B：ひと休みすると届いたものが見えなくなる');
  let gone = false; for (let i = 0; i < 30 && !gone; i++) { gone = await tokenDoc() === 404; if (!gone) await new Promise(r => setTimeout(r, 100)); }
  ok(gone, 'B：ひと休み中はまとめ通知の宛先を外す');
  ok(await A.p.evaluate(() => document.body.innerText) === aBefore, 'A：B がひと休みしても A の画面には何も出ない');
  await B.p.click('#restEnd');
  ok(await until(B.p, () => document.getElementById('restScreen').hidden && !document.getElementById('mainScreen').hidden), 'B：ひと休みを終えるともとに戻る');
  await B.p.evaluate(async () => { localStorage.removeItem('hanbunko-notify'); await Remote.saveToken('test-token-b'); });

  // つながらないとき：A がサーバーに届かない状態で開き直しても、「相手が離れた」や招待のつくり直しは出ない
  const block = r => r.abort();
  await A.ctx.route(/gstatic|127\.0\.0\.1:(8080|9099)/, block); await A.p.reload();
  ok(await until(A.p, () => !document.getElementById('pRetry').hidden), 'A：つながらないと「もう一度つなぐ」が出る');
  ok(await A.p.evaluate(() => document.getElementById('alone').hidden && document.getElementById('pNew').hidden && document.getElementById('pJoinCard').hidden), 'A：つながらなくても「相手が離れた」や招待のつくり直しは出ない');
  await A.ctx.unroute(/gstatic|127\.0\.0\.1:(8080|9099)/, block); await A.p.click('#pRetry');
  ok(await until(A.p, () => !document.getElementById('mainScreen').hidden && document.getElementById('alone').hidden && document.querySelectorAll('#kurouList .item').length === 2), 'A：つながるともとどおり（2人の場所も書いたものもそのまま）');
  await A.p.click('#tabs [data-tab=kurou]');
  // 電波がないあいだに書いたものは、つながったときに届く
  await B.ctx.setOffline(true);
  await B.p.click('#tabs [data-tab=kurou]'); await B.p.fill('#kuText', '圏外で書いた'); await B.p.click('#kurouForm button[type=submit]');
  ok(await until(B.p, () => [...document.querySelectorAll('#kurouList .body')].some(e => e.textContent === '圏外で書いた')), 'B：電波がなくても書いたものはすぐ画面に出る');
  await B.ctx.setOffline(false);
  ok(await until(A.p, () => [...document.querySelectorAll('#kurouList .body')].some(e => e.textContent === '圏外で書いた'), 15000), 'A：B が圏外で書いたものも、つながると届く');

  // 解消：B が電波のないところでひとりで抜ける → すぐ最初の画面に戻り、つながったときにサーバーの片付けが済む → A は静かに「離れました」の表示になる
  const items = async () => JSON.parse(await new Promise(res => http.get('http://127.0.0.1:8080/v1/projects/' + PROJECT + '/databases/(default)/documents/pairs/' + code.split('.')[0] + '/items', { headers: { Authorization: 'Bearer owner' } }, r => { let d = ''; r.on('data', c => { d += c; }); r.on('end', () => res(d)); }))).documents || [];
  await B.ctx.setOffline(true);
  await B.p.click('#leaveBtn'); await B.p.click('#leaveBtn');
  ok(await until(B.p, () => !document.getElementById('pairScreen').hidden, 2000), 'B：電波がなくても、2回押しですぐ抜けて最初の画面に戻る');
  ok(await B.p.evaluate(() => !!localStorage.getItem('hanbunko-leaving') && !localStorage.getItem('hanbunko-pair')), 'B：この端末の鍵はすぐ消え、サーバーの片付けは残りとして覚える');
  await B.ctx.setOffline(false);
  ok(await until(B.p, () => !localStorage.getItem('hanbunko-leaving'), 15000), 'B：つながるとサーバーの片付けが済む');
  ok(await until(A.p, () => !document.getElementById('alone').hidden), 'A：相手が離れたことが静かに表示される');
  const left = await items();
  ok(left.length === 2 && left.every(d => !d.fields.r) && await until(A.p, () => document.querySelectorAll('#kurouList .item').length === 1 && document.querySelectorAll('#yoteiList .item').length === 1 && !document.querySelector('#kurouList .thanks')), '解消：B の書いたもの・返事はサーバーから消え、A の書いたものは残る');
  ok(await tokenDoc() === 404, '解消：B のまとめ通知の宛先も消える');
  ok(A.errs.length === 0 && B.errs.length === 0, 'ページのエラーなし' + [...A.errs, ...B.errs].map(e => '：' + e).join(''));
  await b.close(); server.close();
  console.log(fails ? `\n${fails} 件失敗` : '\nすべて OK'); process.exit(fails ? 1 : 0);
})();
