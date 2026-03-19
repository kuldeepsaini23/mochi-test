# Mochi Deployment Guide

This guide covers deploying Mochi to production. Follow each section in order.

---

# PART A: HOSTING (Coolify + Cloudflare)

This section covers deploying Mochi to a Coolify server with Cloudflare DNS and SSL.

---

## Prerequisites

Before starting, ensure you have:

- Coolify server (v4.x) with Caddy proxy
- Cloudflare account with your domain added or transfered to cloudflare

---

## STEP 1: Configure Cloudflare DNS

Go to your Cloudflare Dashboard and select your domain.

**Add these DNS records:**

| Type | Name | Content | Proxy Status |
|------|------|---------|--------------|
| A | `@` | `YOUR_SERVER_IP` | Proxied (Orange Cloud) |
| A | `*` | `YOUR_SERVER_IP` | Proxied (Orange Cloud) |

**Configure SSL:**

Go to **SSL/TLS** → **Overview** → Set to **Full**

**Recommended settings:**

- Go to **SSL/TLS** → **Edge Certificates** → Enable "Always Use HTTPS"
- Go to **Speed** → **Optimization** → Disable "HTTP/3 (with QUIC)" if you experience errors

---

## STEP 2: Create Cloudflare Origin Certificate

This certificate enables wildcard SSL for all your subdomains.

**In Cloudflare Dashboard:**

Go to **SSL/TLS** → **Origin Server** → Click **Create Certificate**

**Configure the certificate:**

- Generate private key and CSR with Cloudflare: **Selected**
- Private key type: **RSA (2048)**
- Hostnames: `*.mochidev.net` and `mochidev.net`
- Certificate validity: **15 years**

Click **Create**

**IMPORTANT:** Copy and save BOTH the Origin Certificate AND Private Key immediately. You cannot retrieve the private key later.

---

## STEP 3: Save Certificate Files on Server

SSH into your Coolify server or use the terminal in coolify

**Create the certificates directory:**

```bash
mkdir -p /data/coolify/certs/mochidev
```

**Create the certificate file:**

```bash
nano /data/coolify/certs/mochidev/cert.pem
```

Paste the Origin Certificate content, then save (Ctrl+X, Y, Enter)

**Create the private key file:**

```bash
nano /data/coolify/certs/mochidev/key.pem
```

Paste the Private Key content, then save (Ctrl+X, Y, Enter)

**Set permissions:**

```bash
chmod 600 /data/coolify/certs/mochidev/key.pem
chmod 644 /data/coolify/certs/mochidev/cert.pem
```

---

## STEP 4: Mount Certificates in Caddy Proxy

**In Coolify:**

Go to **Server** → **Proxy** → **Configuration**

Find the `volumes:` section in the Caddy docker-compose.yml and add this line:

```yaml
  - '/data/coolify/certs:/certs:ro'
```

The full volumes section should look like:

```yaml
volumes:
  - '/var/run/docker.sock:/var/run/docker.sock:ro'
  - '/data/coolify/proxy/caddy/dynamic:/dynamic'
  - '/data/coolify/proxy/caddy/config:/config'
  - '/data/coolify/proxy/caddy/data:/data'
  - '/data/coolify/certs:/certs:ro'
```

Click **Save** then click **Restart Proxy**

---

## STEP 5: Create Your Application in Coolify

**In Coolify:**

Create a new application and configure these settings:

**Domains field:**
```
https://mochidev.net,https://*.mochidev.net
```

**Build Pack:** Dockerfile

**Ports Exposes:** 3000

---

## STEP 6: Configure Environment Variables

**In your application's Environment Variables section:**

For each variable,ensure the "available at build time" & run time is checked:

**Why STRIPE_SECRET_KEY needs build time:** The Stripe config throws an error at module import, so it must be available during the Next.js build process.

---

## STEP 7: Configure Container Labels for Wildcard SSL

**In your application:**
turn of the readonly for container labels in the project general settings

Go to **General** → Find **Container Labels** section

Locate the wildcard Caddy configuration line:
```
caddy_1=https://*.mochidev.net
```

Add this line immediately after it:
```
caddy_1.tls=/certs/mochidev/cert.pem /certs/mochidev/key.pem
```

Click **Save** then click **Redeploy**

---

## STEP 8: Verify Deployment

Visit your domain to confirm everything is working:

- Main site: `https://mochidev.net`
- Test subdomain: `https://test.mochidev.net`

Both should load without SSL errors.

---

# PART B: CUSTOM DOMAINS FOR USERS

This section covers setting up support for users to add their own custom domains (like `courses.example.com`) to their Mochi websites.

---

## How Custom Domains Work

- User adds a custom domain in their Mochi settings
- System shows DNS instructions (CNAME record)
- User configures DNS at their domain provider (must use Cloudflare)
- User clicks "Verify DNS" to check configuration
- Once verified, traffic routes to their website

---

## STEP 1: Enable Consistent Container Names

By default, Coolify changes container names on each deploy. This breaks custom domain routing.

**In Coolify:**

Go to your **Mochi Application** → **Advanced** tab

Find **"Consistent Container Names"** checkbox → **Enable it**

Click **Save**

Click **Redeploy** (so the container gets the fixed name)

**Note:** This disables rolling updates (brief downtime during deploys). This is fine for most apps.

---

## STEP 2: Enable Override Default Request Handler

Coolify auto-regenerates proxy config files. We need to disable this.

**In Coolify:**

Go to **Server** → **Proxy** tab

Find **"Override default request handler"** checkbox → **Enable it**

Click **Save**

---

## STEP 3: Get Your Container Name

**In Coolify:**

Go to **Server** → **Terminal**

Run this command:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}"
```

Find your Mochi container. With consistent container names enabled, it will look like `z08w04kwkcwkkckkowwo008k` (no timestamp suffix).

**Copy this container name** for the next step.

**If you have multiple projects:** Match the IMAGE tag (git commit hash) to your latest commit to identify the correct container.

---

## STEP 4: Create the Catch-All Configuration

This config routes ALL unknown domains to your Mochi app.

**In the Terminal:**

Run this command (replace `YOUR_CONTAINER_NAME` with the name from Step 3):

```bash
echo 'https:// {
    tls /certs/mochidev/cert.pem /certs/mochidev/key.pem
    reverse_proxy YOUR_CONTAINER_NAME:3000
}' > /data/coolify/proxy/caddy/dynamic/catch-all-custom-domains.caddy
```

**Example with actual container name:**

```bash
echo 'https:// {
    tls /certs/mochidev/cert.pem /certs/mochidev/key.pem
    reverse_proxy z08w04kwkcwkkckkowwo008k:3000
}' > /data/coolify/proxy/caddy/dynamic/catch-all-custom-domains.caddy
```

---

## STEP 5: Verify the Configuration

Run this command:

```bash
cat /data/coolify/proxy/caddy/dynamic/catch-all-custom-domains.caddy
```

It should output:

```
https:// {
    tls /certs/mochidev/cert.pem /certs/mochidev/key.pem
    reverse_proxy z08w04kwkcwkkckkowwo008k:3000
}
```

---

## STEP 6: Restart Caddy Proxy

**In Coolify:**

Go to **Server** → **Your Server** → **Proxy** tab

Click **Restart Proxy**

---

## STEP 7: Check for Errors

**In the Terminal:**

```bash
docker logs coolify-proxy --tail 50
```

Look for any `[ERROR]` messages.

**Common errors:**

| Error | Fix |
|-------|-----|
| `ambiguous site definition: :443` | Enable "Override default request handler" |
| `certificate file not found` | Verify certs exist at `/data/coolify/certs/mochidev/` |
| `502 Bad Gateway` | Container name is wrong - get correct name with `docker ps` |

---

## STEP 8: Test a Custom Domain

**For testing, you need a domain in Cloudflare.**

**User must configure their Cloudflare:**

- Add CNAME record: Name = `@` or subdomain, Value = `mochidev.net`, Proxy = Orange cloud
- Set SSL mode to **Full** (NOT Full Strict)

**Why Full and not Full (Strict)?**

Our origin certificate is for `*.mochidev.net`, not the user's custom domain. Full mode accepts any valid certificate from origin.

**Test:**

- Add the custom domain in Mochi UI
- Click "Verify DNS"
- Visit the custom domain

---

# PART C: CHECKLISTS

---

## Server Setup Checklist (One-Time)

- [ ] Cloudflare DNS records added (A records for `@` and `*`)
- [ ] Cloudflare Origin Certificate created
- [ ] Certificate files saved on server (`/data/coolify/certs/mochidev/`)
- [ ] Certificate volume mounted in Caddy proxy
- [ ] Application created with correct domains and port
- [ ] Environment variables configured with correct build/run time settings
- [ ] Container labels configured for wildcard SSL
- [ ] "Consistent Container Names" enabled
- [ ] "Override default request handler" enabled
- [ ] `catch-all-custom-domains.caddy` file created
- [ ] Caddy proxy restarted
- [ ] Main site working (`mochidev.net`)
- [ ] Wildcard subdomains working (`*.mochidev.net`)
- [ ] Custom domains working (test domain)

---

## User Custom Domain Checklist (Per User)

- [ ] User's domain is in Cloudflare
- [ ] User added CNAME record pointing to `mochidev.net` (proxied/orange cloud)
- [ ] User set SSL mode to **Full** (not Full Strict)
- [ ] User added domain in Mochi UI
- [ ] User clicked "Verify" and it passed
- [ ] Custom domain loads correctly

---

# PART D: TROUBLESHOOTING

---

## Build Errors

**Error: "STRIPE_SECRET_KEY environment variable is required"**

Cause: Next.js evaluates routes during build, and the Stripe config throws at import.

Fix: In Coolify, check "Available at build time" for `STRIPE_SECRET_KEY`

---

## SSL/Connection Errors

**Error: SSL Handshake Failed (Error 525)**

Causes:
- Caddy proxy doesn't have catch-all config
- User's Cloudflare SSL set to "Full (Strict)" instead of "Full"
- Certificate files missing

Fixes:
- Verify catch-all config exists with correct container name
- User must change Cloudflare SSL to "Full"
- Check `/data/coolify/certs/mochidev/` has both files

---

**Error: Too Many Redirects**

Cause: Cloudflare SSL set to "Flexible"

Fix: Set Cloudflare SSL to "Full"

---

**Error: ERR_QUIC_PROTOCOL_ERROR**

Cause: Cloudflare's HTTP/3 (QUIC) conflicts with origin server

Fix: Go to Cloudflare → **Speed** → **Optimization** → Disable **HTTP/3 (with QUIC)**

---

## Gateway Errors

**Error: 502 Bad Gateway**

Causes:
- Container name in Caddy config doesn't match actual container
- Container is not running
- Wrong container targeted

Fixes:
- Get correct container name: `docker ps --format "table {{.Names}}\t{{.Image}}"`
- Match IMAGE tag to your git commit to identify correct container
- Update catch-all config with correct name
- Restart proxy via Coolify UI

---

**Error: 503 Service Unavailable**

Causes:
- Catch-all config not created
- Wrong domains configured in application

Fixes:
- Create `catch-all-custom-domains.caddy` file
- Verify domains are set: `https://mochidev.net,https://*.mochidev.net`

---

## DNS Errors

**Domain Not Verifying (stays "Pending")**

Causes:
- DNS not propagated yet (can take up to 48 hours)
- CNAME pointing to wrong value
- Not using Cloudflare proxy

Fixes:
- Wait for propagation (usually faster with Cloudflare)
- Verify CNAME points to `mochidev.net` exactly
- Ensure Cloudflare proxy is enabled (orange cloud)

---

# PART E: REFERENCE

---

## Container Name Behavior

Coolify generates container names with a base ID + timestamp:

- Base ID: `z08w04kwkcwkkckkowwo008k` (stays the same)
- Timestamp: `-023313227140` (changes on redeploy)
- Full name: `z08w04kwkcwkkckkowwo008k-023313227140`

**What changes container names:**

| Action | Container Name Changes? |
|--------|------------------------|
| Restart Proxy | No |
| Restart Application | No |
| Redeploy Application | Yes (new timestamp) |
| New Git Commit + Deploy | Yes (new timestamp) |

**With "Consistent Container Names" enabled:** Container name is always just the base ID (no timestamp). Your Caddy config never needs updating.

---

## Quick Fix If Container Name Changed

If you forgot to enable consistent container names and redeployed:

**Get the new container name:**

```bash
docker ps --format "{{.Names}}" | grep z08w
```

**Update the config:**

```bash
echo 'https:// {
    tls /certs/mochidev/cert.pem /certs/mochidev/key.pem
    reverse_proxy NEW_CONTAINER_NAME:3000
}' > /data/coolify/proxy/caddy/dynamic/catch-all-custom-domains.caddy
```

**Restart proxy:**

Go to **Server** → **Your Server** → **Proxy** → Click **Restart Proxy**

---

## File Paths Reference

| File | Path |
|------|------|
| Certificate | `/data/coolify/certs/mochidev/cert.pem` |
| Private Key | `/data/coolify/certs/mochidev/key.pem` |
| Catch-All Config | `/data/coolify/proxy/caddy/dynamic/catch-all-custom-domains.caddy` |

---

## Rollback Custom Domains

If custom domains break the site, remove the catch-all config:

```bash
rm /data/coolify/proxy/caddy/dynamic/catch-all-custom-domains.caddy
```

Then go to **Server** → **Your Server** → **Proxy** → Click **Restart Proxy**

---
