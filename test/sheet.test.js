'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/sheet');
const fx = require('./fixtures');

const NOW = new Date('2026-11-11T23:00:00Z'); // 11/11/2026, 20h em São Paulo

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

test('gastos: layout atual da planilha (DATA, TIPO, SAIDA, VALOR, OBS)', () => {
  const g = S.parseSaidas(fx.saidas, { tripYear: 2026, hoje: '2026-11-11' });
  assert.equal(g.itens.length, 3);
  assert.deepEqual(g.itens.map((i) => i.descricao), ['SINAL', 'COMPRAS BASE 1', 'MERCADO DESCARTAVEIS']);
  assert.deepEqual(g.itens.map((i) => i.valor), [2880, 320.5, 257.38]);
  assert.equal(g.itens[0].tipo, 'CASA');
  assert.equal(g.itens[0].obs, 'ADIANTAMENTO DO SINAL DA CASA');
  assert.equal(g.total, 3457.88);
  assert.equal(g.realizado, 3457.88);
  assert.equal(g.previsto, 0);
  assert.deepEqual(g.porTipo, [{ tipo: 'CASA', total: 2880 }, { tipo: 'COMIDA', total: 577.88 }]);
});

test('gastos: datas futuras são previstas, passadas são realizadas', () => {
  const rows = [
    ['DATA', 'SAIDA', 'VALOR'],
    ['20/11', 'Mercado 1', 'R$ 500,00'],
    ['30/12', 'Gelo', 'R$ 40,00'],
  ];
  const g = S.parseSaidas(rows, { tripYear: 2026, hoje: '2026-11-11' });
  assert.equal(g.total, 540);
  assert.equal(g.realizado, 0);
  assert.equal(g.previsto, 540);
  assert.deepEqual(g.itens.map((i) => i.descricao), ['Mercado 1', 'Gelo']);

  const later = S.parseSaidas(rows, { tripYear: 2026, hoje: '2026-12-01' });
  assert.equal(later.realizado, 500);
  assert.equal(later.previsto, 40);
});

test('gastos: coluna STATUS opcional tem prioridade', () => {
  const rows = [
    ['DATA', 'SAIDA', 'VALOR', 'STATUS'],
    ['20/11', 'Mercado 1', 'R$ 500,00', 'pago'],
    ['30/12', 'Gelo', 'R$ 40,00', 'previsto'],
  ];
  const g = S.parseSaidas(rows, { tripYear: 2026, hoje: '2026-11-11' });
  assert.equal(g.realizado, 500);
  assert.equal(g.previsto, 40);
});

test('cardápio e datas da viagem', () => {
  const m = S.parseMenu(fx.menu, { tripYear: 2026 });
  assert.equal(m.titulo, 'MENU REVEILLON 2026');
  assert.equal(m.dias.length, 6);
  assert.equal(m.dias[0].almoco, 'Macarrão com salsicha');
  assert.equal(m.dias[5].janta, null); // "----" vira vazio

  const d = S.buildDashboard(fx, { tripYear: 2026, now: NOW });
  assert.equal(d.hoje, '2026-11-11');
  assert.equal(d.viagem.inicio, '2026-12-30');
  assert.equal(d.viagem.fim, '2027-01-04');
});

test('hojeSaoPaulo usa o fuso de São Paulo', () => {
  assert.equal(S.hojeSaoPaulo(new Date('2026-12-31T02:30:00Z')), '2026-12-30');
});
