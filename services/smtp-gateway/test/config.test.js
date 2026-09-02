'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { isAllowedDomain, loadConfig, parseList } = require('../lib/config')
const { domainRulesSignature, fetchDomainRules, parseDomainRules } = require('../lib/domain-rules')

test('accepts only real subdomains below configured suffixes', () => {
  const rules = parseDomainRules('*.NightYu.com, example.net')
  assert.equal(isAllowedDomain('a.nightyu.com', rules), true)
  assert.equal(isAllowedDomain('deep.a.nightyu.com', rules), true)
  assert.equal(isAllowedDomain('nightyu.com', rules), false)
  assert.equal(isAllowedDomain('example.net', rules), true)
  assert.equal(isAllowedDomain('evilnightyu.com', rules), false)
  assert.equal(isAllowedDomain('nightyu.com.evil.test', rules), false)
})

test('loads authenticated domain rules from the Email Worker', async () => {
  const secret = 'x'.repeat(32)
  const cfg = {
    domainRulesUrl: 'https://worker.example/v1/domain-rules',
    ingestSecret: secret,
    webhookTimeoutMs: 1000,
  }
  const rules = await fetchDomainRules(cfg, async (url, init) => {
    assert.equal(url, cfg.domainRulesUrl)
    assert.equal(init.headers['X-Moe-Signature'], `v1=${domainRulesSignature(secret)}`)
    return { ok: true, json: async () => ({ rules: ['nightyu.com', '*.nightuu.com'] }) }
  })

  assert.deepEqual(rules, ['nightyu.com', '*.nightuu.com'])
})

test('uses the same domain rule signature as the Email Worker', () => {
  assert.equal(
    domainRulesSignature('test-secret-that-is-at-least-32-characters-long'),
    '5f5c132347c5887cfdfe96a423a614788ab2c200087ab1a5d80606b3d5a66b5b',
  )
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
