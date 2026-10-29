# CLAUDE.md

パートナー向けの2人用共有アプリ「はんぶんこ」。完成した情報を送り合うのではなく、半分だけ渡して残りを相手や会話が埋める。素の HTML/CSS/JS（ビルドなし・ライブラリなし）で作り、あとで Capacitor で Android アプリにする（メタボリック・バースト tenmusu10/metabo-burst と同じ作り方）。コンセプト文書：https://claude.ai/artifact/CJKbUFWYKJD91YpZbtE9Ep

## 反束縛の原則（いちばん大事）

この6つに反する機能は、頼まれても作らずに相談する。迷ったら「仲が悪いときに相手を責める材料になるか？」を問い、なるなら作らない。

1. 監視できない：位置共有・既読・オンライン表示・最終ログイン時刻・「入力中」を作らない。保存するのは作った日（day）だけで、時刻は持たない
2. 強制しない：報告義務・連続記録（ストリーク）・「相手が未回答」の催促通知を作らない。通知は1日最大1回のまとめだけ
3. 比較しない：投稿数・家事量のスコア、ランキング、どちらが多いかのグラフを作らない
4. 消せる・隠せる：自分の投稿はいつでも消せる。消したことは相手に知らせない
5. ひとりで抜けられる：休憩と退会はひとりで即時にできる。理由は聞かない
6. 片側だけ強くならない：管理者権限や、相手の設定を変える機能を作らない。課金で2人の間に権限差を作らない

`scripts/release-check.mjs` がこの一部（位置・既読・解析 SDK・ストリーク・管理者）を機械的に見ていて、引っかかると CI が止まる。どうしても必要な行は、理由と `release-check: ok` を同じ行に書く（安易に使わない）。

## どこに何があるか

| ファイル | 担当 |
|---|---|
| `index.html` / `style.css` | 画面（タブ3つ）と見た目 |
| `fonts/` / `tools/make-fonts.py` | 同梱のフォント（Zen Maru Gothic、OFL）。本文は JIS 第1・第2水準まで、太字は画面の字だけ |
| `js/config.js` | 設定値（`SHOW_TEST`、予定・苦労・写真を残す日数） |
| `js/store.js` | データの置き場所。「この端末の中だけ（試作）」と「Firebase」を同じ形で扱う |
| `js/kakera.js` | 今日のかけら：［］の中や写真をぼかして渡す → 相手が想像で一言 → 渡した側が答え合わせ |
| `js/yotei.js` | 半分の予定：いつ・どこで・なにするの一部だけ置き、残りは相手だけが埋める。埋まらなければ消える |
| `js/kurou.js` | 見えない苦労：一文だけ渡し、相手は「ありがとう」だけ返す。数えない |
| `js/app.js` | 最初の画面（ペアづくり）とタブの切り替え・ひと休み（この端末だけの印。相手にもサーバーにも伝えない）・解消・試作用の視点切り替え |
| `js/crypto.js` | 端末側の暗号化（AES-GCM）と招待コード（`<ペアID>.<鍵>`）。鍵はサーバーに置かない |
| `js/remote.js` | Firebase：匿名ログイン・ペアを作る/入る/抜ける・暗号化した中身の同期。SDK は使うときだけ gstatic から読む |
| `js/firebase-config.js` | Firebase のウェブ設定（公開用の値）と SDK の版、ウェブ版の通知の公開鍵 `FIREBASE_VAPID` |
| `js/notify.js` / `sw.js` | まとめ通知のオン/オフ（アプリ版は @capacitor/push-notifications、ウェブ版は Web Push）/ ウェブ版の通知を出すサービスワーカー |
| `tools/digest.mjs` / `.github/workflows/digest.yml` | 1日1回のまとめ通知を送る（毎晩 21:00 JST、相手から新しく届いたものがある人にだけ決まった一文）。手順は [APP.md](APP.md) |
| `firestore.rules` | 2人だけが読み書き・作った人は c、相手は r だけ・自分のものだけ消せる・自分だけ抜けられる・通知の宛先は本人だけが置けて誰も読めない |
| `tests/rules.test.mjs` / `tools/pair-test.js` | ルールのテスト / 2つのブラウザで招待→ペア→やり取り→解消（どちらもエミュレータ） |
| `scripts/release-check.mjs` | 反束縛チェック |
| `capacitor.config.json` / `android/` / `scripts/build-www.mjs` | Android アプリ（Capacitor）。`www/` は生成物。手順は [APP.md](APP.md) |
| `tools/play/` / `.github/workflows/android.yml`・`play-listing.yml`・`android-check.yml` | Play への自動アップロード・掲載情報の反映・Android のコンパイル確認（metabo-burst から流用） |
| `tools/secret-check.mjs` | 秘密ファイル（署名鍵・サービスアカウント・google-services.json・.env）のうっかりコミットを止める |
| `.claude/hooks/guard.mjs` | Claude の main への直接 push・force push・チェックが緑でない PR のマージを止めるフック |
| `tools/smoke.js` | スモークテスト（Playwright で3機能を2人の視点で動かす） |

## 確かめ方

```
npm run check   # 反束縛チェック
npm run secret:check  # 秘密ファイルチェック
npm test        # 上の2つと guard フックのテスト
npm run play:test  # Play リリースの下準備のテスト
npm run smoke   # スモークテスト（Playwright が必要。クラウド環境では /opt/node-tools/node_modules にある）
npm run rules:test  # Firestore ルールのテスト（firebase-tools・@firebase/rules-unit-testing・firebase と Java 21）
npm run pair:test   # 2つのブラウザでの通しテスト（上と同じ道具＋Playwright）
```

- firebase-tools などは package.json に入れず、CI では `npm i --no-save`（版は ci.yml の env と `FIREBASE_SDK`）
- versionCode は `android-vc-N` タグが正。build.gradle の versionCode を手で上げない。アプリに入らない置き場所を増やしたら `tools/play/prepare.mjs` の `NOT_APP` にも足す
- エミュレータの中身は本番と同じ projectId の下に入る（本物の Firebase にはつながない）
- `firestore.rules` を変えたら、Firebase コンソールの「Firestore → ルール」に貼って「公開」する（自動反映はまだ）

- 画面に新しい字（とくに太字の見出し・ボタン）を出したら `npm run fonts` でフォントを作り直す（元の TTF は `fontsrc/` に Google Fonts の ZenMaruGothic-Regular/Bold.ttf を置く。コミットしない）。CI の `npm run fonts:check` が足りない字を見つけると止まる

機能を足したら smoke にも足す。見た目の変更はスクリーンショットを撮って PR かスレッドに載せる。

## PR・ブランチ

- ブランチは `claude/<内容を英語で短く>`。1つの話題につき1本の PR
- PR のタイトルは日本語で「使う2人から見て何がどう変わるか」。本文は `.github/pull_request_template.md` の5つの見出し
- マージは kazuki が「マージ」と言ってから（squash だけ使う）
- `.claude/hooks/guard.mjs`（PreToolUse）が、main への直接 push・force push・「チェック」の check と firebase が緑でない PR のマージを止める。止められたら回避せず、理由に従う
- 公開リポジトリなので、google-services.json・サービスアカウントの鍵・.env はコミットしない（GitHub の Secrets に入れる）

## これからの予定

- Firebase は無料の Spark プランのまま使う：写真は小さく圧縮して Firestore に直接入れる（Cloud Storage は使わない）。1日1回のまとめ通知は GitHub Actions の定時実行（digest.yml）から FCM で送る（Cloud Functions は使わない）
- まとめ通知の文は「相手から届いたものがあります」の一文だけ。数・中身・「返事がまだ」を書かない。返事（r）は届いた日が分からないので通知しない（時刻を持たないため）
- 匿名ログインの「自動クリーンアップ」はオフのまま（オンにすると30日で匿名アカウントが消えてペアが切れる）
- サーバーに平文で残るのは、ペアの members（匿名 UID）と作った日、中身の kind・by（匿名 UID）・day、通知をオンにした人の端末トークン（t）と、もうお知らせした相手の投稿の ID（sent、昨日・今日の分だけ）だけ。プライバシーポリシーの説明と合わせる
- Android 化と Play のリリース自動化は入れた（APP.md）。残りは Secrets の登録・Play Console でのアプリ作成と最初の手動アップロード・アイコンと起動画面
- 将来の有料候補は「かけらの写真を長く残す」だけ。`KAKERA_PHOTO_DAYS` で日数を変えられるようにしてある
