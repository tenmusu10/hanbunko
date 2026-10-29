// 今日のかけら：一言の一部（［］の中）や写真をぼかして渡す。相手は想像で一言返し、渡した側が答え合わせで全部見せる
const Kakera = (() => {
  let photo = null; // 選んだ写真（元の大きさのまま、この端末の中だけ）
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const holes = s => esc(s).replace(/［[^］]*］|\[[^\]]*\]/g, m => `<span class="hole">${'＿'.repeat(Math.max(2, m.length - 2))}</span>`);
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
  function full(img) {
    const c = document.createElement('canvas'); const s = Math.min(1, 1280 / Math.max(img.width, img.height));
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.8);
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
        + (it.photo ? `<img alt="かけらの写真" src="${showAll ? it.photo : it.blur}">` : '')
        + (it.guess ? `<div class="guess">${mine ? 'あいての想像' : 'わたしの想像'}：${esc(it.guess)}</div>` : '')
        + '<div class="row"></div>';
      const row = el.querySelector('.row');
      if (!it.text && !it.photo) el.querySelector('.who').insertAdjacentHTML('afterend', '<div class="body hint">写真は日がたったので消えました</div>');
      if (!mine && !it.guess && !it.revealed) {
        row.innerHTML = '<input class="gIn" maxlength="40" placeholder="想像で一言"><button class="gBtn">返す</button>';
        row.querySelector('.gBtn').onclick = () => { const v = row.querySelector('.gIn').value.trim(); if (v) { Store.update(it.id, { guess: v }); render(); } };
      }
      if (mine && !it.revealed) { const b = document.createElement('button'); b.className = 'rBtn'; b.textContent = '答え合わせする'; b.onclick = () => { Store.update(it.id, { revealed: true }); render(); }; row.append(b); }
      if (mine) row.append(App.delButton(it.id, render));
      $('kakeraList').append(el);
    }
  }

  function init() {
    $('kPhoto').onchange = e => {
      const f = e.target.files[0]; if (!f) return setPhoto(null);
      const img = new Image(); img.onload = () => setPhoto(img); img.src = URL.createObjectURL(f);
    };
    $('kBlur').onchange = preview;
    $('kakeraForm').onsubmit = e => {
      e.preventDefault();
      const text = $('kText').value.trim(); if (!text && !photo) return;
      const data = { text };
      if (photo) { data.blur = blurred(photo, +$('kBlur').value); data.photo = full(photo); }
      Store.add('kakera', data); $('kText').value = ''; $('kPhoto').value = ''; setPhoto(null); render();
    };
  }
  return { init, render, setPhoto, holes };
})();
