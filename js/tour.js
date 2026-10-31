// はじめて開いたときの見本：見本の「あいて」から届いた3つ（かけら・予定・ひとりごと）に、ひとりで返してみる
// 本物の Store には何も入れず、どこにも送らない。覚えるのは「見本を見終えた（とばした）」ことだけで、この端末の中だけ
const Tour = (() => {
  const KEY = 'hanbunko-tour';
  const steps = () => document.querySelectorAll('#tourScreen .tStep');
  let at = 0;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 返したあとは、本物と同じ手ごたえ（.sent）を見せてから、少し置いて「つぎへ」を出す
  const after = (n, card, then) => {
    card.classList.add('sent');
    setTimeout(() => { then?.(); $(n).hidden = false; $(n).nextElementSibling.hidden = false; }, App.still() ? 0 : 900);
  };
  function go(n) {
    at = n; steps().forEach(s => { s.hidden = +s.dataset.step !== n; });
    const s = steps()[n], card = s.querySelector('.item');
    // 見本の相手から届いた瞬間も、本物と同じようにそっと浮かぶ
    if (card) { card.classList.remove('arrive', 'answer'); void card.offsetWidth; card.classList.add('arrive'); }
    window.scrollTo(0, 0);
    (s.querySelector('.choices button, input') || s.querySelector('.go'))?.focus({ preventScroll: true });
  }
  function reset() {
    $('tkChoices').hidden = false; $('tkGuess').textContent = ''; $('tkGuess').hidden = $('tkNote').hidden = $('tkAfter').hidden = true;
    $('tkBody').innerHTML = '帰りに<span class="hole" role="img" aria-label="かくれた言葉">＿＿＿＿</span>を買って食べた';
    $('tyWhere').className = 'empty'; $('tyWhere').innerHTML = '<input id="tyIn" maxlength="30" aria-label="どこでを埋める" placeholder="例：川ぞい（30字まで）">'; $('tyFill').hidden = false; $('tyAfter').hidden = true; $('tyWho').querySelector('.done')?.remove();
    $('tuWords').hidden = false; $('tuGot').hidden = $('tuAfter').hidden = true;
    document.querySelectorAll('#tourScreen .choices button').forEach(o => { o.classList.remove('sel'); o.setAttribute('aria-pressed', 'false'); }); $('tkSend').disabled = $('tuSend').disabled = true;
    document.querySelectorAll('#tourScreen .item').forEach(c => c.classList.remove('sent', 'arrive', 'answer'));
    document.querySelectorAll('#tourScreen .tStep .go').forEach(b => { if (b.closest('.item, .card') === null) b.hidden = true; });
    tyKeys();
  }
  const tyKeys = () => { $('tyIn').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) $('tyFill').click(); }; };
  function open() { reset(); App.screen('tour'); $('devBar').hidden = true; go(0); }
  function close() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* 覚えられなくても先へ進む */ } App.showPair(App.waitCode || undefined); window.scrollTo(0, 0); }
  function init() {
    document.querySelectorAll('#tourScreen .tNext').forEach(b => { b.onclick = () => (at >= steps().length - 1 ? close() : go(at + 1)); });
    $('tourSkip').onclick = close;
    // 選ぶだけでは返さず、「返す」で返す（本物と同じ。見本だけ押せば返る、では本物で迷う。c9 の声）
    const pick = (box, send) => box.querySelectorAll('.choices button').forEach(b => {
      b.onclick = () => { box.querySelectorAll('.choices button').forEach(o => { const on = o === b && o.getAttribute('aria-pressed') !== 'true'; o.classList.toggle('sel', on); o.setAttribute('aria-pressed', on); }); $(send).disabled = !box.querySelector('.choices .sel'); };
    });
    pick($('tkChoices'), 'tkSend'); pick($('tuWords'), 'tuSend');
    // かけら：言葉を1つ選んで返すと想像が返り、答え合わせが届く
    {
      const b = $('tkSend');
      b.onclick = () => {
        const w = $('tkChoices').querySelector('.sel')?.dataset.v; if (!w) return;
        $('tkChoices').hidden = true; $('tkGuess').hidden = false; $('tkGuess').textContent = `わたしの想像：${w}`;
        after('tkAfter', $('tKakera'), () => {
          $('tkBody').innerHTML = '帰りに<mark class="ans">たい焼き</mark>を買って食べた';
          if (w === 'たい焼き') $('tkGuess').insertAdjacentHTML('beforeend', '<span class="done">ぴったり</span>');
          $('tkNote').hidden = false;
          $('tKakera').classList.remove('sent', 'arrive'); void $('tKakera').offsetWidth; $('tKakera').classList.add('arrive', 'answer'); // 本物で答え合わせが届いたときと同じ動き（紙が光って、答えがぼかしから晴れる）
        });
      };
    }
    // 予定：空いた欄を埋める。何も書かずに押したら、例の言葉で埋める（見本なので）
    $('tyFill').onclick = () => {
      const v = $('tyIn').value.trim() || '川ぞい';
      $('tyWhere').className = 'by-me'; $('tyWhere').textContent = v; $('tyFill').hidden = true;
      $('tyWho').insertAdjacentHTML('beforeend', '<span class="done">決まり</span>');
      after('tyAfter', $('tYotei'));
    };
    tyKeys();
    // ひとりごと：言葉を1つ選んで「返す」
    $('tuSend').onclick = () => {
      const w = $('tuWords').querySelector('.sel')?.textContent; if (!w) return;
      $('tuWords').hidden = true; $('tuGot').hidden = false; $('tuGot').innerHTML = `${App.flower}「${esc(w)}」を返しました`;
      after('tuAfter', $('tKurou'));
    };
  }
  // まだ見ていない端末で、2人の場所をつくる前だけ自動で出す
  const due = () => { try { return !localStorage.getItem(KEY); } catch (e) { return false; } };
  return { init, open, close, due };
})();
