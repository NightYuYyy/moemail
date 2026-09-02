'use strict'

const crypto = require('node:crypto')

const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const DOMAIN_RULES_AUTH_PAYLOAD = 'GET\n/v1/domain-rules'

function normalizeDomain(value) {
  const domain = String(value || '').trim().toLowerCase().replace(/\.$/, '')
  if (!domain || domain.length > 253 || domain.includes('*')) return null
  const labels = domain.split('.')
  if (labels.length < 2 || labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))) return null
  return domain
}

function normalizeDomainRule(value) {
  const input = String(value || '').trim().toLowerCase().replace(/\.$/, '')
  const wildcard = input.startsWith('*.')
  const domain = normalizeDomain(wildcard ? input.slice(2) : input)
  if (!domain) return null
  return wildcard ? `*.${domain}` : domain
}

function parseDomainRules(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  const rules = []
  const seen = new Set()
  for (const item of values) {
    const rule = normalizeDomainRule(item)
    if (!rule || seen.has(rule)) continue
    seen.add(rule)
    rules.push(rule)
  }
  return rules
}

function isAllowedDomain(domain, rules) {
  const normalized = normalizeDomain(domain)
  if (!normalized) return false
  return rules.some((rule) => {
    if (!rule.startsWith('*.')) return normalized === rule
    const baseDomain = rule.slice(2)
    return normalized !== baseDomain && normalized.endsWith(`.${baseDomain}`)
  })
}

function domainRulesSignature(secret) {
  return crypto.createHmac('sha256', secret).update(DOMAIN_RULES_AUTH_PAYLOAD).digest('hex')
}

async function fetchDomainRules(cfg, fetchImpl = fetch) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), cfg.webhookTimeoutMs)
  try {
    const response = await fetchImpl(cfg.domainRulesUrl, {
      headers: { 'X-Moe-Signature': `v1=${domainRulesSignature(cfg.ingestSecret)}` },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`domain rules endpoint returned HTTP ${response.status}`)
    const data = await response.json()
    const rules = parseDomainRules(data && data.rules)
    if (rules.length === 0) throw new Error('domain rules endpoint returned no valid rules')
    return rules
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = {
  domainRulesSignature,
  fetchDomainRules,
  isAllowedDomain,
  normalizeDomainRule,
  parseDomainRules,
}
