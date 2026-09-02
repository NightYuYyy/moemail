"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Globe2, ListPlus, Network, Plus, RotateCcw, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { mergeEmailDomainRules, parseEmailDomainRules } from "@/lib/email-domain"

interface DomainRulesManagerProps {
  value: string
  disabled?: boolean
  pending?: boolean
  onChange: (value: string) => void
  onReset: () => void
}

type DomainType = "exact" | "wildcard"
type Feedback = { tone: "error" | "success" | "muted"; message: string } | null

export function DomainRulesManager({
  value,
  disabled = false,
  pending = false,
  onChange,
  onReset,
}: DomainRulesManagerProps) {
  const t = useTranslations("profile.website.domainManager")
  const [domain, setDomain] = useState("")
  const [domainType, setDomainType] = useState<DomainType>("wildcard")
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchValue, setBatchValue] = useState("")
  const [feedback, setFeedback] = useState<Feedback>(null)
  const rules = useMemo(() => parseEmailDomainRules(value), [value])
  const exactCount = rules.filter(rule => rule.type === "exact").length
  const wildcardCount = rules.length - exactCount

  const applyInput = (input: string, batch = false) => {
    const result = mergeEmailDomainRules(value, input)
    if (result.added.length > 0) onChange(result.value)

    if (result.invalid.length > 0) {
      setFeedback({
        tone: "error",
        message: t("invalid", { domains: result.invalid.join(", ") }),
      })
      return result
    }
    if (result.added.length === 0) {
      setFeedback({ tone: "muted", message: t("duplicate") })
      return result
    }

    setFeedback({
      tone: "success",
      message: batch ? t("batchAdded", { count: result.added.length }) : t("added"),
    })
    return result
  }

  const addDomain = () => {
    const baseDomain = domain.trim().replace(/^\*\./, "")
    if (!baseDomain) {
      setFeedback({ tone: "error", message: t("required") })
      return
    }

    const candidate = domainType === "wildcard" ? `*.${baseDomain}` : baseDomain
    const result = applyInput(candidate)
    if (result.added.length > 0) setDomain("")
  }

  const addBatch = () => {
    if (!batchValue.trim()) {
      setFeedback({ tone: "error", message: t("batchRequired") })
      return
    }

    const result = applyInput(batchValue, true)
    if (result.invalid.length > 0) {
      setBatchValue(result.invalid.join("\n"))
      return
    }
    if (result.added.length > 0) {
      setBatchValue("")
      setBatchOpen(false)
    }
  }

  const removeDomain = (ruleValue: string) => {
    if (rules.length <= 1) {
      setFeedback({ tone: "error", message: t("keepOne") })
      return
    }
    onChange(rules.filter(rule => rule.value !== ruleValue).map(rule => rule.value).join(","))
    setFeedback({ tone: "muted", message: t("removed") })
  }

  const feedbackClass = feedback?.tone === "error"
    ? "text-destructive"
    : feedback?.tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-muted-foreground"

  return (
    <section className="space-y-4 border-t border-border/70 pt-5" aria-labelledby="domain-manager-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="domain-manager-title" className="font-semibold">{t("title")}</h3>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {t("total", { count: rules.length })}
            </span>
            {pending && (
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                {t("pending")}
              </span>
            )}
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">{t("description")}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start gap-2"
          disabled={disabled || !pending}
          onClick={() => {
            onReset()
            setFeedback(null)
          }}
        >
          <RotateCcw className="size-3.5" />
          {t("reset")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5">
          <Globe2 className="size-3.5 text-primary" />
          {t("exactCount", { count: exactCount })}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5">
          <Network className="size-3.5 text-primary" />
          {t("wildcardCount", { count: wildcardCount })}
        </span>
        <span className="inline-flex items-center rounded-full bg-muted px-3 py-1.5">{t("syncHint")}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
        <Select value={domainType} onValueChange={value => setDomainType(value as DomainType)} disabled={disabled}>
          <SelectTrigger aria-label={t("typeLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="exact">{t("exact")}</SelectItem>
            <SelectItem value="wildcard">{t("wildcard")}</SelectItem>
          </SelectContent>
        </Select>
        <div>
          <Label htmlFor="email-domain" className="sr-only">{t("domainLabel")}</Label>
          <Input
            id="email-domain"
            value={domain}
            disabled={disabled}
            placeholder={t("placeholder")}
            autoComplete="off"
            onChange={event => setDomain(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault()
                addDomain()
              }
            }}
          />
        </div>
        <Button type="button" className="gap-2" disabled={disabled} onClick={addDomain}>
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">{t("inputHint")}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          disabled={disabled}
          onClick={() => setBatchOpen(open => !open)}
        >
          {batchOpen ? <X className="size-3.5" /> : <ListPlus className="size-3.5" />}
          {batchOpen ? t("closeBatch") : t("openBatch")}
        </Button>
      </div>

      {batchOpen && (
        <div className="space-y-3 border-l-2 border-primary/30 pl-4">
          <div className="space-y-1.5">
            <Label htmlFor="email-domains-batch">{t("batchLabel")}</Label>
            <Textarea
              id="email-domains-batch"
              value={batchValue}
              disabled={disabled}
              className="min-h-28 font-mono text-sm"
              placeholder={t("batchPlaceholder")}
              onChange={event => setBatchValue(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("batchHint")}</p>
          </div>
          <Button type="button" variant="secondary" disabled={disabled} onClick={addBatch}>
            {t("addBatch")}
          </Button>
        </div>
      )}

      {feedback && <p role="status" className={`text-sm ${feedbackClass}`}>{feedback.message}</p>}

      <div className="overflow-hidden rounded-lg border">
        {rules.map((rule, index) => {
          const wildcard = rule.type === "wildcard"
          const Icon = wildcard ? Network : Globe2
          return (
            <div
              key={rule.value}
              className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${index > 0 ? "border-t" : ""}`}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{rule.value}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {wildcard ? t("wildcard") : t("exact")}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {wildcard
                    ? t("wildcardExample", { domain: `a.${rule.baseDomain}` })
                    : t("exactExample", { domain: rule.baseDomain })}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                disabled={disabled || rules.length <= 1}
                aria-label={t("removeLabel", { domain: rule.value })}
                title={rules.length <= 1 ? t("keepOne") : t("remove")}
                onClick={() => removeDomain(rule.value)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
