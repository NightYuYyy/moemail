import {
  isEmailDomainAllowed,
  normalizeEmailDomain,
  normalizeEmailDomainRules,
} from "../../app/lib/email-domain"

export interface SmtpDomainRuleEnv {
  SMTP_ALLOWED_DOMAIN_SUFFIXES?: string
  SMTP_ALLOWED_DOMAIN?: string
}

export interface EmailDomainRulesStore {
  get(key: string): Promise<string | null>
}

export function getSmtpAllowedDomainRules(env: SmtpDomainRuleEnv): string {
  const configured = env.SMTP_ALLOWED_DOMAIN_SUFFIXES ?? env.SMTP_ALLOWED_DOMAIN ?? "nightyu.com"
  const rules = new Set<string>()

  for (const rawSuffix of configured.split(",")) {
    const suffix = normalizeEmailDomain(rawSuffix.trim().replace(/^\*\./, ""))
    if (suffix) rules.add(`*.${suffix}`)
  }

  return Array.from(rules).join(",")
}

export function isSmtpRecipientAllowed(recipient: string, rules: string): boolean {
  const normalizedRecipient = recipient.trim().toLowerCase()
  const at = normalizedRecipient.lastIndexOf("@")

  return at > 0 && isEmailDomainAllowed(normalizedRecipient.slice(at + 1), rules)
}

export async function getConfiguredEmailDomainRules(
  store: EmailDomainRulesStore,
  fallbackEnv: SmtpDomainRuleEnv,
): Promise<string> {
  try {
    const configured = await store.get("EMAIL_DOMAINS")
    const normalized = configured ? normalizeEmailDomainRules(configured) : null
    if (normalized) return normalized
  } catch {
    // KV 暂时不可用时保留已部署的静态白名单，避免中断现有邮件。
  }

  return getSmtpAllowedDomainRules(fallbackEnv)
}
