'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {};
const { redimensionar, maiorRetangulo } = require('../public/crop.js');

test('maiorRetangulo: 1:1 numa foto horizontal fica centralizado', () => {
  const r = maiorRetangulo(1600, 900, 1);
  assert.deepEqual(r, { x: 350, y: 0, w: 900, h: 900 });
});

test('maiorRetangulo: 9:16 numa foto horizontal usa a altura toda', () => {
  const r = maiorRetangulo(1600, 900, 9 / 16);
  assert.ok(Math.abs(r.w / r.h - 9 / 16) < 1e-9);
  assert.equal(r.h, 900);
});

test('livre: arrastar o canto muda largura e altura separadamente e respeita os limites', () => {
  const r = redimensionar({ x: 0, y: 0, w: 1000, h: 800 }, { r: true, b: true }, 600, 5000, 1000, 800, 0, 20);
  assert.deepEqual(r, { x: 0, y: 0, w: 600, h: 800 });
});

test('livre: não deixa a moldura ficar menor que o mínimo', () => {
  const r = redimensionar({ x: 100, y: 100, w: 300, h: 300 }, { l: true }, 900, 0, 1000, 800, 0, 50);
  assert.equal(r.w, 50); assert.equal(r.x, 350);
});

test('proporção travada: o canto mantém a razão e o canto oposto fica parado', () => {
  const ini = { x: 100, y: 100, w: 400, h: 400 };
  const r = redimensionar(ini, { r: true, b: true }, 700, 650, 1000, 1000, 1, 20);
  assert.equal(r.x, 100); assert.equal(r.y, 100);
  assert.ok(Math.abs(r.w / r.h - 1) < 1e-9);
  assert.equal(r.w, 600);
});

test('proporção travada: nunca sai da foto', () => {
  const r = redimensionar({ x: 0, y: 0, w: 400, h: 500 }, { r: true, b: true }, 5000, 5000, 1000, 800, 4 / 5, 20);
  assert.ok(r.x + r.w <= 1000 + 1e-9 && r.y + r.h <= 800 + 1e-9);
  assert.ok(Math.abs(r.w / r.h - 0.8) < 1e-9);
});

test('proporção travada: lateral cresce centralizada na vertical', () => {
  const r = redimensionar({ x: 0, y: 300, w: 200, h: 200 }, { r: true }, 400, 0, 1000, 800, 1, 20);
  assert.equal(r.w, 400); assert.equal(r.h, 400); assert.equal(r.y, 200);
});
