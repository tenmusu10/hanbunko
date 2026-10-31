// 疑似ペアのシミュレーション：架空の2人（A・B）が、それぞれ自分の画面だけを見て本物のアプリを使う
// 計画：https://claude.ai/artifact/V6orZ5yiXUqaSq9xf3WaMB 。演じるのは別々の Claude で、この道具は「画面を読む・操作する・1日進める」だけをする
// 使い方（firebase-tools と firebase が要る。pair-test と同じ：npm i --no-save firebase-tools firebase@<FIREBASE_SDK>）
//   node tools/persona-sim.js serve              … エミュレーターとブラウザを立ち上げて待つ（前回の続きがあれば読み込む）
//   node tools/persona-sim.js gen <seed>         … 10組分の性格・暮らしなどをランダムに引く（JSON）
//   node tools/persona-sim.js gen-critic <seed> [組]  … ストアのレビューが厳しい2人の組を1組、7日分引く（JSON。組の名前の既定は c1）
//   node tools/persona-sim.js new <組> [開始日] [iPhone の人 A,B]  … 組を作る（A・B の端末を用意して1日目にする）。iPhone の人は Safari で開く
//   node tools/persona-sim.js home <組> <A|B>    … iPhone の「ホーム画面に追加」。以後はホーム画面から開いた版（保存場所は Safari と別で、まっさら）
//   node tools/persona-sim.js view <組> <A|B>    … その人の画面（字と、押せる所の番号）とスクリーンショットの場所
//   node tools/persona-sim.js act <組> <A|B> '<JSON の操作の並び>'  … 操作して、そのあとの画面
//   node tools/persona-sim.js line <組> <A|B> '<文>'  … アプリの外（LINE など）で相手に送る
//   node tools/persona-sim.js notify <組> <A|B> on|off … まとめ通知を受けるか（アプリ版を想定）
//   node tools/persona-sim.js day <組>           … 2人とも次の日にする（保存もする）
//   node tools/persona-sim.js status / save / stop
// 操作：{"click":3} {"fill":2,"text":"…"} {"select":1,"text":"隠したい言葉"} {"choose":4,"value":"12"} {"check":5} {"photo":6,"about":"写っているもの"} {"key":"Enter"} {"wait":1000} {"reload":true}
// 途中の保存（暗号の鍵を含むブラウザのプロファイル・エミュレーターの中身・外での連絡）は SIM_WORK（既定は sim-work/、git に入れない）にだけ置く。
// 1回の処理は数十秒で終わる。serve が止まっても（2時間の上限など）、もう一度 serve すれば最後に保存したところから続く
const path = require('path'), fs = require('fs'), http = require('http'), { spawn, execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const WORK = path.resolve(process.env.SIM_WORK || path.join(root, 'sim-work'));
const PORT = Number(process.env.SIM_PORT || 7357);
const PROJECT = fs.readFileSync(path.join(root, 'js/firebase-config.js'), 'utf8').match(/projectId: '([^']+)'/)[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const WHO = ['A', 'B'];
const stateFile = path.join(WORK, 'state.json');
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); };
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// ---- ランダムに引く（乱数の種が同じなら同じ10組） ----
function rng(seed) { let s = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261); return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gen(seed) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)], five = () => 1 + Math.floor(r() * 5);
  const person = () => ({
    年代: pick(['20代前半', '20代後半', '30代前半', '30代後半', '40代']),
    暮らし: pick(['平日勤め（定時）', '平日勤め（残業多め）', 'シフト制', '学生', '在宅の仕事', '夜勤あり']),
    性格: { 外向性: five(), 心配性: five(), 几帳面さ: five(), 引っ張りたい度: five() },
    連絡: pick(['マメ', '気まぐれ', 'ずぼら']), 文の長さ: pick(['短い', 'ふつう', '長い']), 絵文字: pick(['使わない', 'たまに', 'よく使う']),
    使う頻度: pick(['ほぼ毎日', '週2〜3回', '思い出したときだけ']), スマホの慣れ: pick(['よく使う', 'ふつう', '苦手']),
    対人のくせ: pick(['安心している', '安心している', '不安になりやすい', '距離を取りたい']),
    端末: pick(['Android アプリ', 'Android アプリ', 'iPhone のウェブ版']), まとめ通知: pick(['オン', 'オフ']),
  });
  const span = ['交際1年未満', '交際1年未満', '交際1年未満', '交際1〜5年', '交際1〜5年', '交際1〜5年', '交際1〜5年', '5年以上・結婚', '5年以上・結婚', '5年以上・結婚'];
  const live = ['同居', '同居', '同居', '同居', '同居', '別居', '別居', '別居', '別居', '別居'];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  shuffle(span); shuffle(live);
  const fixed = { '08': '縛りたい人がいる（片方が嫉妬深く、相手が今なにをしているかをアプリから読み取ろうとする）', '09': '熱量が合わない（片方はほぼ毎日、もう片方は週1回）', '10': 'けんかする（5日目ごろにけんか。片方がひと休み、最後に解消まで考える）' };
  const events = ['仕事が忙しい', '家事を多めにした', '食べたいものがある', 'ちょっとしたすれ違い', '体調がいまいち', '休みの日', '相手にうれしいことがあった', '特になにもない', '特になにもない', '特になにもない'];
  return Array.from({ length: 10 }, (_, i) => {
    const id = String(i + 1).padStart(2, '0');
    return { 組: id, 交際: span[i], 住み方: live[i], 固定: fixed[id] || null, 関係の温度: { 満足度: five(), 不満の種: pick(['家事の偏り', '会う頻度', 'お金の使い方', '連絡の頻度', 'とくになし']) },
      A: person(), B: person(), 出来事: Array.from({ length: 14 }, () => ({ A: pick(events), B: pick(events) })), 先に開く: Array.from({ length: 14 }, () => pick(WHO)) };
  });
}

// ---- 辛口レビュアーの組（乱数の種が同じなら同じ1組）：ストアのレビューが厳しい人を2人。関係や性格は gen と同じ引き方 ----
function genCritic(seed, id = 'c1') {
  const base = gen(seed)[0], r = rng(seed + ':critic'), pick = a => a[Math.floor(r() * a.length)], five = () => 1 + Math.floor(r() * 5);
  const critic = () => ({
    仕事: pick(['UI デザイナー', 'アプリ開発のエンジニア', '品質保証（テスター）', '事務職', '販売・接客', '看護師', '大学院生', '専業主婦・主夫', '個人で動画配信']),
    レビュー歴: pick(['これまで10件ほど', 'これまで50件ほど', 'これまで200件以上（レビュー常連）']),
    つける星の平均: pick(['1.8', '2.3', '2.7', '3.1']),
    厳しく見るところ: [...new Set([pick(['見た目・操作の細かさ', '説明の分かりにくさ', 'プライバシー・データの扱い', '動作の重さ・不具合', 'コンセプトの必要性（LINE で足りないか）', '有料化・広告の気配']), pick(['見た目・操作の細かさ', '説明の分かりにくさ', 'プライバシー・データの扱い', '動作の重さ・不具合', 'コンセプトの必要性（LINE で足りないか）', '有料化・広告の気配'])])],
    比べるアプリ: pick(['LINE', 'TimeTree', 'Between', 'Pairy', 'Google カレンダー', 'とくになし']),
    書き方: pick(['箇条書きで長い', '皮肉まじり', '一行で切り捨てる', '丁寧だが辛い', '改善案を必ず書く']),
    星を上げる条件: pick(['不具合がない', '他にない体験', '作り手の誠実さが見える', '自分たちの関係に効いた']),
    ほめる気持ち: five(),
  });
  return { ...base, 組: id, 種: String(seed), 固定: 'アプリストアのレビューが厳しい2人。使い終わったらストアにレビューを書く', A: { ...base.A, レビュアー: critic() }, B: { ...base.B, レビュアー: critic() }, 出来事: base.出来事.slice(0, 7), 先に開く: base.先に開く.slice(0, 7) };
}

// ---- 呼ぶ側（短い命令を serve に渡す） ----
async function call(cmd, body) {
  return new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path: '/' + cmd, headers: { 'content-type': 'application/json' } }, r => { let d = ''; r.on('data', c => { d += c; }); r.on('end', () => res({ status: r.statusCode, text: d })); });
    req.on('error', rej); req.end(JSON.stringify(body || {}));
  });
}

// ---- serve：エミュレーター・アプリの配信・ブラウザ ----
async function serve() {
  let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
  const sdkDir = path.dirname(require.resolve('firebase/package.json', { paths: [root] }));
  fs.mkdirSync(WORK, { recursive: true });
  const state = readJSON(stateFile, { pairs: {} });
  const saveState = () => writeJSON(stateFile, state);
  const emuData = path.join(WORK, 'emulator');
  const fb = path.join(root, 'node_modules/.bin/firebase');
  // エミュレーターどうしの 127.0.0.1 のやり取りがプロキシに回されて書き出しが止まるので、プロキシの設定を外して動かす
  const localEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(https?_proxy|GLOBAL_AGENT_|npm_config_(https?_)?proxy)/i.test(k)));
  const emu = spawn(fb, ['emulators:start', '--project', PROJECT, '--only', 'firestore,auth', ...(fs.existsSync(path.join(emuData, 'firebase-export-metadata.json')) ? ['--import', emuData] : [])], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: localEnv });
  let emuLog = ''; emu.stdout.on('data', c => { emuLog += c; }); emu.stderr.on('data', c => { emuLog += c; });
  const ready = await new Promise(res => { const t = Date.now(); const i = setInterval(() => { if (/All emulators ready/.test(emuLog)) { clearInterval(i); res(true); } else if (Date.now() - t > 90000 || emu.exitCode !== null) { clearInterval(i); res(false); } }, 300); });
  if (!ready) { console.error('エミュレーターが立ち上がりませんでした\n' + emuLog.slice(-2000)); process.exit(1); }
  const exportEmu = () => execFileSync(fb, ['emulators:export', emuData, '--project', PROJECT, '--force'], { cwd: root, stdio: 'ignore', env: localEnv });

  const app = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => app.listen(PORT + 1, '127.0.0.1', r)); // 端末の中身はアドレスごとに分かれるので、開き直しても同じ番号にする
  const url = `http://127.0.0.1:${app.address().port}/`;
  const open = {}; // `${組}-${A|B}` → { ctx, page, errs }
  const dir = (pair, ...p) => path.join(WORK, 'pairs', pair, ...p);
  const noon = day => new Date(day + 'T12:00:00');

  async function device(pair, who) {
    const k = pair + '-' + who; if (open[k]) return open[k];
    const st = state.pairs[pair]; if (!st) throw new Error(`組 ${pair} がありません（先に new）`);
    // 1人ずつ、ブラウザのプロファイルごとディスクに置く（開き直しても、匿名ログインの人も暗号の鍵もそのまま）
    const profile = dir(pair, who + '.profile'), fresh = !fs.existsSync(profile);
    // iPhone のウェブ版の人は Safari として開く。「ホーム画面に追加」（home）のあとはホーム画面から開いたことにする
    const iphone = (st.iphone || []).includes(who), home = !!(st.home || {})[who];
    const ctx = await pw.chromium.launchPersistentContext(profile, { viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', ...(iphone ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' } : {}) });
    if (iphone) await ctx.addInitScript(h => { Object.defineProperty(navigator, 'standalone', { get: () => h }); }, home);
    await ctx.clock.install({ time: noon(st.day) }); await ctx.clock.resume();
    await ctx.route(/www\.gstatic\.com\/firebasejs\/[^/]+\/(firebase-[a-z]+\.js)/, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(sdkDir, route.request().url().split('/').pop())) }));
    // 認証エミュレーターは書き出しに refresh token を含めないので、開き直すと匿名の人が入り直しになってしまう。
    // 断られたときだけ、同じ人のトークンをここで作って返す（エミュレーターは署名を確かめない）。本物の Firebase にはつながない
    // 開き直したあとの最初の確かめ（accounts:lookup）で TOKEN_EXPIRED になると、アプリは別の匿名の人として入り直してしまう。
    // 断られたときだけ、同じ人の新しいトークンを作ってやり直す（エミュレーターは署名を確かめない）。本物の Firebase にはつながない
    const token = uid => { const now = Math.floor(Date.now() / 1000), b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'); return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ provider_id: 'anonymous', auth_time: now, user_id: uid, sub: uid, iat: now, exp: now + 3600, aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, firebase: { identities: {}, sign_in_provider: 'anonymous' } }) + '.'; };
    const uidOf = jwt => { try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString()).user_id; } catch (e) { return null; } };
    await ctx.route(/127\.0\.0\.1:9099\/identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/, async route => {
      const resp = await route.fetch(); if (resp.ok()) return route.fulfill({ response: resp });
      let body; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) { return route.fulfill({ response: resp }); }
      const uid = uidOf(body.idToken); if (!uid) return route.fulfill({ response: resp });
      route.fulfill({ response: await route.fetch({ postData: JSON.stringify({ ...body, idToken: token(uid) }) }) });
    });
    await ctx.route(/127\.0\.0\.1:9099\/securetoken\.googleapis\.com\/v1\/token/, async route => {
      const resp = await route.fetch(); if (resp.ok()) return route.fulfill({ response: resp });
      const body = route.request().postData() || '', rt = new URLSearchParams(body).get('refresh_token') || '';
      let uid; try { uid = JSON.parse(Buffer.from(rt, 'base64').toString()).localId; } catch (e) { return route.fulfill({ response: resp }); }
      const t = token(uid);
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: t, id_token: t, expires_in: '3600', token_type: 'Bearer', refresh_token: rt, user_id: uid, project_id: PROJECT }) });
    });
    // アプリ版の「コードを送る」は共有シート → LINE などになる。ここでは送った文を、そのまま相手への外での連絡にする
    await ctx.exposeBinding('__simShare', (src, text) => { const f = dir(pair, 'line.json'), log = readJSON(f, []); log.push({ from: who, to: who === 'A' ? 'B' : 'A', dayNo: state.pairs[pair].dayNo, text: String(text) }); writeJSON(f, log); });
    await ctx.addInitScript(() => { navigator.share = async d => { await window.__simShare(d.text || d.url || ''); }; });
    const page = ctx.pages()[0] || await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    if (process.env.SIM_DEBUG) page.on('response', async r => { if (/9099/.test(r.url())) console.log(pair, who, r.status(), r.url().replace(/\?.*/, ''), (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)); });
    await page.goto(url);
    if (fresh) { await page.evaluate(() => { localStorage.clear(); localStorage.setItem('hanbunko-emulator', '1'); localStorage.setItem('hanbunko-tour', '1'); }); await page.reload(); }
    await page.waitForTimeout(1500);
    return (open[k] = { ctx, page, errs, url });
  }
  // 日を進めたあとは、アプリを閉じた状態（about:blank）にしておき、その人が view・act したときに開く。
  // 日を進めるときに開き直すと、その人が開いていない日にも「見た」ことになり、新しく届いた印が消えてしまうため（c10 の気づき）
  async function opened(pair, who) {
    const d = await device(pair, who);
    if (d.page.url() === 'about:blank') { await d.page.goto(d.url); await d.page.waitForTimeout(1500); }
    const st = state.pairs[pair], me = await d.page.evaluate(() => Store.me).catch(() => null); if (me) (st.me ||= {})[who] = me;
    return d;
  }
  async function persist() { /* プロファイルはブラウザが自分で書く。閉じるときに確実に書き出す */ }
  const closeAll = async () => { for (const k of Object.keys(open)) { await open[k].ctx.close().catch(() => {}); delete open[k]; } };

  // 画面の字を上から順に。押せる所・書ける所には [番号] を付ける（番号は view のたびに付け直す）
  const VIEW = () => {
    document.querySelectorAll('[data-sim]').forEach(e => e.removeAttribute('data-sim'));
    let n = 0; const out = [];
    const shown = e => { if (e.closest('[hidden]')) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length > 0; };
    const clean = t => (t || '').replace(/\s+/g, ' ').trim();
    const mark = (e, text) => { e.setAttribute('data-sim', String(++n)); out.push(`[${n}] ${text}${e.disabled ? '（押せない）' : ''}`); };
    const walk = node => {
      if (node.nodeType === 3) { const t = clean(node.textContent); if (t) out.push(t); return; }
      if (node.nodeType !== 1) return;
      const e = node, tag = e.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION'].includes(tag)) return;
      if (tag === 'INPUT' && e.type === 'file') { const l = e.closest('label'); if (l && shown(l)) mark(e, `写真を選ぶ欄「${clean(l.textContent)}」`); return; }
      if (!shown(e)) return;
      const block = /^(block|flex|grid|list-item|table)/.test(getComputedStyle(e).display);
      if (block) out.push('\n');
      if (/^H[1-4]$/.test(tag)) { out.push('■ ' + clean(e.innerText)); out.push('\n'); return; }
      if (tag === 'BUTTON' || tag === 'A' || e.getAttribute('role') === 'button' || e.getAttribute('role') === 'tab') { mark(e, `ボタン「${clean(e.getAttribute('aria-label') || e.innerText)}」${e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true' || e.hasAttribute('aria-current') ? '（いま選んでいる）' : ''}`); return; }
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio'].includes(e.type))) { mark(e, `書く欄「${clean(e.getAttribute('aria-label') || e.placeholder)}」${e.readOnly ? '（読むだけ）' : ''} いまの中身：「${e.value}」`); return; }
      if (tag === 'INPUT') { const l = e.closest('label'); mark(e, `${e.type === 'radio' ? '選ぶ丸' : 'チェック'}「${clean(l ? l.textContent : e.getAttribute('aria-label'))}」${e.checked ? '（オン）' : '（オフ）'}`); return; }
      if (tag === 'SELECT') { mark(e, `選ぶ欄「${clean(e.getAttribute('aria-label') || (e.previousElementSibling || {}).textContent)}」いま：「${e.options[e.selectedIndex]?.text}」 候補：${[...e.options].map(o => `${o.value}=${o.text}`).join(' / ')}`); return; }
      if (tag === 'CANVAS' || tag === 'IMG') { out.push(`［${tag === 'IMG' ? '画像' : '写真'}${e.alt ? '：' + e.alt : ''}（スクリーンショットで見える）］`); return; }
      if (tag !== 'LABEL' && getComputedStyle(e).cursor === 'pointer' && !e.closest('[data-sim]') && !e.querySelector('button,input,textarea,select,a')) { mark(e, `押せる所「${clean(e.innerText)}」`); return; }
      e.childNodes.forEach(walk);
      if (block) out.push('\n');
    };
    walk(document.body);
    return out.join(' ').replace(/ *\n[ \n]*/g, '\n').trim();
  };
  async function view(pair, who) {
    const { page, errs } = await opened(pair, who), st = state.pairs[pair];
    // サーバーから読み終えて「新しく届いたタブへ動く」まで待ってから撮る（読み終える前に撮ると、タブの点が無い・前のタブのまま、と本物では起きないことが映る）
    await page.waitForFunction(() => window.Store?.ready && (!Store.remote || Store.synced), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    const text = await page.evaluate(VIEW);
    const shots = dir(pair, 'shots'); fs.mkdirSync(shots, { recursive: true });
    const shot = path.join(shots, `d${String(st.dayNo).padStart(2, '0')}-${who}-${Date.now().toString(36)}.png`);
    // 全体を1枚に撮ると、下に固定したタブが途中の字にかぶって写る（実機では起きない）ので、撮るあいだだけページの最後に置く
    await page.screenshot({ path: shot, fullPage: true, style: '#tabs { position: static !important; }' });
    const log = readJSON(dir(pair, 'line.json'), []).filter(m => m.dayNo >= st.dayNo - 1), when = m => (m.dayNo === st.dayNo ? '今日' : 'きのう');
    const line = log.filter(m => m.to === who).map(m => `${when(m)}：${m.text}`);
    const sent = log.filter(m => m.from === who && m.dayNo === st.dayNo).map(m => `今日：${m.text}`);
    const note = (st.digest || {})[who];
    return [`${pair} の ${who}：${st.dayNo}日目（${st.day}）`,
      note ? `ゆうべ21時ごろの通知：「${note}」` : null,
      line.length ? '相手からアプリの外（LINE など）で届いたもの：\n' + line.join('\n') : null,
      sent.length ? 'あなたがアプリの外（LINE など）で相手に送ったもの（アプリの「送る」で共有の画面から送ったものも含む）：\n' + sent.join('\n') : null,
      '--- 画面 ---', text, '--- ここまで ---', `スクリーンショット：${shot}`,
      errs.length ? '画面のエラー：' + errs.splice(0).join(' / ') : null].filter(Boolean).join('\n');
  }
  async function photo(page, about) { // 写っているものを、色と形のある絵にする（ぼかすと色しか残らない）
    return Buffer.from(await page.evaluate(about => {
      const c = document.createElement('canvas'); c.width = c.height = 640; const g = c.getContext('2d');
      let h = 0; for (const ch of about) h = (h * 31 + ch.charCodeAt(0)) % 360;
      g.fillStyle = `hsl(${h},45%,70%)`; g.fillRect(0, 0, 640, 640);
      for (let i = 0; i < 6; i++) { g.fillStyle = `hsl(${(h + i * 50) % 360},55%,${40 + i * 6}%)`; g.beginPath(); g.arc(100 + (h * (i + 3)) % 440, 120 + (h * (i + 7)) % 400, 60 + i * 12, 0, 7); g.fill(); }
      g.fillStyle = '#222'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.fillText(about.slice(0, 10), 320, 340);
      return c.toDataURL('image/png').split(',')[1];
    }, about), 'base64');
  }
  async function act(pair, who, actions) {
    const { page } = await opened(pair, who);
    const at = n => page.locator(`[data-sim="${n}"]`);
    let i = 0, failed = '';
    for (const a of actions) {
      try {
      if (a.click != null) await at(a.click).click({ timeout: 3000 });
      else if (a.fill != null) await at(a.fill).fill(String(a.text ?? ''), { timeout: 3000 });
      else if (a.select != null) await at(a.select).evaluate((e, t) => { const i = e.value.indexOf(t); if (i < 0) throw new Error(`「${t}」が欄の中にありません`); e.focus(); e.setSelectionRange(i, i + t.length); e.dispatchEvent(new Event('select', { bubbles: true })); }, String(a.text));
      else if (a.choose != null) await at(a.choose).selectOption(String(a.value));
      else if (a.check != null) await at(a.check).click({ timeout: 3000 });
      else if (a.photo != null) await at(a.photo).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: await photo(page, String(a.about || '写真')) });
      else if (a.key) await page.keyboard.press(a.key);
      else if (a.wait) await page.waitForTimeout(Math.min(5000, a.wait));
      else if (a.reload) await page.reload();
      else throw new Error('分からない操作');
      } catch (e) { // 番号が古い（画面が変わった）・隠れている、など。残りの操作はしないで、いまの画面を返す
        failed = `${i + 1}番目の操作 ${JSON.stringify(a)} ができませんでした（${/not visible|Timeout/.test(e.message) ? 'その番号の所が見えていないか、画面が変わって番号がずれています' : e.message.split('\n')[0].replace(/\x1b\[[0-9;]*m/g, '').slice(0, 120)}）。ここで止めて、いまの画面を返します\n`;
        break;
      }
      i++; await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1200); await persist(pair, who);
    return failed + await view(pair, who);
  }
  async function items(pair) {
    const pid = await open[pair + '-A']?.page.evaluate(() => (JSON.parse(localStorage.getItem('hanbunko-pair') || 'null') || {}).pairId).catch(() => null)
      || await open[pair + '-B']?.page.evaluate(() => (JSON.parse(localStorage.getItem('hanbunko-pair') || 'null') || {}).pairId).catch(() => null);
    if (!pid) return [];
    const raw = await new Promise(res => http.get(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/pairs/${pid}/items?pageSize=300`, { headers: { Authorization: 'Bearer owner' } }, r => { let d = ''; r.on('data', c => { d += c; }); r.on('end', () => res(d)); }).on('error', () => res('{}')));
    return (JSON.parse(raw).documents || []).map(d => ({ by: d.fields.by?.stringValue, day: d.fields.day?.stringValue }));
  }
  async function nextDay(pair) {
    const st = state.pairs[pair];
    // まとめ通知（tools/digest.mjs と同じ決まり）：その日に相手から新しく届いたものがあり、通知をオンにしている人にだけ、決まった一文
    for (const who of WHO) await device(pair, who); // 開き直したあとは、まだ端末が開いていないことがある
    const list = await items(pair); st.digest = {};
    for (const who of WHO) {
      const me = (st.me || {})[who] || await (await device(pair, who)).page.evaluate(() => Store.me).catch(() => null);
      if ((st.notify || {})[who] && me && list.some(i => i.by && i.by !== me && i.day === st.day)) st.digest[who] = '相手から届いたものがあります';
    }
    st.day = addDays(st.day, 1); st.dayNo += 1;
    for (const who of WHO) { const d = await device(pair, who); await d.ctx.clock.setSystemTime(noon(st.day)); await d.page.goto('about:blank'); await persist(pair, who); }
    saveState(); exportEmu();
    return `${pair}：${st.dayNo}日目（${st.day}）になりました${Object.keys(st.digest).length ? '。通知が出た人：' + Object.keys(st.digest).join('・') : ''}`;
  }

  const handlers = {
    async new({ pair, start, iphone }) {
      if (state.pairs[pair]) throw new Error(`組 ${pair} はもうあります`);
      state.pairs[pair] = { day: start || new Date().toISOString().slice(0, 10), dayNo: 1, notify: {}, digest: {}, iphone: String(iphone || '').split(',').filter(w => WHO.includes(w)) }; saveState();
      for (const who of WHO) { await device(pair, who); await persist(pair, who); }
      return `${pair} を作りました（1日目：${state.pairs[pair].day}）`;
    },
    view: ({ pair, who }) => view(pair, who),
    act: ({ pair, who, actions }) => act(pair, who, actions),
    async line({ pair, who, text }) {
      const f = dir(pair, 'line.json'), log = readJSON(f, []); log.push({ from: who, to: who === 'A' ? 'B' : 'A', dayNo: state.pairs[pair].dayNo, text }); writeJSON(f, log); return '送りました';
    },
    // iPhone の「ホーム画面に追加」。ホーム画面から開いた版は Safari と保存場所が別なので、まっさらな状態から始まる（本物と同じ）
    async home({ pair, who }) {
      const st = state.pairs[pair]; if (!(st.iphone || []).includes(who)) throw new Error(`${who} は iPhone のウェブ版ではありません`);
      if ((st.home || {})[who]) return 'もうホーム画面に追加してあります';
      const k = pair + '-' + who; if (open[k]) { await open[k].ctx.close(); delete open[k]; }
      fs.rmSync(dir(pair, who + '.profile'), { recursive: true, force: true }); st.home = { ...st.home, [who]: true }; saveState();
      return 'ホーム画面に追加しました。これからはホーム画面のふたりごとから開きます\n' + await view(pair, who);
    },
    notify({ pair, who, on }) { const st = state.pairs[pair]; st.notify = { ...st.notify, [who]: on === 'on' }; saveState(); return `${who} のまとめ通知：${on === 'on' ? 'オン' : 'オフ'}`; },
    day: ({ pair }) => nextDay(pair),
    async me({ pair, who }) { return (await device(pair, who)).page.evaluate(() => Store.me); }, // 調べる用（役には渡さない）
    status: () => Object.entries(state.pairs).map(([p, s]) => `${p}：${s.dayNo}日目（${s.day}）`).join('\n') || 'まだ組がありません',
    async save() { for (const k of Object.keys(open)) { const [p, w] = k.split('-'); await persist(p, w); } saveState(); exportEmu(); return '保存しました'; },
    async stop() { await handlers.save(); await closeAll(); setTimeout(() => { emu.kill('SIGINT'); process.exit(0); }, 200); return '止めます'; },
  };
  let queue = Promise.resolve(); // 1つずつ順に（同じ組の A と B が同時に動かないように）
  http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => { queue = queue.then(async () => {
      const cmd = req.url.slice(1);
      try { if (!handlers[cmd]) throw new Error('分からない命令：' + cmd); const out = await handlers[cmd](JSON.parse(body || '{}')); res.writeHead(200); res.end(String(out)); }
      catch (e) { res.writeHead(400); res.end('うまくいきませんでした：' + e.message); }
    }); });
  }).listen(PORT, '127.0.0.1', () => console.log(`persona-sim：待っています（${PORT}）。保存先 ${WORK}`));
  process.on('SIGTERM', async () => { try { await handlers.save(); await closeAll(); } catch (e) { /* 保存に失敗しても止める */ } emu.kill('SIGINT'); process.exit(0); });
}

// ---- 入口 ----
(async () => {
  const [cmd, pair, who, arg] = process.argv.slice(2);
  if (cmd === 'serve') return serve();
  if (cmd === 'gen-critic') return console.log(JSON.stringify(genCritic(pair || String(Date.now()), who), null, 1));
  if (cmd === 'gen') return console.log(JSON.stringify(gen(pair || 'hanbunko'), null, 1));
  const body = ({ new: () => ({ pair, start: who, iphone: arg }), home: () => ({ pair, who }), view: () => ({ pair, who }), me: () => ({ pair, who }), act: () => ({ pair, who, actions: JSON.parse(arg || '[]') }), line: () => ({ pair, who, text: arg }), notify: () => ({ pair, who, on: arg }), day: () => ({ pair }) }[cmd] || (() => ({})))();
  if (who && !['new'].includes(cmd) && !WHO.includes(who)) { console.error('A か B を指定してください'); process.exit(2); }
  try { const r = await call(cmd || 'status', body); console.log(r.text); process.exit(r.status === 200 ? 0 : 1); }
  catch (e) { console.error('serve が動いていません。先に node tools/persona-sim.js serve（または npm run sim:serve）'); process.exit(1); }
})();
