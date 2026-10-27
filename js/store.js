// データの置き場所。「この端末の中だけ（試作）」と「Firebase（2人で共有）」の2つを同じ形で扱う
// 持たない情報：既読・開いた時刻・位置・オンライン状態。作った日（day）だけを持ち、時刻は持たない
// Firebase では中身（c：作った人の分、r：相手の返事）を端末側で暗号化し、kind・by・day だけを平文で置く（js/remote.js）
const Store = (() => {
  const KEY = 'hanbunko-v1', MODE = 'hanbunko-mode';
  // 日付はこの端末の暦で数える（UTC だと日本の朝9時前が前の日になる。まとめ通知 tools/digest.mjs も日本の暦で見る）
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => ymd(new Date());
  const daysAgo = days => { const d = new Date(); d.setDate(d.getDate() - days); return ymd(d); };
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8); // 先頭を時刻にして、同じ日のものも新しい順に並べる
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できなくても表示は続ける */ } };

  // この端末の中だけ（試作・スモークテスト用）。視点の切り替えで1台で2人分を試せる
  const local = {
    items: read(KEY, { items: [] }).items,
    save() { write(KEY, { items: this.items }); },
    add(it) { this.items.push(it); this.save(); },
    update(it, patch) { Object.assign(it, patch); this.save(); },
    remove(it) { this.items = this.items.filter(i => i !== it); this.save(); },
    rewrite(it, fields) { for (const f of fields) delete it[f]; this.save(); },
  };
  let backend = local;

  return {
    me: 'a',
    get mode() { return read(MODE, null); },
    setMode(m) { if (m) write(MODE, m); else localStorage.removeItem(MODE); },
    useLocal() { backend = local; this.setMode('local'); },
    useRemote(remote) { backend = remote; this.me = remote.uid; this.setMode('remote'); },
    get remote() { return backend === local ? null : backend; },
    list(kind) { return backend.items.filter(i => i.kind === kind).sort((x, y) => (y.day + y.id).localeCompare(x.day + x.id)); },
    add(kind, data) { const it = { id: id(), kind, by: this.me, day: today(), ...data }; backend.add(it); return it; },
    // 作った人は自分の分（c）、相手は返事（r）だけを書き換えられる。どちらに入るかは誰が書くかで決まる
    update(itemId, patch) { const it = backend.items.find(i => i.id === itemId); if (it) backend.update(it, patch, it.by === this.me); return it; },
    // 自分のものだけ消せる。消したことは相手に知らせない
    remove(itemId) { const it = backend.items.find(i => i.id === itemId && i.by === this.me); if (it) backend.remove(it); return !!it; },
    // 期限が過ぎたものを消す。サーバーでは自分のものだけ実際に消し、相手のものは見せないだけにする
    purge(kind, days, keep) {
      const limit = daysAgo(days);
      for (const it of backend.items.filter(i => i.kind === kind && i.day < limit && !(keep && keep(i)))) {
        if (backend === local || it.by === this.me) backend.remove(it); else it.hidden = true;
      }
      if (backend !== local) backend.items = backend.items.filter(i => !i.hidden);
    },
    // 古いものから決まった項目だけ外す（かけらの写真など）
    strip(kind, days, fields) {
      const limit = daysAgo(days);
      for (const it of backend.items) if (it.kind === kind && it.day < limit && fields.some(f => f in it)) {
        if (backend === local || it.by === this.me) backend.rewrite(it, fields); else for (const f of fields) delete it[f];
      }
    },
    reset() { local.items = []; local.save(); },
    today,
  };
})();
