'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/sheet');
const fx = require('./fixtures');

const NOW = new Date('2026-11-11T23:00:00Z'); // 11/11/2026, 20h em São Paulo
const round = (n) => Math.round(n * 100) / 100;

test('parseMoney entende os formatos da planilha', () => {
  assert.equal(S.parseMoney('R$ 533,33'), 533.33);
  assert.equal(S.parseMoney('R$200,00'), 200);
  assert.equal(S.parseMoney('R$ 1.234,56'), 1234.56);
  assert.equal(S.parseMoney('533.33'), 533.33);
  assert.equal(S.parseMoney('R$ 1.000'), 1000);
  assert.equal(S.parseMoney('--'), null);
  assert.equal(S.parseMoney(''), null);
  assert.equal(S.parseMoney(undefined), null);
});

test('parseDate infere o ano da viagem', () => {
  assert.equal(S.parseDate('30/12', 2026), '2026-12-30');
  assert.equal(S.parseDate('01/01', 2026), '2027-01-01');
  assert.equal(S.parseDate('5/1/2027', 2026), '2027-01-05');
  assert.equal(S.parseDate('abc', 2026), null);
});

test('parseCsv trata aspas, vírgulas e quebras de linha', () => {
  const rows = S.parseCsv('a,"b,c","d ""e"""\r\n,,\n"x\ny",z\n');
  assert.deepEqual(rows[0], ['a', 'b,c', 'd "e"']);
  assert.deepEqual(rows[1], ['', '', '']);
  assert.deepEqual(rows[2], ['x\ny', 'z']);
});

test('pagamentos: totais batem com a planilha atual', () => {
  const p = S.parsePagantes(fx.pagantes);
  assert.equal(p.grupos.length, 3);
  assert.deepEqual(p.grupos.map((g) => g.pessoas.length), [18, 5, 6]);

  assert.equal(p.casa.pessoas, 18);
  assert.equal(p.casa.valor, 9599.94);
  assert.equal(p.casa.pago, 4273.66);
  assert.equal(p.casa.recebido, 4273.66);
  assert.equal(p.casa.pendente, 5326.28);
  assert.equal(Math.round(p.casa.percentual), 45);

  assert.equal(p.comida.pessoas, 29);
  assert.equal(p.comida.valor, 4400);
  assert.equal(p.comida.pago, 400);
  assert.equal(p.comida.pendente, 4000);

  assert.equal(p.total.valor, 13999.94);
  assert.equal(p.total.pago, 4673.66);
  assert.equal(p.total.pendente, 9326.28);
  assert.equal(p.total.pessoas, 29);
  assert.equal(p.total.quitadas, 2); // Amanda e Alisson
  assert.deepEqual(p.warnings, []);
});

test('crianças não têm casa; nomes repetidos viram pessoas distintas', () => {
  const p = S.parsePagantes(fx.pagantes);
  const bias = p.grupos.flatMap((g) => g.pessoas).filter((x) => x.nome === 'Bia');
  assert.equal(bias.length, 2);
  assert.notEqual(bias[0].id, bias[1].id);
  assert.equal(bias[1].casa, null);
  assert.equal(bias[1].comida.valor, 100);
});

test('status por pessoa e nomes exatamente como na planilha', () => {
  const p = S.parsePagantes(fx.pagantes);
  const all = p.grupos.flatMap((g) => g.pessoas);
  const by = (n) => all.find((x) => x.nome === n);
  assert.equal(by('Amanda').total.status, 'quitado');
  assert.equal(by('Fernando').casa.status, 'parcial');
  assert.equal(by('Fernando').comida.status, 'parcial');
  assert.equal(by('Thalita').comida.status, 'pendente');
  assert.equal(by('Silvia').casa.pendente, 186.33);
  assert.ok(by('(Cris ) Esposa Walace 02'));
});

test('divergência entre o pendente da planilha e valor - pago gera aviso', () => {
  const rows = fx.pagantes.map((r) => r.slice());
  const silvia = rows.find((r) => r[0] === 'Silvia');
  silvia[3] = 'R$ 187,00';
  const p = S.parsePagantes(rows);
  assert.equal(p.warnings.length, 1);
  assert.match(p.warnings[0], /Silvia/);
  assert.equal(p.casa.pendente, 5326.28); // o cálculo ignora o valor digitado
});

test('linhas de Total, Endereço e linhas sem nome são ignoradas', () => {
  const rows = [
    ...fx.pagantes,
    ['Total', 'R$ 9.599,94', 'R$ 4.273,66'],
    ['', '', '', '', '', 'R$ 50,00'],
    ['Endereço:', 'Rua X', '', '', '', 'CEP:00000-000'],
  ];
  const p = S.parsePagantes(rows);
  assert.equal(p.total.pessoas, 29);
  assert.equal(p.total.valor, 13999.94);
});

test('colunas são localizadas pelo cabeçalho (inserir coluna não quebra)', () => {
  const rows = [
    ['ADULTOS', 'EXTRA', 'VALOR CASA', 'PAGO CASA', 'PENDENTE CASA', 'VALOR COMIDA', 'PAGO COMIDA', 'PENDENTE COMIDA'],
    ['Ana', 'x', 'R$ 100,00', 'R$ 40,00', 'R$ 60,00', 'R$ 20,00', 'R$ 20,00', 'R$ 0,00'],
  ];
  const p = S.parsePagantes(rows);
  assert.equal(p.casa.valor, 100);
  assert.equal(p.casa.pago, 40);
  assert.equal(p.comida.status, undefined);
  assert.equal(p.grupos[0].pessoas[0].comida.status, 'quitado');
});

test('pagamento acima do valor não gera pendente negativo', () => {
  const rows = [
    ['ADULTOS', 'VALOR CASA', 'PAGO CASA', 'PENDENTE CASA'],
    ['Ana', 'R$ 100,00', 'R$ 130,00', 'R$ 0,00'],
  ];
  const p = S.parsePagantes(rows);
  assert.equal(p.casa.pendente, 0);
  assert.equal(p.casa.pago, 100);
  assert.equal(p.grupos[0].pessoas[0].casa.excedente, 30);
});

test('gastos: lê DATA, SAIDA, VALOR e OBS (sem coluna TIPO)', () => {
  const g = S.parseSaidas(fx.saidas, { tripYear: 2026 });
  assert.deepEqual(g.itens.map((i) => i.descricao), ['COMPRAS BASE 1', 'MERCADO DESCARTAVEIS']);
  assert.deepEqual(g.itens.map((i) => i.valor), [320.5, 257.38]);
  assert.equal(g.itens[0].obs, 'COMPRA DE ITENS NÃO PERECIVEIS');
  assert.equal(g.itens[0].iso, '2026-11-05');
  assert.equal(g.total, 577.88);
  assert.deepEqual(g.avisos, []);
});

test('gastos: saldo da comida (arrecadado - gastos), pode ficar negativo', () => {
  const d = S.buildDashboard(fx, { tripYear: 2026, now: NOW });
  const g = d.gastos;
  assert.equal(g.total, 577.88);
  assert.equal(g.comida.recebido, 400);
  assert.equal(g.comida.saldo, -177.88);
  assert.equal(g.comida.negativo, true);
  assert.equal(g.comida.percentualUsado, 100); // barra limitada a 100%
  assert.deepEqual(d.avisos, []);
});

test('gastos: saldo positivo e percentual usado', () => {
  const rows = [['DATA', 'SAIDA', 'VALOR', 'OBS'], ['02/11', 'Gelo', 'R$ 100,00', '']];
  const d = S.buildDashboard({ pagantes: fx.pagantes, saidas: rows }, { tripYear: 2026, now: NOW });
  assert.equal(d.gastos.comida.saldo, 300);
  assert.equal(d.gastos.comida.negativo, false);
  assert.equal(d.gastos.comida.percentualUsado, 25);
});

test('gastos: sem cabeçalho assume DATA, SAIDA, VALOR, OBS; coluna TIPO antiga é ignorada', () => {
  const g = S.parseSaidas([['5/11', 'Gelo', 'R$ 40,00', 'obs']], { tripYear: 2026 });
  assert.equal(g.itens[0].valor, 40);
  const legado = S.parseSaidas([['DATA', 'TIPO', 'SAIDA', 'VALOR', 'OBS'], ['5/11', 'COMIDA', 'Gelo', 'R$ 40,00', 'x']], { tripYear: 2026 });
  assert.equal(legado.itens[0].descricao, 'Gelo');
  assert.equal(legado.itens[0].valor, 40);
});

test('gastos: colunas são achadas pelo cabeçalho mesmo fora de ordem', () => {
  const rows = [['VALOR', 'SAIDA', 'DATA', 'OBS'], ['R$ 40,00', 'Gelo', '30/12', 'Gelo para a virada']];
  const g = S.parseSaidas(rows, { tripYear: 2026 });
  assert.equal(g.itens[0].valor, 40);
  assert.equal(g.itens[0].iso, '2026-12-30');
});

test('parseNumero entende vírgula decimal', () => {
  assert.equal(S.parseNumero('18,9'), 18.9);
  assert.equal(S.parseNumero('1.234,5'), 1234.5);
  assert.equal(S.parseNumero('0'), 0);
  assert.equal(S.parseNumero('abc'), null);
  assert.equal(S.parseNumero(''), null);
});

test('cerveja: QTD. vira LATAS, descarta linhas sem nome e soma todas as colunas numéricas (menos ML.)', () => {
  const c = S.buildDashboard(fx, { tripYear: 2026, now: NOW }).cerveja;
  assert.deepEqual(c.colunas.map((x) => x.titulo), ['ADULTOS', 'ENGR.', 'LATAS', 'ML.', 'LITROS']);
  assert.deepEqual(c.colunas.map((x) => x.tipo), ['texto', 'numero', 'numero', 'numero', 'numero']);
  assert.equal(c.linhas.length, 4); // duas linhas vazias descartadas, nomes repetidos mantidos
  assert.equal(c.linhas[1][4].texto, '18,9');
  assert.equal(c.linhas[1][4].numero, 18.9);
  assert.deepEqual(c.totais, { 1: 7, 2: 48, 4: 42 });
  assert.equal(c.litros, 42);
  assert.equal(c.latas, 48);
});

test('cerveja: ausente vira null e aba vazia não quebra', () => {
  assert.equal(S.buildDashboard({ pagantes: fx.pagantes, saidas: fx.saidas }, { now: NOW }).cerveja, null);
  assert.deepEqual(S.parseCerveja([]), { colunas: [], linhas: [], totais: {}, litros: null, latas: null });
});

test('datas da viagem são fixas', () => {
  const d = S.buildDashboard(fx, { tripYear: 2026, now: NOW });
  assert.equal(d.hoje, '2026-11-11');
  assert.deepEqual(d.viagem, { inicio: '2026-12-30', fim: '2027-01-03' });
});

test('hojeSaoPaulo usa o fuso de São Paulo', () => {
  assert.equal(S.hojeSaoPaulo(new Date('2026-12-31T02:30:00Z')), '2026-12-30');
});
