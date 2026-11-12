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
  // Ordem alfabética em português: ignora maiúsculas, acentos e pontuação (ex.: "(Cris )" fica no C).
  const byName = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true, ignorePunctuation: true });

  // Ícones: Font Awesome Free (CC BY 4.0), embutidos em icons.js.
  const ic = (name) => {
    const i = (window.ICONS || {})[name];
    return i ? `<svg class="i" viewBox="0 0 ${i[0]} ${i[1]}" aria-hidden="true" focusable="false"><path fill="currentColor" d="${i[2]}"/></svg>` : '';
  };
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ic(el.dataset.icon); });

  // Endereço da chácara (fixo no código; para mudar, edite aqui).
  const ADDRESS = {
    nome: 'Chácara Nosso Refúgio',
    linha: 'Rua Das Amendoas, Qd12 - LT 275 - Rincão Mimoso, Maricá - RJ, 24938-340',
  };
  const ADDRESS_FULL = `${ADDRESS.nome}: ${ADDRESS.linha}`;
  const MAP_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ADDRESS.nome}, ${ADDRESS.linha}`)}`;

  const ROUTES = {
    inicio: { title: 'Início', render: renderHome },
    casa: { title: 'Casa', render: () => renderPeople('casa') },
    comida: { title: 'Comida', render: () => renderPeople('comida') },
    cerveja: { title: 'Cerveja', render: renderBeer },
    gastos: { title: 'Gastos', render: renderExpenses },
  };

  let data = null;
  const filter = { q: '', status: 'todos' };
  const beerSort = { col: 0, dir: 1 }; // começa por nome, A-Z

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
    const meta = `<div class="countdown-meta"><span>${ic('calendar')}${range}</span></div>`;
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
    return `
      <h1 class="sr-only">Início</h1>
      <section class="panel place" aria-labelledby="h-local">
        <div class="place-main">
          <span class="tile" aria-hidden="true">${ic('pin')}</span>
          <div>
            <h2 class="place-name" id="h-local">${esc(ADDRESS.nome)}</h2>
            <p class="place-addr">${esc(ADDRESS.linha)}</p>
          </div>
        </div>
        <div class="place-actions">
          <button type="button" class="btn btn--ghost" id="copy-addr">${ic('copy')}<span>Copiar endereço</span></button>
          <a class="btn" href="${MAP_URL}" target="_blank" rel="noopener noreferrer">${ic('map')}<span>Abrir no mapa</span></a>
        </div>
        <p class="sr-only" role="status" id="copy-status"></p>
      </section>
      ${countdownHtml()}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Alternativa para navegadores sem acesso à área de transferência.
      const t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_e) { ok = false; }
      t.remove();
      return ok;
    }
  }

  function bindHome() {
    const btn = document.getElementById('copy-addr');
    const status = document.getElementById('copy-status');
    if (!btn) return;
    let timer;
    btn.addEventListener('click', async () => {
      const ok = await copyText(ADDRESS_FULL);
      btn.innerHTML = `${ic(ok ? 'tick' : 'alert')}<span>${ok ? 'Endereço copiado' : 'Não foi possível copiar'}</span>`;
      status.textContent = ok ? 'Endereço copiado' : 'Não foi possível copiar o endereço';
      clearTimeout(timer);
      timer = setTimeout(() => { btn.innerHTML = `${ic('copy')}<span>Copiar endereço</span>`; status.textContent = ''; }, 2200);
    });
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
      .map((g) => ({ g, pessoas: g.pessoas.filter((x) => matches(x, kind)).sort((a, b) => byName.compare(a.nome, b.nome)) }))
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
  // A aba controla só a comida: saldo (arrecadado - gastos) e as saídas dessa conta.
  function renderExpenses() {
    const g = data.gastos;
    const c = g.comida;
    const comida = data.pagamentos.comida;
    const n = g.itens.length;
    const resumo = c.negativo
      ? `Os gastos passaram do arrecadado em ${money(-c.saldo)}.`
      : `${pct(c.percentualUsado)} do arrecadado já foi usado.`;
    const lista = n
      ? `<ul class="ledger">${g.itens.map((i) => `<li class="row">
          <span class="name">${esc(i.descricao || 'Sem nome')}</span><span class="amount num">${money(i.valor)}</span>
          <div class="row-bottom"><span class="num">${esc(i.data || 'Sem data')}</span></div>
          ${i.obs ? `<p class="sub obs">${esc(i.obs)}</p>` : ''}
        </li>`).join('')}</ul>`
      : '<p class="empty">Nenhuma saída de comida lançada ainda. Elas aparecem aqui quando forem adicionadas na aba SAIDAS da planilha.</p>';

    return `
      <div><h1 class="page">Gastos da comida</h1>
      <p class="lede">Controle do dinheiro da comida: o que foi arrecadado, o que já saiu e o que sobra.</p></div>
      <div class="kpis anim">
        ${kpi('wallet', 'Arrecadado', money(c.recebido), `de ${money(comida.valor)} previstos`)}
        ${kpi('receipt', 'Gastos', money(c.gasto), `${n} ${n === 1 ? 'saída' : 'saídas'}`)}
        ${kpi('piggy', 'Saldo disponível', money(c.saldo), c.negativo ? 'gastos acima do arrecadado' : 'arrecadado menos gastos')}
        ${kpi('hourglass', 'Falta receber', money(comida.pendente), 'da comida, ainda em aberto')}
      </div>
      <section class="panel caixa anim" style="--series:var(--comida)" aria-label="Saldo da comida">
        ${panelHead('utensils', 'Saldo da comida', c.negativo ? chip('negativo') : '')}
        <p class="big num">${money(c.saldo)}<small>${c.negativo ? 'saldo negativo' : 'de saldo'}</small></p>
        ${bar(c.gasto, c.recebido, 'comida', 'gastos')}
        <div class="gauge-bottom num"><span>Arrecadado ${money(c.recebido)}</span><span class="strong">Gastos ${money(c.gasto)}</span></div>
        <p class="sub">${resumo}</p>
      </section>
      <section class="panel" aria-labelledby="h-lancamentos">
        ${panelHead('receipt', '<span id="h-lancamentos">Saídas da comida</span>')}
        <p class="panel-sub num">${money(g.total)} em ${n} ${n === 1 ? 'saída' : 'saídas'}</p>
        ${lista}
      </section>
      ${footer()}`;
  }

  // -------------------------------------------------------------------- cerveja
  // Cópia da aba CERVEJA da planilha; clicar no título de uma coluna ordena por ela.
  function beerRows(b) {
    const c = b.colunas[beerSort.col];
    const idx = b.linhas.map((l, i) => ({ l, i }));
    idx.sort((x, y) => {
      const a = x.l[beerSort.col], z = y.l[beerSort.col];
      let r;
      if (c.tipo === 'numero') r = (a.numero ?? -Infinity) - (z.numero ?? -Infinity) || 0;
      else r = byName.compare(a.texto, z.texto);
      return (r || byName.compare(x.l[0].texto, y.l[0].texto) || x.i - y.i) * (r ? beerSort.dir : 1);
    });
    return idx.map((x) => x.l);
  }

  function beerTable(b) {
    const head = b.colunas.map((c, i) => {
      const on = beerSort.col === i;
      const icon = on ? (beerSort.dir === 1 ? 'sort-up' : 'sort-down') : 'sort';
      const sort = on ? ` aria-sort="${beerSort.dir === 1 ? 'ascending' : 'descending'}"` : '';
      return `<th scope="col" class="${c.tipo === 'numero' ? 'num' : ''}"${sort}><button type="button" data-col="${i}">${esc(c.titulo)}${ic(icon)}</button></th>`;
    }).join('');
    const body = beerRows(b).map((l) => `<tr>${l.map((cel, i) => `<td class="${b.colunas[i].tipo === 'numero' ? 'num' : ''}">${esc(cel.texto)}</td>`).join('')}</tr>`).join('');
    const foot = Object.keys(b.totais).length
      ? `<tfoot><tr>${b.colunas.map((c, i) => `<td class="${c.tipo === 'numero' ? 'num' : ''}">${i === 0 ? 'Total' : (i in b.totais ? esc(String(b.totais[i]).replace('.', ',')) : '')}</td>`).join('')}</tr></tfoot>`
      : '';
    return `<div class="table-wrap"><table class="sheet"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
  }

  function renderBeer() {
    const b = data.cerveja;
    const corpo = !b || !b.colunas.length
      ? '<p class="empty">A aba CERVEJA não pôde ser lida agora. Tente de novo em instantes.</p>'
      : (b.linhas.length ? `<div id="beer">${beerTable(b)}</div>` : '<p class="empty">Nenhuma linha na aba CERVEJA ainda.</p>');
    return `
      <div><h1 class="page">Cerveja</h1>
      <p class="lede">Cópia da aba CERVEJA da planilha. Toque no título de uma coluna para ordenar.</p></div>
      <section class="panel panel--tabela anim" aria-label="Tabela de cerveja">${corpo}</section>
      ${footer()}`;
  }

  function bindBeer() {
    const box = document.getElementById('beer');
    if (!box) return;
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-col]');
      if (!btn) return;
      const col = Number(btn.dataset.col);
      if (beerSort.col === col) beerSort.dir *= -1; else { beerSort.col = col; beerSort.dir = 1; }
      box.innerHTML = beerTable(data.cerveja);
      const again = box.querySelector(`button[data-col="${col}"]`);
      if (again) again.focus();
    });
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
    if (route === 'inicio') bindHome();
    if (route === 'cerveja') bindBeer();
    if (resetScroll) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); } else { window.scrollTo(0, y); }
  }

  window.addEventListener('hashchange', () => render(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
  setInterval(() => { if (!document.hidden && data) load(true); }, 60 * 1000);

  load();
})();
