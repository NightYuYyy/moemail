import { describe, expect, it } from "vitest"
import {
  sha256Hex,
  signDomainRulesRequest,
  signGatewayPayload,
  verifyDomainRulesRequest,
  verifyGatewaySignature,
} from "../../workers/lib/gateway-auth"

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

  it("authenticates domain rule synchronization without sending the secret", async () => {
    const signature = await signDomainRulesRequest(secret)

    expect(signature).toBe("5f5c132347c5887cfdfe96a423a614788ab2c200087ab1a5d80606b3d5a66b5b")
    await expect(verifyDomainRulesRequest(secret, `v1=${signature}`)).resolves.toBe(true)
    await expect(verifyDomainRulesRequest(`${secret}-wrong`, `v1=${signature}`)).resolves.toBe(false)
  })
})
