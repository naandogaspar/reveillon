'use strict';

/**
 * Regras do Feed (fotos com legenda). Não conhece banco nem R2: recebe um
 * "repo" (criar/listar) e um "armazenamento" (enviar), o que deixa tudo testável.
 */

const crypto = require('node:crypto');

const MAX_FOTO_BYTES = 2.5 * 1024 * 1024;
const MAX_AUTOR = 40;
const MAX_LEGENDA = 500;
const PAGINA = 20;

class FeedErro extends Error {
  constructor(status, codigo, mensagem) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

/** Confere os primeiros bytes: JPEG, PNG ou WebP. O resto é validado na conversão. */
function formatoReconhecido(b) {
  if (b.length < 12) return false;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.readUInt32BE(0) === 0x89504e47;
  const webp = b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';
  return jpeg || png || webp;
}

const limpar = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Valida o corpo do POST e devolve os campos já tratados. */
function validarPost(corpo) {
  // O nome é opcional: vazio vira "Convidado" na tela.
  const autor = limpar(corpo && corpo.autor);
  if (autor.length > MAX_AUTOR) throw new FeedErro(422, 'autor_invalido', `O nome pode ter até ${MAX_AUTOR} letras.`);

  const legenda = String((corpo && corpo.legenda) ?? '').replace(/\r\n/g, '\n').trim();
  if (legenda.length > MAX_LEGENDA) throw new FeedErro(422, 'legenda_longa', `A legenda pode ter até ${MAX_LEGENDA} letras.`);

  const base64 = String((corpo && corpo.imagem) || '').replace(/^data:[^,]*,/, '');
  if (!base64) throw new FeedErro(422, 'foto_ausente', 'Escolha uma foto para publicar.');
  const imagem = Buffer.from(base64, 'base64');
  if (imagem.length > MAX_FOTO_BYTES) throw new FeedErro(413, 'foto_grande', 'A foto ficou grande demais. Tente outra.');
  if (!formatoReconhecido(imagem)) throw new FeedErro(415, 'foto_invalida', 'Envie uma foto em JPEG, PNG ou WebP.');
  return { autor, legenda, imagem };
}

/**
 * Dados do aparelho de quem publicou (IP e navegador), só para guardar no banco.
 * Nunca voltam na API nem aparecem na tela.
 */
function dadosDoDispositivo(headers = {}) {
  const h = (n) => { const v = headers[n]; return String(Array.isArray(v) ? v[0] : v || '').trim(); };
  const ip = (h('x-forwarded-for').split(',')[0] || h('x-real-ip')).trim().slice(0, 45);
  const userAgent = h('user-agent').slice(0, 255);
  return { ip: ip || null, userAgent: userAgent || null };
}

function criarServico({ repo, armazenamento, publicUrl, converter = require('./imagem').converterParaWebp, agora = () => new Date(), aleatorio = () => crypto.randomBytes(5).toString('hex') }) {
  const base = String(publicUrl || '').replace(/\/+$/, '');
  const paraApi = (p) => ({
    id: p.id, autor: p.autor, legenda: p.legenda, largura: p.largura, altura: p.altura,
    imagem: `${base}/${p.chave}`, criadoEm: new Date(p.criadoEm).toISOString(),
  });

  return {
    async listar({ antes } = {}) {
      const limite = PAGINA;
      const id = Number(antes) > 0 ? Number(antes) : null;
      const linhas = await repo.listar({ antes: id, limite: limite + 1 });
      const itens = linhas.slice(0, limite).map(paraApi);
      return { itens, temMais: linhas.length > limite };
    },

    async publicar(corpo, dispositivo = {}) {
      const post = validarPost(corpo);
      let foto;
      try {
        foto = await converter(post.imagem);
      } catch (e) {
        console.error('feed (conversão):', e && e.message);
        throw new FeedErro(415, 'foto_invalida', 'Não foi possível ler essa foto. Tente outra.');
      }
      const chave = `feed/${agora().getTime()}-${aleatorio()}.webp`;
      try {
        await armazenamento.enviar(chave, foto.buffer, 'image/webp');
      } catch (e) {
        console.error('feed (R2):', e && e.message);
        throw new FeedErro(502, 'armazenamento_falhou', `Não foi possível gravar a foto no R2 (${(e && e.message) || 'erro desconhecido'}).`);
      }
      const criado = await repo.criar({
        autor: post.autor, legenda: post.legenda, chave, largura: foto.largura, altura: foto.altura, criadoEm: agora(),
        ip: dispositivo.ip || null, userAgent: dispositivo.userAgent || null,
      });
      return paraApi(criado);
    },
  };
}

module.exports = { FeedErro, validarPost, dadosDoDispositivo, criarServico, MAX_FOTO_BYTES, MAX_AUTOR, MAX_LEGENDA, PAGINA };
