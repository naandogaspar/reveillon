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
  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404; return res.end('Não encontrado');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  return fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Dashboard em http://localhost:${PORT}${process.env.MOCK ? ' (dados de demonstração)' : ''}`));
