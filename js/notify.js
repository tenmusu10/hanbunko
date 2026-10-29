// 1日1回のまとめ通知：相手から新しく届いたものがある日だけ、夜9時ごろに1回だけ（送るのは tools/digest.mjs）
// オンにするかはひとりで決める。オンにしたかどうか・通知を開いたかどうかは相手にもサーバーにも伝えない
// アプリ版は @capacitor/push-notifications、ウェブ版は Web Push（FIREBASE_VAPID があるときだけ）
const Notify = (() => {
  const KEY = 'hanbunko-notify';
  const native = () => NATIVE_PUSH && window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.PushNotifications;
  const web = () => !!FIREBASE_VAPID && location.protocol === 'https:' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const on = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const set = v => { try { if (v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) { /* 覚えられなくても続ける */ } };

  // この端末のトークンをもらう。ask が false のときは、許可をたずねずに済む場合だけ
  async function token(ask) {
    const P = native();
    if (P) {
      const perm = ask ? await P.requestPermissions() : await P.checkPermissions();
      if (perm.receive !== 'granted') throw new Error('denied');
      return new Promise((ok, ng) => {
        P.removeAllListeners().then(() => {
          P.addListener('registration', t => ok(t.value));
          P.addListener('registrationError', e => ng(new Error(e.error)));
          P.register();
        });
      });
    }
    const perm = ask ? await Notification.requestPermission() : Notification.permission;
    if (perm !== 'granted') throw new Error('denied');
    const reg = await navigator.serviceWorker.register('sw.js'), m = await Remote.messaging();
    return m.getToken(m.messaging, { vapidKey: FIREBASE_VAPID, serviceWorkerRegistration: reg });
  }

  return {
    supported() { return !!native() || web(); },
    // iPhone の Safari はホーム画面から開いたときだけ Web Push が使える。そのときだけ案内を出す
    iosNeedsInstall() { return !!FIREBASE_VAPID && !native() && /iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone && !('PushManager' in window); },
    on,
    async enable() { await Remote.saveToken(await token(true)); set(true); },
    async disable() {
      set(false);
      await Remote.dropToken().catch(e => console.warn('通知の宛先を消せませんでした', e));
      try { const P = native(); if (P) await P.unregister(); else if (web()) { const m = await Remote.messaging(); await m.deleteToken(m.messaging); } } catch (e) { /* 端末側の後片付けは失敗しても続ける */ }
    },
    // 開いたときにトークンを置き直す（トークンは時々変わる）。許可が外れていたらオフにする
    async refresh() { if (!on()) return; try { await Remote.saveToken(await token(false)); } catch (e) { if (e.message === 'denied') set(false); } },
  };
})();
