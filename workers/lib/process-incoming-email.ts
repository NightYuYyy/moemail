import { drizzle } from "drizzle-orm/d1"
import { eq, sql } from "drizzle-orm"
import PostalMime from "postal-mime"
import { messages, emails, webhooks } from "../../app/lib/schema"
import { WEBHOOK_CONFIG } from "../../app/config/webhook"
import type { EmailMessage } from "../../app/lib/webhook"

export interface IncomingEmail {
  from: string
  to: string
  raw: ArrayBuffer | ReadableStream<Uint8Array>
  ingressKey?: string
}

export type IncomingEmailResult =
  | { status: "stored"; messageId: string }
  | { status: "duplicate" }
  | { status: "ignored"; reason: "mailbox_not_found" }

export async function processIncomingEmail(
  message: IncomingEmail,
  env: Pick<CloudflareEnv, "DB">,
): Promise<IncomingEmailResult> {
  const db = drizzle(env.DB, { schema: { messages, emails, webhooks } })
  const recipient = message.to.trim().toLowerCase()
  const targetEmail = await db.query.emails.findFirst({
    where: eq(sql`LOWER(${emails.address})`, recipient),
  })

  if (!targetEmail) {
    console.info(JSON.stringify({ event: "email_ignored", reason: "mailbox_not_found", recipient }))
    return { status: "ignored", reason: "mailbox_not_found" }
  }

  if (message.ingressKey) {
    const duplicate = await db.query.messages.findFirst({
      columns: { id: true },
      where: eq(messages.ingressKey, message.ingressKey),
    })
    if (duplicate) return { status: "duplicate" }
  }

  const parsedMessage = await PostalMime.parse(message.raw)
  const savedMessage = await db.insert(messages).values({
    emailId: targetEmail.id,
    fromAddress: message.from,
    toAddress: targetEmail.address,
    subject: parsedMessage.subject || "(无主题)",
    content: parsedMessage.text || "",
    html: parsedMessage.html || "",
    type: "received",
    ingressKey: message.ingressKey,
  }).onConflictDoNothing().returning().get()

  if (!savedMessage) return { status: "duplicate" }

  const webhook = targetEmail.userId
    ? await db.query.webhooks.findFirst({ where: eq(webhooks.userId, targetEmail.userId) })
    : undefined

  if (webhook?.enabled) {
    try {
      await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": WEBHOOK_CONFIG.EVENTS.NEW_MESSAGE,
        },
        body: JSON.stringify({
          emailId: targetEmail.id,
          messageId: savedMessage.id,
          fromAddress: savedMessage.fromAddress,
          subject: savedMessage.subject,
          content: savedMessage.content,
          html: savedMessage.html,
          receivedAt: savedMessage.receivedAt.toISOString(),
          toAddress: targetEmail.address,
        } as EmailMessage),
      })
    } catch (error) {
      console.error(JSON.stringify({
        event: "email_webhook_failed",
        messageId: savedMessage.id,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  console.info(JSON.stringify({ event: "email_stored", messageId: savedMessage.id, recipient }))
  return { status: "stored", messageId: savedMessage.id }
}
