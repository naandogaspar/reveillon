'use strict';

/**
 * Leitura e interpretação da planilha "Reveillon".
 *
 * A planilha é a única fonte de dados. Nada aqui é gravado: o dashboard só lê.
 * Os nomes e valores são mostrados exatamente como estão na planilha; os
 * saldos pendentes são recalculados (valor - pago), então não dependem das
 * colunas "PENDENTE" estarem corretas.
 */

const DEFAULT_SHEET_ID = '1htWw4J4ClTaFwJbe29uCR3V2B_5xMPs96Cy6zZ53sdc';
// Ids (gid) das abas da planilha padrão; sobrescreva com GID_PAGANTES e GID_SAIDAS se usar outra.
const DEFAULT_GIDS = { pagantes: '1191795445', saidas: '1993973955', cerveja: '1367251633' };

// Datas da viagem (fixas): alimentam a contagem regressiva do Início.
const TRIP_START = '2026-12-30';
const TRIP_END = '2027-01-03';

// ---------------------------------------------------------------- utilidades

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const txt = (v) => (v == null ? '' : String(v).trim());

/** CSV (RFC 4180) -> matriz de strings. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * "R$ 1.234,56" | "R$200,00" | "533.33" | "--" | "" -> número em reais ou null.
 */
function parseMoney(value) {
  let s = txt(value);
  if (!s || /^[-–—\s]+$/.test(s)) return null;
  const negative = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/R\$/gi, '').replace(/[\s()]/g, '').replace(/^-/, '');
  if (!/\d/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return round2(negative ? -n : n);
}

/**
 * "30/12" | "30/12/2026" -> "AAAA-MM-DD".
 * Sem ano: meses 6..12 caem em `tripYear`; meses 1..5 em `tripYear + 1`
 * (a viagem atravessa a virada do ano).
 */
function parseDate(value, tripYear) {
  const m = txt(value).match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year;
  if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  else year = month >= 6 ? tripYear : tripYear + 1;
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

const isBlankRow = (r) => r.every((c) => !txt(c));
const isPlaceholder = (s) => /^[-–—\s]*$/.test(txt(s));

function findCol(header, regex, fallback) {
  const i = header.findIndex((c) => regex.test(txt(c)));
  return i >= 0 ? i : fallback;
}

// ------------------------------------------------------------------ PAGANTES

function statusOf(valor, pago) {
  if (valor == null) return null;
  if (valor > 0 && pago >= valor - 0.005) return 'quitado';
  if (pago > 0) return 'parcial';
  return 'pendente';
}

function part(valor, pago) {
  if (valor == null) return null;
  const p = pago || 0;
  return {
    valor,
    pago: p,
    pendente: round2(Math.max(0, valor - p)),
    excedente: round2(Math.max(0, p - valor)),
    status: statusOf(valor, p),
  };
}

function sumParts(items, key) {
  const list = items.map((i) => i[key]).filter(Boolean);
  const valor = round2(list.reduce((a, p) => a + p.valor, 0));
  const pago = round2(list.reduce((a, p) => a + Math.min(p.pago, p.valor), 0));
  return {
    pessoas: list.length,
    quitadas: list.filter((p) => p.status === 'quitado').length,
    valor,
    pago,
    recebido: round2(list.reduce((a, p) => a + p.pago, 0)), // tudo que entrou, mesmo acima do valor
    pendente: round2(valor - pago),
    percentual: valor > 0 ? round2((pago / valor) * 100) : 0,
  };
}

/**
 * Interpreta a aba PAGANTES. Os grupos (ADULTOS, CRIANÇAS 1, CRIANÇAS 2...)
 * são identificados pelo título; as colunas, pelo nome do cabeçalho.
 */
function parsePagantes(rows) {
  const groups = [];
  const warnings = [];
  let cols = { valorCasa: 1, pagoCasa: 2, pendCasa: 3, valorComida: 5, pagoComida: 6, pendComida: 7, pendTotal: 9 };
  let current = null;

  rows.forEach((r, rowIndex) => {
    if (isBlankRow(r)) return;
    const name = txt(r[0]);

    const isHeader = r.some((c) => /valor\s*casa/i.test(txt(c)));
    if (isHeader) {
      cols = {
        valorCasa: findCol(r, /valor\s*casa/i, cols.valorCasa),
        pagoCasa: findCol(r, /pago\s*casa/i, cols.pagoCasa),
        pendCasa: findCol(r, /pendente\s*casa/i, cols.pendCasa),
        valorComida: findCol(r, /valor\s*comida/i, cols.valorComida),
        pagoComida: findCol(r, /pago\s*comida/i, cols.pagoComida),
        pendComida: findCol(r, /pendente\s*comida/i, cols.pendComida),
        pendTotal: findCol(r, /pendente\s*total|total\s*pendente/i, cols.pendTotal),
      };
      current = { titulo: name, pessoas: [] };
      groups.push(current);
      return;
    }

    if (!name) return;
    if (/^total\b/i.test(name) || /:\s*$/.test(name)) return; // totais e "Endereço:"

    const money = [cols.valorCasa, cols.pagoCasa, cols.valorComida, cols.pagoComida]
      .map((i) => parseMoney(r[i]));
    const onlyTitle = r.slice(1).every((c) => !txt(c));
    if (onlyTitle) {
      current = { titulo: name, pessoas: [] };
      groups.push(current);
      return;
    }
    if (!current || money.every((m) => m == null)) return;

    const [valorCasa, pagoCasa, valorComida, pagoComida] = money;
    const casa = part(valorCasa, pagoCasa);
    const comida = part(valorComida, pagoComida);
    const valor = round2((casa?.valor || 0) + (comida?.valor || 0));
    const pago = round2(Math.min(casa?.pago || 0, casa?.valor || 0) + Math.min(comida?.pago || 0, comida?.valor || 0));
    const pessoa = {
      id: `${groups.length - 1}-${rowIndex}`,
      nome: name,
      casa,
      comida,
      total: { valor, pago, pendente: round2(valor - pago), status: statusOf(valor, pago) },
    };
    current.pessoas.push(pessoa);

    // Avisa se o "pendente" digitado/calculado na planilha diverge do cálculo.
    const check = (label, sheetValue, calc) => {
      const s = parseMoney(sheetValue);
      if (s != null && calc != null && Math.abs(s - calc) > 0.011) {
        warnings.push(`${name}: ${label} na planilha é ${s.toFixed(2)}, mas valor - pago = ${calc.toFixed(2)}`);
      }
    };
    check('pendente casa', r[cols.pendCasa], casa?.pendente);
    check('pendente comida', r[cols.pendComida], comida?.pendente);
    check('pendente total', r[cols.pendTotal], pessoa.total.pendente);
  });

  const nonEmpty = groups.filter((g) => g.pessoas.length);
  const all = nonEmpty.flatMap((g) => g.pessoas);
  const grupos = nonEmpty.map((g) => ({
    titulo: g.titulo,
    pessoas: g.pessoas,
    casa: sumParts(g.pessoas, 'casa'),
    comida: sumParts(g.pessoas, 'comida'),
  }));

  const casa = sumParts(all, 'casa');
  const comida = sumParts(all, 'comida');
  const valor = round2(casa.valor + comida.valor);
  const pago = round2(casa.pago + comida.pago);
  const quitadas = all.filter((p) => p.total.status === 'quitado').length;

  return {
    grupos,
    casa,
    comida,
    total: {
      pessoas: all.length,
      quitadas,
      valor,
      pago,
      pendente: round2(valor - pago),
      percentual: valor > 0 ? round2((pago / valor) * 100) : 0,
    },
    warnings,
  };
}

// -------------------------------------------------------------------- SAIDAS

/**
 * Interpreta a aba SAIDAS (todas as saídas são da comida):
 *   DATA  - quando houve a saída (dd/mm)
 *   SAIDA - rótulo curto do gasto
 *   VALOR - custo
 *   OBS   - descrição completa
 * Uma coluna TIPO antiga, se ainda existir, é ignorada.
 */
function parseSaidas(rows, { tripYear }) {
  const headerAt = rows.findIndex((r) => r.some((c) => /^data$/i.test(txt(c))));
  const header = headerAt >= 0 ? rows[headerAt] : ['DATA', 'SAIDA', 'VALOR', 'OBS'];
  const cDate = findCol(header, /^data$/i, 0);
  const cWhat = findCol(header, /^(sa[ií]da|item|gasto)/i, 1);
  const cValue = findCol(header, /^valor/i, 2);
  const cObs = findCol(header, /^(obs|observa|descri)/i, 3);

  const itens = [];
  const avisos = [];
  rows.slice(headerAt + 1).forEach((r, i) => {
    if (isBlankRow(r)) return;
    const valor = parseMoney(r[cValue]);
    const descricao = txt(r[cWhat]);
    if (valor == null && !descricao) return;
    const dataTexto = txt(r[cDate]);
    if (valor == null) avisos.push(`Gasto "${descricao || 'sem nome'}": valor ausente ou ilegível, contado como R$ 0,00`);
    itens.push({ id: i, data: dataTexto, iso: parseDate(dataTexto, tripYear), descricao, obs: txt(r[cObs]), valor: valor ?? 0 });
  });

  itens.sort((a, b) => {
    if (a.iso && b.iso) return a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.id - b.id;
    if (a.iso) return -1;
    if (b.iso) return 1;
    return a.id - b.id;
  });

  return { itens, total: round2(itens.reduce((acc, g) => acc + g.valor, 0)), avisos };
}

// ------------------------------------------------------------------- CERVEJA

/** "18,9" -> 18.9; "1.234,5" -> 1234.5; texto que não é número -> null. */
function parseNumero(v) {
  const t = txt(v).replace(/\s/g, '');
  if (!t) return null;
  const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : null;
}

/**
 * Copia a aba CERVEJA como está: a primeira linha com texto vira o cabeçalho
 * (ADULTOS, ENGR., QTD., ML., LITROS) e cada linha com nome vira um registro.
 * Linhas sem nome (a planilha deixa várias com LITOS 0) são descartadas.
 */
function parseCerveja(rows) {
  const headerAt = rows.findIndex((r) => !isBlankRow(r));
  if (headerAt < 0) return { colunas: [], linhas: [], totais: {}, litros: null, latas: null };
  const head = rows[headerAt].map(txt);
  let n = head.length;
  while (n > 0 && !head[n - 1]) n--;
  const body = rows.slice(headerAt + 1).filter((r) => txt(r[0]));

  const colunas = head.slice(0, n).map((tituloBruto, i) => {
    // QTD. aparece como LATAS; LITOS (grafia da planilha) e LITROS viram LITROS.
    const titulo = /^qtd\.?$/i.test(tituloBruto) ? 'LATAS' : /^lit(r)?os$/i.test(tituloBruto) ? 'LITROS' : tituloBruto;
    const vals = body.map((r) => txt(r[i])).filter(Boolean);
    const numerica = i > 0 && vals.length > 0 && vals.every((v) => parseNumero(v) != null);
    return { titulo: titulo || `Coluna ${i + 1}`, tipo: numerica ? 'numero' : 'texto', somar: numerica && i > 0 && !/^ml/i.test(titulo) };
  });
  const linhas = body.map((r) => colunas.map((c, i) => {
    const texto = txt(r[i]);
    return { texto, numero: c.tipo === 'numero' ? parseNumero(texto) : null };
  }));
  const totais = {};
  colunas.forEach((c, i) => {
    if (c.somar) totais[i] = round2(linhas.reduce((a, l) => a + (l[i].numero || 0), 0));
  });
  const total = (re) => {
    const i = colunas.findIndex((c) => re.test(c.titulo));
    return i >= 0 ? totais[i] ?? 0 : null;
  };
  return { colunas, linhas, totais, litros: total(/^litros/i), latas: total(/^latas/i) };
}

// ------------------------------------------------------------------ montagem

/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo. */
function hojeSaoPaulo(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

/** Saldo da comida: o que foi arrecadado menos o que os gastos de comida consumiram. */
function caixaDe(recebido, gasto) {
  const saldo = round2(recebido - gasto);
  return {
    recebido,
    gasto,
    saldo,
    negativo: saldo < 0,
    percentualUsado: recebido > 0 ? round2(Math.min(100, (gasto / recebido) * 100)) : (gasto > 0 ? 100 : 0),
  };
}

function buildDashboard({ pagantes, saidas, cerveja }, { tripYear = 2026, now = new Date() } = {}) {
  const p = parsePagantes(pagantes);
  const g = parseSaidas(saidas, { tripYear });
  return {
    atualizadoEm: now.toISOString(),
    hoje: hojeSaoPaulo(now),
    viagem: { inicio: TRIP_START, fim: TRIP_END },
    pagamentos: p,
    gastos: { itens: g.itens, total: g.total, comida: caixaDe(p.comida.recebido, g.total) },
    cerveja: cerveja ? parseCerveja(cerveja) : null,
    avisos: [...p.warnings, ...g.avisos],
  };
}

// ------------------------------------------------------------------- rede

/**
 * Usa o endpoint de exportação em CSV, que devolve o texto exatamente como aparece
 * na planilha. (O endpoint "gviz" tenta adivinhar o tipo de cada coluna e apaga os
 * textos que não combinam, como o cabeçalho "DATA" numa coluna de datas.)
 */
async function fetchTab(sheetId, gid, label) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const res = await fetch(url, { headers: { 'user-agent': 'reveillon-dashboard' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Google respondeu ${res.status} ao ler a aba ${label}.`);
  const body = await res.text();
  if (/^\s*<(!doctype|html)/i.test(body)) {
    throw new Error('A planilha não está acessível. Compartilhe como "Qualquer pessoa com o link" (leitor).');
  }
  return parseCsv(body);
}

async function loadDashboard({ sheetId = DEFAULT_SHEET_ID, tripYear = 2026, gids = {} } = {}) {
  const g = { ...DEFAULT_GIDS, ...Object.fromEntries(Object.entries(gids).filter(([, v]) => v)) };
  const [pagantes, saidas, cerveja] = await Promise.all([
    fetchTab(sheetId, g.pagantes, 'PAGANTES'),
    fetchTab(sheetId, g.saidas, 'SAIDAS'),
    // A cerveja é extra: se a aba falhar, o resto do painel continua funcionando.
    fetchTab(sheetId, g.cerveja, 'CERVEJA').catch(() => null),
  ]);
  const d = buildDashboard({ pagantes, saidas, cerveja }, { tripYear });
  if (!cerveja) d.avisos.push('Não foi possível ler a aba CERVEJA');
  return d;
}

module.exports = {
  DEFAULT_SHEET_ID, TRIP_START, TRIP_END, parseCsv, parseMoney, parseDate, parsePagantes, parseSaidas, parseCerveja, parseNumero,
  buildDashboard, hojeSaoPaulo, loadDashboard,
};
