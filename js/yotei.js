// 半分の予定：いつ・どこで・なにする のうち、置く人は一部だけ埋める。残りは相手だけが埋められる。期限も催促もない
const Yotei = (() => {
  const SLOTS = [['when', 'いつ'], ['where', 'どこで'], ['what', 'なにする']];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const open = it => SLOTS.some(([k]) => !it[k]);
  // 「？」で終わる欄があるうちは、まだ相談中なので「決まり」にしない
  const done = it => !open(it) && !SLOTS.some(([k]) => /[?？]$/.test(it[k]));
  // 自分が書いた欄は、決まったあとでも直せる（直したことは相手に知らせない）。どの欄を直しているかはこの画面の中だけで覚える
  const editing = new Set();
  // やる人（予約や準備などの段取りをする人）：最初は「どちらでも」。やりたい方が一タップで名乗り、いつでも取り下げられる。決めなくてもよく、数えない
  // 置いた人の名乗りは take（c）、相手の名乗りは take2（r）。2人とも名乗れば「ふたりで」
  const TAKE = { none: 'どちらでも', me: 'わたし', you: 'あいて', both: 'ふたりで' };
  // 決まった予定は一行にたためる。たたんだことはこの端末のこの人だけの印で、相手にもサーバーにも伝えない（見比べる材料にしない）
  const FOLD = () => 'hanbunko-folded:' + Store.me;
  const loadFold = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLD())) || []); } catch (e) { return new Set(); } };
  const saveFold = (set, list) => { try { localStorage.setItem(FOLD(), JSON.stringify([...set].filter(id => list.some(i => i.id === id)))); } catch (e) { /* 覚えられなくても表示は続ける */ } };

  function render() {
    // 決まっても決まらなくても、置いてから同じ日数で静かに消える（手で消したものと、日がたって消えたものの見分けがつかないように）
    Store.purge('yotei', YOTEI_DAYS);
    const list = Store.list('yotei'), folded = loadFold();
    $('yoteiList').innerHTML = list.length ? '' : '<p class="empty">置かれた予定はありません。</p>';
    for (const it of list) {
      const mine = it.by === Store.me, isDone = done(it), el = document.createElement('div');
      el.className = 'card item ' + (mine ? 'mine' : 'theirs'); el.dataset.id = it.id;
      const who = `<div class="who">${mine ? 'わたしが半分' : 'あいてが半分'}${App.dayLabel(it.day, mine)}${isDone ? '<span class="done">決まり</span>' : ''}</div>`;
      if (isDone && folded.has(it.id)) {
        el.classList.add('folded');
        el.innerHTML = who + `<div class="summary">${SLOTS.map(([k]) => esc(it[k])).join('・')}</div><div class="row"></div>`;
        const b = document.createElement('button'); b.className = 'unfoldBtn'; b.textContent = 'ひらく';
        b.onclick = () => { folded.delete(it.id); saveFold(folded, list); App.renderAll(); };
        el.querySelector('.row').append(b);
        if (mine) el.querySelector('.row').append(App.delButton(it.id, App.renderAll));
        $('yoteiList').append(el); continue;
      }
      el.innerHTML = who + '<dl class="slots"></dl><div class="row"></div>';
      const dl = el.querySelector('.slots');
      for (const [k, label] of SLOTS) {
        // 埋めた人の色で塗る（置いた人の欄は置いた人、あとから埋めた欄は埋めた人）
        const filler = it[k] ? (it[k + 'By'] || it.by) : null, cls = filler ? (filler === Store.me ? 'by-me' : 'by-you') : 'empty';
        const ek = it.id + '|' + k, own = filler === Store.me;
        const dd = own && editing.has(ek) ? `<input class="edit" data-k="${k}" maxlength="30" aria-label="${label}を直す" value="${esc(it[k])}"><button class="eBtn" data-k="${k}">これにする</button>`
          : it[k] ? esc(it[k]) + (own ? `<button class="edBtn" data-k="${k}" aria-label="${label}を直す">直す</button>` : '')
          : (mine ? '<span class="blank">あいてが埋める</span>' : `<input class="fill" data-k="${k}" maxlength="30" aria-label="${label}を埋める" placeholder="ここを埋める（30字まで）">`);
        dl.insertAdjacentHTML('beforeend', `<dt>${label}</dt><dd class="${cls}">${dd}</dd>`);
      }
      dl.querySelectorAll('.edBtn').forEach(b => { b.onclick = () => { editing.add(it.id + '|' + b.dataset.k); App.renderAll(); document.querySelector(`[data-id="${it.id}"] .edit[data-k="${b.dataset.k}"]`)?.focus(); }; });
      dl.querySelectorAll('.eBtn').forEach(b => {
        const k = b.dataset.k, i = b.previousElementSibling;
        // 空にはできない（空けると相手が埋める欄にもどってしまうので）。空のまま押したら、直さずにもどす
        b.onclick = () => { const v = i.value.trim(); editing.delete(it.id + '|' + k); if (v && v !== it[k]) Store.update(it.id, { [k]: v }); App.renderAll(); };
        i.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) b.click(); };
      });
      const row = el.querySelector('.row');
      if (!mine && open(it)) {
        const b = document.createElement('button'); b.className = 'fBtn'; b.textContent = '埋める';
        b.onclick = () => { const p = {}; el.querySelectorAll('.fill').forEach(i => { if (i.value.trim()) { p[i.dataset.k] = i.value.trim(); p[i.dataset.k + 'By'] = Store.me; } }); if (Object.keys(p).length) { Store.update(it.id, p); App.renderAll(); } };
        el.querySelectorAll('.fill').forEach(i => { i.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) b.click(); }; }); // キーボードの「送信」でも埋められる
        row.append(b);
      }
      const k = mine ? 'take' : 'take2', iTake = !!it[k], youTake = !!it[mine ? 'take2' : 'take'];
      const take = document.createElement('div'); take.className = 'take';
      take.innerHTML = `<span class="tLabel">やる人：<b>${TAKE[iTake ? (youTake ? 'both' : 'me') : (youTake ? 'you' : 'none')]}</b></span>`;
      const tb = document.createElement('button'); tb.className = 'tkBtn'; tb.textContent = iTake ? '名乗りをやめる' : (youTake ? 'わたしも' : 'わたしがやる');
      // 名乗っても、空き欄に書きかけたものは消さない（ほかのボタンも同じ）
      tb.onclick = () => { Store.update(it.id, { [k]: !iTake }); App.renderAll(); };
      take.append(tb); el.insertBefore(take, row);
      if (isDone) { const b = document.createElement('button'); b.className = 'foldBtn'; b.textContent = 'たたむ'; b.onclick = () => { folded.add(it.id); saveFold(folded, list); App.renderAll(); }; row.append(b); }
      if (mine) row.append(App.delButton(it.id, App.renderAll));
      $('yoteiList').append(el);
    }
  }

  function init() {
    $('yoteiForm').onsubmit = e => {
      e.preventDefault();
      const v = { when: $('yWhen').value.trim(), where: $('yWhere').value.trim(), what: $('yWhat').value.trim() };
      const n = Object.values(v).filter(Boolean).length;
      $('yErr').hidden = n > 0 && n < 3;
      if (n === 0) { $('yErr').textContent = 'どれか1つは埋めてください'; return; }
      if (n === 3) { $('yErr').textContent = '全部は埋めずに、1つ以上あいてに残してください'; return; }
      Store.add('yotei', v); ['yWhen', 'yWhere', 'yWhat'].forEach(i => { $(i).value = ''; }); render();
    };
  }
  return { init, render };
})();
