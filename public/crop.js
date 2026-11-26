'use strict';
/**
 * Recorte de foto. Cropper.open(canvasDaFoto, retanguloInicial?) abre uma tela com a foto,
 * uma moldura ajustável (formato livre) e atalhos de proporções comuns das redes sociais.
 * Resolve com {x, y, w, h} em pixels da foto original, ou null se a pessoa cancelar.
 */
(function () {
  const PRESETS = [
    { id: 'livre', nome: 'Livre', razao: 0 },
    { id: '1:1', nome: '1:1', dica: 'Quadrado', razao: 1 },
    { id: '4:5', nome: '4:5', dica: 'Retrato (Instagram)', razao: 4 / 5 },
    { id: '9:16', nome: '9:16', dica: 'Stories e Reels', razao: 9 / 16 },
    { id: '16:9', nome: '16:9', dica: 'Paisagem (YouTube)', razao: 16 / 9 },
    { id: '4:3', nome: '4:3', dica: 'Clássico', razao: 4 / 3 },
    { id: '3:4', nome: '3:4', dica: 'Clássico em pé', razao: 3 / 4 },
  ];
  const ALCA = 22;   // raio de toque das alças (px de tela)
  const MIN_TELA = 40; // tamanho mínimo da moldura (px de tela)

  const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

  // Maior retângulo da proporção dada que cabe na foto, centralizado.
  function maiorRetangulo(W, H, razao) {
    if (!razao) return { x: 0, y: 0, w: W, h: H };
    let w = W, h = W / razao;
    if (h > H) { h = H; w = H * razao; }
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }

  /** Redimensiona `r` arrastando a alça `a` ({l,r,t,b}) até o ponto (px,py). Puro, para poder testar. */
  function redimensionar(r, a, px, py, W, H, razao, min) {
    const x2 = r.x + r.w, y2 = r.y + r.h;
    if (!razao) {
      let x = r.x, y = r.y, xf = x2, yf = y2;
      if (a.l) x = limitar(px, 0, x2 - min);
      if (a.r) xf = limitar(px, r.x + min, W);
      if (a.t) y = limitar(py, 0, y2 - min);
      if (a.b) yf = limitar(py, r.y + min, H);
      return { x, y, w: xf - x, h: yf - y };
    }
    const minW = Math.max(min, min * razao);
    if ((a.l || a.r) && (a.t || a.b)) { // canto: o canto oposto fica parado
      const ax = a.l ? x2 : r.x, ay = a.t ? y2 : r.y;
      const sx = a.l ? -1 : 1, sy = a.t ? -1 : 1;
      let w = Math.max(Math.abs(px - ax), Math.abs(py - ay) * razao);
      const maxW = Math.min(sx > 0 ? W - ax : ax, (sy > 0 ? H - ay : ay) * razao);
      w = limitar(w, Math.min(minW, maxW), maxW);
      const h = w / razao;
      return { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h };
    }
    if (a.l || a.r) { // lateral: cresce para os lados, centralizada na vertical
      const ax = a.l ? x2 : r.x, cy = r.y + r.h / 2;
      const maxW = Math.min(a.l ? ax : W - ax, Math.min(cy, H - cy) * 2 * razao);
      const w = limitar(Math.abs(px - ax), Math.min(minW, maxW), maxW);
      const h = w / razao;
      return { x: a.l ? ax - w : ax, y: cy - h / 2, w, h };
    }
    const ay = a.t ? y2 : r.y, cx = r.x + r.w / 2; // topo/base
    const maxH = Math.min(a.t ? ay : H - ay, Math.min(cx, W - cx) * 2 / razao);
    const h = limitar(Math.abs(py - ay), Math.min(minW / razao, maxH), maxH);
    const w = h * razao;
    return { x: cx - w / 2, y: a.t ? ay - h : ay, w, h };
  }

  let dlg = null;
  function montar() {
    dlg = document.createElement('dialog');
    dlg.className = 'sheet cropper';
    dlg.setAttribute('aria-label', 'Cortar foto');
    dlg.innerHTML = `
      <div class="sheet-head"><h2>Cortar foto</h2>
        <button type="button" class="icon-btn" data-x aria-label="Cancelar">${window.ic ? window.ic('xmark') : '×'}</button></div>
      <div class="crop-stage"><canvas class="crop-canvas" aria-label="Área da foto. Arraste a moldura ou as pontas para cortar."></canvas></div>
      <div class="crop-presets" role="group" aria-label="Formato do corte"></div>
      <p class="composer-msg" data-dica></p>
      <div class="sheet-actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancelar</button>
        <button type="button" class="btn" data-ok>Concluir</button>
      </div>`;
    dlg.querySelector('.crop-presets').innerHTML = PRESETS.map((p) =>
      `<button type="button" class="chip" data-p="${p.id}" aria-pressed="false" ${p.dica ? `title="${p.dica}"` : ''}>${p.nome}</button>`).join('');
    document.body.appendChild(dlg);
  }

  function open(fonte, inicial) {
    if (!dlg) montar();
    const W = fonte.width, H = fonte.height;
    const canvas = dlg.querySelector('canvas'), ctx = canvas.getContext('2d');
    const dica = dlg.querySelector('[data-dica]');
    let rect = inicial ? { ...inicial } : { x: 0, y: 0, w: W, h: H };
    let razao = 0, escala = 1, arrasto = null;

    function medir() {
      const stage = dlg.querySelector('.crop-stage');
      const dispW = Math.max(120, stage.clientWidth || 300);
      const dispH = Math.max(120, Math.min(window.innerHeight * 0.55, 520));
      escala = Math.min(dispW / W, dispH / H);
      const cw = Math.round(W * escala), ch = Math.round(H * escala), dpr = window.devicePixelRatio || 1;
      canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function desenhar() {
      const cw = W * escala, ch = H * escala;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(fonte, 0, 0, cw, ch);
      const x = rect.x * escala, y = rect.y * escala, w = rect.w * escala, h = rect.h * escala;
      ctx.fillStyle = 'rgba(2,5,14,.62)';
      ctx.fillRect(0, 0, cw, y); ctx.fillRect(0, y + h, cw, ch - y - h);
      ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, cw - x - w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(x + (w * i) / 3, y); ctx.lineTo(x + (w * i) / 3, y + h);
        ctx.moveTo(x, y + (h * i) / 3); ctx.lineTo(x + w, y + (h * i) / 3);
      }
      ctx.stroke();
      ctx.strokeStyle = '#E8CB8A'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#E8CB8A';
      const s = 5;
      for (const [hx, hy] of pontos(x, y, w, h)) ctx.fillRect(hx - s, hy - s, s * 2, s * 2);
      dica.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)} px`;
    }
    const pontos = (x, y, w, h) => [[x, y], [x + w, y], [x, y + h], [x + w, y + h],
      [x + w / 2, y], [x + w / 2, y + h], [x, y + h / 2], [x + w, y + h / 2]];

    function alcaEm(cx, cy) { // cx, cy em px de tela dentro do canvas
      const x = rect.x * escala, y = rect.y * escala, w = rect.w * escala, h = rect.h * escala;
      const perto = (a, b) => Math.abs(a - b) <= ALCA;
      const L = perto(cx, x), R = perto(cx, x + w), T = perto(cy, y), B = perto(cy, y + h);
      const dentroX = cx > x - ALCA && cx < x + w + ALCA, dentroY = cy > y - ALCA && cy < y + h + ALCA;
      if ((L || R) && (T || B)) {
        const esq = Math.abs(cx - x) <= Math.abs(cx - (x + w)), cima = Math.abs(cy - y) <= Math.abs(cy - (y + h));
        return { l: esq, r: !esq, t: cima, b: !cima };
      }
      if (T && dentroX && w > ALCA * 3) return { t: true };
      if (B && dentroX && w > ALCA * 3) return { b: true };
      if (L && dentroY && h > ALCA * 3) return { l: true };
      if (R && dentroY && h > ALCA * 3) return { r: true };
      if (cx > x && cx < x + w && cy > y && cy < y + h) return { mover: true };
      return null;
    }
    const ponto = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };

    function aoPressionar(e) {
      const [cx, cy] = ponto(e), alca = alcaEm(cx, cy);
      if (!alca) return;
      canvas.setPointerCapture(e.pointerId);
      arrasto = { alca, inicio: rect, px: cx / escala, py: cy / escala };
      e.preventDefault();
    }
    function aoMover(e) {
      const [cx, cy] = ponto(e);
      if (!arrasto) {
        const a = alcaEm(cx, cy);
        canvas.style.cursor = !a ? 'default' : a.mover ? 'move' : ((a.l || a.r) && (a.t || a.b)) ? (a.l === a.t ? 'nwse-resize' : 'nesw-resize') : (a.l || a.r) ? 'ew-resize' : 'ns-resize';
        return;
      }
      const px = cx / escala, py = cy / escala, ini = arrasto.inicio;
      if (arrasto.alca.mover) {
        rect = { ...ini, x: limitar(ini.x + px - arrasto.px, 0, W - ini.w), y: limitar(ini.y + py - arrasto.py, 0, H - ini.h) };
      } else {
        rect = redimensionar(ini, arrasto.alca, px, py, W, H, razao, MIN_TELA / escala);
      }
      desenhar();
      e.preventDefault();
    }
    const aoSoltar = () => { arrasto = null; };

    function escolher(id) {
      const p = PRESETS.find((q) => q.id === id);
      razao = p.razao;
      dlg.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.p === id)));
      if (razao) rect = maiorRetangulo(W, H, razao);
      desenhar();
    }

    return new Promise((resolve) => {
      let fim = false;
      const ouvintes = [];
      const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); ouvintes.push(() => el.removeEventListener(ev, fn, o)); };
      const concluir = (valor) => {
        if (fim) return; fim = true;
        ouvintes.forEach((f) => f());
        if (dlg.open) dlg.close();
        resolve(valor);
      };
      on(canvas, 'pointerdown', aoPressionar);
      on(canvas, 'pointermove', aoMover);
      on(canvas, 'pointerup', aoSoltar);
      on(canvas, 'pointercancel', aoSoltar);
      on(dlg.querySelector('.crop-presets'), 'click', (e) => { const b = e.target.closest('.chip'); if (b) escolher(b.dataset.p); });
      on(dlg.querySelector('[data-ok]'), 'click', () => concluir({
        x: Math.round(rect.x), y: Math.round(rect.y),
        w: Math.max(1, Math.min(W - Math.round(rect.x), Math.round(rect.w))),
        h: Math.max(1, Math.min(H - Math.round(rect.y), Math.round(rect.h))),
      }));
      on(dlg.querySelector('[data-cancel]'), 'click', () => concluir(null));
      on(dlg.querySelector('[data-x]'), 'click', () => concluir(null));
      on(dlg, 'cancel', (e) => { e.preventDefault(); concluir(null); });
      on(window, 'resize', () => { medir(); desenhar(); });
      dlg.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      dlg.showModal();
      medir();
      if (!inicial) escolher('livre'); else { dlg.querySelector('[data-p="livre"]').setAttribute('aria-pressed', 'true'); desenhar(); }
    });
  }

  window.Cropper = { open, redimensionar, maiorRetangulo, PRESETS };
  if (typeof module !== 'undefined') module.exports = window.Cropper;
})();
