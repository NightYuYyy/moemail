'use strict'

const { createSpoolItem } = require('./spool')

async function queueMessage(cfg, connection) {
  const item = await createSpoolItem(cfg, connection)
  return {
    status: 'queued',
    id: item.id,
    message: `Queued as ${item.id}`,
  }
}

module.exports = { queueMessage }
