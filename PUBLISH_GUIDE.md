# Publishing n8n-nodes-brixfit to npm & n8n Community

**Author:** Jatin Beniwal · **Organisation:** Brixfly Services

---

## Step 1 — Create an npm account

If you don't have one: https://www.npmjs.com/signup

Sign in from terminal:
```bash
npm login
# Enter: username, password, email, OTP
```

---

## Step 2 — Build the node

```bash
cd packages/n8n-nodes-brixfit
npm install
npm run build
```

Verify `dist/` folder is populated with compiled JS files.

---

## Step 3 — Test locally before publishing

Link the package into a local n8n instance:

```bash
# In this directory
npm link

# In your n8n installation directory
npm link n8n-nodes-brixfit

# Restart n8n — the Brixfit node should appear
```

---

## Step 4 — Publish to npm

```bash
cd packages/n8n-nodes-brixfit

# First time
npm publish --access public

# Subsequent updates — bump version first
npm version patch   # 1.0.0 → 1.0.1
npm version minor   # 1.0.0 → 1.1.0
npm version major   # 1.0.0 → 2.0.0
npm publish
```

Your package is now live at: `https://www.npmjs.com/package/n8n-nodes-brixfit`

---

## Step 5 — Submit to n8n Community Nodes Registry

n8n discovers community nodes from npm automatically IF your package.json has the
keyword `n8n-community-node-package` (already set). This means:

- n8n Cloud users can find it via **Settings → Community Nodes → Install → Search**
- Self-hosted users install via `npm install n8n-nodes-brixfit` in n8n's node_modules

**To get listed on n8n's verified list (optional but good for trust):**

1. Go to: https://github.com/n8n-io/n8n/issues/new?template=node-submission.yaml
2. Fill in:
   - **Package name**: `n8n-nodes-brixfit`
   - **npm link**: https://www.npmjs.com/package/n8n-nodes-brixfit
   - **Description**: Brixfit Coaching CRM — manage leads, clients, check-ins and webhooks
   - **Author**: Jatin Beniwal (Brixfly Services)
   - **Credentials**: `brixfitApi` (API key)
   - **Nodes**: `Brixfit` (actions), `BrixfitTrigger` (webhook events)
3. n8n team reviews and adds to their community node list (typically 1–2 weeks)

---

## Step 6 — Update the node

When you add new features:

1. Update `version` in `package.json`
2. Add to `README.md` changelog
3. `npm run build && npm publish`

---

## Version naming convention

- `1.0.x` — Bug fixes only
- `1.x.0` — New operations or events (backwards-compatible)
- `x.0.0` — Breaking changes (rename fields, remove operations)

---

## Adding the Brixfit icon

The node references `file:brixfit.svg`. Create this file:

```
packages/n8n-nodes-brixfit/nodes/Brixfit/brixfit.svg
```

It should be a simple SVG (24×24 or 60×60) of the Brixfit logo. n8n will display
it in the node picker. If missing, n8n uses a default icon — no error.

---

## Checklist before publishing

- [ ] `npm run build` succeeds (no TypeScript errors)
- [ ] Node appears correctly in local n8n test
- [ ] README.md is up to date
- [ ] Version bumped from previous release
- [ ] `dist/` folder exists and has `.js` files
- [ ] `n8n-community-node-package` keyword in package.json
