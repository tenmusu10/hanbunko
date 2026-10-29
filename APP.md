# Android アプリ化と Play への配布（Capacitor）

アプリ本体（`index.html` / `style.css` / `js/`、あれば `icon.svg`）は、そのまま Android アプリに入ります。作り方と配布の自動化は metabo-burst（tenmusu10/metabo-burst の APP.md）と同じです。パッケージ名は `io.github.tenmusu10.hanbunko`（2026年10月26日に決定。Play に登録すると変えられません）。

## ふだんの手順

```
npm install
npm run sync           # www/ を作って android/ に反映（試作用の表示は残る）
npm run release        # 反束縛チェック・秘密ファイルチェックを通してから、SHOW_TEST=false の www/ を android/ に反映
npx cap open android   # Android Studio が開く（npm run android でも同じ）
```

- `www/` と `android/app/src/main/assets/public/` は生成物なのでコミットしない
- Firebase の SDK はこれまでどおり使うときに gstatic から読みます。アプリの中の画面は `https://localhost` から開かれ、`localhost` は Firebase Authentication の承認済みドメインに最初から入っているので、追加の設定はいりません
- バックアップ（Google ドライブ・機種移行）はオフにしてあります（`AndroidManifest.xml` の `allowBackup="false"` と `res/xml/data_extraction_rules.xml`）。暗号鍵は端末の中にだけ置くと約束しているためで、オンに戻すとプライバシーポリシーと食い違います
- アイコンと起動画面はまだ Capacitor の初期のままです。デザインのアイコン（`icon.svg`）が決まったら、1024px の PNG にして `npx capacitor-assets generate --android` で作ります

## GitHub Actions で aab を作り、Play に上げる

**ふだんの手順**：Actions →「Android aab → Play」→「Run workflow」。10分ほどで内部テストに上がります（`.github/workflows/android.yml`）。入力欄でクローズドテスト（alpha）・下書き・aab を作るだけ、も選べます。本番には上げられません（鍵にその権限を渡さない）。

**毎日の自動実行**：毎日 21:00（日本時間）に、前回のビルドからアプリの変更があるときだけ内部テストに上げます。CI・説明書き（*.md）・紹介ページ（site/）・store/ の画像・tools/・tests/・firestore.rules だけの変更では動きません（`tools/play/prepare.mjs` の `NOT_APP`）。`PLAY_SERVICE_ACCOUNT_JSON` を登録するまでは毎晩何もしません。

- `versionCode` は前回作った番号（`android-vc-<番号>` タグ）の次へ自動で上がり、`versionName` の最後の数字も同じだけ上がります（0.1.0 → 0.1.1）。build.gradle は手で上げません
- テスター向けの「新機能」は、入力欄 → `android/whatsnew/whatsnew-ja-JP`（前回から書き換えた場合）→ 前回からのコミットの件名（「〜する」は「〜しました」に直す）の順に使います
- aab は毎回 Artifacts に残ります

**ストアの掲載情報**：Actions →「Play の掲載情報を更新」で、`STORE.md` の「## Google Play」の文を Play に反映します（`.github/workflows/play-listing.yml`）。「images」にチェックすると `store/screenshots/` のスクショ（番号順に全部入れ替え）・`store/feature.png`・あれば `store/icon-512.png` も上げます。「確かめるだけ」で試せます。Play Console で直接直した文は、次に実行したとき STORE.md の内容に戻ります。

## 最初に1回だけ

1. **アップロード鍵を作る**（パソコンで）：`keytool -genkeypair -v -keystore hanbunko.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`。hanbunko.jks とパスワードはリポジトリの外に保管する（`tools/secret-check.mjs` がコミットを止めます）
2. **Secrets を登録する**（Settings → Secrets and variables → Actions）
   - `ANDROID_KEYSTORE_BASE64`：hanbunko.jks を base64 にした文字列（Windows の PowerShell なら `[Convert]::ToBase64String([IO.File]::ReadAllBytes("hanbunko.jks")) | Set-Clipboard`）
   - `ANDROID_KEYSTORE_PASSWORD`／`ANDROID_KEY_PASSWORD`：鍵のパスワード
   - `ANDROID_KEY_ALIAS`：`upload`
3. **Play Console でアプリを作る**：パッケージ名 `io.github.tenmusu10.hanbunko`。Play は最初の aab を画面から手で上げる必要があるので、Actions で「上げない（aab を作るだけ）」を選んで実行し、Artifacts の aab を内部テストに手で上げる（Play アプリ署名はオンのまま）
4. **サービスアカウントを作る**（metabo-burst のものは使い回さず、はんぶんこ用に別に作る。漏れたときに両方止まらないように）
   1. [Google Cloud コンソール](https://console.cloud.google.com/)でプロジェクトを選ぶ（Firebase の hanbunko-dba56 とは分けて、例 `hanbunko-release` を新しく作るのがおすすめ）
   2. 「API とサービス」→「ライブラリ」で **Google Play Android Developer API** を有効にする
   3. 「IAM と管理」→「サービス アカウント」→ 作成（名前は `play-release` など、ロールは付けない）→「鍵」→ JSON を作り、中身を Secrets の `PLAY_SERVICE_ACCOUNT_JSON` に貼ってパソコンのファイルは消す
   4. Play Console →「ユーザーと権限」→ サービスアカウントのメールを招待し、このアプリだけに **アプリ情報の閲覧**・**テスト版トラックへのアプリのリリース**（掲載情報も更新するなら **ストアでの表示の管理**）を付ける。本番へのリリースや管理者の権限は付けない

## 1日1回のまとめ通知

毎晩 21:00（日本時間）に `.github/workflows/digest.yml` が `tools/digest.mjs` を動かし、通知をオンにした人のうち、相手から新しく届いたもの（昨日・今日に作られて、まだお知らせしていないもの）がある人にだけ「相手から届いたものがあります」と送ります。何が・いくつ届いたかや「返事がまだ」は書きません。通知のオン/オフは各自がアプリの下の方で決め、相手には伝わりません。

使えるようにするには、次の3つを1回だけ登録します（どれも無いあいだは、その部分が静かに動かないだけです）。

1. **送るためのサービスアカウント**（必須）：[Google Cloud コンソール](https://console.cloud.google.com/)でプロジェクト **hanbunko-dba56** を選ぶ →「IAM と管理」→「サービス アカウント」→ 作成（名前は `digest` など）→ ロールに **Cloud Datastore ユーザー**・**Firebase Cloud Messaging API 管理者**・**Firebase Rules 管理者** の3つだけを付ける（3つ目は `firestore.rules` を自動で出すため。`.github/workflows/rules.yml`） →「鍵」→ JSON を作り、中身を GitHub の Secrets に `FIREBASE_SA_JSON` で貼って、パソコンのファイルは消す。Firebase コンソールの「サービス アカウント」で作れる鍵（firebase-adminsdk）は何でもできる強い鍵なので使わない
2. **アプリ版**：Firebase コンソール → プロジェクトの概要の「アプリを追加」→ Android → パッケージ名 `io.github.tenmusu10.hanbunko` → `google-services.json` をダウンロードし、中身を Secrets の `GOOGLE_SERVICES_JSON` に貼る（コミットしない）。次の aab から通知の設定が出ます。無いままだと通知の設定を出しません（`js/config.js` の `NATIVE_PUSH`）
3. **ウェブ版**：Firebase コンソール → プロジェクトの設定 →「Cloud Messaging」→「ウェブプッシュ証明書」→「鍵ペアを生成」→ 出てきた公開鍵を `js/firebase-config.js` の `FIREBASE_VAPID` に入れる（公開してよい値）。iPhone のウェブ版は、ホーム画面に追加したときだけ通知を受けられます

確かめ方：Actions →「まとめ通知」→「Run workflow」（最初は「送らずに件数だけ見る」のまま）。ログには件数だけが出ます。`firestore.rules` は main で変わると「ルールを出す」が自動で Firebase に出します（いま出ているものと同じなら何もしない）。鍵を登録した直後は、Actions →「ルールを出す」→「Run workflow」で一度出してください。

## うまくいかないとき

- `The caller does not have permission`：Play Console の招待・権限の反映待ち（数時間〜1日）か、「テスト版トラックへのアプリのリリース」が無い
- `Google Play Android Developer API has not been used in project …`：API を有効にしていない
- `Package not found`：Play Console でアプリを作っていないか、最初の aab を手で上げていない
- `APK specifies a version code that has already been used`：手で上げた番号とぶつかった。もう一度実行すれば次の番号になる
