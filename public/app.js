(() => {
  'use strict';

  const main = document.getElementById('main');
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = (n) => brl.format(n || 0);
  const pct = (n) => `${Math.round(n || 0)}%`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Títulos em CAIXA ALTA na planilha (ADULTOS, CRIANÇAS 1) viram "Adultos", "Crianças 1".
  const sentence = (s) => (s && s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);
  const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  const dayNumber = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000;

  const ROUTES = {
    inicio: { title: 'Início', render: renderHome },
    casa: { title: 'Pagamento casa', render: () => renderPeople('casa') },
    comida: { title: 'Pagamento comida', render: () => renderPeople('comida') },
    gastos: { title: 'Gastos', render: renderExpenses },
  };

  let data = null;
  let timer = null;
  const filter = { q: '', status: 'todos', gasto: 'todos' };

  // ------------------------------------------------------------------ peças
  const ICONS = {
    quitado: '<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.8 8.2l2.2 2.2 4.2-4.6" fill="none" stroke="var(--bg)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    parcial: '<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor"/>',
    pendente: '<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  };
  const LABELS = { quitado: 'Quitado', parcial: 'Parcial', pendente: 'Pendente', negativo: 'Saldo negativo' };

  function chip(status) {
    const icon = ICONS[status === 'negativo' ? 'pendente' : status] || ICONS.pendente;
    return `<span class="chip chip--${status}"><svg viewBox="0 0 16 16" aria-hidden="true">${icon}</svg>${LABELS[status] || ''}</span>`;
  }

  function bar(pago, valor, kind, large, verbo = 'pagos') {
    const p = valor > 0 ? Math.min(100, (pago / valor) * 100) : (pago > 0 ? 100 : 0);
    const label = `${money(pago)} ${verbo} de ${money(valor)} (${pct(p)})`;
    return `<div class="bar bar--${kind}${large ? ' bar--lg' : ''}" role="img" aria-label="${esc(label)}" title="${esc(label)}"><span style="width:${p.toFixed(2)}%"></span></div>`;
  }

  function updatedAt() {
    const d = new Date(data.atualizadoEm);
    const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const parts = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
    return `${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
  }

  function footer() {
    return `<p class="foot">Dados da planilha, atualizados às ${updatedAt()}. Para corrigir algo, fale com quem organiza a viagem.</p>`;
  }

  // -------------------------------------------------------------------- início
  function heroHtml() {
    const { inicio, fim } = data.viagem || {};
    if (!inicio) return '';
    const range = fim && fim !== inicio ? `${ddmm(inicio)} a ${ddmm(fim)}` : ddmm(inicio);
    const today = dayNumber(data.hoje);
    const start = dayNumber(inicio);
    const end = dayNumber(fim || inicio);
    if (today < start) {
      const n = Math.round(start - today);
      return `<div class="hero"><p class="hero-num num">${n}</p><p class="hero-text">${n === 1 ? 'dia' : 'dias'} para o Réveillon<span>${range}${data.local ? `, ${esc(data.local)}` : ''}</span></p></div>`;
    }
    if (today <= end) {
      const k = Math.round(today - start) + 1;
      const total = Math.round(end - start) + 1;
      return `<div class="hero"><p class="hero-num num">${k}</p><p class="hero-text">º dia da viagem<span>de ${total} dias, ${range}</span></p></div>`;
    }
    return `<div class="hero hero--solo"><p class="hero-text">A viagem terminou<span>${range}</span></p></div>`;
  }

  function renderHome() {
    const p = data.pagamentos;
    const g = data.gastos;
    const gastoTotal = g.casa.gasto + g.comida.gasto;

    return `
      <section class="anim">
        ${heroHtml()}
      </section>
      <section class="anim" aria-labelledby="h-arrecadado">
        <h2 id="h-arrecadado">Arrecadado</h2>
        <p class="big num">${money(p.total.pago)}<small>de ${money(p.total.valor)} (${pct(p.total.percentual)})</small></p>
        <p class="sub">Falta receber ${money(p.total.pendente)}</p>
        <div style="margin-top:12px">
          <a class="meter" style="--series:var(--casa)" href="#casa">
            <span class="meter-top"><span class="meter-name"><span class="swatch" aria-hidden="true"></span>Casa</span><span class="meter-pct num">${pct(p.casa.percentual)}</span></span>
            ${bar(p.casa.pago, p.casa.valor, 'casa')}
            <span class="meter-nums num">${money(p.casa.pago)} de ${money(p.casa.valor)}</span>
          </a>
          <a class="meter" style="--series:var(--comida)" href="#comida">
            <span class="meter-top"><span class="meter-name"><span class="swatch" aria-hidden="true"></span>Comida</span><span class="meter-pct num">${pct(p.comida.percentual)}</span></span>
            ${bar(p.comida.pago, p.comida.valor, 'comida')}
            <span class="meter-nums num">${money(p.comida.pago)} de ${money(p.comida.valor)}</span>
          </a>
        </div>
      </section>
      <section aria-labelledby="h-resumo">
        <h2 id="h-resumo" style="margin-bottom:16px">Resumo</h2>
        <dl class="facts">
          <div><dt>Pessoas quitadas</dt><dd class="num">${p.total.quitadas} de ${p.total.pessoas}</dd></div>
          <div><dt>Saldo em caixa</dt><dd class="num">${money(g.saldo)}<small>${gastoTotal > 0 ? `depois de ${money(gastoTotal)} em gastos` : 'nenhum gasto lançado'}</small></dd></div>
        </dl>
        <a class="more" href="#gastos">Ver gastos</a>
      </section>
      ${footer()}`;
  }

  // ------------------------------------------------------- casa e comida
  function personRow(person, kind) {
    const part = person[kind];
    return `<li class="row">
      <div class="row-top"><span class="name">${esc(person.nome)}</span>${chip(part.status)}</div>
      ${bar(part.pago, part.valor, kind)}
      <div class="row-bottom num"><span>Pago ${money(Math.min(part.pago, part.valor))} de ${money(part.valor)}</span>${part.pendente > 0 ? `<span class="due">Falta ${money(part.pendente)}</span>` : (part.excedente > 0 ? `<span>Sobra ${money(part.excedente)}</span>` : '')}</div>
    </li>`;
  }

  function matches(person, kind) {
    const part = person[kind];
    if (!part) return false;
    if (filter.q && !person.nome.toLowerCase().includes(filter.q.toLowerCase())) return false;
    if (filter.status === 'aberto') return part.status !== 'quitado';
    if (filter.status === 'quitado') return part.status === 'quitado';
    return true;
  }

  function listHtml(kind) {
    const groups = data.pagamentos.grupos
      .map((g) => ({ g, pessoas: g.pessoas.filter((x) => matches(x, kind)) }))
      .filter((x) => x.pessoas.length);
    if (!groups.length) {
      return `<p class="empty">${filter.q || filter.status !== 'todos' ? 'Ninguém corresponde a esse filtro.' : 'Nenhuma pessoa nesta lista ainda.'}</p>`;
    }
    return groups.map(({ g, pessoas }) => {
      const t = g[kind];
      return `<section class="group">
        <div class="group-head"><h2>${esc(sentence(g.titulo))}</h2><p class="sub num">${money(t.pago)} de ${money(t.valor)}</p></div>
        <ul class="rows">${pessoas.map((x) => personRow(x, kind)).join('')}</ul>
      </section>`;
    }).join('');
  }

  function renderPeople(kind) {
    const t = data.pagamentos[kind];
    const title = kind === 'casa' ? 'Pagamento da casa' : 'Pagamento da comida';
    const seg = (id, label) => `<button type="button" data-f="${id}" aria-pressed="${filter.status === id}">${label}</button>`;
    return `
      <h1 class="page">${title}</h1>
      <p class="big num">${money(t.pago)}<small>de ${money(t.valor)} (${pct(t.percentual)})</small></p>
      ${bar(t.pago, t.valor, kind, true)}
      <p class="sub" style="margin-top:10px">Falta receber ${money(t.pendente)}. ${t.quitadas} de ${t.pessoas} pessoas quitadas.</p>
      <div class="controls">
        <input type="search" id="q" placeholder="Buscar pessoa" aria-label="Buscar pessoa" value="${esc(filter.q)}" autocomplete="off">
        <div class="seg" role="group" aria-label="Filtrar por situação">${seg('todos', 'Todos')}${seg('aberto', 'Falta pagar')}${seg('quitado', 'Quitados')}</div>
      </div>
      <div id="lista" aria-live="polite">${listHtml(kind)}</div>
      ${footer()}`;
  }

  function bindPeople(kind) {
    const q = document.getElementById('q');
    const lista = document.getElementById('lista');
    if (!q || !lista) return;
    q.addEventListener('input', () => { filter.q = q.value.trim(); lista.innerHTML = listHtml(kind); });
    main.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      filter.status = b.dataset.f;
      main.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      lista.innerHTML = listHtml(kind);
    }));
  }

  // -------------------------------------------------------------------- gastos
  function caixaHtml(nome, kind, c) {
    const resumo = c.negativo
      ? `Os gastos passaram do arrecadado em ${money(-c.saldo)}.`
      : `Arrecadado ${money(c.recebido)}, gastos ${money(c.gasto)}.`;
    return `<div class="caixa" style="--series:var(--${kind})">
      <div class="meter-top"><span class="meter-name"><span class="swatch" aria-hidden="true"></span>${nome}</span>${c.negativo ? chip('negativo') : ''}</div>
      <p class="big num">${money(c.saldo)}<small>${c.negativo ? 'saldo negativo' : 'de saldo'}</small></p>
      ${bar(c.gasto, c.recebido, kind, false, 'gastos')}
      <p class="sub num">${resumo}</p>
      ${c.negativo ? '' : `<p class="sub num">${pct(c.percentualUsado)} do arrecadado já foi usado.</p>`}
    </div>`;
  }

  function expensesListHtml() {
    const itens = data.gastos.itens.filter((i) => filter.gasto === 'todos' || i.tipoChave === filter.gasto);
    if (!itens.length) {
      return `<p class="empty">${data.gastos.itens.length ? 'Nenhum gasto desse tipo.' : 'Nenhum gasto lançado ainda. Os gastos aparecem aqui quando forem adicionados na aba SAIDAS da planilha.'}</p>`;
    }
    return `<ul class="rows ledger">${itens.map((i) => `<li class="row">
        <span class="name">${esc(i.descricao || 'Sem nome')}</span><span class="amount num">${money(i.valor)}</span>
        <div class="row-bottom"><span class="num">${esc(i.data || 'Sem data')}</span>${i.tipo ? `<span class="tag tag--${i.tipoChave}">${esc(sentence(i.tipo))}</span>` : ''}</div>
        ${i.obs ? `<p class="sub obs">${esc(i.obs)}</p>` : ''}
      </li>`).join('')}</ul>`;
  }

  function renderExpenses() {
    const g = data.gastos;
    const seg = (id, label) => `<button type="button" data-f="${id}" aria-pressed="${filter.gasto === id}">${label}</button>`;
    return `
      <h1 class="page">Gastos</h1>
      <p class="lede">Cada gasto é descontado do que foi arrecadado do mesmo tipo: casa ou comida.</p>
      ${caixaHtml('Casa', 'casa', g.casa)}
      ${caixaHtml('Comida', 'comida', g.comida)}
      ${g.outros.qtd ? `<p class="sub">${g.outros.qtd} ${g.outros.qtd === 1 ? 'lançamento tem' : 'lançamentos têm'} tipo diferente de casa e comida (${money(g.outros.total)}) e não entram nos saldos.</p>` : ''}
      <section aria-labelledby="h-lancamentos">
        <h2 id="h-lancamentos">Lançamentos</h2>
        <p class="sub num" style="margin-top:4px">${money(g.total)} em ${g.itens.length} ${g.itens.length === 1 ? 'gasto' : 'gastos'}</p>
        <div class="controls"><div class="seg" role="group" aria-label="Filtrar por tipo">${seg('todos', 'Todos')}${seg('casa', 'Casa')}${seg('comida', 'Comida')}</div></div>
        <div id="lista-gastos" aria-live="polite">${expensesListHtml()}</div>
      </section>
      ${footer()}`;
  }

  function bindExpenses() {
    const lista = document.getElementById('lista-gastos');
    if (!lista) return;
    main.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      filter.gasto = b.dataset.f;
      main.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      lista.innerHTML = expensesListHtml();
    }));
  }

  // -------------------------------------------------------- estados e carga
  function showLoginForm(wrong) {
    main.innerHTML = `<div class="login">
      <h1 class="page">Entrar</h1>
      <p class="lede">Digite a senha que o organizador passou para o grupo.</p>
      <form id="login">
        <label for="senha" class="sub">Senha</label>
        <input id="senha" type="password" autocomplete="current-password" required>
        ${wrong ? '<p class="err" role="alert">Senha incorreta. Tente de novo.</p>' : ''}
        <button class="btn" type="submit">Entrar</button>
      </form></div>`;
    const form = document.getElementById('login');
    document.getElementById('senha').focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try { localStorage.setItem('reveillon-senha', document.getElementById('senha').value); } catch (_) { /* modo privado */ }
      memoryPass = document.getElementById('senha').value;
      load();
    });
  }

  function showError(detail) {
    main.innerHTML = `<div class="state"><strong>Não foi possível ler a planilha agora</strong>
      Tente de novo em alguns minutos. Se continuar, avise quem organiza a viagem.
      ${detail ? `<br><small class="sub">${esc(detail)}</small>` : ''}
      <p><button class="btn" id="retry" type="button">Tentar de novo</button></p></div>`;
    document.getElementById('retry').addEventListener('click', load);
  }

  let memoryPass = '';
  const getPass = () => { try { return localStorage.getItem('reveillon-senha') || memoryPass; } catch (_) { return memoryPass; } };
  const clearPass = () => { memoryPass = ''; try { localStorage.removeItem('reveillon-senha'); } catch (_) { /* ignora */ } };

  async function load(silent) {
    if (!silent) main.innerHTML = '<p class="state">Carregando…</p>';
    try {
      const headers = {};
      const pass = getPass();
      if (pass) headers['x-senha'] = pass;
      const res = await fetch('/api/dados', { headers, cache: 'no-store' });
      if (res.status === 401) { const had = Boolean(pass); clearPass(); showLoginForm(had); return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detalhe || `Erro ${res.status}`);
      data = body;
      render(!silent);
    } catch (err) {
      if (!data) showError(err.message); // com dados na tela, mantém o que já está visível
    }
  }

  function currentRoute() {
    const r = location.hash.replace('#', '');
    return ROUTES[r] ? r : 'inicio';
  }

  function render(resetScroll) {
    if (!data) return;
    // Atualização automática não pode tirar o foco de quem está digitando na busca.
    if (!resetScroll && document.activeElement && document.activeElement.id === 'q') return;
    const route = currentRoute();
    const view = ROUTES[route];
    document.getElementById('brand').textContent = data.titulo;
    document.title = `${view.title} · ${data.titulo}`;
    document.querySelectorAll('.tabs a').forEach((a) => {
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const y = window.scrollY;
    main.innerHTML = view.render();
    if (route === 'casa' || route === 'comida') bindPeople(route);
    if (route === 'gastos') bindExpenses();
    if (resetScroll) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); } else { window.scrollTo(0, y); }
  }

  window.addEventListener('hashchange', () => render(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
  timer = setInterval(() => { if (!document.hidden && data) load(true); }, 2 * 60 * 1000);

  load();
})();
