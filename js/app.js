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
  // 取り消せないボタンは2回押し：1回目は確かめるだけ（4秒で戻る）。続けて速く押した2回目（ダブルタップ）は数えない
  twoStep(b, sure, go) {
    const label = b.textContent, back = () => { clearTimeout(b.t); delete b.dataset.sure; b.textContent = label; b.classList.remove('sure'); };
    b.onclick = () => {
      if (!b.dataset.sure) { b.dataset.sure = Date.now(); b.textContent = sure; b.classList.add('sure'); b.t = setTimeout(back, 4000); return; }
      if (Date.now() - b.dataset.sure < 500) return;
      back(); go();
    };
    return b;
  },
  delButton(id, after) { const b = document.createElement('button'); b.className = 'del'; b.textContent = '消す'; return App.twoStep(b, 'もう一度押すと消えます', () => { Store.remove(id); after(); App.settle(); }); },
  // 送ったり消したりするとカードの形が変わり、下のカードがずれ上がる。指を離す前に別のカードのボタンへ二度押ししないよう、少しのあいだ一覧のボタンを受け付けない
  CALM_MS: 450,
  settle() { App.calm = Date.now(); },
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
      if (focus?.k === k) { i.focus({ preventScroll: true }); if (i.type === 'text') i.setSelectionRange(focus.s, focus.e); } // 日付の欄は選択範囲を持たない
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
  // 相手のかけらは、答え合わせが届いたときにも印をつける（答えを見る瞬間も、届いた瞬間のひとつなので）
  sig(i, me = Store.me) {
    if (i.by !== me) return i.kind === 'kakera' && i.revealed ? i.id + '|a' : i.id;
    const r = i.kind === 'kakera' ? [i.guess ? 1 : ''] : i.kind === 'kurou' ? [i.thanks ? 1 : ''] : [i.take2 ? 1 : '', ...['when', 'where', 'what'].map(k => i[k + 'By'] && i[k + 'By'] !== me ? 1 : '')];
    return r.some(Boolean) ? i.id + '|' + r.join(',') : null;
  },
  fresh: new Set(), // 開いているタブの中で、まだ目にしていなかったもの。タブを変えるまで印を残す
  arrive: new Map(), // はじめて目にした時刻（この画面の中だけ。どこにも残さない）。届いた瞬間の演出に使う
  // 自分が返したり渡したりしたときの、ささやかな手ごたえ（自分の画面の中だけ）
  sent(id) { App.settle(); const el = document.querySelector(`.item[data-id="${id}"]`); if (el) el.classList.add('sent'); },
  // 見え方（色・文字・動き・届いたとき）：えらんだものはこの端末の中だけで覚える。相手にもサーバーにも伝えず、相手の画面も変えない（原則6）
  LOOK: { theme: ['light', 'dark'], size: ['large'], motion: ['gentle', 'off'], arrive: ['nijimi', 'shizuka'] },
  look() { let l; try { l = JSON.parse(localStorage.getItem('hanbunko-look')) || {}; } catch (e) { l = {}; } return l; },
  applyLook() {
    const l = App.look();
    Object.entries(App.LOOK).forEach(([k, ok]) => {
      const v = ok.includes(l[k]) ? l[k] : '';
      if (v) document.documentElement.dataset[k] = v; else delete document.documentElement.dataset[k];
      document.querySelectorAll(`input[name="${k}"]`).forEach(i => { i.checked = i.value === v; });
    });
  },
  setLook(k, v) {
    const l = App.look(); if (v) l[k] = v; else delete l[k];
    try { localStorage.setItem('hanbunko-look', JSON.stringify(l)); } catch (e) { /* 覚えられなくてもこの場は変える */ }
    App.applyLook();
    const c = $('lookPeek'); c.classList.remove('arrive'); void c.offsetWidth; c.classList.add('arrive'); // えらんだ見え方を、見本でいちど見せる
  },
  // 動かさないとき（端末の「動きを減らす」か、ここで「動かさない」をえらんだとき）
  still() { return document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches; },
  // 「ありがとう」にそえる小さな花（絵文字は使わない）
  flower: '<svg class="flower" viewBox="0 0 20 20" aria-hidden="true"><g fill="currentColor" opacity=".55"><circle cx="10" cy="5" r="3.6"/><circle cx="14.8" cy="8.5" r="3.6"/><circle cx="13" cy="14.2" r="3.6"/><circle cx="7" cy="14.2" r="3.6"/><circle cx="5.2" cy="8.5" r="3.6"/></g><circle cx="10" cy="10" r="2.6" fill="currentColor"/></svg>',
  // ほかのタブに相手から新しく届いたものがあれば、タブに小さな点をつける。開いているタブの中では、そのものに小さな印をつける。数は出さない（原則3）
  // 見たかどうかはこの端末の中だけで覚え、相手にもサーバーにも伝えない（原則1）
  marks() {
    if (!Store.ready) return; // 読み終える前に覚えた印を空にしてしまわないように
    let seen; try { seen = new Set(JSON.parse(localStorage.getItem('hanbunko-seen')) || []); } catch (e) { seen = new Set(); }
    const now = new Set();
    for (const b of document.querySelectorAll('#tabs button')) {
      const list = Store.list(b.dataset.tab), sigs = list.map(i => [i.id, App.sig(i)]).filter(([, s]) => s), on = b.classList.contains('on');
      list.forEach(i => { now.add(i.id); for (const o of [App.sig(i, i.by), App.sig(i, '\0')]) if (o) now.add(o); }); // 書いた人から見た印と、受け取った人から見た印 // 1台で試すとき、視点を変えても相手側の覚えを消さないように、どちらから見た印も残す
      if (on) sigs.forEach(([, s]) => { if (!seen.has(s)) { seen.add(s); App.fresh.add(s); App.arrive.set(s, Date.now()); } });
      const isNew = !on && sigs.some(([, s]) => !seen.has(s));
      b.classList.toggle('new', isNew);
      // 点は目にしか見えないので、読み上げにも同じことを伝える
      let t = b.querySelector('.vh');
      if (isNew && !t) { t = document.createElement('span'); t.className = 'vh'; t.textContent = '・新しく届いています'; b.append(t); }
      if (!isNew) t?.remove();
      let n = 0;
      for (const [id, s] of sigs) {
        const el = document.querySelector(`#${b.dataset.tab}List .item[data-id="${id}"]`), f = on && App.fresh.has(s); if (!el) continue;
        el.classList.toggle('fresh', f);
        // はじめて目にしたときだけ、そっと浮かび上がる。途中で描き直しても、続きから
        const t = on && App.arrive.get(s), ago = t ? Date.now() - t : Infinity;
        if (ago < 2600) { el.classList.add('arrive'); el.classList.toggle('answer', s.endsWith('|a')); el.style.setProperty('--d', `${n++ * 160 - ago}ms`); } else { App.arrive.delete(s); el.classList.remove('arrive', 'answer'); }
        let v = el.querySelector('.who .vh');
        if (f && !v) { v = document.createElement('span'); v.className = 'vh'; v.textContent = s.endsWith('|a') ? '答え合わせが届いています・' : s.includes('|') ? '返事が届いています・' : '新しく届いています・'; el.querySelector('.who').prepend(v); } // 自分のものへの返事（id|…）・答え合わせ（id|a）・相手から届いたものを読み分ける
        if (!f) v?.remove();
      }
    }
    try { localStorage.setItem('hanbunko-seen', JSON.stringify([...seen].filter(id => now.has(id)))); } catch (e) { /* 覚えられなくても表示は続ける */ }
  },
  setMe(me) { Store.me = me; App.calm = 0; document.querySelectorAll('#devBar button').forEach(b => b.classList.toggle('on', b.dataset.me === me)); App.renderAll(); },
  show(tab, quiet) {
    document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.querySelectorAll('.tab').forEach(s => { s.hidden = s.id !== tab; });
    if (quiet) return; // 起動したときは、まだ2人の場所を読んでいないので印をつけない
    App.fresh.clear(); App.arrive.clear(); App.marks();
  },
  // 開いたときのタブ：この端末で最後に開いていたタブ（はじめてはひとりごと）。この端末の中だけで覚え、相手にもサーバーにも伝えない
  firstTab() { let t; try { t = localStorage.getItem('hanbunko-tab'); } catch (e) { /* 覚えていなければひとりごと */ } return ['kurou', 'yotei', 'kakera'].includes(t) ? t : 'kurou'; },
  screen(name) {
    if (name === 'main' && App.resting()) name = 'rest'; // ひと休み中は、届いたものを出さない
    $('pairScreen').hidden = name !== 'pair'; $('tourScreen').hidden = name !== 'tour'; $('mainScreen').hidden = name !== 'main'; $('restScreen').hidden = name !== 'rest';
  },
  // ひと休み：この端末だけの印。サーバーにも相手にも何も置かない（原則1・5）。休むあいだはまとめ通知の宛先を外す
  resting() { try { return localStorage.getItem('hanbunko-rest') === '1'; } catch (e) { return false; } },
  async rest(on) {
    try { if (on) localStorage.setItem('hanbunko-rest', '1'); else localStorage.removeItem('hanbunko-rest'); } catch (e) { /* 覚えられなくてもこの場は休む */ }
    App.screen('main'); window.scrollTo(0, 0);
    if (!on) App.hello('おかえりなさい。', true);
    if (Store.remote && Notify.on()) { if (on) await Remote.dropToken().catch(() => {}); else await Notify.refresh(); }
  },
  // ひとことの出迎え：2人の場所ができてはじめて開いたときと、ひと休みから戻ったとき。この端末の中だけで、相手には伝えない
  hello(text, auto, notify) {
    $('helloText').textContent = text; $('hello').hidden = false; clearTimeout(App.helloT);
    $('helloNotify').hidden = !(notify && Notify.supported() && !Notify.on()); // ペアになった直後に一度だけ、まとめ通知を聞く（ふだんは画面のいちばん下）
    $('helloClose').hidden = !!auto; if (auto) App.helloT = setTimeout(() => { $('hello').hidden = true; }, 4000);
  },
  error(msg) { $('pErr').textContent = msg || ''; $('pErr').hidden = !msg; $('pBusy').hidden = true; },
  showPair(code) {
    App.screen('pair'); $('devBar').hidden = true; $('pDemo').hidden = !SHOW_TEST || !!code || Remote.saved(); // 招待やペアがあるあいだは試作に入れない
    $('pTour').hidden = !!code || Remote.saved(); // 見本は、2人の場所をつくる前だけ
    $('pInvite').hidden = !code; $('pCreate').hidden = !!code; $('pCode').value = code || '';
    $('pNew').hidden = $('pJoinCard').hidden = false; $('pRetry').hidden = true;
    // iPhone の Safari とホーム画面版は localStorage（鍵）が別。ペアになる前にホーム画面へ追加してもらう
    const ios = /iPhone|iPad/.test(navigator.userAgent) && !window.Capacitor?.isNativePlatform?.();
    $('iosPairHint').hidden = !!code || !(ios && !navigator.standalone);
    $('iosHomeOk').hidden = !!code || !(ios && navigator.standalone); // ホーム画面から正しく開けているかを、本人が確かめられるように
  },
  // ペアはあるのにつながらないとき：招待をつくり直す道は出さない（押すとこの端末の鍵が新しいものに置き換わってしまうため）
  offline() {
    App.showPair(); $('pNew').hidden = $('pJoinCard').hidden = $('iosPairHint').hidden = $('iosHomeOk').hidden = $('pTour').hidden = true; $('pRetry').hidden = false;
    App.error('いまはつながりませんでした。電波のよいところで「もう一度つなぐ」を押してみてください。2人の場所も、書いたものも消えていません');
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
    if (!state.partner) $('pairMore').open = true; // 相手が離れたら、解消のボタンを探さなくていいように
    if (state.partner && !App.resting()) { try { if (!localStorage.getItem('hanbunko-hello')) { localStorage.setItem('hanbunko-hello', '1'); App.hello('2人の場所ができました。気が向いたときに、半分だけどうぞ。LINE などに送った招待コードは、もう消してかまいません。', false, true); } } catch (e) { /* 出迎えは無くてもいい */ } }
  },
  // 解消は2回押し（押し間違いで2人の場所の鍵をなくさないため。App.twoStep）。理由は聞かない
  async leave() {
    // サーバーの片付けは待たない（電波がなくても、ひとりで即時に抜けられるように。片付けは裏で続く）
    const remote = Store.remote;
    if (remote) { if (Notify.on()) Notify.disable(); Remote.leave(); } else Store.reset(); // 試作で書いたものも残さない
    try { localStorage.removeItem('hanbunko-rest'); localStorage.removeItem('hanbunko-hello'); localStorage.removeItem('hanbunko-tab'); } catch (e) { /* 次のペアに持ち越さない */ }
    $('hello').hidden = true;
    Store.setMode(null);
    // 試作の前につくった招待やペアは、試作の解消では消さずにそこへ戻る
    if (!remote && Remote.saved()) { App.showPair(); $('pNew').hidden = $('pJoinCard').hidden = $('iosPairHint').hidden = $('iosHomeOk').hidden = true; App.startRemote(); }
    else App.showPair();
  },
};
document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => { App.show(b.dataset.tab); try { localStorage.setItem('hanbunko-tab', b.dataset.tab); } catch (e) { /* 覚えられなくても切り替えは続ける */ } }; });
document.querySelectorAll('.look input').forEach(i => { i.onchange = () => App.setLook(i.name, i.value); });
App.applyLook();
document.querySelectorAll('#devBar button').forEach(b => { b.onclick = () => App.setMe(b.dataset.me); });
$('pDemo').onclick = () => App.startLocal();
$('pTour').onclick = () => Tour.open();
$('pCreate').onclick = async () => {
  App.error(); $('pBusy').hidden = false;
  try { const code = await Remote.create(); App.showPair(code); await App.startRemote(); } catch (e) { App.error('招待をつくれませんでした。電波のよいところで、もう一度試してみてください'); }
};
$('pJoin').onclick = async () => {
  App.error(); $('pBusy').hidden = false;
  try { await Remote.join($('pJoinIn').value); await App.startRemote(); } catch (e) { App.error(e.message); }
};
$('pShare').onclick = async () => {
  const text = $('pCode').value;
  const msg = `ふたりごとの招待コード：\n${text}\n\nアプリはこちらから：https://tenmusu10.github.io/hanbunko/\n（iPhone の人は https://tenmusu10.github.io/hanbunko/app/ を Safari で開き、ホーム画面に追加してから、このコードを貼ってください）`, Share = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Share;
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
$('helloClose').onclick = () => { $('hello').hidden = true; };
$('helloNotifyOn').onclick = async () => { $('notifyOn').checked = true; $('helloNotify').hidden = true; await App.toggleNotify($('notifyOn')); App.hello($('notifyHint').textContent, true); };
$('restEnd').onclick = () => App.rest(false);
$('pRetry').onclick = () => location.reload(); // 読み込みに失敗した SDK はブラウザが覚えてしまうので、開き直してやり直す
App.twoStep($('leaveBtn'), 'もう一度押すと解消します', () => App.leave());
document.addEventListener('click', e => { if (Date.now() - (App.calm || 0) < App.CALM_MS && e.target.closest?.('.list button, .list input')) { e.preventDefault(); e.stopPropagation(); } }, true);
Kakera.init(); Yotei.init(); Kurou.init(); Tour.init(); App.show(App.firstTab(), true);
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
else if (Remote.saved()) { App.showPair(); $('pNew').hidden = $('pJoinCard').hidden = $('iosPairHint').hidden = $('iosHomeOk').hidden = true; App.startRemote(); } // つながるまで、招待のつくり直しは出さない
else if (Tour.due()) Tour.open(); // はじめて開いたときは、見本から（いつでもとばせる）
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
