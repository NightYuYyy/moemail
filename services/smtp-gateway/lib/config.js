'use strict'

const path = require('node:path')

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, ''))
    .filter(Boolean)
}

function parsePositiveInt(value, defaultValue) {
  if (value === undefined || value === '') return defaultValue
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function requireHttpsUrl(value, name, nodeEnv) {
  if (!value) throw new Error(`${name} is required`)
  const url = new URL(value)
  const allowHttp = nodeEnv !== 'production' && url.protocol === 'http:'
  if (url.protocol !== 'https:' && !allowHttp) throw new Error(`${name} must use https://`)
  return url.toString()
}

function isAllowedDomain(domain, suffixes) {
  const normalized = String(domain || '').trim().toLowerCase().replace(/\.$/, '')
  return suffixes.some((suffix) => normalized !== suffix && normalized.endsWith(`.${suffix}`))
}

function loadConfig(env = process.env) {
  const spoolDir = env.SPOOL_DIR || '/var/spool/moemail-gateway'
  const acceptedDomainSuffixes = parseList(env.ACCEPTED_DOMAIN_SUFFIXES)
  const ingestSecret = String(env.MOEMAIL_INGEST_SECRET || '')

  if (acceptedDomainSuffixes.length === 0) {
    throw new Error('ACCEPTED_DOMAIN_SUFFIXES is required')
  }
  if (ingestSecret.length < 32) {
    throw new Error('MOEMAIL_INGEST_SECRET must contain at least 32 characters')
  }

  return {
    ingestUrl: requireHttpsUrl(env.MOEMAIL_INGEST_URL, 'MOEMAIL_INGEST_URL', env.NODE_ENV),
    ingestSecret,
    acceptedDomainSuffixes,
    smtpTlsCertPath: env.SMTP_TLS_CERT_PATH || '',
    smtpTlsKeyPath: env.SMTP_TLS_KEY_PATH || '',
    spoolDir,
    pendingDir: path.join(spoolDir, 'pending'),
    processingDir: path.join(spoolDir, 'processing'),
    deadDir: path.join(spoolDir, 'dead'),
    tmpDir: path.join(spoolDir, 'tmp'),
    webhookTimeoutMs: parsePositiveInt(env.WEBHOOK_TIMEOUT_MS, 15000),
    retryIntervalMs: parsePositiveInt(env.RETRY_INTERVAL_MS, 30000),
    retryMaxIntervalMs: parsePositiveInt(env.RETRY_MAX_INTERVAL_MS, 3600000),
    retryScanIntervalMs: parsePositiveInt(env.RETRY_SCAN_INTERVAL_MS, 5000),
    maxRetryAgeMs: parsePositiveInt(env.MAX_RETRY_AGE_MS, 0),
  }
}

module.exports = { isAllowedDomain, loadConfig, parseList }
