'use strict';

/**
 * Servidor local para visualizar o dashboard sem o Vercel.
 *   npm run dev        -> lê a planilha de verdade (precisa de internet)
 *   npm run dev:mock   -> usa uma cópia dos dados (test/fixtures.js)
 *   PASSWORD=abc ...   -> testa a proteção por senha
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('../api/dados');
const { buildDashboard } = require('../lib/sheet');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

if (process.env.PASSWORD) process.env.DASHBOARD_PASSWORD = process.env.PASSWORD;

// Feed de demonstração (MOCK=1): tudo em memória; as fotos enviadas ficam em /mock-img/.
let feedMock = null;
function obterFeedMock() {
  if (feedMock) return feedMock;
  const { repoMemoria, armazenamentoMemoria } = require('../test/fakes');
  const { criarServico } = require('../lib/feed');
  const arte = (cor1, cor2, texto) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor1}"/><stop offset="1" stop-color="${cor2}"/></linearGradient></defs><rect width="1200" height="900" fill="url(#g)"/><text x="600" y="470" font-size="64" text-anchor="middle" fill="#fff" font-family="sans-serif">${texto}</text></svg>`);
  const armazenamento = armazenamentoMemoria();
  armazenamento.objetos.set('feed/seed-1.svg', { corpo: arte('#1AA3B8', '#0A1128', 'Foto de exemplo 1'), tipo: 'image/svg+xml' });
  armazenamento.objetos.set('feed/seed-2.svg', { corpo: arte('#D4A24C', '#3b1d0a', 'Foto de exemplo 2'), tipo: 'image/svg+xml' });
  const agora = Date.now();
  const repo = repoMemoria([
    { id: 1, autor: 'Ana', legenda: 'Pé na estrada, a cerveja já está gelando!', chave: 'feed/seed-1.svg', largura: 1200, altura: 900, criadoEm: new Date(agora - 3 * 3600e3) },
    { id: 2, autor: 'Fernando', legenda: 'Primeira compra da base feita.', chave: 'feed/seed-2.svg', largura: 1200, altura: 900, criadoEm: new Date(agora - 20 * 60e3) },
  ]);
  feedMock = { armazenamento, servico: criarServico({ repo, armazenamento, publicUrl: `http://localhost:${PORT}/mock-img` }) };
  return feedMock;
}

function wrap(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  return res;
}

function mockApi(req, res) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (password && req.headers['x-senha'] !== password) return res.status(401).json({ erro: 'senha_necessaria' });
  const fx = require('../test/fixtures');
  const now = process.env.MOCK_NOW ? new Date(process.env.MOCK_NOW) : new Date();
  return res.status(200).json({
    titulo: process.env.TRIP_TITLE || 'Réveillon 2027',
    local: process.env.TRIP_LOCATION || 'Maricá, RJ',
    protegido: Boolean(password),
    ...buildDashboard(fx, { tripYear: 2026, now }),
  });
}

http.createServer((req, res) => {
  wrap(res);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/dados') {
    return process.env.MOCK ? mockApi(req, res) : handler(req, res);
  }
  if (url.pathname === '/api/feed') {
    return (process.env.MOCK ? require('../api/feed').criarHandler(() => obterFeedMock().servico) : require('../api/feed'))(req, res);
  }
  if (process.env.MOCK && url.pathname.startsWith('/mock-img/')) {
    const obj = obterFeedMock().armazenamento.objetos.get(url.pathname.replace('/mock-img/', ''));
    if (!obj) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', obj.tipo);
    return res.end(obj.corpo);
  }
  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404; return res.end('Não encontrado');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  return fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Dashboard em http://localhost:${PORT}${process.env.MOCK ? ' (dados de demonstração)' : ''}`));
