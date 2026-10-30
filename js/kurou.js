// ひとりごと（もとの名前は「見えない苦労」。kurou の名はそのまま）：声に出さなかったことを一文だけ置く。相手は短い言葉を1つ選んで返す（一言そえてもいい）。回数・合計・比べる表示は作らない
const Kurou = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 返せる言葉。感謝だけに決めつけない（「ありがとう」しか返せないと、渡すたびにお礼を求めているように見える）。どれも受け取る側の気持ちで、評価や指図にならないもの
  const WORDS = ['ありがとう', 'おつかれさま', '無理しないでね', '知らなかった'];
  const picked = new Map(); // 選んだだけでまだ返していない言葉（カードの id → 言葉）。描き直しても残す
  const word = it => it.thanks === true ? WORDS[0] : String(it.thanks || ''); // 前の版は true だけを置いていた
  function render() {
    Store.purge('kurou', KUROU_DAYS);
    const list = Store.list('kurou');
    $('kurouList').innerHTML = list.length ? '' : '<p class="empty">ひとりごとは、少しのあいだだけここに残ります。</p>';
    for (const it of list) {
      const mine = it.by === Store.me, el = document.createElement('div');
      el.className = 'card item ' + (mine ? 'mine' : 'theirs'); el.dataset.id = it.id;
      const got = it.thanks ? `<span class="thanks">${App.flower}「${esc(word(it))}」${mine ? 'が届きました' : 'を返しました'}${it.note ? `<span class="tNote">${esc(it.note)}</span>` : ''}</span>` : '';
      el.innerHTML = `<div class="who">${mine ? 'わたしのひとりごと' : 'あいてのひとりごと'}${App.dayLabel(it.day, mine)}</div><div class="body">${esc(it.text)}</div>${got}<div class="row"></div>`;
      const row = el.querySelector('.row');
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
        row.innerHTML = `<input class="tIn" maxlength="40" aria-label="一言そえる" placeholder="一言そえる（40字まで）"><button class="tSend">返す</button>`;
        const send = () => { const w = picked.get(it.id); if (!w) return; const v = row.querySelector('.tIn').value.trim(); picked.delete(it.id); Store.update(it.id, v ? { thanks: w, note: v } : { thanks: w }); App.renderAll(); App.sent(it.id); };
        row.querySelector('.tSend').onclick = send;
        row.querySelector('.tIn').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) send(); }; // キーボードの「送信」でも返せる
      }
      if (mine) row.append(App.delButton(it.id, App.renderAll));
      $('kurouList').append(el);
    }
  }
  function init() {
    $('kurouForm').onsubmit = e => { e.preventDefault(); const t = $('kuText').value.trim(); if (!t) return; Store.add('kurou', { text: t }); $('kuText').value = ''; render(); };
  }
  return { init, render, WORDS };
})();
