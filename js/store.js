// データの置き場所。今はこの端末の中だけ（localStorage）。サーバーにつなぐときは同じ形の別の実装に差し替える
// 持たない情報：既読・開いた時刻・位置・オンライン状態。作った日（day）だけを持ち、時刻は持たない
const Store = (() => {
  const KEY = 'hanbunko-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { items: [] }; } catch (e) { return { items: [] }; } };
  let db = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 保存できなくても表示は続ける */ } };
  const today = () => new Date().toISOString().slice(0, 10);
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8); // 先頭を時刻にして、同じ日のものも新しい順に並べる
  return {
    me: 'a',
    other() { return this.me === 'a' ? 'b' : 'a'; },
    list(kind) { return db.items.filter(i => i.kind === kind).sort((x, y) => (y.day + y.id).localeCompare(x.day + x.id)); },
    add(kind, data) { const it = { id: id(), kind, by: this.me, day: today(), ...data }; db.items.push(it); save(); return it; },
    update(itemId, patch) { const it = db.items.find(i => i.id === itemId); if (it) { Object.assign(it, patch); save(); } return it; },
    // 自分のものだけ消せる。消したことは相手に知らせない
    remove(itemId) { const n = db.items.length; db.items = db.items.filter(i => !(i.id === itemId && i.by === this.me)); save(); return db.items.length < n; },
    purge(kind, days, keep) {
      const limit = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
      db.items = db.items.filter(i => i.kind !== kind || i.day >= limit || (keep && keep(i))); save();
    },
    // 古いものから決まった項目だけ外す（かけらの写真など）
    strip(kind, days, fields) {
      const limit = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
      for (const i of db.items) if (i.kind === kind && i.day < limit) for (const f of fields) delete i[f];
      save();
    },
    reset() { db = { items: [] }; save(); },
    today,
  };
})();
