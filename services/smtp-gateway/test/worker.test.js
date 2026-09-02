'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { classifyStatus, retryDelayMs } = require('../lib/worker')

test('classifies ingest responses without losing retryable mail', () => {
  assert.equal(classifyStatus(200), 'delivered')
  assert.equal(classifyStatus(204), 'delivered')
  assert.equal(classifyStatus(400), 'dead')
  assert.equal(classifyStatus(413), 'dead')
  assert.equal(classifyStatus(401), 'retry')
  assert.equal(classifyStatus(429), 'retry')
  assert.equal(classifyStatus(500), 'retry')
})

test('caps exponential retry delay', () => {
  const cfg = { retryIntervalMs: 1000, retryMaxIntervalMs: 5000 }
  assert.equal(retryDelayMs(cfg, 1), 1000)
  assert.equal(retryDelayMs(cfg, 3), 4000)
  assert.equal(retryDelayMs(cfg, 10), 5000)
})
