'use strict';

const crypto = require('node:crypto');
const { loadDashboard, DEFAULT_SHEET_ID } = require('../lib/sheet');

// Cache em memória (por instância da função) para não consultar o Google a cada visita.
let memo = null;
const MEMO_MS = 60 * 1000;

function samePassword(given, expected) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  const password = process.env.DASHBOARD_PASSWORD;

  if (password && !samePassword(req.headers['x-senha'], password)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(401).json({ erro: 'senha_necessaria' });
  }

  try {
    const sheetId = process.env.SHEET_ID || DEFAULT_SHEET_ID;
    const tripYear = Number(process.env.TRIP_YEAR) || 2026;

    if (!memo || Date.now() - memo.at > MEMO_MS) {
      memo = { at: Date.now(), data: await loadDashboard({ sheetId, tripYear }) };
    }

    // Com senha, a resposta nunca pode ficar em cache compartilhado (CDN).
    res.setHeader(
      'Cache-Control',
      password ? 'private, max-age=30' : 'public, s-maxage=60, stale-while-revalidate=300',
    );
    return res.status(200).json({
      titulo: process.env.TRIP_TITLE || 'Réveillon 2027',
      local: process.env.TRIP_LOCATION || '',
      protegido: Boolean(password),
      ...memo.data,
    });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ erro: 'planilha_indisponivel', detalhe: err.message });
  }
};
