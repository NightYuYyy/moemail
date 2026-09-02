# MoeMail SMTP Gateway

This service accepts SMTP mail for wildcard subdomains, writes the raw message to a durable local spool, and forwards it to MoeMail's Cloudflare Email Worker over an authenticated HTTPS endpoint.

It is based on [Haraka](https://github.com/haraka/Haraka). The spool/retry layout was adapted from the MIT-licensed [nogringo/haraka-webhook](https://github.com/nogringo/haraka-webhook); the original license is retained in `LICENSE`.

## Security boundary

- Only subdomains below `ACCEPTED_DOMAIN_SUFFIXES` are accepted.
- The gateway does not support SMTP AUTH or outbound relay.
- Each HTTPS request is authenticated with HMAC-SHA256 over the envelope and raw MIME body digest.
- Messages are removed from the spool only after a successful `2xx` response.
- `400`, `404`, `413`, and `422` responses are dead-lettered; authentication, rate-limit, and server errors are retried.

## Run

1. Copy `.env.example` to `.env` and set the Worker URL and shared secret.
2. Create `data` and `certs` directories. The `data` directory must be writable by UID/GID `1000`.
3. Put a publicly trusted SMTP certificate in `certs`, then set `SMTP_TLS_CERT_PATH` and `SMTP_TLS_KEY_PATH`.
4. Run `docker compose up -d --build`.

The container listens on `2525`; Docker publishes host port `25`.

## Certificate renewal

`deploy/nginx-mx.conf` exposes only the ACME HTTP-01 challenge path for `mx.nightyu.com`.
After the first Certbot issuance, pin the image digest in `/opt/moemail-smtp-gateway/certbot-image.txt`, install
`deploy/moemail-renew-cert` to `/usr/local/sbin`, and install the matching systemd service and timer under
`/etc/systemd/system`. The renewal script copies a changed certificate into the container mount and recreates
the gateway only when the certificate content changes.
