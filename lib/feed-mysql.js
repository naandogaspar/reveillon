'use strict';

/**
 * Repositório do Feed no MySQL/MariaDB. A tabela é criada sozinha no primeiro uso.
 * `ip` e `user_agent` só são gravados; as consultas de listagem nunca os devolvem.
 */

const SQL_TABELA = `CREATE TABLE IF NOT EXISTS feed_posts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  autor VARCHAR(40) NOT NULL,
  legenda VARCHAR(500) NOT NULL DEFAULT '',
  imagem_chave VARCHAR(120) NOT NULL,
  largura SMALLINT UNSIGNED NOT NULL,
  altura SMALLINT UNSIGNED NOT NULL,
  criado_em DATETIME NOT NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

/** `conexao`: URL mysql://usuario:senha@host:porta/banco ou objeto de opções do mysql2. */
function criarRepoMysql(conexao) {
  const mysql = require('mysql2/promise');
  // Instâncias serverless são efêmeras: uma conexão por instância basta.
  const base = { connectionLimit: 1, connectTimeout: 8000, timezone: 'Z', charset: 'utf8mb4' };
  const pool = typeof conexao === 'string'
    ? mysql.createPool({ uri: conexao, ...base })
    : mysql.createPool({ ...conexao, ...base });

  let pronto = null;
  const garantirTabela = () => (pronto ||= pool.query(SQL_TABELA).catch((e) => { pronto = null; throw e; }));

  return {
    async listar({ antes, limite }) {
      await garantirTabela();
      const [linhas] = await pool.query(
        `SELECT id, autor, legenda, imagem_chave AS chave, largura, altura, criado_em AS criadoEm
         FROM feed_posts ${antes ? 'WHERE id < ?' : ''} ORDER BY id DESC LIMIT ?`,
        antes ? [antes, limite] : [limite],
      );
      return linhas;
    },
    async criar({ autor, legenda, chave, largura, altura, criadoEm, ip, userAgent }) {
      await garantirTabela();
      const [r] = await pool.query(
        'INSERT INTO feed_posts (autor, legenda, imagem_chave, largura, altura, criado_em, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [autor, legenda, chave, largura, altura, criadoEm, ip || null, userAgent || null],
      );
      return { id: r.insertId, autor, legenda, chave, largura, altura, criadoEm };
    },
  };
}

module.exports = { criarRepoMysql, SQL_TABELA };
