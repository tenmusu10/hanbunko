// GitHub Actions から呼ぶ Play リリースの下準備。結果は $GITHUB_OUTPUT と $GITHUB_STEP_SUMMARY に書く
//   node tools/play/prepare.mjs version <前回の versionCode か空>   build.gradle の番号を決めて書き換える（コミットはしない）
//   node tools/play/prepare.mjs notes <出力フォルダ> <前回の versionCode か空>   新機能の文を whatsnew-ja-JP に書く
//   node tools/play/prepare.mjs listing <出力フォルダ> [--images]   STORE.md と store/ から fastlane supply 用のフォルダを作る
//   node tools/play/prepare.mjs check-key   環境変数 PLAY_SERVICE_ACCOUNT_JSON の形を確かめる
//   node tools/play/prepare.mjs changed <前回の versionCode か空>   前回のビルドからアプリに関係する変更があるか（毎日の自動実行用）
// metabo-burst の tools/play/prepare.mjs から流用（掲載文の読み方・画像の置き場所・数えないパスをはんぶんこに合わせた）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readGradleVersion, writeGradleVersion, nextVersion, releaseNotes, storeListing, checkServiceAccount } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GRADLE = path.join(ROOT, 'android/app/build.gradle');
const NOTES_FILE = 'android/whatsnew/whatsnew-ja-JP';
const PACKAGE = 'io.github.tenmusu10.hanbunko';

const output = (k, v) => process.env.GITHUB_OUTPUT && fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
const summary = s => { console.log(s); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + '\n'); };
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
// アプリに入らない変更（CI・説明書き・紹介ページ・ストア画像・開発用の道具・テスト・Firestore のルール。scripts/ は www/ の作り方を変えることがあるので数える）。新機能の文にも、毎日の自動実行の判定にも数えない。
// firestore.rules はアプリに入らず、Firebase コンソールで公開するものなので数えない
const NOT_APP = [':(exclude).github', ':(exclude).claude', ':(exclude).gitignore', ':(exclude)*.md', ':(exclude)site', ':(exclude)store', ':(exclude)tools', ':(exclude)tests', ':(exclude)firestore.rules', ':(exclude)firebase.json', ':(exclude)android/whatsnew'];
const NOT_NOTES = [...NOT_APP, ':(exclude)package.json', ':(exclude)package-lock.json'];
const lastTagOf = s => (/^\d+$/.test(s ?? '') ? Number(s) : null);

function version([last]) {
  const src = fs.readFileSync(GRADLE, 'utf8');
  const v = nextVersion({ gradle: readGradleVersion(src), lastTag: lastTagOf(last), nameOverride: process.env.VERSION_NAME || '' });
  fs.writeFileSync(GRADLE, writeGradleVersion(src, v));
  if (readGradleVersion(fs.readFileSync(GRADLE, 'utf8')).code !== v.code) throw new Error('build.gradle の書き換えに失敗しました');
  output('code', v.code);
  output('name', v.name);
  summary(`versionCode **${v.code}** / versionName **${v.name}**${v.bumped ? '（前回の番号から自動で上げました）' : ''}`);
}

const tagExists = tag => {
  if (!tag) return false;
  try { git('rev-parse', '--verify', '--quiet', `${tag}^{commit}`); return true; } catch { return false; }
};

function notes([dir, last]) {
  const tag = lastTagOf(last) != null ? `android-vc-${last}` : null;
  const hasTag = tagExists(tag);
  const file = fs.existsSync(path.join(ROOT, NOTES_FILE)) ? fs.readFileSync(path.join(ROOT, NOTES_FILE), 'utf8') : '';
  // ファイルを前回のビルドから書き換えていなければ古い文とみなす
  const fileChanged = hasTag ? git('diff', '--name-only', tag, 'HEAD', '--', NOTES_FILE).trim() !== '' : false;
  const range = hasTag ? [`${tag}..HEAD`] : ['-n', '10'];
  const subjects = git('log', '--no-merges', '--format=%s', ...range, '--', '.', ...NOT_NOTES)
    .split('\n').filter(Boolean);
  const { text, source } = releaseNotes({ input: process.env.RELEASE_NOTES || '', file, fileChanged, subjects });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'whatsnew-ja-JP'), text + '\n');
  summary(`### テスター向けの新機能（${source}・${text.length}/500 字）\n\n${text.split('\n').map(l => '> ' + l).join('\n')}\n`);
}

// fastlane supply のフォルダ構成：<dir>/ja-JP/{title,short_description,full_description}.txt と images/
function listing([dir, flag]) {
  const l = storeListing(fs.readFileSync(path.join(ROOT, 'STORE.md'), 'utf8'));
  const lang = path.join(dir, 'ja-JP');
  fs.mkdirSync(lang, { recursive: true });
  fs.writeFileSync(path.join(lang, 'title.txt'), l.title);
  fs.writeFileSync(path.join(lang, 'short_description.txt'), l.short);
  fs.writeFileSync(path.join(lang, 'full_description.txt'), l.full);
  summary(`### 掲載文\n\n- アプリ名：${l.title}（${[...l.title].length}/30）\n- 短い説明：${l.short}（${[...l.short].length}/80）\n- 詳しい説明：${[...l.full].length}/4000 字`);
  if (flag !== '--images') return;
  // スクショは tools/make-store.mjs が作る store/screenshots/NN-<場面>.png（番号順）
  const sdir = path.join(ROOT, 'store/screenshots');
  const shots = fs.existsSync(sdir) ? fs.readdirSync(sdir).filter(f => /^\d+-.*\.png$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b)) : [];
  if (shots.length < 2 || shots.length > 8) throw new Error(`store/screenshots/ のスクリーンショットが ${shots.length} 枚です（Play は 2〜8 枚）`);
  const img = path.join(lang, 'images');
  fs.mkdirSync(path.join(img, 'phoneScreenshots'), { recursive: true });
  shots.forEach((f, i) => fs.copyFileSync(path.join(sdir, f), path.join(img, 'phoneScreenshots', `${i + 1}_${f}`)));
  fs.copyFileSync(path.join(ROOT, 'store/feature.png'), path.join(img, 'featureGraphic.png'));
  // ストア用アイコン（512×512）はあれば上げる。無ければ Play Console に今あるものを残す
  const icon = path.join(ROOT, 'store/icon-512.png');
  if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(img, 'icon.png'));
  summary(`- 画像：スクリーンショット ${shots.length} 枚・フィーチャーグラフィック${fs.existsSync(icon) ? '・アイコン' : '（store/icon-512.png が無いのでアイコンは変えない）'}`);
}

function checkKey() {
  const json = process.env.PLAY_SERVICE_ACCOUNT_JSON || '';
  if (!json.trim()) throw new Error('Secrets に PLAY_SERVICE_ACCOUNT_JSON がありません。APP.md の「最初に1回だけ」の手順で登録してください（aab は Artifacts からダウンロードできます）');
  const { email } = checkServiceAccount(json);
  summary(`Play に上げるアカウント：\`${email}\`（Play Console の「ユーザーと権限」に招待されている必要があります）`);
  output('package', PACKAGE);
}

// 前回のビルド（タグ）からアプリに関係する変更が無ければ changed=false。タグが見つからなければ念のため true
function changed([last]) {
  const tag = lastTagOf(last) != null ? `android-vc-${last}` : null;
  const files = tagExists(tag) ? git('diff', '--name-only', tag, 'HEAD', '--', '.', ...NOT_APP).trim() : 'タグなし';
  output('changed', files ? 'true' : 'false');
  summary(files ? `前回（${tag ?? 'なし'}）からアプリの変更があります：\n\n${files.split('\n').slice(0, 20).map(f => '- ' + f).join('\n')}` : `前回（${tag}）からアプリの変更が無いので、今日は上げません`);
}

const [cmd, ...args] = process.argv.slice(2);
const cmds = { version, notes, listing, 'check-key': checkKey, changed };
try {
  if (!cmds[cmd]) throw new Error(`使い方：node tools/play/prepare.mjs ${Object.keys(cmds).join('|')}`);
  cmds[cmd](args);
} catch (e) {
  console.log(`::error::${e.message}`);
  process.exit(1);
}
