'use strict';

const crypto = require('node:crypto');

/** Compara a senha informada com a esperada em tempo constante. */
function samePassword(given, expected) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { samePassword };
