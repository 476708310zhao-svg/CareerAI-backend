const test = require('node:test');
const assert = require('node:assert/strict');
const { ADZUNA_COUNTRIES, normalizeCountry, globalSampleCountries, isRemoteJobEligible } = require('../utils/jobGeography');

test('country selection accepts global and explicit worldwide alpha-2 codes without a US fallback', () => {
  assert.equal(normalizeCountry('global'), 'global');
  assert.equal(normalizeCountry('global', '德国'), 'de');
  assert.equal(normalizeCountry('JP'), 'jp');
  assert.equal(normalizeCountry('UK'), 'gb');
  assert.equal(normalizeCountry('', '德国'), 'de');
  assert.equal(normalizeCountry('ZZ'), null);
  assert.equal(normalizeCountry('???'), null);
  assert.equal(ADZUNA_COUNTRIES.has('mx'), true);
  assert.equal(ADZUNA_COUNTRIES.has('jp'), false);
});

test('global map samples distinct country pairs over successive days', () => {
  const first = globalSampleCountries(0);
  const second = globalSampleCountries(86_400_000);
  assert.equal(first.length, 2);
  assert.equal(second.length, 2);
  assert.deepEqual(first, ['us', 'gb']);
  assert.deepEqual(second, ['sg', 'de']);
});

test('country search only admits remote jobs with confirmed country or worldwide eligibility', () => {
  assert.equal(isRemoteJobEligible({ location: 'Worldwide' }, 'jp'), true);
  assert.equal(isRemoteJobEligible({ location: 'Tokyo, Japan' }, 'jp'), true);
  assert.equal(isRemoteJobEligible({ location: 'United States only' }, 'jp'), false);
  assert.equal(isRemoteJobEligible({ location: 'Indiana, United States' }, 'in'), false);
  assert.equal(isRemoteJobEligible({ location: 'Remote' }, 'jp'), false);
  assert.equal(isRemoteJobEligible({ location: 'Remote' }, 'global'), true);
});
