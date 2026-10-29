// 端末側の暗号化（AES-GCM 256bit）。鍵は招待コードに入れて2人の間だけで渡し、サーバーには置かない
const Crypt = (() => {
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const b64url = buf => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64url = s => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const importKey = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  // 大きな写真でも引数の上限に当たらないよう、少しずつ文字にする
  const bigB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  return {
    newKey() { return b64url(crypto.getRandomValues(new Uint8Array(32))); },
    async key(str) { const raw = unb64url(str); if (raw.length !== 32) throw new Error('鍵の長さが違います'); return importKey(raw); },
    async enc(key, obj) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
      const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return bigB64(out);
    },
    async dec(key, s) {
      const all = unb64(s);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12) }, key, all.subarray(12));
      return JSON.parse(new TextDecoder().decode(pt));
    },
    // 招待コード：<ペアのID>.<鍵>。これを知っている人だけがペアに入れ、中身を読める
    invite(pairId, keyStr) { return `${pairId}.${keyStr}`; },
    // LINE などで届いた文ごと貼られても、中のコードだけを拾う
    parseInvite(code) { const m = String(code).normalize('NFKC').match(/(?<![A-Za-z0-9_-])([A-Za-z0-9]{20})\.([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/); return m ? { pairId: m[1], key: m[2] } : null; },
  };
})();
