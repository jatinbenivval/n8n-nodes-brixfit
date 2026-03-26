# n8n-nodes-brixfit

<div align="center">

![Brixfit](https://img.shields.io/badge/Brixfit-Coaching%20CRM-6366f1?style=for-the-badge)
[![npm version](https://img.shields.io/npm/v/n8n-nodes-brixfit?style=for-the-badge&color=6366f1)](https://www.npmjs.com/package/n8n-nodes-brixfit)
[![npm downloads](https://img.shields.io/npm/dm/n8n-nodes-brixfit?style=for-the-badge&color=6366f1)](https://www.npmjs.com/package/n8n-nodes-brixfit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![Changelog](https://img.shields.io/badge/Changelog-v1.2.2-22c55e?style=for-the-badge)](CHANGELOG/v1.2.2-2026-03-26.md)

**Official n8n community node for [Brixfit](https://brixfit.app) — the AI-powered Coaching CRM for fitness coaches.**

Automate your entire coaching workflow: capture leads from any source, sync client data, react to check-ins in real time, and connect Brixfit to 400+ apps inside n8n.

</div>

---

## What is Brixfit?

[Brixfit](https://brixfit.app) is an AI-powered coaching CRM built for fitness and health coaches. It manages leads, clients, check-ins, workout plans, diet plans, progress photos, and automated health reports — all in one place.

This node lets you connect Brixfit to any tool in your n8n workflow.

---

## Nodes Included

| Node | Type | Description |
|------|------|-------------|
| **Brixfit** | Action | Perform operations on leads, clients, check-ins and webhooks |
| **Brixfit Trigger** | Trigger | Start workflows automatically when events fire in Brixfit |

---

## Prerequisites

- A [Brixfit](https://brixfit.app) account (coach plan)
- An API key — generate one at **Brixfit → Developer → API Keys**
- n8n v1.0.0 or later

---

## Installation

### n8n Cloud / Self-hosted UI (recommended)

1. Go to **Settings → Community Nodes**
2. Click **Install**
3. Enter `n8n-nodes-brixfit`
4. Click **Install** and confirm

### Self-hosted (manual)

```bash
# Navigate to your n8n installation
cd /usr/local/lib/node_modules/n8n

# Install the package
npm install n8n-nodes-brixfit

# Restart n8n
```

---

## Setup

### 1. Add Brixfit credentials

In n8n, go to **Credentials → New** and search for **Brixfit API**.

| Field | Value |
|-------|-------|
| **API Key** | Your key from Brixfit → Developer → API Keys |
| **Base URL** | `https://brixfit.app` (leave as default) |

Click **Save** — n8n automatically tests the connection with a live API call and confirms your key is valid before saving.

### 2. Add the Brixfit node to a workflow

Drag the **Brixfit** node from the node panel and select your resource and operation.

### 3. Add the Brixfit Trigger (for event-driven workflows)

Drag **Brixfit Trigger** as the first node in your workflow:

1. Select the events you want to listen for
2. **Activate** the workflow — n8n generates a webhook URL
3. Copy that URL
4. Go to **Brixfit → Developer → Webhooks → Create**
5. Paste the URL, select the same events, and copy the signing secret
6. Paste the secret back into the trigger node

---

## Operations

### Lead

| Operation | Description |
|-----------|-------------|
| **Get All** | List leads with optional search, status filter, sort, and pagination |
| **Get** | Fetch a single lead by ID |
| **Create** | Create a new lead — fields are dynamically loaded from your Brixfit account |
| **Update** | Update lead fields — same dynamic field loading |
| **Update Status** | Move a lead to a different pipeline status |
| **Delete** | Permanently delete a lead |

> **Dynamic fields**: When you create or update a lead, the node automatically fetches your custom field definitions from Brixfit and shows them as individual inputs. Click **Refresh** to reload after adding new fields.

### Client

| Operation | Description |
|-----------|-------------|
| **Get All** | List clients with search and status filter |
| **Get** | Fetch a single client by ID |
| **Update** | Update account status, goal, phone, end date or notes |
| **Deactivate** | Deactivate a client account |
| **Get Check-ins** | Fetch all check-ins for a specific client, with status and date filters |

### Check-in

| Operation | Description |
|-----------|-------------|
| **Get All** | List check-ins with filters (status, date range, client ID, pagination) |
| **Get by Client** | Fetch all check-ins for a specific client ID |

### Webhook

| Operation | Description |
|-----------|-------------|
| **Get All** | List all registered webhooks |
| **Create** | Register a new webhook endpoint |
| **Enable / Disable** | Toggle a webhook's `is_active` state without deleting it |
| **Delete** | Remove a webhook |

---

## Trigger Events

The **Brixfit Trigger** node starts your workflow when any of these events fire:

| Event | When it fires |
|-------|--------------|
| `lead.created` | A new lead is added |
| `lead.updated` | A lead's details are changed |
| `lead.status_changed` | A lead moves to a new pipeline stage |
| `lead.converted` | A lead is converted to a client |
| `lead.deleted` | A lead is deleted |
| `client.created` | A new client is onboarded |
| `client.updated` | A client's details are updated |
| `checkin.submitted` | A client submits a check-in |
| `*` | All events |

All payloads are **HMAC-SHA256 signed**. If you set a Webhook Secret, the node verifies the signature using the original raw bytes and constant-time comparison — tampered or unsigned requests are automatically rejected.

---

## Example Workflows

### 1. Capture leads from any form → Brixfit

```
Typeform / Tally / Facebook Lead Ads Trigger
  → Set (map name, email, phone, goal)
  → Brixfit: Create Lead
```

### 2. New lead → WhatsApp + Google Sheets

```
Brixfit Trigger (lead.created)
  → WhatsApp: Send welcome message to lead
  → Google Sheets: Append row
```

### 3. Client check-in submitted → Slack notification

```
Brixfit Trigger (checkin.submitted)
  → Slack: Send message to #coach-alerts
        "{{ $json.client_name }} just submitted their check-in"
```

### 4. Daily check-in report → Email

```
Schedule Trigger (every day at 9am)
  → Brixfit: Get All Check-ins (from_date: today, status: pending)
  → Gmail: Send summary to coach
```

### 5. Lead status changed → CRM sync

```
Brixfit Trigger (lead.status_changed)
  → IF (status == "converted")
      → HubSpot: Create Contact
      → Slack: Notify sales team
```

### 6. Auto-assign workout when client is created

```
Brixfit Trigger (client.created)
  → Brixfit: Get client details
  → HTTP Request: Trigger internal workflow
```

---

## Data Handling

When creating or updating leads via this node, Brixfit automatically:

- **Calculates body metrics** (BMI, BMR, TDEE, body fat %) from height, weight, age, gender, and activity level fields — no manual calculation needed
- **Normalizes phone numbers** — strips trunk zeros, handles international formats (`00XX` → `+XX`)
- **Validates and casts field types** — numbers stay numbers, dates become ISO strings, booleans are properly coerced

---

## Security

This node follows security best practices out of the box:

- **HMAC-SHA256 webhook verification** — uses raw request bytes and constant-time comparison
- **SSRF protection** — Base URL is validated; private/internal network addresses are rejected
- **Path traversal prevention** — all ID parameters are validated against an allowlist before use in URLs
- **30-second request timeout** — prevents n8n executions from hanging on slow API responses
- **Live credential testing** — API key is verified immediately on Save

---

## Resources

- [Brixfit website](https://brixfit.app)
- [API documentation](https://brixfit.app/coach/developer)
- [npm package](https://www.npmjs.com/package/n8n-nodes-brixfit)
- [GitHub repository](https://github.com/jatinbenivval/n8n-nodes-brixfit)
- [Changelog](CHANGELOG/v1.2.2-2026-03-26.md)
- [Report issues](https://github.com/jatinbenivval/n8n-nodes-brixfit/issues)

---

## Changelog

See the [CHANGELOG](CHANGELOG/) folder for full version history.

| Version | Date | Summary |
|---------|------|---------|
| [v1.2.2](CHANGELOG/v1.2.2-2026-03-26.md) | 2026-03-26 | Webhook Enable/Disable operation — complete API coverage |
| [v1.2.1](CHANGELOG/v1.2.1-2026-03-22.md) | 2026-03-22 | Complete reliability + UI fixes: error surfacing, filter preservation, JSON error handling |
| [v1.2.0](CHANGELOG/v1.2.0-2026-03-22.md) | 2026-03-22 | Security hardening, reliability improvements, credential testing, UI fixes |
| v1.1.0 | 2026-03-21 | Dynamic lead fields, client update/deactivate, check-in by client |
| v1.0.0 | 2026-03-21 | Initial release |

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

---

## License

MIT — © 2026 [Jatin Beniwal](https://github.com/jatinbenivval) / [Brixfly Services](https://brixfit.app)
