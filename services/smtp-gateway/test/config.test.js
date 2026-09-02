'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { isAllowedDomain, loadConfig, parseList } = require('../lib/config')

test('accepts only real subdomains below configured suffixes', () => {
  const suffixes = parseList('*.NightYu.com, example.net')
  assert.equal(isAllowedDomain('a.nightyu.com', suffixes), true)
  assert.equal(isAllowedDomain('deep.a.nightyu.com', suffixes), true)
  assert.equal(isAllowedDomain('nightyu.com', suffixes), false)
  assert.equal(isAllowedDomain('evilnightyu.com', suffixes), false)
  assert.equal(isAllowedDomain('nightyu.com.evil.test', suffixes), false)
})

test('requires https, a domain suffix, and a strong shared secret in production', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /ACCEPTED_DOMAIN_SUFFIXES/)
  assert.throws(() => loadConfig({
    NODE_ENV: 'production',
    ACCEPTED_DOMAIN_SUFFIXES: 'nightyu.com',
    MOEMAIL_INGEST_SECRET: 'short',
  }), /at least 32/)
  assert.throws(() => loadConfig({
    NODE_ENV: 'production',
    ACCEPTED_DOMAIN_SUFFIXES: 'nightyu.com',
    MOEMAIL_INGEST_SECRET: 'x'.repeat(32),
    MOEMAIL_INGEST_URL: 'http://localhost/inbound',
  }), /https/)
})
