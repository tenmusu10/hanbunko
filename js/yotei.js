// 半分の予定：いつ・どこで・なにする のうち、置く人は一部だけ埋める。残りは相手だけが埋められる。期限も催促もない
const Yotei = (() => {
  const SLOTS = [['when', 'いつ'], ['where', 'どこで'], ['what', 'なにする']];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const open = it => SLOTS.some(([k]) => !it[k]);
  // 「？」で終わる欄があるうちは、まだ相談中なので「決まり」にしない
  const done = it => !open(it) && !SLOTS.some(([k]) => /[?？]$/.test(it[k]));
  // 自分が書いた欄は、決まったあとでも直せる（直したことは相手に知らせない）。どの欄を直しているかはこの画面の中だけで覚える
  const editing = new Set();
  let pastOpen = false; // 「済んだ予定」を開いたかは、この画面のあいだだけ覚える
  const kOpen = new Set(); // 「日にちを変える・カレンダー」を開いた予定（この画面のあいだだけ覚える）
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
  // 日にちを外した（延期した）日は undate（作った人）・undate2（相手）。そこから数え直すので、延ばしたとたんに消えることはない
  const fromDay = it => [isDay(it.doneDay) ? it.doneDay : it.day, it.undate, it.undate2].filter(isDay).sort().pop();
  const lastDay = it => {
    const from = fromDay(it), cap = addDays(from, KEEP_MAX_DAYS);
    const kept = [it.keep, it.keep2].filter(isDay).sort().pop();
    return [addDays(from, YOTEI_DONE_DAYS), kept && kept < cap ? kept : kept ? cap : ''].sort().pop();
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
    let past = null; // 日にちの過ぎた予定は、一行にして「済んだ予定」にたたむ（ひとりごと・かけらの「もっと前」と同じ扱い。行った・行かなかったは聞かない：c11・c12 の声）
    for (const it of list) {
      const mine = it.by === Store.me, isDone = done(it), el = document.createElement('div');
      el.className = 'card item ' + (mine ? 'mine' : 'theirs'); el.dataset.id = it.id;
      const who = `<div class="who">${mine ? 'わたしが半分' : 'あいてが半分'}${App.dayLabel(it.day, mine, it.now)}${isDone ? '<span class="done">決まり</span>' : ''}</div>`;
      const kd0 = isDone ? keepDay(it) : '', gone = !!kd0 && kd0 < Store.today();
      if (isDone && (gone || folded.has(it.id))) {
        el.classList.add('folded'); if (gone) el.classList.add('past');
        el.innerHTML = who + `<div class="summary">${SLOTS.map(([k]) => esc(it[k])).join('・')}</div>`
          + (gone ? `<p class="hint small">${md(kd0)} の予定でした。${md(lastDay(it))} まで残ります</p>` : '<p class="hint">たたんだのは自分の画面だけです。相手の画面はそのままです</p>') + '<div class="row"></div>';
        if (!gone) { const b = document.createElement('button'); b.className = 'unfoldBtn'; b.textContent = 'ひらく'; b.onclick = () => { folded.delete(it.id); saveFold(folded, list); App.renderAll(); }; el.querySelector('.row').append(b); }
        if (mine) el.querySelector('.row').append(App.delButton(it.id, App.renderAll));
        if (gone) { if (!past) { past = document.createElement('details'); past.className = 'more past'; past.open = pastOpen; past.ontoggle = () => { pastOpen = past.open; }; past.innerHTML = '<summary>済んだ予定</summary>'; } past.append(el); }
        else $('yoteiList').append(el);
        continue;
      }
      el.innerHTML = who + '<dl class="slots"></dl><div class="row"></div>';
      const dl = el.querySelector('.slots');
      for (const [k, label] of SLOTS) {
        // 埋めた人の色で塗る（置いた人の欄は置いた人、あとから埋めた欄は埋めた人）
        const filler = it[k] ? (it[k + 'By'] || it.by) : null, cls = filler ? (filler === Store.me ? 'by-me' : 'by-you') : 'empty';
        const ek = it.id + '|' + k, own = filler === Store.me;
        const dd = own && editing.has(ek) ? `<input class="edit" data-k="${k}" maxlength="30" aria-label="${label}を直す" value="${esc(it[k])}"><button class="eBtn" data-k="${k}">これにする</button>`
          : it[k] ? `<span class="v">${esc(it[k])}</span>` + (own ? `<button class="edBtn" data-k="${k}" aria-label="${label}を直す">直す</button>` : '')
          : (mine ? '<span class="blank">あいてにおまかせ</span>' : `<input class="fill" data-k="${k}" maxlength="30" aria-label="${label}を埋める" placeholder="ここを埋める（30字まで）">`);
        // 日にちが入っていたら「いつ」の横にも出す（ぼかした「いつ」と、決まった日にちを並べて見られるように）
        const kd = k === 'when' && done(it) && keepDay(it) ? `<span class="kDate">${md(keepDay(it))}</span>` : '';
        dl.insertAdjacentHTML('beforeend', `<dt>${label}</dt><dd class="${cls}">${dd}${kd}</dd>`);
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
      // 途中まで埋まった予定は、どうなっているのかを一言（「まだ」とは書かない。急がせない）
      const partly = !isDone && open(it) && SLOTS.some(([sk]) => it[sk] && (it[sk + 'By'] || it.by) !== it.by);
      if (partly) row.insertAdjacentHTML('beforebegin', `<p class="hint small yPart">${mine ? 'あいてが一部を埋めました。空いているところも、あいてが埋めるところです' : '埋めたところは、相手にもう届いています。残りは、あとで埋めてもかまいません'}</p>`);
      // やる人（予約や準備などの段取り）は、決まった予定の「日にち・カレンダー・やる人」の中だけ（定食屋の予定にも毎回出て要らない、という c7・c10〜c13 の声。名乗った人がいるときは外に出す）
      const k = mine ? 'take' : 'take2', iTake = !!it[k], youTake = !!it[mine ? 'take2' : 'take'];
      const take = document.createElement('div'); take.className = 'take';
      take.innerHTML = `<span class="tLabel">やる人：<b>${TAKE[iTake ? (youTake ? 'both' : 'me') : (youTake ? 'you' : 'none')]}</b></span>`;
      const tb = document.createElement('button'); tb.className = 'tkBtn'; tb.textContent = iTake ? '名乗りをやめる' : (youTake ? 'わたしもやる' : 'わたしがやる');
      // 名乗っても、空き欄に書きかけたものは消さない（ほかのボタンも同じ）
      tb.onclick = () => { Store.update(it.id, { [k]: !iTake }); App.renderAll(); };
      take.append(tb);
      if (isDone && (iTake || youTake)) el.insertBefore(take, row);
      if (isDone) {
        const kk = mine ? 'keep' : 'keep2', mineKeep = it[kk] || '', yourKeep = it[mine ? 'keep2' : 'keep'] || '', from = fromDay(it), k = keepDay(it), last = lastDay(it);
        const undated = !k && (isDay(it.undate) || isDay(it.undate2));
        const kp = document.createElement('div'); kp.className = 'keep';
        const two = isDay(mineKeep) && isDay(yourKeep) && mineKeep !== yourKeep ? `（わたし ${md(mineKeep)}・あいて ${md(yourKeep)}。遅いほうまで残ります）` : '';
        // 相手だけが日にちを入れているときは、自分の欄は空のまま。「入れ直さなくていい」と分かるように書き分ける
        const label = yourKeep && !mineKeep ? '別の日にするなら' : '日にち';
        const today = Store.today(); // 日にちの過ぎた予定は、ここには来ない（上で「済んだ予定」にたたむ）
        kp.innerHTML = `<span class="kLabel">${k ? (k === today ? `今日（${md(k)}）の予定` : `${md(k)} の予定${two}`) : undated ? '日にちが外れました（延期）。また決まったら入れてください' : '日にちが決まったら入れられます（相手にもすぐ出ます）'}</span>`
          + `<p class="hint small kLast">${k ? `${md(last)} まで2人の画面に残ります` : `入れなければ、${undated ? '外した日' : '決まった日'}から1か月（${md(last)}）で消えます`}</p>`
          // 変える欄・カレンダー・やる人・残り方は、たたんでおく（決まった予定のカードが説明書のように長くならないように。c6・c7・c13 の声）
          + `<details class="more kMore"${kOpen.has(it.id) ? ' open' : ''}><summary>${k ? '日にちを変える・カレンダー・やる人' : '日にち・やる人・残り方'}</summary></details>`
          + (yourKeep && !mineKeep ? `<p class="hint small kYour">日にちは相手が入れました。同じ日なら、ここは空のままで大丈夫です</p>` : '')
          + `<label class="kSet">${label} <input type="date" class="kIn" min="${today}" max="${addDays(from, KEEP_MAX_DAYS)}" value="${mineKeep}" aria-label="${label}（${md(addDays(from, KEEP_MAX_DAYS))}まで選べます）"></label>`;
        kp.querySelector('.kIn').onchange = e => {
          const v = e.target.value; if (v && !isDay(v)) return;
          // 2人とも日にちが無くなったら、外した日を残す（そこから2週間は消えない）
          const off = !v && isDay(mineKeep) && !isDay(yourKeep);
          if (v) kOpen.delete(it.id); // 日にちが入ったら、たたんでカードを短くもどす（外に「○日の予定」「○日まで残ります」が出る）
          Store.update(it.id, { [kk]: v || '', ...(off ? { [mine ? 'undate' : 'undate2']: Store.today() } : {}) }); App.renderAll();
        };
        if (k) {
          const cb = document.createElement('button'); cb.className = 'calBtn'; cb.textContent = 'カレンダーに入れる';
          const ios = /iPhone|iPad/.test(navigator.userAgent), after = 'あとで日にちを変えたり外したりしても、カレンダーに入れた分はそのまま残ります。そちらは手で直してください';
          const note = document.createElement('p'); note.className = 'hint small calNote'; note.textContent = `押すと、この予定の字があなたの${ios ? 'iPhone のカレンダー' : 'カレンダー（Google カレンダー）'}に渡ります`;
          cb.onclick = () => { toCalendar(it); note.textContent = (ios ? 'カレンダーに渡しました。出てきた画面で「追加」を押すと入ります。' : 'カレンダーを開きました。開いた画面で「保存」を押すと入ります。') + after; };
          kp.append(cb, note);
        }
        const km = kp.querySelector('.kMore');
        // 日にちが決まるまでは「○日で消えます」もたたむ（急かされる、という c13 の声）。日にちがあれば「○日まで残ります」は外に
        km.append(...[...kp.children].filter(e => e !== km && !e.matches(k ? '.kLabel, .kLast' : '.kLabel'))); if (!take.parentNode) km.append(take);
        km.querySelector('summary').onclick = () => { km.open ? kOpen.delete(it.id) : kOpen.add(it.id); }; // 開く前の状態で覚える（toggle は描き直しのあとに来ることがある）
        el.insertBefore(kp, row);
      }
      if (isDone) { const b = document.createElement('button'); b.className = 'foldBtn'; b.textContent = 'たたむ（自分の画面だけ）'; b.onclick = () => { folded.add(it.id); saveFold(folded, list); App.renderAll(); }; row.append(b); }
      if (mine) row.append(App.delButton(it.id, App.renderAll));
      $('yoteiList').append(el);
    }
    if (past) $('yoteiList').append(past); // 済んだものは、いまの予定の下
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
      if ($('yNow').checked) v.now = true; // 同じ家の2人の、今日・あしたの予定（2026-10-30 tenmusu の答え）
      Store.add('yotei', v); App.tap(); added = Date.now(); ['yWhen', 'yWhere', 'yWhat'].forEach(i => { $(i).value = ''; }); $('yNow').checked = false; render(); App.todayNotes();
    };
  }
  return { init, render };
})();
