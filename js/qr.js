// 招待コードを QR で渡すための、小さな QR コードの作り手（ライブラリなし）
// 8ビットのバイトモード・誤り訂正 L・版は 1〜9（232 バイトまで。招待の URL は約 110 バイト）。読み取りは相手のスマホのカメラがする（このアプリは読まない）
const QR = (() => {
  // GF(256) の掛け算の表
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  // リード・ソロモンの誤り訂正符号（n 語）
  const gen = n => { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; };
  const rs = (data, n) => { const g = gen(n), r = new Array(n).fill(0); for (const d of data) { const f = d ^ r.shift(); r.push(0); if (f) for (let j = 0; j < n; j++) r[j] ^= mul(g[j + 1], f); } return r; };
  // 版ごとの［誤り訂正の語数、ブロックごとのデータ語数］（誤り訂正 L）
  const BLOCKS = { 1: [7, [19]], 2: [10, [34]], 3: [15, [55]], 4: [20, [80]], 5: [26, [108]], 6: [18, [68, 68]], 7: [20, [78, 78]], 8: [24, [97, 97]], 9: [30, [116, 116]] };
  const ALIGN = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46] };
  const MASK = [(r, c) => (r + c) % 2 === 0, (r, c) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0, (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];

  // 文字列 → 0/1 の二次元配列（余白は含まない）
  function encode(str) {
    const bytes = new TextEncoder().encode(str);
    let v = 1;
    for (; v <= 9; v++) if (4 + 8 + bytes.length * 8 <= BLOCKS[v][1].reduce((a, b) => a + b, 0) * 8) break;
    if (v > 9) throw new Error('QR に入れるには長すぎます');
    const [ecn, sizes] = BLOCKS[v], cap = sizes.reduce((a, b) => a + b, 0);
    // データのビット列：モード（バイト）・長さ・中身・終端・詰め物
    const bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    put(4, 4); put(bytes.length, 8); for (const b of bytes) put(b, 8);
    for (let i = 0; i < 4 && bits.length < cap * 8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; data.length < cap; pad ^= 0xfd) data.push(pad);
    // ブロックに分けて誤り訂正を付け、交互に並べる
    const dB = [], eB = []; let off = 0;
    for (const s of sizes) { const d = data.slice(off, off + s); off += s; dB.push(d); eB.push(rs(d, ecn)); }
    const out = [];
    for (let i = 0; i < Math.max(...sizes); i++) for (const d of dB) if (i < d.length) out.push(d[i]);
    for (let i = 0; i < ecn; i++) for (const e of eB) out.push(e[i]);
    // 升目：-1 はまだ決まっていない所
    const n = v * 4 + 17, m = Array.from({ length: n }, () => new Int8Array(n).fill(-1));
    const finder = (r, c) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) { const rr = r + i, cc = c + j; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue; const on = i >= 0 && i <= 6 && j >= 0 && j <= 6 && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)); m[rr][cc] = on ? 1 : 0; } };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    for (let i = 8; i < n - 8; i++) m[6][i] = m[i][6] = i % 2 === 0 ? 1 : 0;
    const ap = ALIGN[v] || [];
    for (const r of ap) for (const c of ap) { if ((r < 9 && c < 9) || (r < 9 && c > n - 10) || (r > n - 10 && c < 9)) continue; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) m[r + i][c + j] = Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0; }
    for (let i = 0; i < 9; i++) { if (m[8][i] === -1) m[8][i] = 0; if (m[i][8] === -1) m[i][8] = 0; }
    for (let i = n - 8; i < n; i++) { m[8][i] = 0; m[i][8] = 0; } m[n - 8][8] = 1;
    if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { m[i][n - 11 + j] = 0; m[n - 11 + j][i] = 0; }
    const func = m.map(row => Array.from(row, x => x !== -1));
    // データを右下から蛇行して置く
    let bi = 0; const total = out.length * 8;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
        const c = right - j, r = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
        if (func[r][c]) continue;
        let bit = 0; if (bi < total) { bit = (out[bi >> 3] >> (7 - (bi & 7))) & 1; bi++; }
        m[r][c] = bit;
      }
    }
    const fmt = (grid, mask) => { // 形式情報（誤り訂正 L = 01 とマスク番号）
      const d = (1 << 3) | mask; let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412, bit = i => (b >>> i) & 1;
      for (let i = 0; i <= 5; i++) grid[i][8] = bit(i); grid[7][8] = bit(6); grid[8][8] = bit(7); grid[8][7] = bit(8); for (let i = 9; i < 15; i++) grid[8][14 - i] = bit(i);
      for (let i = 0; i < 8; i++) grid[8][n - 1 - i] = bit(i); for (let i = 8; i < 15; i++) grid[n - 15 + i][8] = bit(i); grid[n - 8][8] = 1;
    };
    if (v >= 7) { let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25); const b = (v << 12) | rem; for (let i = 0; i < 18; i++) { const bit = (b >>> i) & 1, a = n - 11 + (i % 3), c = Math.floor(i / 3); m[a][c] = bit; m[c][a] = bit; } }
    // 8つのマスクから、同じ色の並びが少ないものを選ぶ
    let best = null, bestScore = Infinity;
    for (let k = 0; k < 8; k++) {
      const g = m.map((row, r) => Array.from(row, (x, c) => (func[r][c] ? x : x ^ (MASK[k](r, c) ? 1 : 0))));
      fmt(g, k);
      let score = 0;
      for (let r = 0; r < n; r++) for (let c = 0, run = 0; c < n; c++) { run = c && g[r][c] === g[r][c - 1] ? run + 1 : 1; if (run === 5) score += 3; else if (run > 5) score++; }
      for (let c = 0; c < n; c++) for (let r = 0, run = 0; r < n; r++) { run = r && g[r][c] === g[r - 1][c] ? run + 1 : 1; if (run === 5) score += 3; else if (run > 5) score++; }
      for (let r = 0; r + 1 < n; r++) for (let c = 0; c + 1 < n; c++) if (g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) score += 3;
      if (score < bestScore) { bestScore = score; best = g; }
    }
    return best;
  }
  // SVG の文字列（余白4升。色は字の色）
  function svg(str, label) {
    const g = encode(str), n = g.length, q = 4, size = n + q * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c]) d += `M${c + q} ${r + q}h1v1h-1z`;
    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${label || 'QR コード'}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  return { encode, svg };
})();
