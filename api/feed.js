'use strict';

const { samePassword } = require('../lib/auth');
const { FeedErro, criarServico } = require('../lib/feed');

let servico = null;

/** Monta o serviço a partir das variáveis de ambiente (uma vez por instância). */
function obterServico() {
  if (servico) return servico;
  const e = process.env;
  const dbUrl = e.DATABASE_URL;
  const r2 = { accountId: e.R2_ACCOUNT_ID, bucket: e.R2_BUCKET || 'reveillon', accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY };
  const faltando = [];
  if (!dbUrl) faltando.push('DATABASE_URL');
  if (!r2.accountId) faltando.push('R2_ACCOUNT_ID');
  if (!r2.accessKeyId) faltando.push('R2_ACCESS_KEY_ID');
  if (!r2.secretAccessKey) faltando.push('R2_SECRET_ACCESS_KEY');
  if (!e.R2_PUBLIC_URL) faltando.push('R2_PUBLIC_URL');
  if (faltando.length) throw new FeedErro(503, 'feed_nao_configurado', `Feed ainda não configurado (faltam: ${faltando.join(', ')}).`);

  const { criarRepoMysql } = require('../lib/feed-mysql');
  const { criarArmazenamentoR2 } = require('../lib/r2');
  servico = criarServico({ repo: criarRepoMysql(dbUrl), armazenamento: criarArmazenamentoR2(r2), publicUrl: e.R2_PUBLIC_URL });
  return servico;
}

async function lerJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let texto = '';
  if (typeof req.body === 'string') texto = req.body;
  else if (Buffer.isBuffer(req.body)) texto = req.body.toString('utf8');
  else for await (const parte of req) texto += parte;
  try { return JSON.parse(texto || '{}'); } catch (_) { throw new FeedErro(400, 'json_invalido', 'Pedido inválido.'); }
}

/** `fabrica` existe para os testes e o modo de demonstração trocarem o serviço. */
function criarHandler(fabrica = obterServico) {
  return async function handler(req, res) {
    const password = process.env.DASHBOARD_PASSWORD;
    res.setHeader('Cache-Control', 'no-store');

    if (password && !samePassword(req.headers['x-senha'], password)) return res.status(401).json({ erro: 'senha_necessaria' });

    try {
      if (req.method === 'GET') {
        const query = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
        return res.status(200).json(await fabrica().listar({ antes: query.antes }));
      }
      if (req.method === 'POST') {
        // Sem senha qualquer pessoa poderia enviar fotos: o envio só funciona com acesso protegido.
        if (!password) throw new FeedErro(403, 'envio_bloqueado', 'Para liberar o envio de fotos, defina DASHBOARD_PASSWORD na Vercel.');
        const corpo = await lerJson(req);
        return res.status(201).json(await fabrica().publicar(corpo));
      }
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ erro: 'metodo_nao_permitido' });
    } catch (err) {
      if (err instanceof FeedErro) return res.status(err.status).json({ erro: err.codigo, detalhe: err.message });
      console.error('feed:', err && err.message);
      return res.status(502).json({ erro: 'feed_indisponivel', detalhe: 'Não foi possível acessar o feed agora. Tente de novo em instantes.' });
    }
  };
}

module.exports = criarHandler();
module.exports.criarHandler = criarHandler;
