# Wildcard SMTP Gateway

## Purpose

Cloudflare Email Routing requires each subdomain to be onboarded separately. The gateway keeps the existing Cloudflare Pages, D1, KV, and Email Worker deployment while adding SMTP reception for dynamic addresses such as `user@tenant.nightyu.com`.

## Runtime flow

```text
Sender -> TCP/25 -> Night_yu Haraka gateway -> durable disk spool
       -> HTTPS + HMAC -> email-receiver-worker fetch() -> shared parser -> D1

Sender -> Cloudflare Email Routing -> email-receiver-worker email()
       -> shared parser -> D1
```

Both Worker handlers call `workers/lib/process-incoming-email.ts`; the UI and message APIs therefore see identical D1 records regardless of ingress path.

## Trust boundaries

- The SMTP gateway accepts only real subdomains below `ACCEPTED_DOMAIN_SUFFIXES`. It never accepts outbound relay.
- `ACCEPTED_DOMAIN_SUFFIXES` and the Email Worker's `SMTP_ALLOWED_DOMAIN_SUFFIXES` both accept comma-separated base domains. Keep the two lists identical.
- Bind the same `SITE_CONFIG` KV namespace to Pages and the Email Worker. The gateway retrieves current exact/wildcard rules from the Worker's authenticated `/v1/domain-rules` endpoint and refreshes them every minute.
- The gateway/Worker shared secret is stored only in a root-readable server `.env` and a Cloudflare Worker Secret.
- Every request signs the timestamp, nonce, delivery ID, envelope sender, recipients, and SHA-256 digest of the raw MIME body with HMAC-SHA256.
- Worker requests older than five minutes are rejected.
- `message.ingress_key` is unique so retries do not duplicate inbox messages.
- Logs contain delivery IDs and processing status, not message bodies or secrets.

## DNS

Keep the apex Cloudflare Email Routing MX records. Add a DNS-only SMTP host and wildcard MX:

```dns
mx.nightyu.com.    A     <Night_yu IPv4>
*.nightyu.com.     MX 10 mx.nightyu.com.
```

An existing explicit DNS name suppresses wildcard synthesis. Add an explicit MX record when mail is required for an existing hostname such as `app.nightyu.com`.

## Deployment order

1. Back up D1 and apply `drizzle/0020_easy_thunderbird.sql`.
2. Store `SMTP_GATEWAY_SECRET` with `wrangler secret put`; do not add it to configuration files.
3. Deploy `email-receiver-worker` and verify `/health`, signed ingestion, deduplication, and the existing Email Routing handler.
4. Build and deploy `services/smtp-gateway` to `/opt/moemail-smtp-gateway` on `Night_yu`.
5. Mount a publicly trusted certificate for `mx.nightyu.com`, then enable STARTTLS.
6. Open `25/tcp`, verify from external probes, and only then add the wildcard MX.
7. Set `EMAIL_DOMAINS` to the enabled exact and wildcard rules (for example, `nightyu.com,*.nightyu.com,*.nightuu.com`) after the transport path passes end-to-end testing.

## Rollback

1. Restore `EMAIL_DOMAINS=nightyu.com`.
2. Remove the wildcard MX, wait at least one DNS TTL, and drain the gateway spool.
3. Stop the gateway and close `25/tcp`.
4. Roll the Worker back to the recorded prior deployment if required. The nullable `ingress_key` column is backward compatible and can remain.
