// 1日1回のまとめ通知を送る（.github/workflows/digest.yml が毎晩 21:00 JST に動かす）
// 相手から新しく届いた投稿がある人にだけ、決まった一文を1回送る。何が・いくつ届いたか・相手がまだ返していないこと、は書かない（原則2・3）
// サーバーで読めるのは kind・by・day と宛先だけ（中身は端末で暗号化済み）。ここでも by・day と宛先しか使わない
// 公開リポジトリの Actions のログは誰でも見られるので、ID やトークンは出さず件数だけを出す
// 使い方：FIREBASE_SA_JSON='<サービスアカウントの鍵の中身>' node tools/digest.mjs [--dry]（firebase-admin が必要。--dry は送らず書き込まない）
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export const TITLE = 'ふたりごと', BODY = '相手から届いたものがあります';
// 送れなくなった宛先（アプリを消した・通知を切った）。このときは宛先を消す
const GONE = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'];

// 日本の暦で [おととい, 昨日]。アプリは端末の暦で day を付け、相手のものは作った日の次の日から見せる（js/store.js）ので、今日の分はまだ届いていない
export function jstDays(now = new Date()) {
  const d = new Date(now.getTime() + 9 * 3600e3), day = () => { d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  const y = day();
  return [day(), y];
}

// 日数を過ぎたひとりごとは、ここでサーバーからも消す（作った人の端末が開かないままだと、暗号化されたまま残り続けたため。c7 の声）
// 日数はアプリと同じ js/config.js の KUROU_DAYS。端末の暦のずれを見込んで1日おまけする。使うのは平文の kind と day だけ
// 予定は消える日が暗号の中（決まった日・残す日）にあり、かけらは写真だけが消える（写真も暗号の中）ので、ここでは消さない
export const KUROU_DAYS = Number(/const KUROU_DAYS = (\d+)/.exec(readFileSync(new URL('../js/config.js', import.meta.url), 'utf8'))[1]);
export function sweepLimit(now = new Date(), days = KUROU_DAYS) {
  const d = new Date(now.getTime() + 9 * 3600e3); d.setUTCDate(d.getUTCDate() - days - 1); return d.toISOString().slice(0, 10);
}
export const toSweep = (items, limit) => items.filter(i => i.kind === 'kurou' && typeof i.day === 'string' && i.day < limit).map(i => i.id);

// 宛先ごとに送るかを決める。相手がおととい・昨日に作った投稿（今日までに届いたもの）のうち、まだお知らせしていないものがあれば送る
// （おとといも見るのは、端末の暦が日本とずれていても取りこぼさないため。sent は今回見えた ID に置き換えるので、おとといより前の ID は持ち続けない）
export function plan(members, tokens, items) {
  if (members.length !== 2) return [];
  return tokens.filter(t => members.includes(t.uid) && t.t).map(t => {
    const ids = items.filter(i => i.by !== t.uid && members.includes(i.by)).map(i => i.id).sort();
    const sent = new Set(t.sent || []);
    return { uid: t.uid, token: t.t, send: ids.some(id => !sent.has(id)), sent: ids, changed: ids.join() !== [...sent].sort().join() };
  });
}

export const message = token => ({
  token,
  notification: { title: TITLE, body: BODY },
  android: { collapseKey: 'digest', notification: { tag: 'digest' } },
  webpush: { headers: { Urgency: 'normal', TTL: String(12 * 3600) } }, // 朝まで届かなければ捨てる（まとめは次の晩にまた来る）
});

// ペアを1つずつ見て送る。send(token) は送れなければ code 付きの例外を投げる（エミュレータで試すときは差し替える）
export async function run(db, send, { days = jstDays(), dry = false, limit = sweepLimit() } = {}) {
  const n = { pairs: 0, sent: 0, gone: 0, failed: 0, swept: 0 };
  for (const pr of (await db.collection('pairs').get()).docs) {
    // 古いひとりごとを消す（通知をオンにしていないペアも）。範囲の条件は day だけにする（kind と組み合わせると複合インデックスが要る）
    const old = (await pr.ref.collection('items').where('day', '<', limit).get()).docs.map(d => ({ id: d.id, kind: d.data().kind, day: d.data().day }));
    for (const id of toSweep(old, limit)) { if (!dry) await pr.ref.collection('items').doc(id).delete(); n.swept++; }
    const members = pr.data().members || [], tokens = await pr.ref.collection('tokens').get();
    if (members.length !== 2 || tokens.empty) continue;
    n.pairs++;
    const items = (await pr.ref.collection('items').where('day', 'in', days).get()).docs.map(d => ({ id: d.id, by: d.data().by }));
    for (const p of plan(members, tokens.docs.map(d => ({ uid: d.id, ...d.data() })), items)) {
      const ref = pr.ref.collection('tokens').doc(p.uid);
      if (p.send) {
        if (dry) { n.sent++; continue; }
        try { await send(p.token); n.sent++; }
        catch (e) {
          if (GONE.includes(e.code)) { await ref.delete(); n.gone++; } else { n.failed++; console.error(`送れませんでした：${e.code || e.message}`); }
          continue;
        }
      }
      if (p.changed && !dry) await ref.update({ sent: p.sent });
    }
  }
  return n;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dry = process.argv.includes('--dry');
  if (!process.env.FIREBASE_SA_JSON) { console.log('::warning::FIREBASE_SA_JSON が無いので、まとめ通知は送りません（作り方は APP.md）'); process.exit(0); }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getMessaging } = await import('firebase-admin/messaging');
  const app = initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SA_JSON)) });
  const fcm = getMessaging(app);
  const n = await run(getFirestore(app), token => fcm.send(message(token)), { dry });
  console.log(`${dry ? '（送らずに数えただけ）' : ''}通知をオンにしているペア ${n.pairs}・送った ${n.sent}・宛先を片付けた ${n.gone}・失敗 ${n.failed}・日数を過ぎて消したひとりごと ${n.swept}`);
  if (n.failed) process.exit(1);
}
