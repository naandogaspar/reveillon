'use strict';

/**
 * Prepara a foto para o bucket: corrige a rotação do celular (EXIF), limita o lado maior
 * a 1600 px e converte para WebP, que é bem menor que JPEG com a mesma qualidade.
 */
const LADO_MAXIMO = 1600;
const QUALIDADE = 78;

async function converterParaWebp(buffer) {
  const sharp = require('sharp');
  const { data, info } = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALIDADE })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, largura: info.width, altura: info.height };
}

module.exports = { converterParaWebp, LADO_MAXIMO, QUALIDADE };
