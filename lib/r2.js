'use strict';

/**
 * Envio de arquivos para o Cloudflare R2 pela API S3, com assinatura AWS SigV4
 * feita à mão (sem dependências). Só precisamos de PUT de um objeto.
 */

const crypto = require('node:crypto');

const sha256 = (d) => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (key, d) => crypto.createHmac('sha256', key).update(d).digest();
const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Gera os cabeçalhos assinados (inclui Authorization) de uma requisição S3. */
function assinar({ method, host, path, query = {}, headers = {}, payloadHash, region, service = 's3', accessKeyId, secretAccessKey, amzDate }) {
  const dia = amzDate.slice(0, 8);
  const todos = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  Object.entries(headers).forEach(([k, v]) => { todos[k.toLowerCase()] = String(v).trim(); });

  const nomes = Object.keys(todos).sort();
  const canonicalHeaders = nomes.map((n) => `${n}:${todos[n]}\n`).join('');
  const signedHeaders = nomes.join(';');
  const canonicalQuery = Object.keys(query).sort().map((k) => `${encode(k)}=${encode(query[k])}`).join('&');
  const canonicalUri = path.split('/').map(encode).join('/');
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const escopo = `${dia}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, escopo, sha256(canonicalRequest)].join('\n');
  const chave = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dia), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', chave).update(stringToSign).digest('hex');

  return {
    signature,
    headers: { ...todos, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${escopo}, SignedHeaders=${signedHeaders}, Signature=${signature}` },
  };
}

/** Armazenamento R2: enviar(chave, buffer, tipo) devolve a chave gravada. */
function criarArmazenamentoR2({ accountId, bucket, accessKeyId, secretAccessKey, agora = () => new Date() }) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  return {
    async enviar(chave, corpo, contentType) {
      const path = `/${bucket}/${chave}`;
      const amzDate = agora().toISOString().replace(/[-:]|\.\d{3}/g, '');
      const { headers } = assinar({
        method: 'PUT', host, path, payloadHash: sha256(corpo), region: 'auto', accessKeyId, secretAccessKey, amzDate,
        headers: { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' },
      });
      delete headers.host; // o fetch define o Host sozinho
      const res = await fetch(`https://${host}${path}`, { method: 'PUT', headers, body: corpo, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`R2 respondeu ${res.status} ao gravar ${chave}`);
      return chave;
    },
  };
}

module.exports = { assinar, criarArmazenamentoR2, sha256 };
