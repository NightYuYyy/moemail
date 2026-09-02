import { parseEmailDomainRules } from "../app/lib/email-domain"
import { sha256Hex, verifyDomainRulesRequest, verifyGatewaySignature } from "./lib/gateway-auth"
import { processIncomingEmail } from "./lib/process-incoming-email"
import { getConfiguredEmailDomainRules, isSmtpRecipientAllowed } from "./lib/smtp-domain-rules"

const MAX_MESSAGE_BYTES = 25 * 1024 * 1024
const MAX_RECIPIENTS = 50
const MAX_CLOCK_SKEW_SECONDS = 300
const TOKEN_PATTERN = /^[a-zA-Z0-9_.-]{1,160}$/

interface EmailWorkerEnv extends Pick<CloudflareEnv, "DB" | "SITE_CONFIG"> {
  SMTP_GATEWAY_SECRET?: string
  SMTP_ALLOWED_DOMAIN_SUFFIXES?: string
  SMTP_ALLOWED_DOMAIN?: string
}

const worker = {
  async email(message: ForwardableEmailMessage, env: EmailWorkerEnv): Promise<void> {
    try {
      await processIncomingEmail({
        from: message.from,
        to: message.to,
        raw: message.raw,
      }, env)
    } catch (error) {
      console.error(JSON.stringify({
        event: "email_processing_failed",
        source: "cloudflare_email_routing",
        error: error instanceof Error ? error.message : String(error),
      }))
      throw error
    }
  },

  async fetch(request: Request, env: EmailWorkerEnv): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" })
    }

    if (!env.SMTP_GATEWAY_SECRET || env.SMTP_GATEWAY_SECRET.length < 32) {
      console.error(JSON.stringify({ event: "gateway_configuration_error", reason: "missing_secret" }))
      return Response.json({ error: "service_unavailable" }, { status: 503 })
    }

    if (request.method === "GET" && url.pathname === "/v1/domain-rules") {
      const verified = await verifyDomainRulesRequest(
        env.SMTP_GATEWAY_SECRET,
        request.headers.get("x-moe-signature") || "",
      )
      if (!verified) {
        return Response.json({ error: "invalid_signature" }, { status: 401 })
      }

      const rulesValue = await getConfiguredEmailDomainRules(env.SITE_CONFIG, env)
      return Response.json({
        rules: parseEmailDomainRules(rulesValue).map(rule => rule.value),
      }, {
        headers: { "Cache-Control": "no-store" },
      })
    }

    if (request.method !== "POST" || url.pathname !== "/v1/inbound") {
      return Response.json({ error: "not_found" }, { status: 404 })
    }

    const contentLength = Number(request.headers.get("content-length") || "0")
    if (contentLength > MAX_MESSAGE_BYTES) {
      return Response.json({ error: "message_too_large" }, { status: 413 })
    }

    const timestamp = request.headers.get("x-moe-timestamp") || ""
    const nonce = request.headers.get("x-moe-nonce") || ""
    const deliveryId = request.headers.get("x-moe-delivery-id") || ""
    const sender = request.headers.get("x-moe-sender") || ""
    const recipientsHeader = request.headers.get("x-moe-recipients") || ""
    const signature = request.headers.get("x-moe-signature") || ""
    const timestampNumber = Number(timestamp)

    if (
      !Number.isInteger(timestampNumber)
      || Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > MAX_CLOCK_SKEW_SECONDS
      || !TOKEN_PATTERN.test(nonce)
      || !TOKEN_PATTERN.test(deliveryId)
      || !sender
      || !recipientsHeader
    ) {
      return Response.json({ error: "invalid_envelope" }, { status: 400 })
    }

    const recipients = Array.from(new Set(
      recipientsHeader.split(",").map(value => value.trim().toLowerCase()).filter(Boolean),
    ))

    if (
      recipients.length === 0
      || recipients.length > MAX_RECIPIENTS
      || recipients.some(recipient => {
        const at = recipient.lastIndexOf("@")
        return at <= 0 || at === recipient.length - 1
      })
    ) {
      return Response.json({ error: "invalid_recipient" }, { status: 400 })
    }

    const raw = await request.arrayBuffer()
    if (raw.byteLength === 0 || raw.byteLength > MAX_MESSAGE_BYTES) {
      return Response.json({ error: "invalid_message_size" }, { status: raw.byteLength > MAX_MESSAGE_BYTES ? 413 : 400 })
    }

    const bodySha256 = await sha256Hex(raw)
    const verified = await verifyGatewaySignature({
      timestamp,
      nonce,
      deliveryId,
      sender,
      recipients: recipientsHeader,
      bodySha256,
    }, env.SMTP_GATEWAY_SECRET, signature)

    if (!verified) {
      return Response.json({ error: "invalid_signature" }, { status: 401 })
    }

    const allowedDomainRules = await getConfiguredEmailDomainRules(env.SITE_CONFIG, env)
    if (
      !allowedDomainRules
      || recipients.some(recipient => !isSmtpRecipientAllowed(recipient, allowedDomainRules))
    ) {
      return Response.json({ error: "invalid_recipient" }, { status: 400 })
    }

    try {
      const results = []
      for (const recipient of recipients) {
        results.push(await processIncomingEmail({
          from: sender,
          to: recipient,
          raw,
          ingressKey: `${deliveryId}:${recipient}`,
        }, env))
      }

      return Response.json({
        stored: results.filter(result => result.status === "stored").length,
        duplicates: results.filter(result => result.status === "duplicate").length,
        ignored: results.filter(result => result.status === "ignored").length,
      })
    } catch (error) {
      console.error(JSON.stringify({
        event: "email_processing_failed",
        source: "smtp_gateway",
        deliveryId,
        error: error instanceof Error ? error.message : String(error),
      }))
      return Response.json({ error: "processing_failed" }, { status: 500 })
    }
  },
} satisfies ExportedHandler<EmailWorkerEnv>

export default worker
