// 半分の予定：いつ・どこで・なにする のうち、置く人は一部だけ埋める。残りは相手だけが埋められる。期限も催促もない
const Yotei = (() => {
  const SLOTS = [['when', 'いつ'], ['where', 'どこで'], ['what', 'なにする']];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const filled = it => SLOTS.every(([k]) => it[k]);
  // やる人（予約や準備などの段取りをする人）：最初は「どちらでも」。やりたい方が一タップで名乗り、いつでも取り下げられる。決めなくてもよく、数えない
  // 置いた人の名乗りは take（c）、相手の名乗りは take2（r）。2人とも名乗れば「ふたりで」
  const TAKE = { none: 'どちらでも', me: 'わたし', you: 'あいて', both: 'ふたりで' };

  function render() {
    // 決まっても決まらなくても、置いてから同じ日数で静かに消える（手で消したものと、日がたって消えたものの見分けがつかないように）
    Store.purge('yotei', YOTEI_DAYS);
    const list = Store.list('yotei');
    $('yoteiList').innerHTML = list.length ? '' : '<p class="empty">置かれた予定はありません。</p>';
    for (const it of list) {
      const mine = it.by === Store.me, done = filled(it), el = document.createElement('div');
      el.className = 'card item ' + (mine ? 'mine' : 'theirs'); el.dataset.id = it.id;
      el.innerHTML = `<div class="who">${mine ? 'わたしが半分' : 'あいてが半分'}${App.dayLabel(it.day, mine)}${done ? '<span class="done">決まり</span>' : ''}</div><dl class="slots"></dl><div class="row"></div>`;
      const dl = el.querySelector('.slots');
      for (const [k, label] of SLOTS) {
        // 埋めた人の色で塗る（置いた人の欄は置いた人、あとから埋めた欄は埋めた人）
        const filler = it[k] ? (it[k + 'By'] || it.by) : null, cls = filler ? (filler === Store.me ? 'by-me' : 'by-you') : 'empty';
        const dd = it[k] ? esc(it[k]) : (mine ? '<span class="blank">あいてが埋める</span>' : `<input class="fill" data-k="${k}" maxlength="30" aria-label="${label}を埋める" placeholder="ここを埋める">`);
        dl.insertAdjacentHTML('beforeend', `<dt>${label}</dt><dd class="${cls}">${dd}</dd>`);
      }
      const row = el.querySelector('.row');
      if (!mine && !done) {
        const b = document.createElement('button'); b.className = 'fBtn'; b.textContent = '埋める';
        b.onclick = () => { const p = {}; el.querySelectorAll('.fill').forEach(i => { if (i.value.trim()) { p[i.dataset.k] = i.value.trim(); p[i.dataset.k + 'By'] = Store.me; } }); if (Object.keys(p).length) { Store.update(it.id, p); render(); } };
        el.querySelectorAll('.fill').forEach(i => { i.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) b.click(); }; }); // キーボードの「送信」でも埋められる
        row.append(b);
      }
      const k = mine ? 'take' : 'take2', iTake = !!it[k], youTake = !!it[mine ? 'take2' : 'take'];
      const take = document.createElement('div'); take.className = 'take';
      take.innerHTML = `<span class="tLabel">やる人：<b>${TAKE[iTake ? (youTake ? 'both' : 'me') : (youTake ? 'you' : 'none')]}</b></span>`;
      const tb = document.createElement('button'); tb.className = 'tkBtn'; tb.textContent = iTake ? '名乗りをやめる' : (youTake ? 'わたしも' : 'わたしがやる');
      tb.onclick = () => { Store.update(it.id, { [k]: !iTake }); render(); };
      take.append(tb); el.insertBefore(take, row);
      if (mine) row.append(App.delButton(it.id, render));
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
