// 画面の切り替えと共通の部品
const App = {
  delButton(id, after) { const b = document.createElement('button'); b.className = 'del'; b.textContent = '消す'; b.onclick = () => { Store.remove(id); after(); }; return b; },
  renderAll() { Kakera.render(); Yotei.render(); Kurou.render(); },
  setMe(me) { Store.me = me; document.querySelectorAll('#devBar button').forEach(b => b.classList.toggle('on', b.dataset.me === me)); App.renderAll(); },
  show(tab) {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.tab').forEach(s => { s.hidden = s.id !== tab; });
  },
};
document.querySelectorAll('#tabs button').forEach(b => { b.onclick = () => App.show(b.dataset.tab); });
if (SHOW_TEST) { $('devBar').hidden = false; document.querySelectorAll('#devBar button').forEach(b => { b.onclick = () => App.setMe(b.dataset.me); }); }
Kakera.init(); Yotei.init(); Kurou.init();
App.setMe('a');
