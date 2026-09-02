const encoder = new TextEncoder()

export interface GatewaySignatureInput {
  timestamp: string
  nonce: string
  deliveryId: string
  sender: string
  recipients: string
  bodySha256: string
}

export function canonicalGatewayPayload(input: GatewaySignatureInput): string {
  return [
    input.timestamp,
    input.nonce,
    input.deliveryId,
    input.sender,
    input.recipients,
    input.bodySha256,
  ].join("\n")
}

export async function sha256Hex(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value)
  return bytesToHex(new Uint8Array(digest))
}

export async function signGatewayPayload(
  input: GatewaySignatureInput,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(canonicalGatewayPayload(input)),
  )
  return bytesToHex(new Uint8Array(signature))
}

export async function verifyGatewaySignature(
  input: GatewaySignatureInput,
  secret: string,
  signature: string,
): Promise<boolean> {
  const normalizedSignature = signature.startsWith("v1=") ? signature.slice(3) : ""
  const signatureBytes = hexToBytes(normalizedSignature)
  if (!signatureBytes) return false

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  )

  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(canonicalGatewayPayload(input)),
  )
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16)
  }
  return bytes
}
