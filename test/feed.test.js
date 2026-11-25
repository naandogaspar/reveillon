'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../lib/feed');
const R2 = require('../lib/r2');
const { repoMemoria, armazenamentoMemoria, jpegFalso } = require('./fakes');
const { criarHandler } = require('../api/feed');

const foto = (w = 800, h = 600, extra = 0) => jpegFalso(w, h, extra).toString('base64');
const montar = () => {
  const repo = repoMemoria();
  const armazenamento = armazenamentoMemoria();
  let n = 0;
  const servico = F.criarServico({
    repo, armazenamento, publicUrl: 'https://pub.r2.dev/',
    agora: () => new Date('2026-11-25T21:00:00Z'), aleatorio: () => `abc${n++}`,
  });
  return { repo, armazenamento, servico };
};

test('assinatura SigV4 confere com o exemplo oficial da AWS (GET com Range)', () => {
  const { signature } = R2.assinar({
    method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', headers: { range: 'bytes=0-9' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    region: 'us-east-1', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    amzDate: '20130524T000000Z',
  });
  assert.equal(signature, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('dimensoesJpeg lê largura e altura', () => {
  assert.deepEqual(F.dimensoesJpeg(jpegFalso(1200, 800)), { largura: 1200, altura: 800 });
  assert.equal(F.dimensoesJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0])), null);
});

test('publicar: grava a foto, cria o post e devolve a URL pública', async () => {
  const { servico, repo, armazenamento } = montar();
  const p = await servico.publicar({ autor: '  Fer   nando ', legenda: ' Chegamos! ', imagem: foto(1600, 1200) });
  assert.equal(p.autor, 'Fer nando');
  assert.equal(p.legenda, 'Chegamos!');
  assert.deepEqual([p.largura, p.altura], [1600, 1200]);
  assert.match(p.imagem, /^https:\/\/pub\.r2\.dev\/feed\/\d+-abc0\.jpg$/);
  assert.equal(repo.linhas.length, 1);
  assert.equal([...armazenamento.objetos.values()][0].tipo, 'image/jpeg');
  assert.equal(p.criadoEm, '2026-11-25T21:00:00.000Z');
});

test('publicar: o nome é opcional', async () => {
  const { servico } = montar();
  const p = await servico.publicar({ imagem: foto() });
  assert.equal(p.autor, '');
  assert.equal(p.legenda, '');
});

test('publicar: guarda IP e navegador no banco, mas a resposta e a lista não os devolvem', async () => {
  const { servico, repo } = montar();
  const disp = F.dadosDoDispositivo({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'Mozilla/5.0 (iPhone)' });
  assert.deepEqual(disp, { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)' });
  const p = await servico.publicar({ autor: 'Ana', imagem: foto() }, disp);
  assert.equal(repo.linhas[0].ip, '203.0.113.7');
  assert.equal(repo.linhas[0].userAgent, 'Mozilla/5.0 (iPhone)');
  const texto = JSON.stringify([p, await servico.listar()]);
  assert.doesNotMatch(texto, /203\.0\.113|Mozilla|userAgent|"ip"/);
});

test('dadosDoDispositivo: sem cabeçalhos vira null e limita o tamanho', () => {
  assert.deepEqual(F.dadosDoDispositivo({}), { ip: null, userAgent: null });
  assert.equal(F.dadosDoDispositivo({ 'user-agent': 'x'.repeat(400) }).userAgent.length, 255);
  assert.equal(F.dadosDoDispositivo({ 'x-real-ip': '198.51.100.9' }).ip, '198.51.100.9');
});

test('publicar: aceita prefixo data: e legenda vazia', async () => {
  const { servico } = montar();
  const p = await servico.publicar({ autor: 'Ana', legenda: '', imagem: `data:image/jpeg;base64,${foto()}` });
  assert.equal(p.legenda, '');
});

test('publicar: rejeita autor, legenda, foto ausente, tipo e tamanho inválidos', async () => {
  const { servico, armazenamento } = montar();
  const erro = async (corpo, status, codigo) => {
    await assert.rejects(() => servico.publicar(corpo), (e) => e instanceof F.FeedErro && e.status === status && e.codigo === codigo);
  };
  await erro({ autor: 'x'.repeat(41), imagem: foto() }, 422, 'autor_invalido');
  await erro({ autor: 'Ana', legenda: 'y'.repeat(501), imagem: foto() }, 422, 'legenda_longa');
  await erro({ autor: 'Ana' }, 422, 'foto_ausente');
  await erro({ autor: 'Ana', imagem: Buffer.from('<?php echo 1;').toString('base64') }, 415, 'foto_invalida');
  await erro({ autor: 'Ana', imagem: foto(100, 100, F.MAX_FOTO_BYTES) }, 413, 'foto_grande');
  assert.equal(armazenamento.objetos.size, 0); // nada vai para o R2 quando a validação falha
});

test('listar: mais novos primeiro, paginação por "antes"', async () => {
  const { servico } = montar();
  for (let i = 1; i <= F.PAGINA + 3; i++) await servico.publicar({ autor: `P${i}`, imagem: foto() });
  const a = await servico.listar();
  assert.equal(a.itens.length, F.PAGINA);
  assert.equal(a.itens[0].autor, `P${F.PAGINA + 3}`);
  assert.equal(a.temMais, true);
  const b = await servico.listar({ antes: a.itens.at(-1).id });
  assert.deepEqual(b.itens.map((x) => x.autor), ['P3', 'P2', 'P1']);
  assert.equal(b.temMais, false);
});

// ------------------------------------------------------------------- handler HTTP

const resposta = () => {
  const r = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.codigo = c; return this; }, json(o) { this.corpo = o; return this; } };
  return r;
};

test('api/feed: senha, envio bloqueado sem senha configurada e fluxo feliz', async () => {
  const { servico } = montar();
  const handler = criarHandler(() => servico);
  const anterior = process.env.DASHBOARD_PASSWORD;
  try {
    delete process.env.DASHBOARD_PASSWORD;
    let r = await handler({ method: 'POST', headers: {}, body: { autor: 'Ana', imagem: foto() } }, resposta());
    assert.equal(r.codigo, 403);
    assert.equal(r.corpo.erro, 'envio_bloqueado');

    process.env.DASHBOARD_PASSWORD = 'festa';
    r = await handler({ method: 'GET', headers: {}, query: {} }, resposta());
    assert.equal(r.codigo, 401);
    r = await handler({ method: 'POST', headers: { 'x-senha': 'errada' }, body: {} }, resposta());
    assert.equal(r.codigo, 401);

    r = await handler({ method: 'POST', headers: { 'x-senha': 'festa', 'x-forwarded-for': '203.0.113.7' }, body: { legenda: 'oi', imagem: foto() } }, resposta());
    assert.equal(r.codigo, 201);
    assert.equal(r.corpo.autor, '');
    assert.equal(r.corpo.ip, undefined);
    assert.equal(r.headers['Cache-Control'], 'no-store');
    r = await handler({ method: 'POST', headers: { 'x-senha': 'festa' }, body: { autor: 'x'.repeat(41), imagem: foto() } }, resposta());
    assert.equal(r.codigo, 422);
    r = await handler({ method: 'GET', headers: { 'x-senha': 'festa' }, query: {} }, resposta());
    assert.equal(r.codigo, 200);
    assert.equal(r.corpo.itens.length, 1);
    r = await handler({ method: 'DELETE', headers: { 'x-senha': 'festa' } }, resposta());
    assert.equal(r.codigo, 405);
  } finally {
    if (anterior === undefined) delete process.env.DASHBOARD_PASSWORD; else process.env.DASHBOARD_PASSWORD = anterior;
  }
});

test('api/feed: sem configuração devolve 503 explicando o que falta', async () => {
  const handler = criarHandler();
  const guardado = { ...process.env };
  ['DATABASE_URL', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL', 'DASHBOARD_PASSWORD'].forEach((k) => delete process.env[k]);
  try {
    const r = await handler({ method: 'GET', headers: {}, query: {} }, resposta());
    assert.equal(r.codigo, 503);
    assert.match(r.corpo.detalhe, /DATABASE_URL/);
  } finally {
    Object.assign(process.env, guardado);
  }
});
