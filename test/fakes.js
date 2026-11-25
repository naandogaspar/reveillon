'use strict';

/** Repositório e armazenamento em memória, para testes e para o modo de demonstração. */

function repoMemoria(inicial = []) {
  const linhas = [...inicial];
  let proximo = linhas.reduce((m, l) => Math.max(m, l.id), 0) + 1;
  return {
    linhas,
    async listar({ antes, limite }) {
      return linhas.filter((l) => !antes || l.id < antes).sort((a, b) => b.id - a.id).slice(0, limite);
    },
    async criar(p) {
      const l = { id: proximo++, ...p };
      linhas.push(l);
      return l;
    },
  };
}

function armazenamentoMemoria() {
  const objetos = new Map();
  return { objetos, async enviar(chave, corpo, tipo) { objetos.set(chave, { corpo, tipo }); return chave; } };
}

/** Menor JPEG válido possível com as dimensões pedidas (só cabeçalhos; basta para validação). */
function jpegFalso(largura, altura, extra = 0) {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, altura >> 8, altura & 255, largura >> 8, largura & 255, 0x01, 0x01, 0x11, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]), sof, Buffer.alloc(extra), Buffer.from([0xff, 0xd9])]);
}

module.exports = { repoMemoria, armazenamentoMemoria, jpegFalso };
