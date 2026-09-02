import { describe, expect, it } from "vitest"
import { sha256Hex, signGatewayPayload, verifyGatewaySignature } from "../../workers/lib/gateway-auth"

describe("SMTP gateway signatures", () => {
  const secret = "test-secret-that-is-at-least-32-characters-long"
  const payload = {
    timestamp: "1788330000",
    nonce: "nonce-1",
    deliveryId: "delivery-1",
    sender: "sender@example.com",
    recipients: "mailbox@a.nightyu.com",
    bodySha256: "a".repeat(64),
  }

  it("signs and verifies the canonical payload", async () => {
    const signature = await signGatewayPayload(payload, secret)
    await expect(verifyGatewaySignature(payload, secret, `v1=${signature}`)).resolves.toBe(true)
  })

  it("rejects a signature when the recipient changes", async () => {
    const signature = await signGatewayPayload(payload, secret)
    await expect(verifyGatewaySignature({
      ...payload,
      recipients: "other@a.nightyu.com",
    }, secret, `v1=${signature}`)).resolves.toBe(false)
  })

  it("hashes the raw message body", async () => {
    const bytes = new TextEncoder().encode("Subject: test\r\n\r\nhello")
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    await expect(sha256Hex(buffer)).resolves.toMatch(/^[a-f0-9]{64}$/)
  })
})
