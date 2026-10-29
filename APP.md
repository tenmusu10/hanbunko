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
- Android Studio を使わずコマンドで debug 版を作るとき（Windows）：`cd android` → `set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` → `set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk` → `gradlew.bat assembleDebug`。できた `android/app/build/outputs/apk/debug/app-debug.apk` を `adb install -r` で入れる。`ANDROID_HOME` が無いと「SDK location not found」で止まる（`android/local.properties` に `sdk.dir` を書いてもよい。コミットしない）
- Firebase の SDK はこれまでどおり使うときに gstatic から読みます。アプリの中の画面は `https://localhost` から開かれ、`localhost` は Firebase Authentication の承認済みドメインに最初から入っているので、追加の設定はいりません
- バックアップ（Google ドライブ・機種移行）はオフにしてあります（`AndroidManifest.xml` の `allowBackup="false"` と `res/xml/data_extraction_rules.xml`）。暗号鍵は端末の中にだけ置くと約束しているためで、オンに戻すとプライバシーポリシーと食い違います
- アイコンと起動画面は `icon.svg` から `npm run icons` で作ります（`tools/make-icons.mjs`。ランチャー用・丸・アダプティブ・テーマ別のモノクロ・起動画面・Play 掲載用の `store/icon-512.png`）。icon.svg を変えたらこれを実行してコミットする
- `npm run ready` で、アイコン・掲載画像・掲載文・プライバシーポリシーがそろっているかを確かめられます（CI でも毎回動く）

## GitHub Actions で aab を作り、Play に上げる

**ふだんの手順**：Actions →「Android aab → Play」→「Run workflow」。10分ほどで内部テストに上がります（`.github/workflows/android.yml`）。入力欄でクローズドテスト（alpha）・下書き・aab を作るだけ、も選べます。本番には上げられません（鍵にその権限を渡さない）。

**毎日の自動実行**：毎日 21:00（日本時間）に、前回のビルドからアプリの変更があるときだけ内部テストに上げます。CI・説明書き（*.md）・紹介ページ（site/）・store/ の画像・tools/・tests/・firestore.rules だけの変更では動きません（`tools/play/prepare.mjs` の `NOT_APP`）。`PLAY_SERVICE_ACCOUNT_JSON` を登録するまでは毎晩何もしません。

- `versionCode` は前回作った番号（`android-vc-<番号>` タグ）の次へ自動で上がり、`versionName` の最後の数字も同じだけ上がります（0.1.0 → 0.1.1）。build.gradle は手で上げません
- テスター向けの「新機能」は、入力欄 → `android/whatsnew/whatsnew-ja-JP`（前回から書き換えた場合）→ 前回からのコミットの件名（「〜する」は「〜しました」に直す）の順に使います
- aab は毎回 Artifacts に残ります

**ストアの掲載情報**：Actions →「Play の掲載情報を更新」で、`STORE.md` の「## Google Play」の文を Play に反映します（`.github/workflows/play-listing.yml`）。「images」にチェックすると `store/screenshots/` のスクショ（番号順に全部入れ替え）・`store/feature.png`・あれば `store/icon-512.png` も上げます。「確かめるだけ」で試せます。Play Console で直接直した文は、次に実行したとき STORE.md の内容に戻ります。

## 人がやること（上から順に）

コードで済むことは済ませてあり、残りは鍵・Secrets・コンソールの操作だけです。上から順にやれば、内部テストで実機に入るところまで行きます。済んだものは飛ばしてください。

### A. Firebase コンソール（[hanbunko-dba56](https://console.firebase.google.com/project/hanbunko-dba56)）

1. ~~**Authentication → 設定 → 承認済みドメイン** に `tenmusu10.github.io` を足す~~（2026-10-26 済み。ウェブ版でペアを作るため。Android アプリは `localhost` なので不要）
2. ~~匿名アカウントの自動クリーンアップがオフかを確かめる~~（2026-10-29 確認済み。この設定は Identity Platform にアップグレードしたプロジェクトにしか出てこないので、Authentication → 設定に無ければオフのまま。アップグレードしたらオフにする。オンだと30日でペアが切れる）
3. ~~**まとめ通知を送るサービスアカウント**を作り、Secrets の `FIREBASE_SA_JSON` に貼る~~（2026-10-29 済み。手順は下の「1日1回のまとめ通知」の 1）
4. ~~**Android アプリを Firebase に追加**し、`google-services.json` の中身を Secrets の `GOOGLE_SERVICES_JSON` に貼る~~（2026-10-29 済み。同じく 2。無いと aab に通知が入らない）
5. ~~**ウェブプッシュ証明書の鍵ペアを生成**し、公開鍵をスレッドに貼る~~（2026-10-29 済み。同じく 3。Claude が `js/firebase-config.js` の `FIREBASE_VAPID` に入れる。公開してよい値）
6. ~~**ルールを出す**：3 の鍵を登録したら Actions →「ルールを出す」→「Run workflow」を1回押す~~（2026-10-29 済み。以降は main で `firestore.rules` が変わるたびに自動）
7. ~~Actions →「まとめ通知」を「送らずに件数だけ見る」のまま実行し、エラーが出ないのを確かめる~~（2026-10-29 済み）

### B. アップロード鍵と Secrets（パソコンと GitHub）

8. **アップロード鍵を作る**：`keytool -genkeypair -v -keystore hanbunko.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`。hanbunko.jks とパスワードはリポジトリの外に保管する（`tools/secret-check.mjs` がコミットを止めます）。なくすと Play での鍵のリセット申請が要る
9. **Secrets を登録する**（[Settings → Secrets and variables → Actions](https://github.com/tenmusu10/hanbunko/settings/secrets/actions)）
   - `ANDROID_KEYSTORE_BASE64`：hanbunko.jks を base64 にした文字列（Windows の PowerShell なら `[Convert]::ToBase64String([IO.File]::ReadAllBytes("hanbunko.jks")) | Set-Clipboard`）
   - `ANDROID_KEYSTORE_PASSWORD`／`ANDROID_KEY_PASSWORD`：鍵のパスワード
   - `ANDROID_KEY_ALIAS`：`upload`
10. Actions →「Android aab → Play」→ どこに上げるか「**上げない（aab を作るだけ）**」で実行し、Artifacts から aab を落とす

### C. Play Console でアプリを作り、最初の aab を手で上げる

11. **アプリを作成**：アプリ名「はんぶんこ」、言語 日本語、アプリ、無料。パッケージ名は最初の aab で `io.github.tenmusu10.hanbunko` に決まる
12. **テスト → 内部テスト** でリリースを作り、10 の aab を手で上げる（Play アプリ署名はオンのまま）。テスターに自分の Google アカウントを入れ、表示される参加 URL を実機で開いてインストール
13. **「アプリのコンテンツ」に答える**（下の「Play Console に入れる答え」をそのまま写す）

### D. 自動アップロード用のサービスアカウント

14. **サービスアカウントを作る**（metabo-burst のものは使い回さず、はんぶんこ用に別に作る。漏れたときに両方止まらないように）
    1. [Google Cloud コンソール](https://console.cloud.google.com/)でプロジェクトを選ぶ（Firebase の hanbunko-dba56 とは分けて、例 `hanbunko-release` を新しく作るのがおすすめ）
    2. 「API とサービス」→「ライブラリ」で **Google Play Android Developer API** を有効にする
    3. 「IAM と管理」→「サービス アカウント」→ 作成（名前は `play-release` など、ロールは付けない）→「鍵」→ JSON を作り、中身を Secrets の `PLAY_SERVICE_ACCOUNT_JSON` に貼ってパソコンのファイルは消す
    4. Play Console →「ユーザーと権限」→ サービスアカウントのメールを招待し、このアプリだけに **アプリ情報の閲覧**・**テスト版トラックへのアプリのリリース**・**ストアでの表示の管理** を付ける。本番へのリリースや管理者の権限は付けない
15. Actions →「Play の掲載情報を更新」を「images」にチェックして実行（掲載文・スクショ・フィーチャーグラフィック・アイコンが入る）。これ以降、アプリの変更は毎晩 21:00 に内部テストへ自動で上がる

### E. 本番に出す前（個人のデベロッパー アカウントの場合）

16. 2023年11月以降に作った個人アカウントは、本番の申請前に **クローズドテスト（alpha）で12人以上が14日間続けて参加** している必要がある。試用（11/9〜11/22、10組）の参加者をクローズドテストのテスターにすると、試用と兼ねられる（Actions の入力欄で「alpha（クローズドテスト）」を選ぶ）
17. STORE.md の「出す前に事実を確かめること」を全部チェックしてから、Play Console で本番の申請をする（本番には自動では上げない）

## Play Console に入れる答え

「アプリのコンテンツ」（ポリシー → アプリのコンテンツ）の各項目。中身の根拠はプライバシーポリシー（`site/privacy.html`）と実装です。

| 項目 | 答え |
|---|---|
| プライバシー ポリシー | `https://tenmusu10.github.io/hanbunko/privacy.html` |
| 広告 | 広告を含まない |
| アプリのアクセス権 | 「一部の機能が制限されている」→ 下の説明文 |
| コンテンツのレーティング | カテゴリは「ソーシャル・コミュニケーション」（選べなければ「その他すべてのアプリ」）。暴力・性的・言葉・薬物・ギャンブルはすべて「いいえ」。ユーザー同士のやり取り「はい」（2人の間で文と写真を送り合う）、位置情報の共有「いいえ」、デジタル商品の購入「いいえ」 |
| ターゲット ユーザー | 18歳以上（子ども向けにしない。ファミリー ポリシーの対象外にするため） |
| ニュース アプリ／健康／金融／政府 | いいえ |
| データ セーフティ：収集・共有するか | はい（収集のみ。共有はしない。Firebase は委託先なので共有に当たらない） |
| 　転送時の暗号化 | はい（Firebase との通信はすべて TLS） |
| 　削除のリクエスト | はい（アプリ内の「ペアを解消する」で即時。アプリ削除後は問い合わせメール） |
| 　申告するデータ | 個人情報 → **ユーザー ID**（匿名ログインの ID）：収集する・共有しない・必須・目的は「アプリの機能」。**デバイスまたはその他の ID**（通知用の FCM トークン）：収集する・共有しない・任意（通知をオンにした人だけ）・目的は「アプリの機能」。それ以外は申告しない（投稿の文と写真は端末で暗号化し運営者は読めないため、Play の基準で対象外。位置・連絡先・診断・広告 ID は取らない） |
| アカウントの削除 | アプリ内で作れる：はい。削除の案内 URL は `https://tenmusu10.github.io/hanbunko/privacy.html#delete` |
| ストアの設定 | カテゴリ「ライフスタイル」、連絡先メール `rokomoko.ten@gmail.com`（プライバシーポリシーと同じ）、国は日本 |

アプリのアクセス権の説明文（審査の人がペアを作るため）：

```text
はんぶんこは2人でペアになって使うアプリです。ログインやパスワードはありません。
1. 1台目でアプリを開き「招待をつくる」を押すと、招待コードが表示されます（「コードを送る」でメールなどに送れます）。
2. 2台目でアプリを開き、「招待コードを貼る」欄にそのコードを貼って「ペアになる」を押すと、2台がペアになります。
3. ペアになると「今日のかけら」「半分の予定」「見えない苦労」の3つのタブが使えます。片方で置いたものを、もう片方で埋めたり返事をしたりします。
端末が1台しかない場合は、ブラウザで https://tenmusu10.github.io/hanbunko/app/ を開くと2台目の代わりになります。
```

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
