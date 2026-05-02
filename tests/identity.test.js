'use strict';
const { test }  = require('node:test');
const assert    = require('node:assert/strict');
const {
  formatCurrency,
  generateId,
  isSelfReference,
  ME_KEYWORDS,
  ALL_KEYWORD,
} = require('../core/identity');

test('formatCurrency: rounds to 2 decimal places with ₹ prefix', () => {
  assert.equal(formatCurrency(123),     '₹123.00');
  assert.equal(formatCurrency(123.4),   '₹123.40');
  assert.equal(formatCurrency(123.456), '₹123.46');
  assert.equal(formatCurrency(0),       '₹0.00');
  assert.equal(formatCurrency('500.5'), '₹500.50');
});

test('generateId: returns a unique-ish 8-13 char string each call', () => {
  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(generateId());
  assert.equal(ids.size, 100, 'all 100 ids should be unique');
  for (const id of ids) {
    assert.match(id, /^[a-z0-9]{8,13}$/);
  }
});

test('isSelfReference: matches me/i/myself in any case, anywhere', () => {
  assert.equal(isSelfReference('me'),     true);
  assert.equal(isSelfReference('I'),      true);
  assert.equal(isSelfReference('myself'), true);
  assert.equal(isSelfReference('and me'), true);
  assert.equal(isSelfReference('Mohit'),  false);
  assert.equal(isSelfReference(''),       false);
  assert.equal(isSelfReference(null),     false);
});

test('ME_KEYWORDS and ALL_KEYWORD constants are exported', () => {
  assert.deepEqual(ME_KEYWORDS, ['me', 'i', 'myself']);
  assert.equal(ALL_KEYWORD, '@all');
});
