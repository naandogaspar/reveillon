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

/** Lê largura e altura de um JPEG procurando o marcador SOF. */
function dimensoesJpeg(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marcador = buf[i + 1];
    if (marcador === 0xff) { i++; continue; }
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
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
  if (imagem.length < 4 || imagem[0] !== 0xff || imagem[1] !== 0xd8 || imagem[2] !== 0xff) {
    throw new FeedErro(415, 'foto_invalida', 'Envie uma foto em JPEG.');
  }
  const dim = dimensoesJpeg(imagem);
  if (!dim || !dim.largura || !dim.altura) throw new FeedErro(415, 'foto_invalida', 'Não foi possível ler essa foto.');
  return { autor, legenda, imagem, ...dim };
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

function criarServico({ repo, armazenamento, publicUrl, agora = () => new Date(), aleatorio = () => crypto.randomBytes(5).toString('hex') }) {
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
      const chave = `feed/${agora().getTime()}-${aleatorio()}.jpg`;
      try {
        await armazenamento.enviar(chave, post.imagem, 'image/jpeg');
      } catch (e) {
        console.error('feed (R2):', e && e.message);
        throw new FeedErro(502, 'armazenamento_falhou', `Não foi possível gravar a foto no R2 (${(e && e.message) || 'erro desconhecido'}).`);
      }
      const criado = await repo.criar({
        autor: post.autor, legenda: post.legenda, chave, largura: post.largura, altura: post.altura, criadoEm: agora(),
        ip: dispositivo.ip || null, userAgent: dispositivo.userAgent || null,
      });
      return paraApi(criado);
    },
  };
}

module.exports = { FeedErro, validarPost, dadosDoDispositivo, dimensoesJpeg, criarServico, MAX_FOTO_BYTES, MAX_AUTOR, MAX_LEGENDA, PAGINA };
