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
      await p.emulateMedia({ colorScheme, reducedMotion: 'reduce' }); // 届いた瞬間の演出（薄い色から浮かぶ）の途中ではなく、止まったあとの色で見る
      const v = (await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }))).violations;
      ok(!v.length, `アクセシビリティ（${label}・${colorScheme === 'dark' ? 'ダーク' : 'ライト'}）` + v.map(x => `：${x.id} ${x.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`).join(''));
    }
    await p.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  };
  // hidden を付けたのに見えているもの（CSS の display に負けている）
  const shownHidden = () => p.evaluate(() => [...document.querySelectorAll('[hidden]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.className));
  // はじめて開いたときは見本から。見本の相手から届いた3つに返してみる。何も保存せず、とばすとペアづくりの画面へ
  ok(!(await p.locator('#tourScreen').isHidden()) && await p.locator('#pairScreen').isHidden() && await p.locator('#tourSkip').isVisible(), 'はじめて開くと見本が出て、いつでもとばせる');
  await axe('見本のはじめ');
  await p.click('#tourScreen .tStep:not([hidden]) .go');
  await p.click('#tkChoices button >> nth=1');
  await p.locator('#tkAfter').waitFor();
  ok((await p.locator('#tkBody').innerText()).includes('たい焼き') && (await p.locator('#tkGuess').innerText()).includes('ぴったり'), '見本のかけら：選ぶと想像が返り、答え合わせが届く');
  await p.click('#tourScreen .tStep:not([hidden]) > .go');
  await p.fill('#tyIn', '近くの川'); await p.click('#tyFill'); await p.locator('#tyAfter').waitFor();
  ok((await p.locator('#tyWhere').innerText()) === '近くの川' && await p.locator('#tyWhere.by-me').count() === 1, '見本の予定：空いた欄を自分の色で埋められる');
  await p.click('#tourScreen .tStep:not([hidden]) > .go');
  await p.click('#tuWords button >> nth=1'); await p.locator('#tuAfter').waitFor();
  ok((await p.locator('#tuGot').innerText()).includes('おつかれさま'), '見本のひとりごと：言葉を選んで返せる');
  await axe('見本のひとりごと');
  await p.click('#tourScreen .tStep:not([hidden]) > .go');
  await p.click('#tourDone');
  ok(await p.locator('#tourScreen').isHidden() && !(await p.locator('#pairScreen').isHidden()), '見本を見終えるとペアづくりの画面へ');
  ok(await p.evaluate(() => !localStorage.getItem('hanbunko-v1') && !localStorage.getItem('hanbunko-mode') && Object.keys(localStorage).join() === 'hanbunko-tour'), '見本で書いたものはどこにも残らない（覚えるのは見終えたことだけ）');
  await p.reload();
  ok(await p.locator('#tourScreen').isHidden() && !(await p.locator('#pairScreen').isHidden()), '見本は一度見たら、開き直しても出ない');
  await p.click('#pTour'); await p.click('#tourSkip');
  ok(await p.locator('#tourScreen').isHidden() && !(await p.locator('#pairScreen').isHidden()), '「ひとりで見てみる」でもう一度見られ、とばすとペアづくりの画面へ戻る');
  ok(await p.evaluate(() => { App.showPair('code'); const h = $('pTour').hidden; App.showPair(); return h && !$('pTour').hidden; }), '招待をつくったあとは見本への入口を出さない');
  // 最初はペアづくりの画面。試作では「1台で試す」でこの端末の中だけで動かす
  ok(!(await shownHidden()).length, '最初の画面：隠したはずの欄（招待コード・試作の視点切り替え）が見えていない');
  await axe('最初の画面');
  ok(!(await p.locator('#pairScreen').isHidden()) && await p.locator('#mainScreen').isHidden(), '最初はペアづくりの画面');
  ok(await p.locator('#pInvite').isHidden() && await p.locator('#devBar').isHidden(), '最初の画面では、招待コードの欄も試作の視点切り替えも出ていない');
  ok(await p.evaluate(() => { App.showPair('code'); const h = $('pDemo').hidden; App.showPair(); return h && !$('pDemo').hidden; }), '招待をつくったあとは「1台で試す」を出さない');
  ok(await p.evaluate(async () => {
    const k = Crypt.newKey(), key = await Crypt.key(k), s = await Crypt.enc(key, { text: 'ひみつ' });
    const inv = Crypt.parseInvite(Crypt.invite('A'.repeat(20), k));
    const msg = Crypt.parseInvite(`ふたりごとの招待コード：\n${Crypt.invite('B'.repeat(20), k)}\n`);
    return !s.includes('ひみつ') && (await Crypt.dec(key, s)).text === 'ひみつ' && inv && inv.key === k && msg && msg.pairId === 'B'.repeat(20) && !Crypt.parseInvite('abc') && !Crypt.parseInvite('x' + Crypt.invite('A'.repeat(20), k))
      && Crypt.parseInvite(Crypt.invite('C'.repeat(20), k).replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0)))?.key === k;
  }), '暗号化と招待コード：鍵で戻せる・平文が残らない・届いた文ごと貼っても読める・全角で打っても読める・形の違うコードは受け付けない');
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
  ok((await p.locator('#hello').innerText()).includes('おかえりなさい') && await p.evaluate(() => !Object.keys(localStorage).some(k => /hello/.test(k))), 'ひと休みから戻ると「おかえりなさい」と出迎える（この画面だけ。何も覚えない）');
  await p.waitForFunction(() => document.getElementById('hello').hidden, null, { timeout: 6000 });
  ok(await p.evaluate(() => { const d = new Date(); return Store.today() === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }), '作った日は端末の暦の日付（時刻は持たない）');
  const as = async me => p.click(me === 'a' ? '#asA' : '#asB');
  const tab = async t => p.click(`#tabs [data-tab=${t}]`);
  const count = sel => p.locator(sel).count();

  // 今日のかけら：［］の中が隠れ、相手が想像を返し、渡した側の答え合わせで全部見える
  // 「選んだところを隠す」：選んだ言葉が［］で囲まれる。何も選ばなければ［］が入る
  await p.fill('#kText', '今日はラーメンを食べた'); await p.evaluate(() => $('kText').setSelectionRange(3, 7)); await p.click('#kHide');
  const hid = await p.inputValue('#kText'); await p.fill('#kText', 'あ'); await p.evaluate(() => $('kText').setSelectionRange(1, 1)); await p.click('#kHide');
  ok(hid === '今日は［ラーメン］を食べた' && await p.inputValue('#kText') === 'あ［］', 'かけら：「選んだところを隠す」で［］で囲める');
  // 助詞や1文字だけを選んだとき・何も選ばずに押したときは、当てがいのある言葉を隠す。中が空の［］は渡さない
  const hideAt = async (v, x, y) => { await p.fill('#kText', v); await p.evaluate(([x, y]) => $('kText').setSelectionRange(x, y), [x, y]); await p.click('#kHide'); return p.inputValue('#kText'); };
  ok(await hideAt('駅前で猫を見た', 4, 5) === '駅前で［猫］を見た' && await hideAt('駅前で猫を見た', 7, 7) === '［駅前］で猫を見た' && await hideAt('今日はラーメンを食べた', 11, 11) === '今日は［ラーメン］を食べた', 'かけら：助詞を選んだり何も選ばずに押すと、当てがいのある言葉を隠す');
  ok(await hideAt('渋谷で猫を見た', 7, 7) === '渋谷で［猫］を見た', 'かけら：何も選ばずに押すと、3択を作れる言葉を先に隠す');
  ok(await hideAt('駅前で［猫］を見た', 4, 5) === '駅前で［猫］を見た', 'かけら：［］の中を選んで押しても二重にしない');
  ok(await hideAt('夜勤明け もちと寝てた', 5, 7) === '夜勤明け ［もち］と寝てた' && await hideAt('ねこと寝てた', 0, 2) === '［ねこ］と寝てた', 'かけら：自分で選んだひらがな2文字の名前（もち・ねこ）はそのまま隠す');
  await p.fill('#kText', '猫［］見た'); await p.click('#kakeraForm button[type=submit]');
  ok(await p.locator('#kakeraList .body').first().innerText() === '猫見た' && await count('#kakeraList .hole') === 0, 'かけら：中が空の［］は空欄にしない');
  await p.evaluate(() => { Store.remove(Store.list('kakera')[0].id); Kakera.render(); });
  await p.fill('#kText', '今日は［ラーメン］を食べた'); await p.dispatchEvent('#kText', 'input');
  ok(!(await p.locator('#kChoiceHint').isHidden()), 'かけら：一覧にある言葉を隠すと、3択になると知らせる');
  await p.click('#kakeraForm button[type=submit]');
  ok(await p.locator('#kakeraList .body').innerText() === '今日は＿＿＿＿を食べた', 'かけら：［］の中が隠れる');
  ok(await p.locator('#kakeraList .who .day').innerText() === '今日' && await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); const y = new Date(); y.setDate(y.getDate() - 2); const f = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return App.dayLabel(f(d)).includes('きのう') && App.dayLabel('2020-11-15').includes('11/15（日）') && App.dayLabel('<b>') === ''; }), '置いた日を小さく出す（今日・きのう・11/15（日）。時刻は出さない）');
  // 2人で使うとき（Firebase）は、相手のものを作った日の次の日から見せる。自分のものはすぐ見え、「相手にはあした届きます」と出る
  ok(await p.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, t = Store.today(), me = Store.me;
    Store.useRemote({ uid: 'u1', state: {}, items: [{ id: 'm', kind: 'kurou', by: 'u1', day: t }, { id: 'p1', kind: 'kurou', by: 'u2', day: t }, { id: 'p2', kind: 'kurou', by: 'u2', day: y }] });
    const ids = Store.list('kurou').map(i => i.id).join(), label = App.dayLabel(t, true);
    Store.useLocal(); Store.me = me;
    return ids === 'm,p2' && label.includes('相手にはあした届きます') && !App.dayLabel(t, true).includes('あした');
  }), '相手のものは次の日から見える（今日の分は見えない）・自分の今日の分には「相手にはあした届きます」');
  // 届く側にも「あしたここに届きます」と書いておき、「今日」「今夜」と打ったら相手が読むのは次の日だと添える（1台で試すときは出さない）
  ok(await count('.nextday:not([hidden])') === 0 && await count('.todayNote:not([hidden])') === 0, '1台で試すときは「あした届く」の添え書きを出さない');
  ok(await p.evaluate(() => {
    const me = Store.me; Store.useRemote({ uid: 'u1', state: {}, items: [] }); App.renderAll();
    const shown = () => [...document.querySelectorAll('#kurou .nextday, #kurouForm .todayNote')].map(e => !e.hidden).join();
    const before = shown(); $('kuText').value = '今夜のごはん、作っておいた'; $('kuText').dispatchEvent(new Event('input', { bubbles: true }));
    const typed = shown(); $('kuText').value = 'ごはん、作っておいた'; $('kuText').dispatchEvent(new Event('input', { bubbles: true }));
    const after = shown(); $('kuText').value = ''; Store.useLocal(); Store.me = me; App.renderAll();
    return before === 'false,true' && typed === 'true,true' && after === 'false,true'; // 書く欄の添え書き、届く側の添え書きの順
  }), '2人で使うとき：届く側に「あしたここに届きます」、書く欄に「今夜」と打つと「相手にはあした届きます」が出る');
  ok(await p.locator('#kakeraList .rBtn').innerText() === '想像を待たずに、相手に答えを明かす', 'かけら：相手の想像が届く前は「想像を待たずに、相手に答えを明かす」');
  await as('b');
  ok(await count('#kakeraList .rBtn') === 0 && await count('#kakeraList .del') === 0, 'かけら：相手は答え合わせも削除もできない');
  const opts = await p.locator('#kakeraList .cBtn').allInnerTexts();
  ok(opts.length === 3 && opts.includes('今日はラーメンを食べた') && new Set(opts).size === 3 && opts.every(o => /^今日は.+を食べた$/.test(o)), 'かけら：隠した言葉と似た言葉を入れた3つの文が出る（' + opts.join('／') + '）');
  await p.fill('#kakeraList .gIn', 'カレー？'); await p.click('#kakeraList .gBtn');
  ok((await p.locator('#kakeraList .guess').innerText()).includes('カレー？'), 'かけら：想像の一言を返せる');
  await as('a');
  ok(await p.locator('#kakeraList .rBtn').innerText() === '答え合わせする', 'かけら：想像が届いたら「答え合わせする」');
  await p.fill('#kakeraList .aIn', 'おしい！'); await p.click('#kakeraList .rBtn');
  ok((await p.locator('#kakeraList .aNote').innerText()).includes('おしい！') && await count('#kakeraList .aIn') === 0, 'かけら：答え合わせに一言そえられる');
  ok(await p.locator('#kakeraList .body').innerText() === '今日はラーメンを食べた' && await p.locator('#kakeraList .body .ans').innerText() === 'ラーメン', 'かけら：答え合わせで全部見え、隠していたところに印がつく');
  ok((await p.locator('#kakeraList .item').first().innerText()).includes('相手にも答えが見えています'), 'かけら：答え合わせのあと、渡した側に「相手にも答えが見えています」');
  ok(await p.evaluate(() => { const s = new Set(); for (let i = 0; i < 200; i++) Words.choices('猫').forEach(w => s.add(w)); return [...s].every(w => '猫 犬 カラス ハト すずめ'.split(' ').includes(w)); }), 'かけら：まぎれの言葉は同じ場面でありえるものだけ（猫に動物園の動物をまぜない）');
  // 3択から選んで返せる。答え合わせで同じなら「ぴったり」
  await p.fill('#kText', '駅前で［猫］を見た'); await p.click('#kakeraForm button[type=submit]'); await as('b');
  ok(await p.locator('#kakeraList .item').first().locator('.body').innerText() === '駅前で＿＿＿＿を見た', 'かけら：空欄はいつも同じ長さ（字数が分からない）');
  await p.locator('#kakeraList .item').first().locator('.cBtn', { hasText: /^駅前で猫を見た$/ }).click();
  ok(await p.locator('#kakeraList .item').first().locator('.cBtn.sel[aria-pressed="true"]').count() === 1 && await p.locator('#kakeraList .item >> nth=0 >> .guess').count() === 0 && (await p.getAttribute('#kakeraList .item >> nth=0 >> .gIn', 'placeholder')).includes('一言そえる'), 'かけら：3択は押しただけでは送らず、選んだ印がついて一言をそえられる');
  await p.locator('#kakeraList .item').first().locator('.cBtn', { hasText: /^駅前で猫を見た$/ }).click();
  ok(await p.locator('#kakeraList .item').first().locator('.cBtn.sel').count() === 0, 'かけら：選んだ3択をもう一度押すと選び直せる');
  await p.locator('#kakeraList .item').first().locator('.cBtn', { hasText: /^駅前で猫を見た$/ }).click();
  await p.fill('#kakeraList .item >> nth=0 >> .gIn', 'あの黒いの？'); await p.locator('#kakeraList .item').first().locator('.gBtn').click();
  ok(await p.locator('#kakeraList .item').first().locator('.cBtn, .gIn').count() === 0 && (await p.locator('#kakeraList .guess').first().innerText()).includes('猫') && await p.locator('#kakeraList .item >> nth=0 >> .guess .gNote').innerText() === 'あの黒いの？', 'かけら：3択を選んで一言をそえて返せる');
  await as('a'); await p.locator('#kakeraList .item').first().locator('.rBtn').click();
  ok(await p.locator('#kakeraList .item').first().locator('.guess .done').count() === 1, 'かけら：選んだ言葉が答えと同じなら「ぴったり」');
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
  await p.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 50; const img = new Image(); img.onload = () => Kakera.setPhoto(img); img.src = c.toDataURL(); });
  await p.waitForTimeout(200); await p.click('#kPhotoOff');
  ok(await p.locator('#kBlurRow').isHidden(), 'かけら：選んだ写真は渡す前に外せる');
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
  const fills = p.locator('#yoteiList .fill'); await fills.nth(0).fill('駅前'); await p.click('#yoteiList .tkBtn');
  ok(await fills.nth(0).inputValue() === '駅前', '予定：空き欄に書きかけてから名乗っても、書いたものが消えない');
  await p.click('#yoteiList .tkBtn'); await fills.nth(0).fill('駅前'); await fills.nth(1).fill('ごはん'); await p.click('#yoteiList .fBtn');
  ok(await count('#yoteiList .done') === 1, '予定：相手が埋めると「決まり」');
  // やる人：最初は「どちらでも」。どちらからでも一タップで名乗れ、取り下げられる
  const take = () => p.locator('#yoteiList .take b').first().textContent();
  ok(await take() === 'どちらでも', '予定：やる人は最初「どちらでも」');
  await p.click('#yoteiList .tkBtn'); ok(await take() === 'わたし', '予定：相手側からも一タップで名乗れる');
  await as('a'); ok(await take() === 'あいて', '予定：名乗りは置いた人にも見える');
  await p.click('#yoteiList .tkBtn'); ok(await take() === 'ふたりで', '予定：2人とも名乗れば「ふたりで」');
  await p.click('#yoteiList .tkBtn'); await as('b'); await p.click('#yoteiList .tkBtn'); ok(await take() === 'どちらでも', '予定：名乗りはいつでも「どちらでも」にもどせる');
  // 決まったあとも、自分が書いた欄だけは直せる。「？」で終わるうちは「決まり」にしない
  ok(await count('#yoteiList .edBtn') === 2, '予定：決まったあとも、自分が埋めた欄には「直す」が出る（相手の欄には出ない）');
  await p.click('#yoteiList .edBtn >> nth=0'); await p.fill('#yoteiList .edit', '北口？'); await p.click('#yoteiList .eBtn');
  ok(await p.locator('#yoteiList .slots').textContent().then(t => t.includes('北口？')) && await count('#yoteiList .done') === 0, '予定：直せる。「？」で終わる欄があるうちは「決まり」にならない');
  await as('a'); ok(await count('#yoteiList .edBtn') === 1 && await count('#yoteiList .done') === 0, '予定：直したものは置いた人にもそのまま見え、置いた人は自分の欄だけ直せる');
  await as('b'); await p.click('#yoteiList .edBtn >> nth=0'); await p.fill('#yoteiList .edit', ''); await p.click('#yoteiList .eBtn');
  ok(await p.locator('#yoteiList .slots').textContent().then(t => t.includes('北口？')), '予定：空にして押しても、空き欄にはもどらない');
  await p.click('#yoteiList .edBtn >> nth=0'); await p.fill('#yoteiList .edit', '北口'); await p.press('#yoteiList .edit', 'Enter');
  ok(await count('#yoteiList .done') === 1, '予定：「？」を消すと「決まり」');
  // 決まった予定は一行にたためる。たたんだことはこの端末のこの人だけの印で、相手には伝わらない
  ok(await count('#yoteiList .foldBtn') === 1 && (await p.locator('#yoteiList .foldBtn').innerText()) === '自分の画面でたたむ', '予定：決まった予定に「自分の画面でたたむ」が出る');
  await p.click('#yoteiList .foldBtn');
  ok(await count('#yoteiList .item.folded') === 1 && await count('#yoteiList .slots') === 0 && (await p.locator('#yoteiList .summary').innerText()).includes('北口') && (await p.locator('#yoteiList .item.folded').innerText()).includes('自分の画面だけ'), '予定：たたむと一行になり、自分の画面だけのことだと書いてある');
  await as('a'); ok(await count('#yoteiList .item.folded') === 0 && await count('#yoteiList .foldBtn') === 1, '予定：たたんだことは相手には伝わらない');
  await as('b'); ok(await count('#yoteiList .item.folded') === 1, '予定：たたんだ印は開き直しても残る');
  await p.click('#yoteiList .unfoldBtn'); ok(await count('#yoteiList .item.folded') === 0 && await count('#yoteiList .slots') === 1, '予定：「ひらく」でもどる');
  // 決まった予定は、決まった日から2週間。先の約束なら「この日まで残す」日を1つ付けられ、カレンダーに下書きを渡せる
  ok(await p.evaluate(() => Store.list('yotei')[0].doneDay === Store.today()) && await count('#yoteiList .calBtn') === 1 && (await p.locator('#yoteiList .keep').innerText()).includes('決まった日から2週間'), '予定：決まると決まった日を覚え、「カレンダーに入れる」と残り方が出る');
  const ahead = await p.evaluate(() => { const t = new Date(); t.setDate(t.getDate() + 40); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; });
  await p.fill('#yoteiList .kIn', ahead);
  ok((await p.locator('#yoteiList .keep').innerText()).includes(`${Number(ahead.slice(5, 7))}/${Number(ahead.slice(8))} まで残します`), '予定：「この日まで残す」日を付けると、その日まで残ると出る');
  await p.evaluate(() => { const i = Store.list('yotei')[0]; Store.update(i.id, { day: '2000-01-01' }); Yotei.render(); });
  ok(await count('#yoteiList .item') === 1, '予定：置いた日から2週間たっても、決まった予定は決まった日から数え、残す日まで残る');
  await as('a'); ok(await count('#yoteiList .item') === 1 && (await p.locator('#yoteiList .keep').innerText()).includes('まで残します'), '予定：残す日は相手の画面にも同じように効く');
  await as('b');
  // 決まっても決まらなくても、期限が過ぎれば同じように消える（手で消したものと見分けがつかないように）。新しい予定は残る
  await p.evaluate(() => { Store.add('yotei', { when: 'いつか', where: '', what: '' }); Store.list('yotei').forEach(i => Store.update(i.id, { day: '2000-01-01', doneDay: '2000-01-01', keep: '', keep2: '' })); Store.add('yotei', { when: '', where: '', what: 'さんぽ' }); Yotei.render(); });
  ok(await count('#yoteiList .item') === 1 && await count('#yoteiList .done') === 0, '予定：決まった予定も決まらない予定も、日がたつと消える');
  await p.evaluate(() => { const i = Store.add('yotei', { when: 'いつか', where: '海', what: '' }); Store.update(i.id, { what: 'さんぽ', day: '2000-01-01', doneDay: '2000-01-02', keep: '2099-01-01' }); Yotei.render(); });
  ok(await count('#yoteiList .item') === 1, '予定：残す日は、決まった日から2か月より先にはならない');

  // 見えない苦労：相手は短い言葉を1つ選んで返す（押しただけでは送らない）。一言そえてもいい。返すのは1回だけ
  await tab('kurou'); await as('a');
  await p.fill('#kuText', '排水口の掃除をしておいた'); await p.click('#kurouForm button[type=submit]');
  await as('b'); const t0 = await count('#kurouList .thanks'), off = await p.locator('#kurouList .tSend').isDisabled();
  await p.fill('#kurouList .tIn', 'いつもの'); await p.click('#kurouList .tBtn:has-text("おつかれさま")');
  ok(await p.inputValue('#kurouList .tIn') === 'いつもの', '苦労：先に一言を書いてから言葉を選んでも、一言が消えない');
  await p.click('#kurouList .tSend');
  ok(t0 === 0 && off && (await p.locator('#kurouList .thanks').innerText()).includes('「おつかれさま」を返しました') && (await p.locator('#kurouList .tNote').innerText()) === 'いつもの' && await count('#kurouList .tBtn') === 0, '苦労：言葉を選ばずには返せない。選んで一言そえて返すと、言葉と一言が残り、もう返せない');
  ok(await p.evaluate(() => { const i = Store.list('kurou')[0]; return i.thanks === 'おつかれさま' && i.note === 'いつもの' && !('count' in i); }), '苦労：返したのは言葉と一言だけ（数えない）');
  // ほかのタブに相手から新しく届いたものがあると、タブに点がつく（数は出さない）。開くと消える
  await as('a'); await p.fill('#kuText', '印のテスト'); await p.click('#kurouForm button[type=submit]'); await tab('kakera'); await as('b');
  const isNew = () => p.locator('#tabs [data-tab=kurou]').evaluate(b => b.classList.contains('new'));
  const said = () => p.locator('#tabs [data-tab=kurou]').evaluate(b => b.textContent.includes('新しく届いています'));
  const n1 = await isNew(), s1 = await said(); await tab('kurou'); const n2 = await isNew(), s2 = await said(); await tab('kakera'); const n3 = await isNew();
  ok(n1 && !n2 && !n3 && !/\d/.test(await p.locator('#tabs').innerText()), 'ほかのタブに新しく届くと点がつき、開くと消える（数は出さない）');
  ok(s1 && !s2, '点は読み上げでも「新しく届いています」と分かり、開くと消える');
  // タブの中では、まだ目にしていなかったものにだけ小さな印がつき、描き直しても残り、タブを変えると消える
  await as('a'); await tab('kurou'); await p.fill('#kuText', '中の印'); await p.click('#kurouForm button[type=submit]'); await tab('kakera'); await as('b'); await tab('kurou');
  const freshOf = () => p.locator('#kurouList .item.fresh').evaluateAll(els => els.map(e => e.querySelector('.body').textContent));
  const f1 = await freshOf(), v1 = await p.locator('#kurouList .item.fresh .who').first().textContent(); await p.evaluate(() => App.renderAll()); const f2 = await freshOf(); await tab('kakera'); await tab('kurou'); const f3 = await freshOf();
  ok(f1.join() === '中の印' && v1.includes('新しく届いています') && f2.join() === '中の印' && f3.length === 0 && !(await p.locator('#kurouList').textContent()).includes('新しく届いています'), 'タブの中：まだ見ていなかったものにだけ印がつき（読み上げも）、描き直しても残り、タブを変えると消える');
  // 届いた瞬間の演出：はじめて目にしたときだけ、そっと浮かぶ。中身にもサーバーにも何も足さない（開いたことを相手に伝えない）
  await as('a'); await p.fill('#kuText', '演出のテスト'); await p.click('#kurouForm button[type=submit]'); await tab('kakera'); await as('b');
  const before = await p.evaluate(() => JSON.stringify(Store.list('kurou').find(i => i.text === '演出のテスト')));
  await tab('kurou'); const ar1 = await p.locator('#kurouList .item.arrive').evaluateAll(els => els.map(e => e.querySelector('.body').textContent));
  const anim = await p.locator('#kurouList .item.arrive').first().evaluate(e => getComputedStyle(e).animationName);
  const after = await p.evaluate(() => JSON.stringify(Store.list('kurou').find(i => i.text === '演出のテスト')));
  await tab('kakera'); await tab('kurou'); const ar2 = await p.locator('#kurouList .item.arrive').count();
  ok(ar1.join() === '演出のテスト' && /arrive/.test(anim) && before === after && ar2 === 0, '届いた瞬間：はじめて目にしたものだけがそっと浮かび、もう一度開いても繰り返さない。中身は変わらない（既読のような印をどこにも置かない）');
  await p.emulateMedia({ reducedMotion: 'reduce' }); await p.evaluate(() => { App.arrive.set(App.sig(Store.list('kurou').find(i => i.text === '演出のテスト')), Date.now()); App.marks(); });
  ok(await p.locator('#kurouList .item.arrive').first().evaluate(e => getComputedStyle(e).animationName === 'none'), '動きを減らす設定の端末では、届いた瞬間の演出を動かさない');
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.click('#kurouList .item:has-text("演出のテスト") .tBtn:has-text("ありがとう")'); await p.click('#kurouList .item:has-text("演出のテスト") .tSend');
  ok(await p.locator('#kurouList .item.sent:has-text("演出のテスト") .thanks .flower').count() === 1, 'ありがとうを返すと、返した側の画面だけで小さな花が咲く');
  await as('a'); await p.evaluate(() => { Store.remove(Store.list('kurou').find(i => i.text === '演出のテスト')?.id); App.renderAll(); }); await as('b');
  // 自分のものに相手の返事（ありがとう）が届いたときも、ほかのタブにいれば点、開けばそのものに印
  await p.click('#kurouList .item:has-text("中の印") .tBtn:has-text("ありがとう")'); await p.click('#kurouList .item:has-text("中の印") .tSend'); await tab('kakera'); await as('a');
  const n4 = await isNew(); await tab('kurou'); const f4 = await freshOf(), v4 = await p.locator('#kurouList .item.fresh .who').first().textContent(); await tab('kakera'); await as('b'); const n5 = await isNew();
  ok(n4 && f4.join() === '中の印' && v4.includes('返事が届いています') && !v4.includes('新しく届いています') && !n5, '自分の苦労にありがとうが届くと、ほかのタブなら点、開けばそのものに印（読み上げは「返事が届いています」。返した側には何もつかない）');
  await as('a'); await p.evaluate(() => { Store.remove(Store.list('kurou').find(i => i.text === '中の印')?.id); App.renderAll(); }); await as('b');
  ok(await p.evaluate(() => { localStorage.setItem('hanbunko-seen', '["x1"]'); const me = Store.me; Store.useRemote({ uid: me, items: [], loaded: false }); App.marks(); const s = localStorage.getItem('hanbunko-seen'); Store.useLocal(); Store.me = me; return s === '["x1"]'; }), '届いたものを読み終える前は、見たものの覚えを消さない（開いたら古いものに点がつかない）');
  await p.evaluate(() => { Store.remove(Store.list('kurou').find(i => i.text === '印のテスト')?.id); }); await as('a'); await p.evaluate(() => { Store.remove(Store.list('kurou').find(i => i.text === '印のテスト')?.id); App.renderAll(); }); await as('b'); await tab('kurou');
  // 打つ前から、どの欄にも上限の字数が書いてある（欄ごとに上限が違うので）
  ok(await p.evaluate(() => [...document.querySelectorAll('[maxlength]')].every(i => i.placeholder.includes(i.maxLength + '字まで'))), '字数に上限のある欄には、打つ前から「○字まで」と書いてある');
  // 欄に入ったときから上限の字数が見える
  await p.focus('#kuText');
  ok((await p.locator('#kurouForm .count').innerText()) === '60字まで', '欄に入ると、打つ前から「60字まで」と出る');
  // 字数の上限が近づくと、残りの字数が出る
  await p.fill('#kuText', 'あ'.repeat(55)); await p.dispatchEvent('#kuText', 'input');
  ok((await p.locator('#kurouForm .count').innerText()) === 'あと5字', '字数の上限が近づくと「あと5字」と出る');
  await p.fill('#kuText', 'あ'.repeat(60)); await p.dispatchEvent('#kuText', 'input'); await p.click('#kurouForm button[type=submit]'); await p.waitForTimeout(50);
  ok(await count('#kurouForm .count') === 0, '送ると「あと○字」「ここまでです」の知らせも消える');
  await p.click('#kurouList .del');
  // ID から書いた時刻が分からない（原則1）。同じ日の中は置いた順に新しいものが上
  await p.fill('#kuText', '2つめ'); await p.click('#kurouForm button[type=submit]');
  ok(await p.locator('#kurouList .item .body').first().innerText() === '2つめ', '苦労：同じ日の中でも新しいものが上');
  // ID はでたらめなので、たまたま今の時刻に近い数になることがある（数万回に1回）。時刻入りの ID なら全部が近くなるので、全部が近いときだけ落とす
  ok(await p.evaluate(() => { const l = Store.list('kurou'); return l.length >= 2 && !l.every(i => Math.abs(parseInt(i.id.slice(0, 8), 36) - Date.now()) < 864e5); }), 'ID に書いた時刻が入っていない');
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
  ok(await p.evaluate(() => ['kakera', 'yotei', 'kurou'].every(k => Store.list(k).length === 0)), '解消：試作で書いたものは残らない');
  ok(await p.evaluate(() => [...document.querySelectorAll('input:not([type=file]):not([type=checkbox]), textarea, select')].every(e => parseFloat(getComputedStyle(e).fontSize) >= 16)), '入力欄の文字は 16px 以上（iPhone でタップしても画面が拡大されない）');
  // キーボードだけでも使える：写真を選ぶ欄にフォーカスでき、想像の一言は Enter で返せる
  await p.click('#tabs [data-tab=kakera]');
  await p.focus('#kPhoto'); ok(await p.evaluate(() => document.activeElement.id === 'kPhoto'), 'キーボード：写真を選ぶ欄にフォーカスできる');
  // 指で使うと名乗らない端末（Android のエミュレーターなど）でも、キーボードで画面が大きく縮んだら隠す
  await p.focus('#kText'); await p.setViewportSize({ width: 390, height: 420 }); await p.waitForTimeout(100);
  const shrunk = await p.locator('#tabs').isHidden(); await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(100);
  ok(shrunk && await p.locator('#tabs').isVisible(), 'キーボードで画面が縮んだあいだは下のタブを隠し、戻ったら出す'); await p.focus('#kPhoto');
  // スマホでキーボードが出ているあいだは下のタブを隠す
  const mm = await p.evaluate(() => { const o = window.matchMedia; window.matchMedia = q => q === '(pointer: coarse)' ? { matches: true } : o.call(window, q); return 1; });
  await p.focus('#kText'); const tabsHid = await p.locator('#tabs').isHidden(); await p.focus('#kPhoto');
  ok(mm && tabsHid && await p.locator('#tabs').isVisible(), 'スマホ：文字を打つあいだは下のタブを隠し、離れたら戻す');
  await p.fill('#kText', '［キー］で'); await p.click('#kakeraForm button[type=submit]'); await as('b');
  ok(await p.locator('#kakeraList .item').first().locator('.cBtn').count() === 0, 'かけら：一覧に無い言葉は3択にせず、一言で返す');
  await p.fill('#kakeraList .gIn', 'エンター'); await p.press('#kakeraList .gIn', 'Enter');
  ok((await p.locator('#kakeraList .guess').first().innerText()).includes('エンター'), 'キーボード：想像の一言は Enter で返せる');
  // 相手から何か届いて描き直しても、書きかけの想像の一言は消えず、入力も続けられる。変換中は描き直さない
  await as('a'); await p.fill('#kText', '［書きかけ］'); await p.click('#kakeraForm button[type=submit]'); await as('b');
  await p.fill('#kakeraList .gIn >> nth=0', 'とちゅう');
  await p.evaluate(() => { Store.add('kurou', { text: '届いた' }); App.renderAll(); });
  ok(await p.inputValue('#kakeraList .gIn >> nth=0') === 'とちゅう' && await p.evaluate(() => document.activeElement.matches('#kakeraList .gIn')), '描き直し：書きかけの返事と入力中の場所が残る');
  const kept = await p.evaluate(() => { const i = document.querySelector('#kakeraList .gIn'); i.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); App.renderAll(); const same = document.querySelector('#kakeraList .gIn') === i; i.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); return same; });
  await p.waitForTimeout(50);
  ok(kept && await p.inputValue('#kakeraList .gIn >> nth=0') === 'とちゅう', '描き直し：日本語の変換中は描き直さない');
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
  await ios.goto(`http://127.0.0.1:${server.address().port}/`); await ios.evaluate(() => { localStorage.clear(); localStorage.setItem('hanbunko-tour', '1'); }); await ios.reload();
  ok(!(await ios.locator('#iosPairHint').isHidden()) && await p.locator('#iosPairHint').isHidden(), 'iPhone の Safari だけ、ペアになる前にホーム画面へ追加する案内を出す');
  await ios.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true })); await ios.reload();
  ok(await ios.locator('#iosPairHint').isHidden() && !(await ios.locator('#iosHomeOk').isHidden()), 'iPhone のホーム画面から開くと、正しく開けていると出す');
  await b.close(); server.close();
  console.log(fails ? `\n${fails} 件失敗` : '\nすべて OK'); process.exit(fails ? 1 : 0);
})();
