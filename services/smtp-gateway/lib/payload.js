'use strict'

const crypto = require('node:crypto')

function sha256Hex(rawMime) {
  return crypto.createHash('sha256').update(rawMime).digest('hex')
}

function canonicalPayload({ timestamp, nonce, deliveryId, sender, recipients, bodySha256 }) {
  return [timestamp, nonce, deliveryId, sender, recipients, bodySha256].join('\n')
}

function signatureFor(secret, input) {
  return crypto.createHmac('sha256', secret).update(canonicalPayload(input)).digest('hex')
}

function buildRequest(meta, rawMime, secret, now = new Date()) {
  const timestamp = String(Math.floor(now.getTime() / 1000))
  const nonce = crypto.randomBytes(24).toString('hex')
  const sender = String(meta.sender || '').trim().toLowerCase()
  const recipients = Array.from(new Set(
    (meta.recipients || []).map(value => String(value).trim().toLowerCase()).filter(Boolean),
  )).join(',')
  const input = {
    timestamp,
    nonce,
    deliveryId: meta.id,
    sender,
    recipients,
    bodySha256: sha256Hex(rawMime),
  }

  return {
    headers: {
      'content-type': 'message/rfc822',
      'x-moe-timestamp': timestamp,
      'x-moe-nonce': nonce,
      'x-moe-delivery-id': meta.id,
      'x-moe-sender': sender,
      'x-moe-recipients': recipients,
      'x-moe-signature': `v1=${signatureFor(secret, input)}`,
    },
    body: rawMime,
  }
}

module.exports = { buildRequest, canonicalPayload, sha256Hex, signatureFor }
