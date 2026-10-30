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
  // 決まった予定の残り方：決まった日（doneDay）から YOTEI_DAYS 日。日にちが決まったら、どちらも「日にち」（作った人は keep、相手は keep2）を1つ入れられ、その日まで残る（決まった日から KEEP_MAX_DAYS 日まで。2人の日にちが違えば遅いほう）
  // 「いつ」はぼかしたまま置けるので、日にちは別に持つ。カレンダーに入れるのは日にちがあるときだけ
  const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number), t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const lastDay = it => {
    const from = isDay(it.doneDay) ? it.doneDay : it.day, cap = addDays(from, KEEP_MAX_DAYS);
    const kept = [it.keep, it.keep2].filter(isDay).sort().pop();
    return [addDays(from, YOTEI_DAYS), kept && kept < cap ? kept : kept ? cap : ''].sort().pop();
  };
  const keepDay = it => [it.keep, it.keep2].filter(isDay).sort().pop() || '';
  const md = ymd => { const [, m, d] = ymd.split('-').map(Number); return `${m}/${d}`; };
  // カレンダーに下書きを渡す。押した人の操作で、この予定の字がカレンダーのサービスに渡る（アプリの中の予定は今までどおり消える）
  function toCalendar(it) {
    const title = it.what || '2人の予定', details = `いつ：${it.when}\nどこで：${it.where}\nふたりごとで決めた予定`, k = keepDay(it);
    const ymd = s => s.replace(/-/g, '');
    if (/iPhone|iPad/.test(navigator.userAgent)) { // iPhone はカレンダーのファイル（.ics）を開く
      const ev = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//futarigoto//ja', 'BEGIN:VEVENT', 'UID:' + it.id + '@futarigoto', 'SUMMARY:' + title, 'LOCATION:' + it.where, 'DESCRIPTION:' + details.replace(/\n/g, '\\n'), ...(k ? ['DTSTART;VALUE=DATE:' + ymd(k), 'DTEND;VALUE=DATE:' + ymd(addDays(k, 1))] : []), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const a = document.createElement('a'); a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ev); a.download = 'futarigoto.ics'; a.click(); return;
    }
    const q = new URLSearchParams({ action: 'TEMPLATE', text: title, details, location: it.where, ...(k ? { dates: ymd(k) + '/' + ymd(addDays(k, 1)) } : {}) });
    window.open('https://calendar.google.com/calendar/render?' + q, '_blank', 'noopener');
  }
  const saveFold = (set, list) => { try { localStorage.setItem(FOLD(), JSON.stringify([...set].filter(id => list.some(i => i.id === id)))); } catch (e) { /* 覚えられなくても表示は続ける */ } };

  function render() {
    // 決まらなければ置いてから YOTEI_DAYS 日で静かに消える。決まった予定は lastDay まで（手で消したものと、日がたって消えたものの見分けがつかないように、残す日は2人とも同じ計算）
    Store.purge('yotei', YOTEI_DAYS, it => done(it) && Store.today() <= lastDay(it));
    const list = Store.list('yotei'), folded = loadFold();
    $('yoteiList').innerHTML = list.length ? '' : '<p class="empty">まだ何も置かれていません。思いついたときに、半分だけどうぞ。</p>';
    for (const it of list) {
      const mine = it.by === Store.me, isDone = done(it), el = document.createElement('div');
      el.className = 'card item ' + (mine ? 'mine' : 'theirs'); el.dataset.id = it.id;
      const who = `<div class="who">${mine ? 'わたしが半分' : 'あいてが半分'}${App.dayLabel(it.day, mine)}${isDone ? '<span class="done">決まり</span>' : ''}</div>`;
      if (isDone && folded.has(it.id)) {
        el.classList.add('folded');
        el.innerHTML = who + `<div class="summary">${SLOTS.map(([k]) => esc(it[k])).join('・')}</div><p class="hint">たたんだのは自分の画面だけです。相手の画面はそのままです</p><div class="row"></div>`;
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
          : (mine ? '<span class="blank">あいてにおまかせ</span>' : `<input class="fill" data-k="${k}" maxlength="30" aria-label="${label}を埋める" placeholder="ここを埋める（30字まで）">`);
        dl.insertAdjacentHTML('beforeend', `<dt>${label}</dt><dd class="${cls}">${dd}</dd>`);
      }
      dl.querySelectorAll('.edBtn').forEach(b => { b.onclick = () => { editing.add(it.id + '|' + b.dataset.k); App.renderAll(); document.querySelector(`[data-id="${it.id}"] .edit[data-k="${b.dataset.k}"]`)?.focus(); }; });
      dl.querySelectorAll('.eBtn').forEach(b => {
        const k = b.dataset.k, i = b.previousElementSibling;
        // 空にはできない（空けると相手が埋める欄にもどってしまうので）。空のまま押したら、直さずにもどす
        b.onclick = () => { const v = i.value.trim(); editing.delete(it.id + '|' + k); if (v && v !== it[k]) Store.update(it.id, { [k]: v, ...(!done(it) && done({ ...it, [k]: v }) ? { doneDay: Store.today() } : {}) }); App.renderAll(); };
        i.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) b.click(); };
      });
      const row = el.querySelector('.row');
      if (!mine && open(it)) {
        const b = document.createElement('button'); b.className = 'fBtn'; b.textContent = '埋める';
        b.onclick = () => { const p = {}; el.querySelectorAll('.fill').forEach(i => { if (i.value.trim()) { p[i.dataset.k] = i.value.trim(); p[i.dataset.k + 'By'] = Store.me; } }); if (Object.keys(p).length) { if (done({ ...it, ...p })) p.doneDay = Store.today(); Store.update(it.id, p); App.renderAll(); App.sent(it.id); } };
        el.querySelectorAll('.fill').forEach(i => { i.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) b.click(); }; }); // キーボードの「送信」でも埋められる
        row.append(b);
      }
      const k = mine ? 'take' : 'take2', iTake = !!it[k], youTake = !!it[mine ? 'take2' : 'take'];
      const take = document.createElement('div'); take.className = 'take';
      take.innerHTML = `<span class="tLabel">やる人：<b>${TAKE[iTake ? (youTake ? 'both' : 'me') : (youTake ? 'you' : 'none')]}</b></span>`;
      const tb = document.createElement('button'); tb.className = 'tkBtn'; tb.textContent = iTake ? '名乗りをやめる' : (youTake ? 'わたしもやる' : 'わたしがやる');
      // 名乗っても、空き欄に書きかけたものは消さない（ほかのボタンも同じ）
      tb.onclick = () => { Store.update(it.id, { [k]: !iTake }); App.renderAll(); };
      take.append(tb); el.insertBefore(take, row);
      if (isDone) {
        const kk = mine ? 'keep' : 'keep2', mineKeep = it[kk] || '', yourKeep = it[mine ? 'keep2' : 'keep'] || '', from = isDay(it.doneDay) ? it.doneDay : it.day, k = keepDay(it), last = lastDay(it);
        const kp = document.createElement('div'); kp.className = 'keep';
        const two = isDay(mineKeep) && isDay(yourKeep) && mineKeep !== yourKeep ? `（わたし ${md(mineKeep)}・あいて ${md(yourKeep)}。遅いほうまで残ります）` : '';
        kp.innerHTML = `<span class="kLabel">${k ? `${md(k)} の予定${two}。日にちは相手の画面にもすぐ出ます` : '日にちが決まったら入れてください。相手の画面にもすぐ出て、カレンダーにも入れられます'}</span>`
          + `<p class="hint small kLast">${k ? `${md(last)} まで2人の画面に残ります` : `入れなければ、決まった日から2週間（${md(lastDay(it))}）で消えます`}</p>`
          + `<label class="kSet">日にち <input type="date" class="kIn" min="${Store.today()}" max="${addDays(from, KEEP_MAX_DAYS)}" value="${mineKeep}" aria-label="日にち（${md(addDays(from, KEEP_MAX_DAYS))}まで選べます）"></label>`;
        kp.querySelector('.kIn').onchange = e => { const v = e.target.value; if (!v || isDay(v)) { Store.update(it.id, { [kk]: v || '' }); App.renderAll(); } };
        if (k) {
          const cb = document.createElement('button'); cb.className = 'calBtn'; cb.textContent = 'カレンダーに入れる';
          const note = document.createElement('p'); note.className = 'hint small calNote'; note.textContent = '押すと、この予定の字があなたのカレンダー（Google など）に渡ります';
          cb.onclick = () => { toCalendar(it); note.textContent = /iPhone|iPad/.test(navigator.userAgent) ? 'カレンダーに渡しました。出てきた画面で「追加」を押すと入ります' : 'カレンダーを開きました。開いた画面で「保存」を押すと入ります'; };
          kp.append(cb, note);
        }
        el.insertBefore(kp, row);
      }
      if (isDone) { const b = document.createElement('button'); b.className = 'foldBtn'; b.textContent = '自分の画面でたたむ'; b.onclick = () => { folded.add(it.id); saveFold(folded, list); App.renderAll(); }; row.append(b); }
      if (mine) row.append(App.delButton(it.id, App.renderAll));
      $('yoteiList').append(el);
    }
  }

  let added = 0;
  function init() {
    $('yoteiForm').onsubmit = e => {
      e.preventDefault();
      const v = { when: $('yWhen').value.trim(), where: $('yWhere').value.trim(), what: $('yWhat').value.trim() };
      const n = Object.values(v).filter(Boolean).length;
      if (n === 0 && Date.now() - added < 1000) return; // 置いた直後の押し直し（ダブルタップ）で「書いてみてください」と出さない
      $('yErr').hidden = n > 0 && n < 3;
      if (n === 0) { $('yErr').textContent = 'どれか1つだけでも、書いてみてください'; return; }
      if (n === 3) { $('yErr').textContent = '1つは、あいてのために空けておいてください'; return; }
      Store.add('yotei', v); App.tap(); added = Date.now(); ['yWhen', 'yWhere', 'yWhat'].forEach(i => { $(i).value = ''; }); render();
    };
  }
  return { init, render };
})();
