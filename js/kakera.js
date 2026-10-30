// 今日のかけら：一言の一部（［］の中）や写真をぼかして渡す。相手は想像で一言返し、渡した側が答え合わせで全部見せる
const Kakera = (() => {
  let pastOpen = false; // 「もっと前」を開いたかは、この画面のあいだだけ覚える
  let photo = null; // 選んだ写真（元の大きさのまま、この端末の中だけ）
  const picked = new Map(); // 3択で選んだだけでまだ返していない言葉（かけらの id → 言葉）。描き直しても残す
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const holes = s => esc(s).replace(/［[^］]*］|\[[^\]]*\]/g, m => `<span class="hole" role="img" aria-label="かくれた言葉">＿＿＿＿</span>`); // 字数が分からないよう、いつも同じ長さ
  // 写真として出すのは、この端末が作るのと同じ形（JPEG の data URL）だけ。それ以外は属性を壊して悪さをしうるので出さない
  const photoSrc = s => typeof s === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(s) ? s : '';
  // 3択にするのは、隠したところが1つだけのとき（2つ以上だと、どれの答えか分からないため）
  const hidden = s => { const m = String(s || '').match(/［[^］]*］|\[[^\]]*\]/g); return m?.length === 1 ? m[0].slice(1, -1).trim() : null; };
  // 答え合わせのあとは、隠していたところに印をつける（ふつうの文に戻るだけだと、答えが出たことに気づきにくい）
  const plain = s => esc(s).replace(/［([^］]*)］|\[([^\]]*)\]/g, (_, a, b) => `<mark class="ans">${a ?? b}</mark>`).replace(/[［\[\]］]/g, '');

  // ぼかし：小さく縮めてから引き伸ばす。canvas の filter は iPhone の Safari で効かず、元の写真がそのまま見えてしまうため使わない
  function soften(g, img, x, y, w, h, px) {
    let src = img, sw = img.width, sh = img.height;
    const tw = Math.max(2, Math.round(w / px)), th = Math.max(2, Math.round(h / px));
    // 半分ずつ縮めて、細かい模様が粗い点として残らないようにする
    while (sw / 2 >= tw && sh / 2 >= th) {
      const t = document.createElement('canvas'); t.width = Math.round(sw / 2); t.height = Math.round(sh / 2);
      t.getContext('2d').drawImage(src, 0, 0, t.width, t.height); src = t; sw = t.width; sh = t.height;
    }
    const t = document.createElement('canvas'); t.width = tw; t.height = th;
    t.getContext('2d').drawImage(src, 0, 0, sw, sh, 0, 0, tw, th);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(t, x, y, w, h);
  }
  function blurred(img, px) {
    const c = document.createElement('canvas'); const s = Math.min(1, 640 / Math.max(img.width, img.height));
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    soften(c.getContext('2d'), img, 0, 0, c.width, c.height, px);
    return c.toDataURL('image/jpeg', 0.7);
  }
  // 元の写真：Firestore の1件の上限（firestore.rules で暗号化後 900KB 未満）に、ぼかした版と一緒に必ず収まるように、細かい写真ほど小さく・粗くする
  const FULL_MAX = 480000;
  function full(img) {
    let out = '';
    for (const [side, q] of [[1280, 0.8], [1280, 0.65], [1024, 0.6], [800, 0.55], [640, 0.5], [480, 0.45]]) {
      const c = document.createElement('canvas'); const s = Math.min(1, side / Math.max(img.width, img.height));
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); out = c.toDataURL('image/jpeg', q);
      if (out.length <= FULL_MAX) break;
    }
    return out;
  }
  function preview() {
    $('kBlurRow').hidden = !photo; if (!photo) return;
    const c = $('kPreview'), g = c.getContext('2d'), s = Math.min(c.width / photo.width, c.height / photo.height);
    g.clearRect(0, 0, c.width, c.height);
    soften(g, photo, (c.width - photo.width * s) / 2, (c.height - photo.height * s) / 2, photo.width * s, photo.height * s, $('kBlur').value / 2);
  }
  function setPhoto(img) { photo = img; preview(); }

  function render() {
    Store.strip('kakera', KAKERA_PHOTO_DAYS, ['photo', 'blur']);
    const list = Store.list('kakera');
    $('kakeraList').innerHTML = list.length ? '' : '<p class="empty">まだかけらはありません。気が向いたときにどうぞ。</p>';
    // 答え合わせが済んだものは、新しい3つだけ出して、あとは「もっと前」にたたむ（ひとりごとと同じ。数は出さない）
    let settled = 0, past = null;
    for (const it of list) {
      const mine = it.by === Store.me, el = document.createElement('div');
      el.className = 'card item ' + (mine ? 'mine' : 'theirs') + (it.revealed ? ' settled' : ''); el.dataset.id = it.id; // 答え合わせが済んだものは小さめに
      const showAll = it.revealed;
      el.innerHTML = `<div class="who">${mine ? 'わたしから' : 'あいてから'}${App.dayLabel(it.day, mine)}</div>`
        + (it.text ? `<div class="body">${showAll ? plain(it.text) : holes(it.text)}</div>` : '')
        + (photoSrc(showAll ? it.photo : it.blur) ? `<img alt="かけらの写真"${showAll ? ' class="revealed"' : ''} src="${photoSrc(showAll ? it.photo : it.blur)}">` : '')
        + (it.guess ? `<div class="guess">${mine ? 'あいての想像' : 'わたしの想像'}：${esc(it.guess)}${showAll && it.guess === hidden(it.text) ? '<span class="done">ぴったり</span>' : ''}${it.note ? `<div class="gNote">${esc(it.note)}</div>` : ''}</div>` : '')
        + (it.revealed && it.aNote ? `<div class="guess aNote">${mine ? 'わたしのひとこと' : 'あいてのひとこと'}：${esc(it.aNote)}</div>` : '')
        + (mine && it.revealed ? '<div class="hint">答え合わせしました。相手にも答えが見えています</div>' : '')
        + '<div class="row"></div>';
      const row = el.querySelector('.row');
      if (!it.text && !it.photo) el.querySelector('.who').insertAdjacentHTML('afterend', '<div class="body hint">写真は日がたったので消えました</div>');
      if (!mine && !it.guess && !it.revealed) {
        // 3つから選ぶか、自分で一言書くか。選んでも書いても、返すのは1回だけ
        // 3択は押しただけでは送らない（選んだ印がつくだけ）。一言をそえてもそえなくても「返す」で送る
        const pick = picked.get(it.id);
        if (Array.isArray(it.choices)) {
          const c = document.createElement('div'); c.className = 'choices'; c.setAttribute('role', 'group'); c.setAttribute('aria-label', '空いているところに入る言葉を3つから選ぶ');
          // 札は言葉だけ（文を3回くり返すと縦に長くなる、という声から）。文は上に空欄つきで出ている
          for (const v of it.choices.slice(0, 3)) {
            const b = document.createElement('button'); b.className = 'cBtn'; b.textContent = String(v);
            b.classList.toggle('sel', pick === String(v)); b.setAttribute('aria-pressed', pick === String(v));
            b.onclick = () => { if (picked.get(it.id) === String(v)) picked.delete(it.id); else picked.set(it.id, String(v)); App.renderAll(); };
            c.append(b);
          }
          row.before(c);
        }
        const ph = pick ? '一言そえる（なくてもいい）' : Array.isArray(it.choices) ? 'または自分で一言' : '想像で一言';
        row.innerHTML = `<input class="gIn" maxlength="40" aria-label="${pick ? '一言そえる' : '想像で一言'}" placeholder="${ph}（40字まで）"><button class="gBtn">返す</button>`;
        row.querySelector('.gBtn').onclick = () => {
          const v = row.querySelector('.gIn').value.trim(), c = picked.get(it.id);
          if (c) { picked.delete(it.id); Store.update(it.id, v ? { guess: c, note: v } : { guess: c }); App.renderAll(); App.sent(it.id); } else if (v) { Store.update(it.id, { guess: v }); App.renderAll(); App.sent(it.id); }
        };
        row.querySelector('.gIn').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) row.querySelector('.gBtn').click(); }; // キーボードの「送信」でも返せる
      }
      if (mine && !it.revealed) {
        // 想像が届いていたら、答え合わせに一言そえられる（「おしい！」など。なくてもいい）
        if (it.guess) row.insertAdjacentHTML('beforeend', '<input class="aIn" maxlength="40" aria-label="答え合わせに一言" placeholder="一言（なくてもいい）">');
        const b = document.createElement('button'); b.className = 'rBtn' + (it.guess ? '' : ' reveal'); b.textContent = it.guess ? '答え合わせする' : '想像を待たずに、相手に答えを明かす';
        const reveal = () => { const v = row.querySelector('.aIn')?.value.trim(); Store.update(it.id, v ? { revealed: true, aNote: v } : { revealed: true }); App.renderAll(); App.sent(it.id); };
        // 想像が届く前に明かすと、相手は想像できなくなる（取り消せない）ので2回押し
        if (it.guess) b.onclick = reveal; else App.twoStep(b, 'もう一度押すと答えを明かします', reveal);
        row.querySelector('.aIn')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) b.click(); });
        row.append(b);
      }
      if (mine) row.append(App.delButton(it.id, App.renderAll));
      if (it.revealed && ++settled > 3) {
        if (!past) { past = document.createElement('details'); past.className = 'more past'; past.open = pastOpen; past.ontoggle = () => { pastOpen = past.open; }; past.innerHTML = '<summary>もっと前のかけら</summary>'; $('kakeraList').append(past); }
        past.append(el); continue;
      }
      $('kakeraList').append(el);
    }
  }

  // 当てがいのある言葉：漢字・カタカナ・英数字を含むか、3文字以上のひらがな。助詞や「た」のような1文字は選ばない
  const PARTICLES = /^(なので|だけど|から|まで|より|けど|ので|のに|だけ|しか|など|でも|ても|ながら|ばかり)$/;
  const meaningful = w => /[\p{sc=Han}\p{sc=Katakana}A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/u.test(w) || (w.length >= 3 && !PARTICLES.test(w));
  // 札にする言葉：当てがいのある言葉に加え、ひらがな2文字（もち・ねこ・すし）でも助詞でなければ
  const chosen = w => meaningful(w) || (w.length >= 2 && /^[\p{sc=Hiragana}ー]+$/u.test(w) && !PARTICLES.test(w) && !/^(は|が|を|に|へ|と|で|も|の|や|ね|よ|か)+$/.test(w));
  // 書いた文を言葉ごとの札にして欄の下に並べ、押した言葉を［］で囲む（もう一度押すと戻す）。字を選んでからボタンを押す2段階をやめ、1回押すだけで隠せるように
  function pieces(v) {
    const out = []; let at = 0;
    const plainPart = (t, base) => {
      const seg = window.Intl?.Segmenter ? [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(t)].map(x => [x.segment, x.index])
        : [...t.matchAll(/[\p{sc=Han}々\p{sc=Katakana}ーA-Za-z0-9]+|[\p{sc=Hiragana}]+|[^\p{sc=Han}々\p{sc=Katakana}ーA-Za-z0-9\p{sc=Hiragana}]+/gu)].map(m => [m[0], m.index]);
      // 1文字の漢字のあとに続くひらがな（送りがな・「て」「た」）は、ひとつの札にまとめる（「食|べた」「寝|て|た」を「食べた」「寝てた」に）。助詞の1文字で止める
      for (let k = 0; k < seg.length; k++) {
        let [w, i] = seg[k];
        if (/^[\p{sc=Katakana}ー]+$/u.test(w)) while (/^[\p{sc=Katakana}ー]+$/u.test(seg[k + 1]?.[0] || '')) w += seg[++k][0]; // カタカナの続き（「メロン|パン」）も1つに
        const kana = x => /^[\p{sc=Hiragana}ー]+$/u.test(x || ''), particle = x => /^[はがをにへとでものや]$/.test(x || '') || /^(なので|だけど|けど|から|まで|より|ので|のに|だけ|など|でも|ても|ながら|ばかり|な|だ|です|でした|だった)$/.test(x || ''); // 「しか」は「おいしかった」の中にも出るので入れない // 助詞と「だ・です」の前で止める
        if (/^[\p{sc=Han}々]+$/u.test(w)) while (/^[\p{sc=Han}々]+$/u.test(seg[k + 1]?.[0] || '')) w += seg[++k][0]; // 漢字の続き（「配信|前」）も1つに
        if (/\p{sc=Han}/u.test(w)) while (kana(seg[k + 1]?.[0]) && !particle(seg[k + 1][0])) w += seg[++k][0]; // 漢字のあとの送りがな・「てしまった」なども1つに
        else if (kana(w) && !particle(w)) { let last = w; while (kana(seg[k + 1]?.[0]) && !particle(seg[k + 1][0]) && (last.length === 1 || w.length <= 2 || seg[k + 1][0].length === 1 || /^[っゃゅょぁぃぅぇぉ]/.test(seg[k + 1][0]))) { last = seg[++k][0]; w += last; } } // ひらがなの切れはし（「お|やつ」「す|ご|か|っ|た」）をつなぐ。助詞の1文字で止める。小さい字で始まる切れはし（Firefox の「おいしか|った」）は言葉の頭にならないのでつなぐ
        out.push({ w, i: base + i, e: base + i + w.length, tap: chosen(w.trim()) });
      }
    };
    for (const m of v.matchAll(/［[^］]*］|\[[^\]]*\]/g)) {
      if (m.index > at) plainPart(v.slice(at, m.index), at);
      out.push({ w: m[0].slice(1, -1), i: m.index, e: m.index + m[0].length, hid: true }); at = m.index + m[0].length;
    }
    if (at < v.length) plainPart(v.slice(at), at);
    return out;
  }
  // 隠した札も字はそのまま見せ、色だけ変える（札の幅が変わらないので、続けて押しても隣の言葉を押し間違えない）
  function wordChips() {
    const t = $('kText'), v = t.value, box = $('kWords'), line = box.querySelector('.wLine'), ps = pieces(v);
    box.hidden = !ps.some(x => x.tap || x.hid); line.textContent = '';
    for (const x of ps) {
      if (!x.tap && !x.hid) { line.append(x.w); continue; }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'wBtn' + (x.hid ? ' hid' : ''); b.textContent = x.w || '　';
      b.setAttribute('aria-pressed', !!x.hid); if (!x.w) b.setAttribute('aria-label', '空の［］');
      b.onpointerdown = e => e.preventDefault(); // 押しても入力欄からキーボードが外れない（外れると画面が動いて、次に押す場所がずれるため）
      b.onclick = () => {
        // 隠したところのすぐ隣を押したら、新しい空欄にせず、隠したところを広げる（「パン」を隠してから「屋」を押すと「パン屋」が1つの空欄に）
        const prev = ps[ps.indexOf(x) - 1], next = ps[ps.indexOf(x) + 1];
        if (x.hid) t.value = v.slice(0, x.i) + x.w + v.slice(x.e);
        else if (prev?.hid && prev.e === x.i) t.value = v.slice(0, prev.e - 1) + x.w + v.slice(prev.e - 1, prev.e) + v.slice(x.e);
        else if (next?.hid && next.i === x.e) t.value = v.slice(0, x.i) + v.slice(next.i, next.i + 1) + x.w + v.slice(next.i + 1);
        else if (v.length + 2 > t.maxLength) return;
        else t.value = v.slice(0, x.i) + '［' + x.w + '］' + v.slice(x.e);
        t.dispatchEvent(new Event('input', { bubbles: true })); // 札・字数・3択の知らせも合わせる
      };
      line.append(b);
    }
  }

  // 渡す前に、3択になるかどうかだけ知らせる（外れの言葉は渡すときに選ぶので、ここでは見せない）
  function choiceHint() { $('kChoiceHint').hidden = !Words.choices(hidden($('kText').value)); }

  function init() {
    $('kText').oninput = () => { choiceHint(); wordChips(); };
    $('kPhoto').onchange = e => {
      const f = e.target.files[0]; if (!f) return setPhoto(null);
      const img = new Image(); img.onload = () => setPhoto(img); img.src = URL.createObjectURL(f);
    };
    $('kBlur').onchange = preview;
    $('kPhotoOff').onclick = () => { $('kPhoto').value = ''; setPhoto(null); };
    $('kakeraForm').onsubmit = e => {
      e.preventDefault();
      const text = $('kText').value.replace(/［\s*］|\[\s*\]/g, '').trim(); if (!text && !photo) return; // 中が空の［］は隠すものがないので外す
      const data = { text }, choices = Words.choices(hidden(text));
      if (choices) data.choices = choices; // 鍵をかける前にこの端末で作る（本文を外に出さない）
      if (photo) { data.blur = blurred(photo, +$('kBlur').value); data.photo = full(photo); }
      Store.add('kakera', data); App.tap(); $('kText').value = ''; choiceHint(); wordChips(); $('kPhoto').value = ''; setPhoto(null); render();
    };
  }
  return { init, render, setPhoto, holes };
})();
