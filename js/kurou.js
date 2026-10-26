// 見えない苦労：一文だけ渡す。相手は「ありがとう」だけ返せる。回数・合計・比べる表示は作らない
const Kurou = (() => {
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render() {
    Store.purge('kurou', KUROU_DAYS);
    const list = Store.list('kurou');
    $('kurouList').innerHTML = list.length ? '' : '<p class="empty">ここに届いた苦労は、少しのあいだだけ残ります。</p>';
    for (const it of list) {
      const mine = it.by === Store.me, el = document.createElement('div');
      el.className = 'card item ' + (mine ? 'mine' : 'theirs'); el.dataset.id = it.id;
      el.innerHTML = `<div class="who">${mine ? 'わたしの' : 'あいての'}</div><div class="body">${esc(it.text)}</div><div class="row">${it.thanks ? `<span class="thanks">${mine ? 'ありがとうが届きました' : 'ありがとうを返しました'}</span>` : ''}</div>`;
      const row = el.querySelector('.row');
      if (!mine && !it.thanks) { const b = document.createElement('button'); b.className = 'tBtn'; b.textContent = 'ありがとう'; b.onclick = () => { Store.update(it.id, { thanks: true }); render(); }; row.append(b); }
      if (mine) row.append(App.delButton(it.id, render));
      $('kurouList').append(el);
    }
  }
  function init() {
    $('kurouForm').onsubmit = e => { e.preventDefault(); const t = $('kuText').value.trim(); if (!t) return; Store.add('kurou', { text: t }); $('kuText').value = ''; render(); };
  }
  return { init, render };
})();
