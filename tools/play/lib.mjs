// Google Play への自動リリース（.github/workflows/android.yml・play-listing.yml）で使う、通信しない部分（metabo-burst の tools/play/ から流用）
// テスト：npm run play:test

// Play の上限（文字数）
export const LIMITS = { notes: 500, title: 30, short: 80, full: 4000 };

// build.gradle から versionCode / versionName を読む
export function readGradleVersion(gradle) {
  const code = gradle.match(/^\s*versionCode\s+(\d+)\s*$/m);
  const name = gradle.match(/^\s*versionName\s+"([^"]+)"\s*$/m);
  if (!code || !name) throw new Error('android/app/build.gradle に versionCode / versionName が見つかりません');
  return { code: Number(code[1]), name: name[1] };
}

export function writeGradleVersion(gradle, { code, name }) {
  return gradle
    .replace(/^(\s*versionCode\s+)\d+(\s*)$/m, `$1${code}$2`)
    .replace(/^(\s*versionName\s+)"[^"]+"(\s*)$/m, `$1"${name}"$2`);
}

// "1.0.6" の最後の数字を n 増やす
export function bumpPatch(name, n) {
  const m = name.match(/^(.*?)(\d+)$/);
  if (!m) throw new Error(`versionName「${name}」の最後が数字ではないので自動で上げられません。入力欄で指定してください`);
  return m[1] + (Number(m[2]) + n);
}

// 今回の versionCode / versionName を決める。
// build.gradle の番号が前回作った番号（android-vc-N タグ）より大きければ、そのまま使う（手で上げた場合）。
// そうでなければ前回 +1 にし、versionName の最後の数字も同じだけ上げる。
// lastTag は前回の versionCode（タグが無ければ null）
export function nextVersion({ gradle, lastTag, nameOverride = '' }) {
  const last = lastTag ?? 0;
  let { code, name } = gradle;
  const bumped = code <= last;
  if (bumped) {
    name = bumpPatch(name, last + 1 - code);
    code = last + 1;
  }
  const want = nameOverride.trim();
  if (want) {
    if (!/^[0-9A-Za-z._-]{1,50}$/.test(want)) throw new Error(`versionName「${want}」に使えない文字があります（英数字と . _ - だけ）`);
    name = want;
  }
  if (code > 2100000000) throw new Error(`versionCode ${code} が Play の上限を超えています`);
  return { code, name, bumped };
}

// 「4面を追加 (#63)」→「4面を追加」
export function cleanSubject(s) {
  return s.replace(/\s*\(#\d+\)\s*$/, '').trim();
}

// 件名は「〜を追加する」のような言い切りなので、テスター向けに「〜を追加しました」にする。
// 動詞で終わらない件名（「4面を追加」など）や、形が分からないものはそのまま
const GODAN_RU = new Set(['帰る', '減る', '蹴る', '滑る', '照る', '喋る', '入る', '要る', '切る', '走る', '知る', '握る', '混じる']);
const ICHIDAN_KANJI_RU = new Set(['見る', '着る', '出る', '寝る', '居る', '似る', '煮る', '得る']);
const E_ROW = 'えけげせぜてでねべぺめれ';
const I_ROW = 'いきぎしじちぢにびぴみり';
const GODAN = { す: 'し', く: 'き', ぐ: 'ぎ', つ: 'ち', う: 'い', む: 'み', ぶ: 'び', ぬ: 'に' };
export function politeSubject(s) {
  const [, body, paren] = s.match(/^(.*?)((?:（[^（）]*）)?)$/);
  const done = t => t + paren;
  const prev = body.slice(-2, -1), end = body.slice(-1);
  if (/(?:ます|ました|した)$/.test(body)) return s;
  if (body.endsWith('する')) return done(body.slice(0, -2) + 'しました');
  if (body.endsWith('来る')) return done(body.slice(0, -1) + 'ました');
  if (end === 'る') {
    // 「〜が取れる」は「〜が取れるようにしました」の方が自然
    if (prev === 'れ' && /が[^を]*れる$/.test(body)) return done(body + 'ようにしました');
    if ([...GODAN_RU].some(v => body.endsWith(v))) return done(body.slice(0, -1) + 'りました');
    // 一段（「知らせる」「落ちる」「見る」）は「る」を「ました」に、それ以外の五段（「取る」「なる」）は「りました」
    if (ICHIDAN_KANJI_RU.has(body.slice(-2)) || E_ROW.includes(prev) || I_ROW.includes(prev)) return done(body.slice(0, -1) + 'ました');
    if (/[\u4e00-\u9fffぁ-ん]/.test(prev)) return done(body.slice(0, -1) + 'りました');
    return s;
  }
  if (GODAN[end] && /[\u4e00-\u9fffぁ-ん]/.test(prev)) return done(body.slice(0, -1) + GODAN[end] + 'ました');
  return s;
}

// テスター向けの「新機能」を決める（Play の上限 500 字）
//   input：Run workflow の入力欄（「\n」と書くと改行）
//   file：android/whatsnew/whatsnew-ja-JP の中身、fileChanged：前回のビルドから書き換えたか
//   subjects：前回のビルドからのコミットの件名（新しい順）
export function releaseNotes({ input = '', file = '', fileChanged = false, subjects = [] }) {
  const typed = input.replace(/\\n/g, '\n').trim();
  if (typed) return { text: checkNotes(typed, '入力欄の新機能'), source: '入力欄' };
  if (fileChanged && file.trim()) return { text: checkNotes(file.trim(), 'android/whatsnew/whatsnew-ja-JP'), source: 'android/whatsnew/whatsnew-ja-JP' };
  // どちらも無ければコミットの件名を並べる。入りきらない分は「ほか N 件」にまとめる
  const lines = [...new Set(subjects.map(cleanSubject).filter(Boolean).map(politeSubject))].map(s => '・' + s);
  if (!lines.length) return { text: '細かな修正をしました。', source: '既定の文' };
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const rest = lines.length - i - 1;
    const tail = rest ? `\nほか ${rest} 件の修正` : '';
    const next = [...out, lines[i]].join('\n');
    if (next.length + tail.length > LIMITS.notes) {
      out.push(`ほか ${lines.length - i} 件の修正`);
      break;
    }
    out.push(lines[i]);
  }
  let text = out.join('\n');
  if (text.length > LIMITS.notes) text = text.slice(0, LIMITS.notes - 1) + '…';
  return { text, source: 'コミットの件名' };
}

function checkNotes(text, where) {
  if (text.length > LIMITS.notes) throw new Error(`${where}が ${text.length} 字あります。Play の上限は ${LIMITS.notes} 字です`);
  return text;
}

// STORE.md の読み方（はんぶんこの形）：「## 店」の下の「### 項目（上限）」の直後にある ```text ブロックが中身
export function storeFields(md) {
  const out = {};
  let shop = '', field = '';
  const lines = md.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('## ')) { shop = l.slice(3).replace(/（.*$/, '').trim(); field = ''; }
    else if (l.startsWith('### ')) field = l.slice(4).replace(/（.*$/, '').trim();
    else if (l.trim() === '```text' && field) {
      const body = [];
      for (i++; i < lines.length && lines[i].trim() !== '```'; i++) body.push(lines[i]);
      out[`${shop}/${field}`] = body.join('\n').trim();
      field = '';
    }
  }
  return out;
}

// STORE.md から Play の掲載文（アプリ名・短い説明・詳しい説明）を取り出して長さを確かめる
export function storeListing(md) {
  const f = storeFields(md);
  const pick = (field, key) => {
    const v = f[`Google Play/${field}`];
    if (!v) throw new Error(`STORE.md の「## Google Play」に「### ${field}」と、その下の \`\`\`text ブロックがありません`);
    const n = [...v].length;
    if (n > LIMITS[key]) throw new Error(`STORE.md の${field}が ${n} 字あります。Play の上限は ${LIMITS[key]} 字です`);
    return v;
  };
  const listing = { title: pick('アプリ名', 'title'), short: pick('短い説明', 'short'), full: pick('詳しい説明', 'full') };
  if (listing.title.includes('\n') || listing.short.includes('\n')) throw new Error('STORE.md のアプリ名と短い説明は1行にしてください');
  return listing;
}

// サービスアカウントの鍵（JSON）が形として正しいか。中身は表に出さない
export function checkServiceAccount(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error('PLAY_SERVICE_ACCOUNT_JSON が JSON として読めません。ダウンロードした .json ファイルの中身を丸ごと貼ってください'); }
  if (j.type !== 'service_account') throw new Error('PLAY_SERVICE_ACCOUNT_JSON がサービスアカウントの鍵ではありません（"type": "service_account" がない）');
  if (!j.client_email || !j.private_key) throw new Error('PLAY_SERVICE_ACCOUNT_JSON に client_email か private_key がありません。鍵を作り直して貼り直してください');
  return { email: j.client_email };
}
