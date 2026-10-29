// Firebase のウェブアプリ設定。アプリに埋め込む前提の公開用の値（守りは firestore.rules と端末側の暗号化で行う）
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCZp882k7vka3eBkg1XZkVBwBsHGAtfYBA',
  authDomain: 'hanbunko-dba56.firebaseapp.com',
  projectId: 'hanbunko-dba56',
  storageBucket: 'hanbunko-dba56.firebasestorage.app',
  messagingSenderId: '889736941917',
  appId: '1:889736941917:web:f0f76454e223fce56798b4',
};
// SDK の版（新しい版で急に壊れないよう固定）
const FIREBASE_SDK = '12.19.0';
// ウェブ版のまとめ通知に使う公開鍵（Firebase コンソール → プロジェクトの設定 → Cloud Messaging → ウェブプッシュ証明書）。空のあいだ、ウェブ版では通知の設定を出さない
const FIREBASE_VAPID = 'BOcM6u8sBkZ-oQUnaHyHdh1OKvRwjME5qRw2drZnfXUqn0HXcExrqxhZpB-goo8fKkaKVaFZRLnE71g9bjYhpVM';
