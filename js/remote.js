// Firebase につなぐ：匿名ログイン、招待コードでペアを作る・入る・抜ける、中身の暗号化と同期
// SDK は使うときだけ読み込む（試作モードやスモークテストではネットにつながない）
const Remote = (() => {
  const PAIR = 'hanbunko-pair'; // { pairId, key, code, everPaired } をこの端末だけに覚える
  const load = () => { try { return JSON.parse(localStorage.getItem(PAIR)); } catch (e) { return null; } };
  const save = p => { try { if (p) localStorage.setItem(PAIR, JSON.stringify(p)); else localStorage.removeItem(PAIR); } catch (e) { /* 覚えられなくても続ける */ } };
  let fb = null, stops = [];

  async function sdk() {
    if (fb) return fb;
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}/`;
    const [app, auth, fs] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(base + f)));
    const a = app.initializeApp(FIREBASE_CONFIG);
    fb = { ...fs, app: a, auth: auth.getAuth(a), signInAnonymously: auth.signInAnonymously, db: fs.getFirestore(a) };
    // テスト用：エミュレータにつなぐ（試作版で hanbunko-emulator を入れたときだけ。tools/pair-test.js が使う）
    if (SHOW_TEST && localStorage.getItem('hanbunko-emulator')) {
      fs.connectFirestoreEmulator(fb.db, '127.0.0.1', 8080);
      auth.connectAuthEmulator(fb.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    return fb;
  }
  async function signIn() {
    const f = await sdk(); await f.auth.authStateReady();
    if (!f.auth.currentUser) await f.signInAnonymously(f.auth);
    return f.auth.currentUser.uid;
  }
  const pairRef = (f, pairId) => f.doc(f.db, 'pairs', pairId);
  const tokenRef = (f, pairId, uid) => f.doc(f.db, 'pairs', pairId, 'tokens', uid);
  const content = it => { const o = { ...it }; for (const k of ['id', 'kind', 'by', 'day', '_c', '_r', 'hidden']) delete o[k]; return o; };

  return {
    saved() { return !!load(); },
    // 招待をつくる：ペアの場所と鍵を作り、招待コードを返す（鍵はサーバーに送らない）
    async create() {
      const f = await sdk(), uid = await signIn();
      const ref = f.doc(f.collection(f.db, 'pairs'));
      await f.setDoc(ref, { members: [uid], day: Store.today() });
      const key = Crypt.newKey(), code = Crypt.invite(ref.id, key);
      save({ pairId: ref.id, key, code, everPaired: false });
      return code;
    },
    async join(code) {
      const inv = Crypt.parseInvite(code); if (!inv) throw new Error('招待コードの形が違います。もう一度コピーして貼ってください');
      const f = await sdk(), uid = await signIn();
      try { await f.updateDoc(pairRef(f, inv.pairId), { members: f.arrayUnion(uid) }); } catch (e) { throw new Error('この招待コードでは入れませんでした（もう2人そろっているか、コードが違います）'); }
      save({ ...inv, code: null, everPaired: true });
    },
    // ひとりで即時に抜ける。理由は聞かない。自分が書いたもの（相手のものへの返事も）・匿名のアカウント・この端末の鍵を消す。相手が書いたものは相手の手元に残る
    async leave() {
      const p = load(); stops.forEach(s => s()); stops = []; save(null);
      if (!p) return;
      try {
        const f = await sdk(), uid = await signIn(), items = f.collection(f.db, 'pairs', p.pairId, 'items');
        const all = await f.getDocs(items);
        await f.deleteDoc(tokenRef(f, p.pairId, uid)).catch(() => {}); // まとめ通知の宛先も消す
        await Promise.all(all.docs.map(d => d.data().by === uid ? f.deleteDoc(d.ref) : d.data().r ? f.updateDoc(d.ref, { r: f.deleteField() }) : null));
        await f.updateDoc(pairRef(f, p.pairId), { members: f.arrayRemove(uid) });
        await f.auth.currentUser.delete();
      } catch (e) { console.warn('サーバー側の片付けが途中で止まりました', e); } // この端末では抜けた扱いにする
    },
    // まとめ通知の宛先（この端末のトークン）を置く・消す。merge にするのは、送る側が書く sent を消さないため
    async saveToken(t) { const p = load(), f = await sdk(), uid = await signIn(); await f.setDoc(tokenRef(f, p.pairId, uid), { t }, { merge: true }); },
    async dropToken() { const p = load(); if (!p) return; const f = await sdk(), uid = await signIn(); await f.deleteDoc(tokenRef(f, p.pairId, uid)); },
    // ウェブ版の通知（Web Push）。使うときだけ SDK を読む
    async messaging() {
      const f = await sdk(), m = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK}/firebase-messaging.js`);
      return { getToken: m.getToken, deleteToken: m.deleteToken, messaging: m.getMessaging(f.app) };
    },
    // つなぐ：ペアの状態と中身を見張り、変わったら onChange(state) を呼ぶ。Store に渡す backend を返す
    async connect(onChange) {
      const p = load(), f = await sdk(), uid = await signIn(), key = await Crypt.key(p.key);
      const items = f.collection(f.db, 'pairs', p.pairId, 'items');
      const be = {
        uid, items: [], state: { partner: false, everPaired: p.everPaired, code: p.code },
        async add(it) { be.items.push(it); it._c = content(it); await f.setDoc(f.doc(items, it.id), { kind: it.kind, by: it.by, day: it.day, c: await Crypt.enc(key, it._c) }).catch(e => console.warn('保存できませんでした', e)); },
        async update(it, patch, mine) {
          Object.assign(it, patch);
          const field = mine ? '_c' : '_r'; it[field] = { ...(it[field] || {}), ...patch };
          await f.updateDoc(f.doc(items, it.id), { [mine ? 'c' : 'r']: await Crypt.enc(key, it[field]) }).catch(e => console.warn('保存できませんでした', e));
        },
        async remove(it) { be.items = be.items.filter(i => i !== it); await f.deleteDoc(f.doc(items, it.id)).catch(e => console.warn('消せませんでした', e)); },
        async rewrite(it, fields) { for (const k of fields) { delete it[k]; delete it._c[k]; } await f.updateDoc(f.doc(items, it.id), { c: await Crypt.enc(key, it._c) }).catch(e => console.warn('保存できませんでした', e)); },
      };
      stops.push(f.onSnapshot(pairRef(f, p.pairId), snap => {
        const members = snap.exists() ? snap.data().members : [];
        be.state.partner = members.length === 2;
        if (be.state.partner && !be.state.everPaired) { be.state.everPaired = true; save({ ...load(), everPaired: true }); }
        onChange(be.state);
      }, () => onChange(be.state)));
      stops.push(f.onSnapshot(items, async snap => {
        const list = await Promise.all(snap.docs.map(async d => {
          const x = d.data();
          try {
            const c = await Crypt.dec(key, x.c), r = x.r ? await Crypt.dec(key, x.r) : {};
            return { id: d.id, kind: x.kind, by: x.by, day: x.day, _c: c, _r: r, ...c, ...r };
          } catch (e) { return null; } // 読めないもの（鍵が違う）は出さない
        }));
        be.items = list.filter(Boolean); onChange(be.state);
      }));
      return be;
    },
  };
})();
