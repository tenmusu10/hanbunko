// firestore.rules を Firebase に出す（.github/workflows/rules.yml が main への push で動かす。手でコンソールに貼らなくてよくする）
// いま出ているルールと同じなら何もしない。中身の確かめ（tests/rules.test.mjs）は PR の CI で済んでいる前提
// 使い方：FIREBASE_SA_JSON='<サービスアカウントの鍵の中身>' node tools/deploy-rules.mjs [--dry]（firebase-admin が必要。鍵には「Firebase Rules 管理者」が要る）
import { readFileSync } from 'node:fs';

const dry = process.argv.includes('--dry');
if (!process.env.FIREBASE_SA_JSON) { console.log('::warning::FIREBASE_SA_JSON が無いので、ルールは出しません（Firebase コンソールに手で貼ってください。手順は APP.md）'); process.exit(0); }
const { initializeApp, cert } = await import('firebase-admin/app');
const { getSecurityRules } = await import('firebase-admin/security-rules');
const rules = getSecurityRules(initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SA_JSON)) }));
const src = readFileSync('firestore.rules', 'utf8');
const now = await rules.getFirestoreRuleset().then(r => r.source.map(f => f.content).join(''), () => '');
if (now.trim() === src.trim()) { console.log('ルールは出ているものと同じなので、そのままにしました'); process.exit(0); }
if (dry) { console.log('（確かめるだけ）ルールが違うので、出すと置き換わります'); process.exit(0); }
const r = await rules.releaseFirestoreRulesetFromSource(src);
console.log(`ルールを出しました（${r.createTime}）`);
