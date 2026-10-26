// 動作確認（スモークテスト）：3機能を2人の視点で一通り動かし、エラーが出ないか・束縛につながる表示がないかを見る
// 使い方：node tools/smoke.js [index.html のパス]   （Playwright と Chromium が必要）
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const file = path.resolve(process.argv[2] || 'index.html');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fails++; };
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_FILE/.test(m.text())) errs.push(m.text()); });
  await p.goto('file://' + file); await p.evaluate(() => localStorage.clear()); await p.reload();
  // 最初はペアづくりの画面。試作では「1台で試す」でこの端末の中だけで動かす
  ok(!(await p.locator('#pairScreen').isHidden()) && await p.locator('#mainScreen').isHidden(), '最初はペアづくりの画面');
  ok(await p.evaluate(async () => {
    const k = Crypt.newKey(), key = await Crypt.key(k), s = await Crypt.enc(key, { text: 'ひみつ' });
    const inv = Crypt.parseInvite(Crypt.invite('A'.repeat(20), k));
    return !s.includes('ひみつ') && (await Crypt.dec(key, s)).text === 'ひみつ' && inv && inv.key === k && !Crypt.parseInvite('abc');
  }), '暗号化と招待コード：鍵で戻せる・平文が残らない・形の違うコードは受け付けない');
  await p.click('#pDemo');
  ok(!(await p.locator('#mainScreen').isHidden()), '「1台で試す」で3つのタブが出る');
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
  await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 120; const g = c.getContext('2d'); g.fillStyle = '#c63'; g.fillRect(0, 0, 200, 120); const img = new Image(); img.onload = () => Kakera.setPhoto(img); img.src = c.toDataURL(); });
  await p.waitForTimeout(200);
  ok(!(await p.locator('#kBlurRow').isHidden()), 'かけら：写真を選ぶとぼかしの見本が出る');
  await p.click('#kakeraForm button[type=submit]');
  ok(await p.evaluate(() => { const it = Store.list('kakera')[0]; return it.photo && it.blur && it.photo !== it.blur && document.querySelector('#kakeraList img').src === it.blur; }), 'かけら：写真はぼかした版だけ見える');
  // 写真は決まった日数で消え、一言は残る
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
  // 自分のものだけ消せる
  await as('a'); await p.click('#kurouList .del');
  ok(await count('#kurouList .item') === 0, '苦労：自分のカードは消せる');

  // ペアの解消は2回押しで、理由は聞かずに最初の画面へ戻る
  await p.click('#leaveBtn');
  ok(await p.locator('#pairScreen').isHidden() && (await p.locator('#leaveBtn').innerText()).includes('もう一度'), '解消：1回目は確かめるだけ');
  await p.click('#leaveBtn');
  ok(!(await p.locator('#pairScreen').isHidden()), '解消：2回目で最初の画面に戻る');
  await p.click('#pDemo');
  // 束縛につながる表示が画面のどこにもない
  const text = await p.evaluate(() => document.body.innerText);
  ok(!/既読|オンライン|最終ログイン|入力中|連続|回目|合計/.test(text), '画面に既読・オンライン・回数の表示がない');
  ok(await p.evaluate(() => !JSON.stringify(localStorage).match(/readAt|seenAt|lastSeen|"at":\d/)), '保存データに既読や時刻を持たない');
  ok(errs.length === 0, 'ページのエラーなし' + (errs.length ? '：' + errs.join(' / ') : ''));
  await b.close();
  console.log(fails ? `\n${fails} 件失敗` : '\nすべて OK'); process.exit(fails ? 1 : 0);
})();
