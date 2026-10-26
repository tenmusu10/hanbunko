// 今日のかけら：一言の一部（［］の中）や写真をぼかして渡す。相手は想像で一言返し、渡した側が答え合わせで全部見せる
const Kakera = (() => {
  let photo = null; // 選んだ写真（元の大きさのまま、この端末の中だけ）
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const holes = s => esc(s).replace(/［[^］]*］|\[[^\]]*\]/g, m => `<span class="hole">${'＿'.repeat(Math.max(2, m.length - 2))}</span>`);
  const plain = s => esc(s).replace(/[［\[\]］]/g, '');

  function blurred(img, px) {
    const c = document.createElement('canvas'); const s = Math.min(1, 640 / Math.max(img.width, img.height));
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const g = c.getContext('2d'); g.filter = `blur(${px}px)`; g.drawImage(img, 0, 0, c.width, c.height);
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
    g.clearRect(0, 0, c.width, c.height); g.filter = `blur(${$('kBlur').value / 2}px)`;
    g.drawImage(photo, (c.width - photo.width * s) / 2, (c.height - photo.height * s) / 2, photo.width * s, photo.height * s); g.filter = 'none';
  }
  function setPhoto(img) { photo = img; preview(); }

  function render() {
    Store.strip('kakera', KAKERA_PHOTO_DAYS, ['photo', 'blur']);
    const list = Store.list('kakera');
    $('kakeraList').innerHTML = list.length ? '' : '<p class="empty">まだかけらはありません。気が向いたときにどうぞ。</p>';
    for (const it of list) {
      const mine = it.by === Store.me, el = document.createElement('div');
      el.className = 'card item'; el.dataset.id = it.id;
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
