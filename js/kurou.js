// ひとりごと（もとの名前は「見えない苦労」。kurou の名はそのまま）：声に出さなかったことを一文だけ置く。相手は短い言葉を1つ選んで返す（一言そえてもいい）。回数・合計・比べる表示は作らない
const Kurou = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 返せる言葉。感謝だけに決めつけない（「ありがとう」しか返せないと、渡すたびにお礼を求めているように見える）。どれも受け取る側の気持ちで、評価や指図にならないもの
  const WORDS = ['ありがとう', 'おつかれさま', '無理しないでね', '知らなかった'];
  const picked = new Map(); // 選んだだけでまだ返していない言葉（カードの id → 言葉）。描き直しても残す
  const word = it => it.thanks === true ? WORDS[0] : String(it.thanks || ''); // 前の版は true だけを置いていた
  // 自分のひとりごとは、相手に届く前（置いた日のうち、まだ返事が無いあいだ）だけ直せる。直したことは相手に知らせない
  const editing = new Set();
  let pastOpen = false; // 「もっと前」を開いたかは、この画面のあいだだけ覚える
  const canEdit = it => it.by === Store.me && !it.thanks && it.day === Store.today() && !(Store.remote && Store.pairedDay === it.day);
  function render() {
    Store.purge('kurou', KUROU_DAYS);
    const list = Store.list('kurou');
    $('kurouList').innerHTML = list.length ? '' : `<p class="empty">ひとりごとは、置いた日から${KUROU_DAYS}日でどちらの画面からも消えます。</p>`;
    // 返事が済んだものは、新しい3つだけ出して、あとは「もっと前」にたたむ（毎日の画面が過去で長くならないように。数は出さない）
    let settled = 0, past = null;
    for (const it of list) {
      const mine = it.by === Store.me, el = document.createElement('div');
      el.className = 'card item ' + (mine ? 'mine' : 'theirs') + (it.thanks ? ' settled' : ''); el.dataset.id = it.id; // 返事が済んだものは小さめに
      const got = it.thanks ? `<span class="thanks">${App.flower}「${esc(word(it))}」${mine ? 'が届きました' : 'を返しました'}${it.note ? `<span class="tNote">${esc(it.note)}</span>` : ''}</span>` : '';
      el.innerHTML = `<div class="who">${mine ? 'わたしのひとりごと' : 'あいてのひとりごと'}${App.dayLabel(it.day, mine)}</div><div class="body">${esc(it.text)}</div>${got}<div class="row"></div>`;
      const row = el.querySelector('.row');
      if (canEdit(it) && editing.has(it.id)) {
        el.querySelector('.body').innerHTML = `<input class="edit" maxlength="60" aria-label="ひとりごとを直す" value="${esc(it.text)}"><button class="eBtn">これにする</button>`;
        const i = el.querySelector('.edit'), b = el.querySelector('.eBtn');
        b.onclick = () => { const v = i.value.trim(); editing.delete(it.id); if (v && v !== it.text) Store.update(it.id, { text: v }); App.renderAll(); }; // 空にはできない（消すときは「消す」で）
        i.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) b.click(); };
      } else if (canEdit(it)) {
        const b = document.createElement('button'); b.className = 'edBtn'; b.textContent = '直す'; b.setAttribute('aria-label', '届く前に直す');
        b.onclick = () => { editing.add(it.id); App.renderAll(); el.ownerDocument.querySelector(`[data-id="${it.id}"] .edit`)?.focus(); };
        row.append(b);
        // 書いた欄の注意は、置いたあとでは見えない。届く前のカードにも同じ一言を出す
        if (Store.remote && /今日|きょう|今夜|今晩|こんや|今から|いまから|今朝|けさ/.test(it.text)) row.insertAdjacentHTML('beforebegin', '<p class="hint small">相手にはあした届きます。「今日」は「きのう」のことと読まれます（届く前なら直せます）</p>');
      }
      if (!mine && !it.thanks) {
        // 言葉を1つ選び（押しただけでは送らない）、一言そえてもそえなくても「返す」で送る。返すのは1回だけ
        const pick = picked.get(it.id), c = document.createElement('div'); c.className = 'choices words'; c.setAttribute('role', 'group'); c.setAttribute('aria-label', '返す言葉を選ぶ');
        for (const w of WORDS) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'tBtn'; b.textContent = w;
          b.classList.toggle('sel', pick === w); b.setAttribute('aria-pressed', pick === w);
          b.onclick = () => { if (picked.get(it.id) === w) picked.delete(it.id); else picked.set(it.id, w); App.renderAll(); };
          c.append(b);
        }
        row.before(c);
        row.innerHTML = `<input class="tIn" maxlength="40" aria-label="一言そえる" placeholder="一言そえる（40字まで）"><button class="tSend"${pick ? '' : ' disabled title="上の言葉を1つ選ぶと返せます"'}>返す</button>`;
        const tIn = row.querySelector('.tIn'); // 書きかけの一言は、描き直しても App.renderAll が持ち越す
        if (!pick) row.insertAdjacentHTML('afterend', '<p class="hint small">上の言葉を1つ選ぶと返せます</p>');
        const send = () => { const w = picked.get(it.id); if (!w) return; const v = tIn.value.trim(); picked.delete(it.id); Store.update(it.id, v ? { thanks: w, note: v } : { thanks: w }); App.renderAll(); App.sent(it.id); };
        row.querySelector('.tSend').onclick = send;
        tIn.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) send(); }; // キーボードの「送信」でも返せる
      }
      if (mine) row.append(App.delButton(it.id, App.renderAll));
      if (it.thanks && ++settled > 3) {
        if (!past) { past = document.createElement('details'); past.className = 'more past'; past.open = pastOpen; past.ontoggle = () => { pastOpen = past.open; }; past.innerHTML = '<summary>もっと前のひとりごと</summary>'; $('kurouList').append(past); }
        past.append(el); continue;
      }
      $('kurouList').append(el);
    }
  }
  function init() {
    $('kurouForm').onsubmit = e => { e.preventDefault(); const t = $('kuText').value.trim(); if (!t) return; Store.add('kurou', { text: t }); App.tap(); $('kuText').value = ''; render(); };
  }
  return { init, render, WORDS };
})();
