'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildRequest, signatureFor } = require('../lib/payload')

test('buildRequest binds the HMAC to the envelope and raw MIME body', () => {
  const raw = Buffer.from('Subject: hello\r\n\r\nbody')
  const secret = 'test-secret-that-is-at-least-32-characters-long'
  const result = buildRequest({
    id: 'delivery-1',
    sender: 'Sender@Example.com',
    recipients: ['User@A.NightYu.com'],
  }, raw, secret, new Date('2026-09-02T00:00:00Z'))

  assert.equal(result.body, raw)
  assert.equal(result.headers['x-moe-sender'], 'sender@example.com')
  assert.equal(result.headers['x-moe-recipients'], 'user@a.nightyu.com')
  assert.match(result.headers['x-moe-signature'], /^v1=[a-f0-9]{64}$/)

  const input = {
    timestamp: result.headers['x-moe-timestamp'],
    nonce: result.headers['x-moe-nonce'],
    deliveryId: result.headers['x-moe-delivery-id'],
    sender: result.headers['x-moe-sender'],
    recipients: result.headers['x-moe-recipients'],
    bodySha256: require('../lib/payload').sha256Hex(raw),
  }
  assert.equal(result.headers['x-moe-signature'], `v1=${signatureFor(secret, input)}`)
})
