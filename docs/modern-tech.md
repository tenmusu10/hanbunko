# いまのスマホアプリの技術と、ふたりごとへの取り入れ方（2026-10-30 調べ）

ふたりごとは「派手にしない・音を出さない・相手を見張る材料を作らない」アプリなので、新しい技術も「静かに効くか」「反束縛の原則（CLAUDE.md）に触れないか」「手間」の3つで選んだ。

- 合う：◎ そのまま合う / ○ 使い方しだい / × 合わない
- 手間：小（数行）/ 中（数十行・1日）/ 大（ネイティブや仕組みの追加）

## 一覧

| # | 技術 | 何がうれしいか | 合う | 手間 | どうするか |
|---|---|---|---|---|---|
| 1 | Android の端から端まで表示（edge-to-edge）と Capacitor 8 の `--safe-area-inset-*` | targetSdk 35 以降は必ず端から端まで描かれる。古い WebView（Chromium 140 より前）は `env(safe-area-inset-*)` が正しくないので、下のタブがジェスチャーバーに重なりうる | ◎ | 小 | **取り入れた**：`var(--safe-area-inset-*, env(...))` の順に読む |
| 2 | 日本語の文節で折り返す `word-break: auto-phrase` | 「ありがと／う」のような変な改行が減り、短い一文が読みやすい。`lang="ja"` が要る。Chrome 119 以降（ほかのブラウザは今まで通り） | ◎ | 小 | **取り入れた**：文・ヒント・見出し・ラベル |
| 3 | `text-wrap: pretty` | 段落の最後の行に1字だけ残るのを避ける。効かないブラウザでは今まで通り | ◎ | 小 | **取り入れた**（2 と同じ行） |
| 4 | 触覚フィードバック（ハプティクス） | 渡した・返したときに指先にごく短い手ごたえ。目で見なくても「届けた」と分かる | ○ | 小 | **取り入れた**：`navigator.vibrate(8)` を1回だけ。Android は VIBRATE 権限（聞かれない）。iPhone の Safari は振動 API が無いので何もしない。見え方の「渡したときの手ごたえ」で「なし」にできる。動かさない設定のときも鳴らさない |
| 5 | View Transitions（画面の切り替えを1行でなめらかに） | タブの切り替えや答え合わせで、紙がそのまま移るように見せられる。同じ画面内は Chrome 111・Safari 18・Firefox 144 で使え、効かなければ今まで通り | ○ | 中 | 動き・見た目の設定スレッドに渡す（演出はそちらでまとめる）。使うときは動きを減らす設定で止める |
| 6 | ばねのような動き（CSS の `linear()` イージング） | 花が咲く・紙が置かれる動きが「物っぽく」なる。Chrome 113・Firefox 112・Safari 17.2。JS のライブラリは要らない | ○ | 小 | 同上。跳ねすぎない曲線にし、`opacity` には使わない（ちらつく） |
| 7 | `@starting-style`（出てくるときの動きを CSS だけで） | 今は JS でクラスを付けている「出てくる」動きを CSS だけで書ける | ○ | 小 | 同上。今の作りで困っていないので急がない |
| 8 | 予測型の「戻る」（Android 16 は targetSdk 36 で既定でオン） | 戻るジェスチャーの途中でホームが見える。アプリ側で戻るを横取りしていなければ何もしなくてよい | ◎ | なし | 今は横取りしていない（@capacitor/app を入れていない）ので、そのまま。見本や設定を「戻る」で閉じたくなったら @capacitor/app を入れて考える。**実機で未確認** |
| 9 | テーマアイコン（Android 13 のモノクロアイコン） | ホームの色に合わせたアイコン | ◎ | なし | 入っている（`ic_launcher_monochrome`） |
| 10 | システムの写真選び（Android 13 以降の Photo Picker） | 写真全部を見る権限なしで、選んだ1枚だけ渡せる | ◎ | なし | 写真の権限を求めていない（`<input type=file>` だけ）。今のままでよい |
| 11 | iPhone のウェブでの振動の裏技（`<input type=checkbox switch>` を押させる） | Safari でも振動を出せる | × | 小 | 取り入れない：正式な API ではなく、いつ止まるか分からない |
| 12 | ホーム画面ウィジェット／ロック画面のライブ表示 | 開かなくても様子が分かる | × | 大 | 取り入れない：「相手が何かした」をいつでも見られる＝見張る道具になる（原則1・2）。通知は1日1回のまとめだけ |
| 13 | Material You（壁紙から色を取る） | 端末になじむ | × | 中 | 取り入れない：柿＝自分・藍＝相手という色の意味が崩れる |
| 14 | 端末の中で動く AI（Gemini Nano・Chrome の組み込み AI） | かけらで隠す言葉の候補、ひとりごとの言い換えなど | × | 大 | 今は取り入れない：「AIらしさを消す」方針と、2人の言葉を2人で埋めるという考えに合わない。中身を外に出さない点は良いので、要望が出たら考える |
| 15 | パスキー | パスワードなしのログイン | × | 中 | 不要：匿名ログイン＋招待コードで、覚えるものが無い |
| 16 | スクロールに合わせて動く演出（scroll-driven animations） | スクロールで見出しが縮むなど | × | 小 | 取り入れない：にぎやかになり、静かな画面に合わない |

## 取り入れたもの（この PR）

- `style.css`：`body` と下のタブの余白を `var(--safe-area-inset-top|bottom, env(...))` に。文・ヒント・見出し・ラベルに `word-break: auto-phrase; text-wrap: pretty`
- `index.html`：見え方に「渡したときの手ごたえ」（小さくふるえる／なし）
- `js/app.js`：`App.tap()`（8ms の振動を1回。見え方の haptic が off か、動かさないときは鳴らさない）。返したとき（`App.sent`）と、かけら・予定・ひとりごとを置いたときに呼ぶ
- `android/app/src/main/AndroidManifest.xml`：`VIBRATE`（インストール時の権限で、使う人には聞かれない）
- `tools/smoke.js`：上の3つのテスト

## 出典

- Capacitor：SystemBars（`insetsHandling`・`--safe-area-inset-*`・WebView 140 より前の不具合）https://capacitorjs.com/docs/apis/system-bars
- Capacitor 8 への更新（targetSdk 36・`adjustMarginsForEdgeToEdge` の廃止）https://capacitorjs.com/docs/updating/8-0
- Capawesome：Capacitor の edge-to-edge と safe area の手引き https://capawesome.io/blog/capacitor-edge-to-edge-and-safe-areas-guide/
- Android 16 の動作変更（edge-to-edge の除外が廃止・予測型の戻る）https://developer.android.com/about/versions/16/behavior-changes-16
- Chrome：CSS の国際化の新機能（`word-break: auto-phrase`、Chrome 119、`lang="ja"` が必要）https://developer.chrome.com/blog/css-i18n-features?hl=ja
- Chrome：View Transitions の 2025 年の状況（Safari 18・Firefox 144）https://developer.chrome.com/blog/view-transitions-in-2025
- Chrome：`linear()` イージング https://developer.chrome.com/docs/css-ui/css-linear-easing-function ／ 物理っぽいイージングの指針 https://developer.chrome.com/docs/modern-web-guidance/guides/ui-behaviors/physics-based-easing
- `@starting-style` の対応状況 https://web-platform-dx.github.io/web-features-explorer/features/starting-style/
- Capacitor Haptics（入れるならこちら。今回は追加の部品を増やさず `navigator.vibrate` にした）https://capacitorjs.com/docs/apis/haptics
- iPhone の Safari での振動の裏技（取り入れない理由の確認）https://azukiazusa.dev/blog/ios-safari-web-haptics
