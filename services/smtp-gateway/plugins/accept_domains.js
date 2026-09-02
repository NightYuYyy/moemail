'use strict'

const { isAllowedDomain, loadConfig } = require('../lib/config')

exports.register = function () {
  this.cfg = loadConfig(process.env)
}

exports.hook_rcpt = function (next, connection, params) {
  const recipient = params && params[0]
  const domain = String(recipient && recipient.host || '').trim().toLowerCase()

  if (!domain || !isAllowedDomain(domain, this.cfg.acceptedDomainSuffixes)) {
    connection.lognotice(this, `rejecting recipient outside accepted suffixes: ${domain || '(missing)'}`)
    return next(DENY, 'I cannot deliver for that domain')
  }

  return next(OK)
}
