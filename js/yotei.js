// 半分の予定：いつ・どこで・なにする のうち、置く人は一部だけ埋める。残りは相手だけが埋められる。期限も催促もない
const Yotei = (() => {
  const SLOTS = [['when', 'いつ'], ['where', 'どこで'], ['what', 'なにする']];
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const filled = it => SLOTS.every(([k]) => it[k]);

  function render() {
    Store.purge('yotei', YOTEI_DAYS, filled); // 埋まらなかった予定は静かに消える（決まった予定は残す）
    const list = Store.list('yotei');
    $('yoteiList').innerHTML = list.length ? '' : '<p class="empty">置かれた予定はありません。</p>';
    for (const it of list) {
      const mine = it.by === Store.me, done = filled(it), el = document.createElement('div');
      el.className = 'card item'; el.dataset.id = it.id;
      el.innerHTML = `<div class="who">${mine ? 'わたしが半分' : 'あいてが半分'}${done ? '　<span class="done">決まり</span>' : ''}</div><dl class="slots"></dl><div class="row"></div>`;
      const dl = el.querySelector('.slots');
      for (const [k, label] of SLOTS) {
        const dd = it[k] ? esc(it[k]) : (mine ? '<span class="blank">あいてが埋める</span>' : `<input class="fill" data-k="${k}" maxlength="30" placeholder="ここを埋める">`);
        dl.insertAdjacentHTML('beforeend', `<dt>${label}</dt><dd>${dd}</dd>`);
      }
      const row = el.querySelector('.row');
      if (!mine && !done) {
        const b = document.createElement('button'); b.className = 'fBtn'; b.textContent = '埋める';
        b.onclick = () => { const p = {}; el.querySelectorAll('.fill').forEach(i => { if (i.value.trim()) p[i.dataset.k] = i.value.trim(); }); if (Object.keys(p).length) { Store.update(it.id, p); render(); } };
        row.append(b);
      }
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
