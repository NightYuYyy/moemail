import { describe, expect, it } from "vitest"
import {
  isEmailDomainAllowed,
  normalizeEmailDomain,
  normalizeEmailDomainRules,
  parseEmailDomainRules,
} from "@/lib/email-domain"

describe("email domain rules", () => {
  it("normalizes exact and wildcard rules", () => {
    expect(normalizeEmailDomainRules(" NightYu.COM, *.NightYu.com,nightyu.com "))
      .toBe("nightyu.com,*.nightyu.com")
  })

  it("matches explicit domains", () => {
    expect(isEmailDomainAllowed("nightyu.com", "nightyu.com")).toBe(true)
    expect(isEmailDomainAllowed("a.nightyu.com", "nightyu.com")).toBe(false)
  })

  it("matches wildcard subdomains but not the apex", () => {
    expect(isEmailDomainAllowed("a.nightyu.com", "*.nightyu.com")).toBe(true)
    expect(isEmailDomainAllowed("deep.a.nightyu.com", "*.nightyu.com")).toBe(true)
    expect(isEmailDomainAllowed("nightyu.com", "*.nightyu.com")).toBe(false)
  })

  it("does not match suffix-confusion domains", () => {
    expect(isEmailDomainAllowed("evilnightyu.com", "*.nightyu.com")).toBe(false)
    expect(isEmailDomainAllowed("nightyu.com.evil.test", "*.nightyu.com")).toBe(false)
  })

  it("rejects malformed domains and rules", () => {
    expect(normalizeEmailDomain("-bad.nightyu.com")).toBeNull()
    expect(normalizeEmailDomain("bad_.nightyu.com")).toBeNull()
    expect(normalizeEmailDomainRules("nightyu.com,*nightyu.com")).toBeNull()
  })

  it("deduplicates normalized rules", () => {
    expect(parseEmailDomainRules("nightyu.com,NIGHTYU.COM").map(rule => rule.value))
      .toEqual(["nightyu.com"])
  })
})
