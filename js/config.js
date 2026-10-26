// 試作用の表示（視点の切り替え）。公開用ビルドでは false にする
const SHOW_TEST = true;
// 半分の予定が埋まらないまま消えるまでの日数
const YOTEI_DAYS = 14;
// 見えない苦労カードを見せる日数（数えない・ためないため、古いものは消える）
const KUROU_DAYS = 30;
// 今日のかけらの写真を残す日数（過ぎると写真だけ消え、一言は残る）。長く残す機能を将来つけるときはここを変える
const KAKERA_PHOTO_DAYS = 7;
const $ = id => document.getElementById(id);
