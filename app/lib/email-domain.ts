const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export interface EmailDomainRule {
  type: "exact" | "wildcard"
  value: string
  baseDomain: string
}

export function normalizeEmailDomain(domain: string): string | null {
  const normalized = domain.trim().toLowerCase().replace(/\.$/, "")

  if (!normalized || normalized.length > 253 || normalized.includes("*")) {
    return null
  }

  const labels = normalized.split(".")
  if (labels.length < 2 || labels.some(label => !DOMAIN_LABEL_PATTERN.test(label))) {
    return null
  }

  return normalized
}

export function normalizeEmailDomainRule(rule: string): EmailDomainRule | null {
  const normalizedRule = rule.trim().toLowerCase().replace(/\.$/, "")
  const wildcard = normalizedRule.startsWith("*.")
  const baseDomain = normalizeEmailDomain(wildcard ? normalizedRule.slice(2) : normalizedRule)

  if (!baseDomain) {
    return null
  }

  return {
    type: wildcard ? "wildcard" : "exact",
    value: wildcard ? `*.${baseDomain}` : baseDomain,
    baseDomain,
  }
}

export function parseEmailDomainRules(value: string): EmailDomainRule[] {
  const seen = new Set<string>()
  const rules: EmailDomainRule[] = []

  for (const rawRule of value.split(",")) {
    const rule = normalizeEmailDomainRule(rawRule)
    if (!rule || seen.has(rule.value)) continue
    seen.add(rule.value)
    rules.push(rule)
  }

  return rules
}

export function normalizeEmailDomainRules(value: string): string | null {
  const rawRules = value.split(",").map(rule => rule.trim()).filter(Boolean)
  if (rawRules.length === 0) return null

  const normalizedRules = rawRules.map(normalizeEmailDomainRule)
  if (normalizedRules.some(rule => !rule)) return null

  return Array.from(new Set(normalizedRules.map(rule => rule!.value))).join(",")
}

export function isEmailDomainAllowed(domain: string, rulesValue: string): boolean {
  const normalizedDomain = normalizeEmailDomain(domain)
  if (!normalizedDomain) return false

  return parseEmailDomainRules(rulesValue).some(rule => {
    if (rule.type === "exact") return normalizedDomain === rule.baseDomain
    return normalizedDomain !== rule.baseDomain && normalizedDomain.endsWith(`.${rule.baseDomain}`)
  })
}

export function isWildcardEmailDomainRule(value: string): boolean {
  return normalizeEmailDomainRule(value)?.type === "wildcard"
}
