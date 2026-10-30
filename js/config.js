// 試作用の表示（視点の切り替え）。公開用ビルドでは false にする
const SHOW_TEST = true;
// 半分の予定が（埋まっても埋まらなくても）消えるまでの日数
const YOTEI_DAYS = 14;
// ひとりごと（見えない苦労）を見せる日数（数えない・ためないため、古いものは消える）
const KUROU_DAYS = 30;
// 今日のかけらの写真を残す日数（過ぎると写真だけ消え、一言は残る）。長く残す機能を将来つけるときはここを変える
const KAKERA_PHOTO_DAYS = 7;
// アプリ版でまとめ通知を使えるか。android/app/google-services.json があるときだけ scripts/build-www.mjs が true にする（無いまま通知を登録するとアプリが落ちる）
const NATIVE_PUSH = false;
const $ = id => document.getElementById(id);
