'use strict';

// Cópia fiel do conteúdo da planilha "Reveillon 2027" em 11/11/2026
// (usada nos testes e no modo de demonstração local: npm run dev:mock).

const adult = (nome, pagoCasa, pendCasa, pagoComida, pendComida, pendTotal) => [
  nome, 'R$ 533,33', pagoCasa, pendCasa, '', 'R$ 200,00', pagoComida, pendComida, '', pendTotal,
];
const kid = (nome, valor, pago, pend) => [nome, '--', '--', '--', '', valor, pago, pend, '', pend];

const pagantes = [
  ['ADULTOS', 'VALOR CASA', 'PAGO CASA', 'PENDENTE CASA', '', 'VALOR COMIDA', 'PAGO COMIDA', 'PENDENTE COMIDA', '', 'TOTAL PENDENTE'],
  adult('Thalita', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  adult('Alessandro', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  adult('Amanda', 'R$ 533,33', 'R$ 0,00', 'R$ 200,00', 'R$ 0,00', 'R$ 0,00'),
  adult('Fernando', 'R$ 160,00', 'R$ 373,33', 'R$ 100,00', 'R$ 100,00', 'R$ 473,33'),
  adult('Wallace 02', 'R$ 460,00', 'R$ 73,33', 'R$ 0,00', 'R$ 200,00', 'R$ 273,33'),
  adult('(Cris ) Esposa Walace 02', 'R$ 533,33', 'R$ 0,00', 'R$ 0,00', 'R$ 200,00', 'R$ 200,00'),
  adult('Silvia', 'R$ 347,00', 'R$ 186,33', 'R$ 0,00', 'R$ 200,00', 'R$ 386,33'),
  adult('Michel', 'R$ 320,00', 'R$ 213,33', 'R$ 0,00', 'R$ 200,00', 'R$ 413,33'),
  adult('Taty', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  adult('Felipe', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  adult('Walace 01', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  adult('Andressa Walace 01', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  adult('Paulo', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  adult('Day', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  adult('Fininho', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  adult('Namorada Finin', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  adult('Bia', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  adult('Gaby', 'R$ 160,00', 'R$ 373,33', 'R$ 0,00', 'R$ 200,00', 'R$ 573,33'),
  ['CRIANÇAS 1'],
  kid('Alisson', 'R$ 100,00', 'R$ 100,00', 'R$ 0,00'),
  kid('Bia', 'R$ 100,00', 'R$ 0,00', 'R$ 100,00'),
  kid('Mariane', 'R$ 100,00', 'R$ 0,00', 'R$ 100,00'),
  kid('Josué', 'R$ 100,00', 'R$ 0,00', 'R$ 100,00'),
  kid('Calebe', 'R$ 100,00', 'R$ 0,00', 'R$ 100,00'),
  ['CRIANÇAS 2'],
  kid('Nina', 'R$ 50,00', 'R$ 0,00', 'R$ 50,00'),
  kid('Sofia', 'R$ 50,00', 'R$ 0,00', 'R$ 50,00'),
  kid('Gui', 'R$ 50,00', 'R$ 0,00', 'R$ 50,00'),
  kid('Vitoria', 'R$ 50,00', 'R$ 0,00', 'R$ 50,00'),
  kid('João', 'R$ 50,00', 'R$ 0,00', 'R$ 50,00'),
  kid('Luca', 'R$ 50,00', 'R$ 0,00', 'R$ 50,00'),
];

const saidas = [
  ['DATA', 'SAIDA', 'VALOR'],
  ['20/11', 'Mercado 1', 'R$ 500,00'],
  ['30/12', 'Gelo', 'R$ 40,00'],
];

const menu = [
  ['MENU REVEILLON 2026'],
  ['DATA', 'ALMOÇO', 'JANTA'],
  ['30/12', 'Macarrão com salsicha', 'Churrasco'],
  ['31/12', 'Strogonoffe de frango', 'Peru + Salada de bacalhau + salpicão + Tender + Churrasco'],
  ['01/01', 'Lasanha + salada verde', 'Caldos e Petiscos'],
  ['02/01', 'Filé de peixe  + Tabule', 'Churrasco'],
  ['03/01', 'Fricassê / Risoto', 'Churrasco'],
  ['04/01', 'Churrasco', '----'],
];

module.exports = { pagantes, saidas, menu };
