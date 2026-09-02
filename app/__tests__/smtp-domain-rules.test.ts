import { describe, expect, it } from "vitest"
import {
  getSmtpAllowedDomainRules,
  isSmtpRecipientAllowed,
} from "../../workers/lib/smtp-domain-rules"

describe("SMTP domain rules", () => {
  it("creates wildcard rules for multiple accepted suffixes", () => {
    expect(getSmtpAllowedDomainRules({
      SMTP_ALLOWED_DOMAIN_SUFFIXES: "nightyu.com, NIGHTUU.com,*.nightyu.com",
    })).toBe("*.nightyu.com,*.nightuu.com")
  })

  it("keeps compatibility with the legacy singular setting", () => {
    expect(getSmtpAllowedDomainRules({ SMTP_ALLOWED_DOMAIN: "nightyu.com" }))
      .toBe("*.nightyu.com")
  })

  it("accepts subdomains of either configured suffix", () => {
    const rules = "*.nightyu.com,*.nightuu.com"

    expect(isSmtpRecipientAllowed("mailbox@a.nightyu.com", rules)).toBe(true)
    expect(isSmtpRecipientAllowed("mailbox@tenant.nightuu.com", rules)).toBe(true)
    expect(isSmtpRecipientAllowed("mailbox@nightuu.com", rules)).toBe(false)
  })

  it("rejects malformed recipients and suffix-confusion domains", () => {
    const rules = "*.nightuu.com"

    expect(isSmtpRecipientAllowed("missing-at", rules)).toBe(false)
    expect(isSmtpRecipientAllowed("mailbox@evilnightuu.com", rules)).toBe(false)
    expect(isSmtpRecipientAllowed("mailbox@nightuu.com.evil.test", rules)).toBe(false)
  })
})
