// 画面の切り替えと共通の部品。最初の画面（ペアづくり）→ 3つのタブ
const App = {
  // 置いた日（時刻は持たないので日だけ）。「あした」「今夜」がどの日のことか分かるように
  // mine：自分が今日置いたものは、相手にはあした届く（js/store.js の list）。1台で試すときは相手がいないので出さない
  dayLabel(day, mine) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return '';
    if (day === Store.today()) return `<span class="day">今日${mine && Store.remote ? '・相手にはあした届きます' : ''}</span>`;
    const [y, m, d] = day.split('-').map(Number), t = new Date(y, m - 1, d), n = new Date(); n.setDate(n.getDate() - 1);
    return `<span class="day">${t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth() && t.getDate() === n.getDate() ? 'きのう' : `${m}/${d}（${'日月火水木金土'[t.getDay()]}）`}</span>`;
  },
  delButton(id, after) { const b = document.createElement('button'); b.className = 'del'; b.textContent = '消す'; b.onclick = () => { Store.remove(id); after(); }; return b; },
  // 相手から何か届くたびに描き直すので、書きかけの返事（想像の一言・予定の空き欄）と入力中の場所を持ち越す
  // 日本語の変換中だけは描き直さず、変換が終わってから描く（途中で描き直すと変換が切れるため）
  renderAll() {
    if (App.composing) { App.later = true; return; }
    const key = i => `${i.closest('.item').dataset.id}|${i.dataset.k || i.className}`, kept = {}, a = document.activeElement;
    document.querySelectorAll('.list .item input').forEach(i => { if (i.value) kept[key(i)] = i.value; });
    const focus = a?.matches?.('.list .item input') ? { k: key(a), s: a.selectionStart, e: a.selectionEnd } : null;
    Kakera.render(); Yotei.render(); Kurou.render();
    document.querySelectorAll('.list .item input').forEach(i => {
      const k = key(i); if (k in kept) i.value = kept[k];
      if (focus?.k === k) { i.focus({ preventScroll: true }); i.setSelectionRange(focus.s, focus.e); }
    });
    App.marks(); App.todayNotes();
  },
  // 2人で使うとき、相手のものはあした届く（js/store.js の list）。届く側にも書いておき、「今日」「今夜」と打ったら、相手が読むのは次の日だと添える
  todayNotes() {
    document.querySelectorAll('.nextday').forEach(e => { e.hidden = !Store.remote; });
    document.querySelectorAll('form.compose').forEach(f => { const n = f.querySelector('.todayNote'); if (n) n.hidden = !(Store.remote && [...f.querySelectorAll('input, textarea')].some(i => /今日|きょう|今夜|今晩|こんや|今から|いまから/.test(i.value))); });
  },
  // 「見た」の覚えに使う印：相手が書いたものはその ID。自分のものは、相手の返事（想像・ありがとう・埋めた欄・名乗り）が付いたときだけ、どこまで付いたかを含める（返事が届いても点がつくように）
  // 予定の欄は「埋まったかどうか」だけを見る（相手が自分の欄を直しても、知らせない）。返事のない自分のものは印にしない
  sig(i, me = Store.me) {
    if (i.by !== me) return i.id;
    const r = i.kind === 'kakera' ? [i.guess ? 1 : ''] : i.kind === 'kurou' ? [i.thanks ? 1 : ''] : [i.take2 ? 1 : '', ...['when', 'where', 'what'].map(k => i[k + 'By'] && i[k + 'By'] !== me ? 1 : '')];
    return r.some(Boolean) ? i.id + '|' + r.join(',') : null;
  },
  fresh: new Set(), // 開いているタブの中で、まだ目にしていなかったもの。タブを変えるまで印を残す
  // ほかのタブに相手から新しく届いたものがあれば、タブに小さな点をつける。開いているタブの中では、そのものに小さな印をつける。数は出さない（原則3）
  // 見たかどうかはこの端末の中だけで覚え、相手にもサーバーにも伝えない（原則1）
  marks() {
    if (!Store.ready) return; // 読み終える前に覚えた印を空にしてしまわないように
    let seen; try { seen = new Set(JSON.parse(localStorage.getItem('hanbunko-seen')) || []); } catch (e) { seen = new Set(); }
    const now = new Set();
    for (const b of document.querySelectorAll('#tabs button')) {
      const list = Store.list(b.dataset.tab), sigs = list.map(i => [i.id, App.sig(i)]).filter(([, s]) => s), on = b.classList.contains('on');
      list.forEach(i => { now.add(i.id); const o = App.sig(i, i.by); if (o) now.add(o); }); // 1台で試すとき、視点を変えても相手側の覚えを消さないように、どちらから見た印も残す
      if (on) sigs.forEach(([, s]) => { if (!seen.has(s)) { seen.add(s); App.fresh.add(s); } });
      const isNew = !on && sigs.some(([, s]) => !seen.has(s));
      b.classList.toggle('new', isNew);
      // 点は目にしか見えないので、読み上げにも同じことを伝える
      let t = b.querySelector('.vh');
      if (isNew && !t) { t = document.createElement('span'); t.className = 'vh'; t.textContent = '・新しく届いています'; b.append(t); }
      if (!isNew) t?.remove();
      for (const [id, s] of sigs) {
        const el = document.querySelector(`#${b.dataset.tab}List .item[data-id="${id}"]`), f = on && App.fresh.has(s); if (!el) continue;
        el.classList.toggle('fresh', f);
        let v = el.querySelector('.who .vh');
        if (f && !v) { v = document.createElement('span'); v.className = 'vh'; v.textContent = s.includes('|') ? '返事が届いています・' : '新しく届いています・'; el.querySelector('.who').prepend(v); } // 自分のものへの返事（id|…）と、相手から届いたものを読み分ける
        if (!f) v?.remove();
      }
    }
    try { localStorage.setItem('hanbunko-seen', JSON.stringify([...seen].filter(id => now.has(id)))); } catch (e) { /* 覚えられなくても表示は続ける */ }
  },
  setMe(me) { Store.me = me; document.querySelectorAll('#devBar button').forEach(b => b.classList.toggle('on', b.dataset.me === me)); App.renderAll(); },
  show(tab) {
    document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.querySelectorAll('.tab').forEach(s => { s.hidden = s.id !== tab; });
    App.fresh.clear(); App.marks();
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
    App.screen('pair'); $('devBar').hidden = true; $('pDemo').hidden = !SHOW_TEST || !!code || Remote.saved(); // 招待やペアがあるあいだは試作に入れない
    $('pInvite').hidden = !code; $('pCreate').hidden = !!code; $('pCode').value = code || '';
    $('pNew').hidden = $('pJoinCard').hidden = false; $('pRetry').hidden = true;
    // iPhone の Safari とホーム画面版は localStorage（鍵）が別。ペアになる前にホーム画面へ追加してもらう
    $('iosPairHint').hidden = !!code || !(/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone && !window.Capacitor?.isNativePlatform?.());
  },
  // ペアはあるのにつながらないとき：招待をつくり直す道は出さない（押すとこの端末の鍵が新しいものに置き換わってしまうため）
  offline() {
    App.showPair(); $('pNew').hidden = $('pJoinCard').hidden = $('iosPairHint').hidden = true; $('pRetry').hidden = false;
    App.error('つながりませんでした。電波のよいところで「もう一度つなぐ」を押してください。2人の場所と書いたものは消えていません');
  },
  startLocal() { Store.useLocal(); App.notifyRow(); App.screen('main'); $('alone').hidden = true; $('devBar').hidden = !SHOW_TEST; App.setMe('a'); },
  async startRemote() {
    $('pBusy').hidden = false;
    try { Store.useRemote(await Remote.connect(App.onRemote)); } catch (e) { App.offline(); return; }
    App.notifyRow(); if (!App.resting()) Notify.refresh();
  },
  // まとめ通知の設定は、2人で使っていて、この端末が通知を受けられるときだけ出す
  notifyRow() {
    const can = Notify.supported(), ios = Notify.iosNeedsInstall();
    $('notifyRow').hidden = !(Store.remote && (can || ios));
    $('notifyLabel').hidden = $('notifyHint').hidden = !can; $('iosHint').hidden = can || !ios;
    $('notifyOn').checked = Notify.on();
  },
  async toggleNotify(box) {
    box.disabled = true;
    try {
      if (box.checked) await Notify.enable(); else await Notify.disable();
      $('notifyHint').textContent = box.checked ? 'オンにしました。相手から新しく届いたものがある日だけ、夜9時ごろに1回お知らせします。' : 'オフにしました。';
    } catch (e) {
      box.checked = false; await Notify.disable();
      $('notifyHint').textContent = e.message === 'denied' ? '通知が許可されていません。端末の設定で「ふたりごと」の通知を許可してから、もう一度オンにしてください。' : '通知をオンにできませんでした。電波のよいところでもう一度試してください。';
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
    // サーバーの片付けは待たない（電波がなくても、ひとりで即時に抜けられるように。片付けは裏で続く）
    const remote = Store.remote;
    if (remote) { if (Notify.on()) Notify.disable(); Remote.leave(); } else Store.reset(); // 試作で書いたものも残さない
    try { localStorage.removeItem('hanbunko-rest'); } catch (e) { /* 次のペアに持ち越さない */ }
    Store.setMode(null);
    // 試作の前につくった招待やペアは、試作の解消では消さずにそこへ戻る
    if (!remote && Remote.saved()) { App.showPair(); $('pNew').hidden = $('pJoinCard').hidden = $('iosPairHint').hidden = true; App.startRemote(); }
    else App.showPair();
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
  const msg = `ふたりごとの招待コード：\n${text}`, Share = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Share;
  // アプリ版の WebView には navigator.share が無いので、@capacitor/share で LINE などの共有シートを開く
  try {
    if (Share) await Share.share({ text: msg, dialogTitle: '招待コードを送る' });
    else if (navigator.share) await navigator.share({ text: msg });
    else { await navigator.clipboard.writeText(text); $('pShare').textContent = 'コピーしました'; }
  } catch (e) {
    if (/cancel/i.test(e?.message || '') || e?.name === 'AbortError') return; // 共有シートを閉じただけ
    $('pCode').select(); // 送れなければ選んだ状態にして、手でコピーしてもらう
  }
};
$('notifyOn').onchange = e => App.toggleNotify(e.currentTarget);
$('restBtn').onclick = () => App.rest(true);
$('restEnd').onclick = () => App.rest(false);
$('pRetry').onclick = () => location.reload(); // 読み込みに失敗した SDK はブラウザが覚えてしまうので、開き直してやり直す
$('leaveBtn').onclick = e => App.leave(e.currentTarget);
Kakera.init(); Yotei.init(); Kurou.init();
// スマホでキーボードが出ているあいだは下のタブを隠す（キーボードの上に乗って入力欄が狭くなるため）
// 指で使う端末なら入力欄に入ったときに、そう名乗らない端末（エミュレーターなど）でも画面が大きく縮んだときに隠す
const field = el => el?.matches?.('input:not([type=checkbox]):not([type=file]), textarea'), vv = window.visualViewport;
let tall = vv?.height || innerHeight;
const kb = () => { const h = vv?.height || innerHeight; tall = Math.max(tall, h); document.body.classList.toggle('kb', field(document.activeElement) && (matchMedia('(pointer: coarse)').matches || h < tall * 0.75)); };
addEventListener('focusin', kb); addEventListener('focusout', () => setTimeout(kb)); (vv || window).addEventListener('resize', kb);
addEventListener('compositionstart', () => { App.composing = true; });
addEventListener('compositionend', () => { App.composing = false; if (App.later) { App.later = false; setTimeout(App.renderAll); } });
// 前に抜けたときのサーバーの片付けが残っていれば続ける。電波が戻ったときも
Remote.finishLeave(); addEventListener('online', () => { Remote.finishLeave(); if (!$('pRetry').hidden) $('pRetry').click(); });
if (Store.mode === 'local') App.startLocal();
else if (Remote.saved()) { App.showPair(); $('pNew').hidden = $('pJoinCard').hidden = $('iosPairHint').hidden = true; App.startRemote(); } // つながるまで、招待のつくり直しは出さない
else App.showPair();
// 字数の上限は、欄に入ったときから欄のすぐ下に出しておく。近づいたら残りの字数にかえる（何も言わずに打てなくなるのを避ける）
// 送ると欄は空になるので、字数の知らせも消す
document.addEventListener('submit', e => { setTimeout(() => e.target.querySelectorAll('.count').forEach(c => c.remove())); });
const limitNote = el => {
  const max = el.maxLength; if (!(max > 0)) return;
  let c = el.nextElementSibling?.classList.contains('count') ? el.nextElementSibling : null;
  if (!c) { c = document.createElement('span'); c.className = 'count'; c.setAttribute('aria-live', 'polite'); el.after(c); }
  const left = max - el.value.length;
  c.textContent = left > 10 ? `${max}字まで` : left > 0 ? `あと${left}字` : `ここまでです（${max}字まで）`;
};
document.addEventListener('input', e => { limitNote(e.target); if (e.target.closest?.('form.compose')) App.todayNotes(); });
document.addEventListener('submit', () => setTimeout(App.todayNotes)); // 渡して欄が空になったら、添え書きも消す
// 離れても消さない（押そうとしたボタンが、消えた分だけずれて押せなくなるので）
document.addEventListener('focusin', e => limitNote(e.target));
