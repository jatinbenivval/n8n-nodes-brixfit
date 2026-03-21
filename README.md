# n8n-nodes-brixfit

Official **n8n community node** for [Brixfit](https://brixfit.app) Coaching CRM.

Automate your fitness coaching business — create leads from landing pages, sync data to Google Sheets, send WhatsApp messages when clients check in, and much more.

**Author:** Jatin Beniwal · **Organisation:** Brixfly Services

---

## Features

- **Brixfit** node — perform actions: create/get/update/delete leads, list clients, list check-ins, manage webhooks
- **Brixfit Trigger** node — start workflows reactively when events fire in Brixfit (lead created, status changed, check-in submitted, etc.)
- Full TypeScript types

---

## Installation

### In n8n Cloud or self-hosted (recommended)

Go to **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-brixfit
```

### Manual (self-hosted)

```bash
cd /usr/local/lib/node_modules/n8n
npm install n8n-nodes-brixfit
# Restart n8n
```

---

## Getting Started

### 1. Add credentials

In n8n: **Credentials → New → Brixfit API**

- **API Key**: Generate one in Brixfit → Developer → API Keys
- **Base URL**: Leave as `https://brixfit.app`

### 2. Use the Brixfit node (actions)

Drag **Brixfit** into your workflow. Choose a resource and operation:

| Resource | Operations |
|----------|------------|
| Lead | Get All, Get, Create, Update, Update Status, Delete |
| Client | Get All, Get |
| Check-in | Get All |
| Webhook | Get All, Create, Delete |

### 3. Use the Brixfit Trigger node (events)

Drag **Brixfit Trigger** as the first node. It starts your workflow when Brixfit fires an event.

**Setup:**
1. Activate the workflow — n8n gives you a webhook URL
2. In Brixfit → Developer → Webhooks, create a new webhook pointing to that URL
3. Select the same events in both places
4. Paste the webhook secret into the trigger node

---

## Example Workflows

### Lead from Facebook → Brixfit

```
Facebook Lead Ads Trigger → Set (map fields) → Brixfit: Create Lead
```

### New lead → WhatsApp + Google Sheets

```
Brixfit Trigger (lead.created) → WhatsApp (send welcome message)
                               → Google Sheets (append row)
```

### Daily check-in report → Email

```
Schedule Trigger (every day 9am) → Brixfit: Get All Check-ins (from_date: today)
                                 → Email (send summary to coach)
```

---

## Supported Events (Trigger Node)

| Event | Description |
|-------|-------------|
| `lead.created` | New lead added |
| `lead.updated` | Lead details changed |
| `lead.status_changed` | Lead moved to new pipeline stage |
| `lead.converted` | Lead converted to client |
| `lead.deleted` | Lead deleted |
| `client.created` | New client onboarded |
| `client.updated` | Client details updated |
| `checkin.submitted` | Client submitted a check-in |

---

## License

MIT — © 2025 Jatin Beniwal / Brixfly Services
