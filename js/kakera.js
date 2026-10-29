// 今日のかけら：一言の一部（［］の中）や写真をぼかして渡す。相手は想像で一言返し、渡した側が答え合わせで全部見せる
const Kakera = (() => {
  let photo = null; // 選んだ写真（元の大きさのまま、この端末の中だけ）
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const holes = s => esc(s).replace(/［[^］]*］|\[[^\]]*\]/g, m => `<span class="hole" role="img" aria-label="かくれた言葉">${'＿'.repeat(Math.max(2, m.length - 2))}</span>`);
  // 写真として出すのは、この端末が作るのと同じ形（JPEG の data URL）だけ。それ以外は属性を壊して悪さをしうるので出さない
  const photoSrc = s => typeof s === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(s) ? s : '';
  // 3択にするのは、隠したところが1つだけのとき（2つ以上だと、どれの答えか分からないため）
  const hidden = s => { const m = String(s || '').match(/［[^］]*］|\[[^\]]*\]/g); return m?.length === 1 ? m[0].slice(1, -1).trim() : null; };
  const plain = s => esc(s).replace(/[［\[\]］]/g, '');

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
    for (const it of list) {
      const mine = it.by === Store.me, el = document.createElement('div');
      el.className = 'card item ' + (mine ? 'mine' : 'theirs'); el.dataset.id = it.id;
      const showAll = it.revealed;
      el.innerHTML = `<div class="who">${mine ? 'わたしから' : 'あいてから'}</div>`
        + (it.text ? `<div class="body">${showAll ? plain(it.text) : holes(it.text)}</div>` : '')
        + (photoSrc(showAll ? it.photo : it.blur) ? `<img alt="かけらの写真" src="${photoSrc(showAll ? it.photo : it.blur)}">` : '')
        + (it.guess ? `<div class="guess">${mine ? 'あいての想像' : 'わたしの想像'}：${esc(it.guess)}${showAll && it.guess === hidden(it.text) ? '<span class="done">ぴったり</span>' : ''}</div>` : '')
        + '<div class="row"></div>';
      const row = el.querySelector('.row');
      if (!it.text && !it.photo) el.querySelector('.who').insertAdjacentHTML('afterend', '<div class="body hint">写真は日がたったので消えました</div>');
      if (!mine && !it.guess && !it.revealed) {
        // 3つから選ぶか、自分で一言書くか。選んでも書いても、返すのは1回だけ
        if (Array.isArray(it.choices)) {
          const c = document.createElement('div'); c.className = 'choices'; c.setAttribute('role', 'group'); c.setAttribute('aria-label', '3つの文から選ぶ');
          // 言葉だけでなく、空欄に入れたときの文で見せる
          for (const v of it.choices.slice(0, 3)) { const b = document.createElement('button'); b.className = 'cBtn'; b.textContent = String(it.text).replace(/［[^］]*］|\[[^\]]*\]/, String(v)); b.onclick = () => { Store.update(it.id, { guess: String(v) }); render(); }; c.append(b); }
          row.before(c);
        }
        row.innerHTML = `<input class="gIn" maxlength="40" aria-label="想像で一言" placeholder="${Array.isArray(it.choices) ? 'または自分で一言' : '想像で一言'}"><button class="gBtn">返す</button>`;
        row.querySelector('.gBtn').onclick = () => { const v = row.querySelector('.gIn').value.trim(); if (v) { Store.update(it.id, { guess: v }); render(); } };
        row.querySelector('.gIn').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) row.querySelector('.gBtn').click(); }; // キーボードの「送信」でも返せる
      }
      if (mine && !it.revealed) { const b = document.createElement('button'); b.className = 'rBtn'; b.textContent = '答え合わせする'; b.onclick = () => { Store.update(it.id, { revealed: true }); render(); }; row.append(b); }
      if (mine) row.append(App.delButton(it.id, render));
      $('kakeraList').append(el);
    }
  }

  // 当てがいのある言葉：漢字・カタカナ・英数字を含むか、3文字以上のひらがな。助詞や「た」のような1文字は選ばない
  const meaningful = w => /[\p{sc=Han}\p{sc=Katakana}A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/u.test(w) || (w.length >= 3 && !/^(から|まで|より|けど|ので|のに|だけ|しか|など|でも|ても|ながら|ばかり)$/.test(w));
  function words(v) {
    const done = [...v.matchAll(/［[^］]*］|\[[^\]]*\]/g)].map(m => [m.index, m.index + m[0].length]); // もう隠したところは選ばない
    const seg = window.Intl?.Segmenter ? [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(v)].map(x => [x.segment, x.index])
      : [...v.matchAll(/[\p{sc=Han}々\p{sc=Katakana}ーA-Za-z0-9]+|[\p{sc=Hiragana}]+/gu)].map(m => [m[0], m.index]);
    return seg.filter(([w, i]) => meaningful(w) && !/[［］\[\]]/.test(w) && !done.some(([x, y]) => i < y && i + w.length > x)).map(([w, i]) => ({
      i, e: i + w.length,
      // 3択を作れる言葉をいちばん先に（返す側が押すだけで済むので）。次に長い言葉・カタカナ。1文字の漢字のすぐ後ろにひらがなが続くのは動詞の頭（「食」べた）のことが多いので後に
      score: (Words.has(w) ? 10 : 0) + w.length + (/\p{sc=Katakana}/u.test(w) ? 1 : 0) - (w.length === 1 && /\p{sc=Hiragana}/u.test(v[i + 1] || '') ? 1 : 0),
    }));
  }
  // 選んだ言葉を［］で囲む（スマホで［］を打たなくて済むように）。まだ何も書いていなければ［］を入れて、その中に書けるようにする
  function hide() {
    const t = $('kText'), v = t.value; let a = t.selectionStart, b = t.selectionEnd;
    // 何も選んでいないときや、助詞・1文字だけを選んだときは、そばの（無ければいちばん当てがいのある）言葉を隠す
    if (!meaningful(v.slice(a, b).replace(/[［］\[\]]/g, '').trim())) {
      const ws = words(v), w = ws.find(x => x.i <= a && a <= x.e) || ws.find(x => x.i <= b && b <= x.e) || [...ws].sort((x, y) => y.score - x.score)[0];
      if (w) { a = w.i; b = w.e; }
    }
    const word = v.slice(a, b).replace(/[［］\[\]]/g, '');
    if (v.length - (b - a) + word.length + 2 > t.maxLength) return;
    t.value = v.slice(0, a) + '［' + word + '］' + v.slice(b);
    const at = a + 1 + word.length; t.focus(); t.setSelectionRange(word ? at + 1 : at, word ? at + 1 : at);
  }

  // 渡す前に、3択になるかどうかだけ知らせる（外れの言葉は渡すときに選ぶので、ここでは見せない）
  function choiceHint() { $('kChoiceHint').hidden = !Words.choices(hidden($('kText').value)); }

  function init() {
    $('kHide').onclick = () => { hide(); choiceHint(); };
    $('kText').oninput = choiceHint;
    $('kHide').onpointerdown = e => e.preventDefault(); // 押したときに入力欄の選択が外れないように
    $('kPhoto').onchange = e => {
      const f = e.target.files[0]; if (!f) return setPhoto(null);
      const img = new Image(); img.onload = () => setPhoto(img); img.src = URL.createObjectURL(f);
    };
    $('kBlur').onchange = preview;
    $('kakeraForm').onsubmit = e => {
      e.preventDefault();
      const text = $('kText').value.replace(/［\s*］|\[\s*\]/g, '').trim(); if (!text && !photo) return; // 中が空の［］は隠すものがないので外す
      const data = { text }, choices = Words.choices(hidden(text));
      if (choices) data.choices = choices; // 鍵をかける前にこの端末で作る（本文を外に出さない）
      if (photo) { data.blur = blurred(photo, +$('kBlur').value); data.photo = full(photo); }
      Store.add('kakera', data); $('kText').value = ''; choiceHint(); $('kPhoto').value = ''; setPhoto(null); render();
    };
  }
  return { init, render, setPhoto, holes };
})();
