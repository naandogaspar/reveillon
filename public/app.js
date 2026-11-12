(() => {
  'use strict';

  const main = document.getElementById('main');
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = (n) => brl.format(n || 0);
  const pct = (n) => `${Math.round(n || 0)}%`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Títulos em CAIXA ALTA na planilha (ADULTOS, CRIANÇAS 1, CASA) viram "Adultos", "Crianças 1", "Casa".
  const sentence = (s) => (s && s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);
  const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  const dayNumber = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000;

  // Ícones: Font Awesome Free (CC BY 4.0), embutidos em icons.js.
  const ic = (name) => {
    const i = (window.ICONS || {})[name];
    return i ? `<svg class="i" viewBox="0 0 ${i[0]} ${i[1]}" aria-hidden="true" focusable="false"><path fill="currentColor" d="${i[2]}"/></svg>` : '';
  };
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ic(el.dataset.icon); });

  const ROUTES = {
    inicio: { title: 'Início', render: renderHome },
    casa: { title: 'Casa', render: () => renderPeople('casa') },
    comida: { title: 'Comida', render: () => renderPeople('comida') },
    gastos: { title: 'Gastos', render: renderExpenses },
  };

  let data = null;
  const filter = { q: '', status: 'todos', gasto: 'todos' };

  // ------------------------------------------------------------------ peças
  const STATUS_ICON = { quitado: 'check', parcial: 'half', pendente: 'empty', negativo: 'alert' };
  const STATUS_LABEL = { quitado: 'Quitado', parcial: 'Parcial', pendente: 'Pendente', negativo: 'Saldo negativo' };

  const chip = (status) => `<span class="chip chip--${status}">${ic(STATUS_ICON[status])}${STATUS_LABEL[status] || ''}</span>`;

  function bar(usado, total, kind, texto) {
    const p = total > 0 ? Math.min(100, (usado / total) * 100) : (usado > 0 ? 100 : 0);
    const label = `${money(usado)} ${texto} de ${money(total)} (${pct(p)})`;
    return `<div class="bar bar--${kind}" role="img" aria-label="${esc(label)}" title="${esc(label)}"><span style="width:${p.toFixed(2)}%"></span></div>`;
  }

  const kpi = (icon, label, value, caption) => `<div class="panel kpi">
      <p class="kpi-label">${ic(icon)}<span>${label}</span></p>
      <p class="kpi-value num">${value}</p>
      <p class="kpi-cap">${caption}</p>
    </div>`;

  const panelHead = (icon, title, extra) => `<div class="panel-head"><span class="tile" aria-hidden="true">${ic(icon)}</span><h2 class="grow">${title}</h2>${extra || ''}</div>`;

  /** Uma barra com título, percentual e duas linhas de apoio. */
  function gauge({ nome, kind, usado, total, texto, rotulo, esquerda, direita }) {
    const p = total > 0 ? Math.min(100, (usado / total) * 100) : (usado > 0 ? 100 : 0);
    return `<div class="gauge" style="--series:var(--${kind})">
      <div class="gauge-top"><span class="gauge-name"><span class="swatch" aria-hidden="true"></span>${nome}</span><span class="gauge-pct num">${pct(p)}<small>${rotulo}</small></span></div>
      ${bar(usado, total, kind, texto)}
      <div class="gauge-bottom num"><span>${esquerda}</span><span class="strong">${direita}</span></div>
    </div>`;
  }

  function updatedAt() {
    const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(data.atualizadoEm)).map((x) => [x.type, x.value]));
    return `${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
  }
  const footer = () => `<p class="foot">Dados da planilha, atualizados às ${updatedAt()}. Para corrigir algo, fale com quem organiza a viagem.</p>`;

  // -------------------------------------------------------------------- início
  function countdownHtml() {
    const { inicio, fim } = data.viagem || {};
    if (!inicio) return '';
    const range = fim && fim !== inicio ? `${ddmm(inicio)} a ${ddmm(fim)}` : ddmm(inicio);
    const meta = `<div class="countdown-meta"><span>${ic('calendar')}${range}</span>${data.local ? `<span>${ic('pin')}${esc(data.local)}</span>` : ''}</div>`;
    const today = dayNumber(data.hoje);
    const start = dayNumber(inicio);
    const end = dayNumber(fim || inicio);
    let inner;
    if (today < start) {
      const n = Math.round(start - today);
      inner = `<p class="countdown-num num">${n}</p><div><p class="countdown-text">${n === 1 ? 'dia' : 'dias'} para a viagem</p>${meta}</div>`;
    } else if (today <= end) {
      const k = Math.round(today - start) + 1;
      const total = Math.round(end - start) + 1;
      inner = `<p class="countdown-num num">${k}</p><div><p class="countdown-text">º dia de ${total} da viagem</p>${meta}</div>`;
    } else {
      inner = `<div><p class="countdown-text">A viagem terminou</p>${meta}</div>`;
    }
    return `<section class="panel countdown anim" aria-label="Contagem regressiva">${inner}</section>`;
  }

  function renderHome() {
    const p = data.pagamentos;
    const g = data.gastos;
    const gastoTotal = g.casa.gasto + g.comida.gasto;

    const caixaGauge = (nome, kind, c) => gauge({
      nome, kind, usado: c.gasto, total: c.recebido, texto: 'gastos', rotulo: 'utilizado',
      esquerda: `Gastos ${money(c.gasto)} de ${money(c.recebido)}`,
      direita: c.negativo ? `Negativo em ${money(-c.saldo)}` : `Restam ${money(c.saldo)}`,
    });

    return `
      <h1 class="sr-only">Visão geral</h1>
      ${countdownHtml()}
      <div class="kpis anim">
        ${kpi('wallet', 'Arrecadado', money(p.total.pago), `de ${money(p.total.valor)} previstos`)}
        ${kpi('hourglass', 'Falta receber', money(p.total.pendente), `${pct(p.total.percentual)} do previsto já foi pago`)}
        ${kpi('piggy', 'Saldo em caixa', money(g.saldo), gastoTotal > 0 ? `depois de ${money(gastoTotal)} em gastos` : 'nenhum gasto lançado')}
        ${kpi('users', 'Pessoas quitadas', `${p.total.quitadas} de ${p.total.pessoas}`, 'com tudo pago')}
      </div>
      <div class="split">
        <section class="panel anim" aria-labelledby="h-pagamentos">
          ${panelHead('wallet', '<span id="h-pagamentos">Acompanhamento dos pagamentos</span>')}
          <p class="panel-sub">As barras mostram quanto de cada valor já foi pago.</p>
          <div class="gauges">
            ${gauge({ nome: 'Casa', kind: 'casa', usado: p.casa.pago, total: p.casa.valor, texto: 'pagos', rotulo: 'pago',
              esquerda: `Pago ${money(p.casa.pago)} de ${money(p.casa.valor)}`, direita: `Faltam ${money(p.casa.pendente)}` })}
            ${gauge({ nome: 'Comida', kind: 'comida', usado: p.comida.pago, total: p.comida.valor, texto: 'pagos', rotulo: 'pago',
              esquerda: `Pago ${money(p.comida.pago)} de ${money(p.comida.valor)}`, direita: `Faltam ${money(p.comida.pendente)}` })}
          </div>
          <a class="link" href="#casa">Ver quem já pagou</a>
        </section>
        <section class="panel anim" aria-labelledby="h-saldos">
          ${panelHead('piggy', '<span id="h-saldos">Uso do dinheiro arrecadado</span>')}
          <p class="panel-sub">Cada gasto sai do saldo do seu tipo: casa ou comida.</p>
          <div class="gauges">
            ${caixaGauge('Casa', 'casa', g.casa)}
            ${caixaGauge('Comida', 'comida', g.comida)}
          </div>
          <p class="note">${ic('info')}<span>Os valores vêm da planilha e se atualizam sozinhos. O saldo é o arrecadado menos os gastos do mesmo tipo.</span></p>
          <a class="link" href="#gastos">Ver os gastos</a>
        </section>
      </div>
      ${footer()}`;
  }

  // ------------------------------------------------------- casa e comida
  function personRow(person, kind) {
    const part = person[kind];
    return `<li class="row">
      <div class="row-top"><span class="name">${esc(person.nome)}</span>${chip(part.status)}</div>
      ${bar(Math.min(part.pago, part.valor), part.valor, kind, 'pagos')}
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
        <ul class="cards">${pessoas.map((x) => personRow(x, kind)).join('')}</ul>
      </section>`;
    }).join('');
  }

  function renderPeople(kind) {
    const t = data.pagamentos[kind];
    const nome = kind === 'casa' ? 'casa' : 'comida';
    const seg = (id, label) => `<button type="button" data-f="${id}" aria-pressed="${filter.status === id}">${label}</button>`;
    return `
      <h1 class="page">Pagamento da ${nome}</h1>
      <div class="kpis anim">
        ${kpi('receipt', 'Previsto', money(t.valor), `${t.pessoas} pessoas`)}
        ${kpi('wallet', 'Pago', money(t.pago), `${pct(t.percentual)} do previsto`)}
        ${kpi('hourglass', 'Falta receber', money(t.pendente), 'ainda em aberto')}
        ${kpi('users', 'Pessoas quitadas', `${t.quitadas} de ${t.pessoas}`, `com a ${nome} paga`)}
      </div>
      <section class="panel anim" aria-label="Andamento do pagamento">
        ${gauge({ nome: sentence(nome.toUpperCase()), kind, usado: t.pago, total: t.valor, texto: 'pagos', rotulo: 'pago',
          esquerda: `Pago ${money(t.pago)} de ${money(t.valor)}`, direita: `Faltam ${money(t.pendente)}` })}
      </section>
      <div class="toolbar">
        <label class="field"><span class="sr-only">Buscar pessoa</span>${ic('search')}<input type="search" id="q" placeholder="Buscar pessoa" value="${esc(filter.q)}" autocomplete="off"></label>
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
  function caixaHtml(nome, kind, icon, c) {
    const resumo = c.negativo
      ? `Os gastos passaram do arrecadado em ${money(-c.saldo)}.`
      : `${pct(c.percentualUsado)} do arrecadado já foi usado.`;
    return `<section class="panel caixa anim" style="--series:var(--${kind})" aria-label="Saldo ${nome}">
      ${panelHead(icon, nome, c.negativo ? chip('negativo') : '')}
      <p class="big num">${money(c.saldo)}<small>${c.negativo ? 'saldo negativo' : 'de saldo'}</small></p>
      ${bar(c.gasto, c.recebido, kind, 'gastos')}
      <div class="gauge-bottom num"><span>Arrecadado ${money(c.recebido)}</span><span class="strong">Gastos ${money(c.gasto)}</span></div>
      <p class="sub">${resumo}</p>
    </section>`;
  }

  function expensesListHtml() {
    const itens = data.gastos.itens.filter((i) => filter.gasto === 'todos' || i.tipoChave === filter.gasto);
    if (!itens.length) {
      return `<p class="empty">${data.gastos.itens.length ? 'Nenhum gasto desse tipo.' : 'Nenhum gasto lançado ainda. Os gastos aparecem aqui quando forem adicionados na aba SAIDAS da planilha.'}</p>`;
    }
    return `<ul class="ledger">${itens.map((i) => `<li class="row">
        <span class="name">${esc(i.descricao || 'Sem nome')}</span><span class="amount num">${money(i.valor)}</span>
        <div class="row-bottom"><span class="num">${esc(i.data || 'Sem data')}</span>${i.tipo ? `<span class="tag tag--${i.tipoChave}">${esc(sentence(i.tipo))}</span>` : ''}</div>
        ${i.obs ? `<p class="sub obs">${esc(i.obs)}</p>` : ''}
      </li>`).join('')}</ul>`;
  }

  function renderExpenses() {
    const g = data.gastos;
    const recebido = g.casa.recebido + g.comida.recebido;
    const gasto = g.casa.gasto + g.comida.gasto;
    const seg = (id, label) => `<button type="button" data-f="${id}" aria-pressed="${filter.gasto === id}">${label}</button>`;
    return `
      <div><h1 class="page">Gastos</h1>
      <p class="lede">Cada gasto é descontado do que foi arrecadado do mesmo tipo: casa ou comida.</p></div>
      <div class="kpis anim">
        ${kpi('wallet', 'Arrecadado', money(recebido), 'casa e comida somadas')}
        ${kpi('receipt', 'Total de gastos', money(g.total), `${g.itens.length} ${g.itens.length === 1 ? 'lançamento' : 'lançamentos'}`)}
        ${kpi('piggy', 'Saldo em caixa', money(g.saldo), `arrecadado menos ${money(gasto)} em gastos`)}
        ${kpi('info', 'Sem tipo definido', money(g.outros.total), g.outros.qtd ? `${g.outros.qtd} ${g.outros.qtd === 1 ? 'lançamento' : 'lançamentos'} fora dos saldos` : 'tudo classificado')}
      </div>
      <div class="split split--even">
        ${caixaHtml('Casa', 'casa', 'house', g.casa)}
        ${caixaHtml('Comida', 'comida', 'utensils', g.comida)}
      </div>
      <section class="panel" aria-labelledby="h-lancamentos">
        ${panelHead('receipt', '<span id="h-lancamentos">Lançamentos</span>')}
        <p class="panel-sub num">${money(g.total)} em ${g.itens.length} ${g.itens.length === 1 ? 'gasto' : 'gastos'}</p>
        <div class="toolbar" style="margin-bottom:6px"><div class="seg" role="group" aria-label="Filtrar por tipo">${seg('todos', 'Todos')}${seg('casa', 'Casa')}${seg('comida', 'Comida')}</div></div>
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
  let memoryPass = '';
  const getPass = () => { try { return localStorage.getItem('reveillon-senha') || memoryPass; } catch (_) { return memoryPass; } };
  const clearPass = () => { memoryPass = ''; try { localStorage.removeItem('reveillon-senha'); } catch (_) { /* ignora */ } };

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
    document.getElementById('senha').focus();
    document.getElementById('login').addEventListener('submit', (e) => {
      e.preventDefault();
      memoryPass = document.getElementById('senha').value;
      try { localStorage.setItem('reveillon-senha', memoryPass); } catch (_) { /* modo privado */ }
      load();
    });
  }

  function showError(detail) {
    main.innerHTML = `<div class="state"><strong>Não foi possível ler a planilha agora</strong>
      Tente de novo em alguns minutos. Se continuar, avise quem organiza a viagem.
      ${detail ? `<br><small class="sub">${esc(detail)}</small>` : ''}
      <p style="margin-top:16px"><button class="btn" id="retry" type="button">Tentar de novo</button></p></div>`;
    document.getElementById('retry').addEventListener('click', () => load());
  }

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

  const currentRoute = () => { const r = location.hash.replace('#', ''); return ROUTES[r] ? r : 'inicio'; };

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
  setInterval(() => { if (!document.hidden && data) load(true); }, 2 * 60 * 1000);

  load();
})();
