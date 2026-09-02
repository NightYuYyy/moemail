'use strict'

const { isAllowedDomain, loadConfig } = require('../lib/config')
const { fetchDomainRules } = require('../lib/domain-rules')

exports.register = function () {
  this.cfg = loadConfig(process.env)
  this.acceptedDomainRules = this.cfg.acceptedDomainRules
  this.refreshDomainRules = async () => {
    try {
      this.acceptedDomainRules = await fetchDomainRules(this.cfg)
      this.loginfo(this, `loaded ${this.acceptedDomainRules.length} domain rules`)
    } catch (error) {
      this.lognotice(this, `keeping last known domain rules: ${error.message}`)
    }
  }
  this.refreshDomainRules()
  this.domainRulesTimer = setInterval(this.refreshDomainRules, this.cfg.domainRulesRefreshIntervalMs)
  this.domainRulesTimer.unref()
}

exports.hook_rcpt = function (next, connection, params) {
  const recipient = params && params[0]
  const domain = String(recipient && recipient.host || '').trim().toLowerCase()

  if (!domain || !isAllowedDomain(domain, this.acceptedDomainRules)) {
    connection.lognotice(this, `rejecting recipient outside accepted suffixes: ${domain || '(missing)'}`)
    return next(DENY, 'I cannot deliver for that domain')
  }

  return next(OK)
}

exports.shutdown = function () {
  if (this.domainRulesTimer) clearInterval(this.domainRulesTimer)
}
