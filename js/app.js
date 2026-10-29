// 画面の切り替えと共通の部品。最初の画面（ペアづくり）→ 3つのタブ
const App = {
  delButton(id, after) { const b = document.createElement('button'); b.className = 'del'; b.textContent = '消す'; b.onclick = () => { Store.remove(id); after(); }; return b; },
  renderAll() { Kakera.render(); Yotei.render(); Kurou.render(); },
  setMe(me) { Store.me = me; document.querySelectorAll('#devBar button').forEach(b => b.classList.toggle('on', b.dataset.me === me)); App.renderAll(); },
  show(tab) {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.tab').forEach(s => { s.hidden = s.id !== tab; });
  },
  screen(name) {
    if (name === 'main' && App.resting()) name = 'rest'; // ひと休み中は、届いたものを出さない
    $('pairScreen').hidden = name !== 'pair'; $('mainScreen').hidden = name !== 'main'; $('restScreen').hidden = name !== 'rest';
  },
  // ひと休み：この端末だけの印。サーバーにも相手にも何も置かない（原則1・5）。休むあいだはまとめ通知の宛先を外す
  resting() { try { return localStorage.getItem('hanbunko-rest') === '1'; } catch (e) { return false; } },
  async rest(on) {
    try { if (on) localStorage.setItem('hanbunko-rest', '1'); else localStorage.removeItem('hanbunko-rest'); } catch (e) { /* 覚えられなくてもこの場は休む */ }
    App.screen('main'); window.scrollTo(0, 0);
    if (Store.remote && Notify.on()) { if (on) await Remote.dropToken().catch(() => {}); else await Notify.refresh(); }
  },
  error(msg) { $('pErr').textContent = msg || ''; $('pErr').hidden = !msg; $('pBusy').hidden = true; },
  showPair(code) {
    App.screen('pair'); $('devBar').hidden = true; $('pDemo').hidden = !SHOW_TEST;
    $('pInvite').hidden = !code; $('pCreate').hidden = !!code; $('pCode').value = code || '';
  },
  startLocal() { Store.useLocal(); App.notifyRow(); App.screen('main'); $('alone').hidden = true; $('devBar').hidden = !SHOW_TEST; App.setMe('a'); },
  async startRemote() {
    $('pBusy').hidden = false;
    try { Store.useRemote(await Remote.connect(App.onRemote)); } catch (e) { App.showPair(); App.error('つなげませんでした。電波のよいところでもう一度開いてください'); return; }
    App.notifyRow(); if (!App.resting()) Notify.refresh();
  },
  // まとめ通知の設定は、2人で使っていて、この端末が通知を受けられるときだけ出す
  notifyRow() { $('notifyRow').hidden = !(Store.remote && Notify.supported()); $('notifyOn').checked = Notify.on(); },
  async toggleNotify(box) {
    box.disabled = true;
    try {
      if (box.checked) await Notify.enable(); else await Notify.disable();
      $('notifyHint').textContent = box.checked ? 'オンにしました。相手から新しく届いたものがある日だけ、夜9時ごろに1回お知らせします。' : 'オフにしました。';
    } catch (e) {
      box.checked = false; await Notify.disable();
      $('notifyHint').textContent = e.message === 'denied' ? '通知が許可されていません。端末の設定で「はんぶんこ」の通知を許可してから、もう一度オンにしてください。' : '通知をオンにできませんでした。電波のよいところでもう一度試してください。';
    }
    box.disabled = false;
  },
  // ペアの状態が変わったとき・中身が届いたとき
  onRemote(state) {
    if (!Store.remote) return;
    if (!state.partner && !state.everPaired) { App.showPair(state.code); $('pBusy').hidden = true; return; }
    App.screen('main'); $('alone').hidden = state.partner; App.renderAll();
  },
  // 解消は2回押し（押し間違いで2人の場所の鍵をなくさないため）。理由は聞かない
  async leave(btn) {
    if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'もう一度押すと解消します'; setTimeout(() => { delete btn.dataset.sure; btn.textContent = 'ペアを解消する'; }, 4000); return; }
    delete btn.dataset.sure; btn.textContent = 'ペアを解消する';
    if (Store.remote) { if (Notify.on()) await Notify.disable(); await Remote.leave(); }
    try { localStorage.removeItem('hanbunko-rest'); } catch (e) { /* 次のペアに持ち越さない */ }
    Store.setMode(null); App.showPair();
  },
};
document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => App.show(b.dataset.tab); });
document.querySelectorAll('#devBar button').forEach(b => { b.onclick = () => App.setMe(b.dataset.me); });
$('pDemo').onclick = () => App.startLocal();
$('pCreate').onclick = async () => {
  App.error(); $('pBusy').hidden = false;
  try { const code = await Remote.create(); App.showPair(code); await App.startRemote(); } catch (e) { App.error('招待をつくれませんでした。電波のよいところでもう一度試してください'); }
};
$('pJoin').onclick = async () => {
  App.error(); $('pBusy').hidden = false;
  try { await Remote.join($('pJoinIn').value); await App.startRemote(); } catch (e) { App.error(e.message); }
};
$('pShare').onclick = async () => {
  const text = $('pCode').value;
  try { if (navigator.share) await navigator.share({ text: `はんぶんこの招待コード：\n${text}` }); else { await navigator.clipboard.writeText(text); $('pShare').textContent = 'コピーしました'; } } catch (e) { $('pCode').select(); }
};
$('notifyOn').onchange = e => App.toggleNotify(e.currentTarget);
$('restBtn').onclick = () => App.rest(true);
$('restEnd').onclick = () => App.rest(false);
$('leaveBtn').onclick = e => App.leave(e.currentTarget);
Kakera.init(); Yotei.init(); Kurou.init();
if (Store.mode === 'local') App.startLocal();
else if (Remote.saved()) { App.showPair(); App.startRemote(); }
else App.showPair();
