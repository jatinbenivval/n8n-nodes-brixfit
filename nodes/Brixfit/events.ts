// Single source of truth for webhook events — used by the Brixfit node (Webhook → Create)
// and the Brixfit Trigger. Mirrors `WebhookEvent` in the Brixfit API.
export const WEBHOOK_EVENT_OPTIONS = [
  { name: 'Check-in Submitted',  value: 'checkin.submitted'   },
  { name: 'Client Created',      value: 'client.created'      },
  { name: 'Client Deleted',      value: 'client.deleted'      },
  { name: 'Client Updated',      value: 'client.updated'      },
  { name: 'Lead Call Booked',    value: 'lead.call_booked'    },
  { name: 'Lead Converted',      value: 'lead.converted'      },
  { name: 'Lead Created',        value: 'lead.created'        },
  { name: 'Lead Deleted',        value: 'lead.deleted'        },
  { name: 'Lead Status Changed', value: 'lead.status_changed' },
  { name: 'Lead Updated',        value: 'lead.updated'        },
]
