import { createHmac, timingSafeEqual } from 'crypto'
import type {
  IHookFunctions,
  IWebhookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  IDataObject,
} from 'n8n-workflow'

/**
 * BrixfitTrigger — receives webhook events from Brixfit and starts n8n workflows.
 *
 * How it works:
 * 1. When you activate the workflow, n8n exposes a webhook URL
 * 2. You paste that URL in Brixfit → Developer → Webhooks (or via API)
 * 3. Brixfit POSTs signed payloads to your URL on every selected event
 * 4. This node validates the signature and passes the event data downstream
 */
export class BrixfitTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Brixfit Trigger',
    name: 'brixfitTrigger',
    icon: 'file:brixfit.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts a workflow when a Brixfit event fires (lead created, status changed, check-in submitted, etc.)',
    defaults: { name: 'Brixfit Trigger' },
    inputs: [],
    outputs: ['main'],
    credentials: [{ name: 'brixfitApi', required: false }],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'webhook',
      },
    ],
    properties: [
      {
        displayName: 'Events to Listen For',
        name: 'events',
        type: 'multiOptions',
        options: [
          { name: 'Lead Created',        value: 'lead.created'        },
          { name: 'Lead Updated',        value: 'lead.updated'        },
          { name: 'Lead Status Changed', value: 'lead.status_changed' },
          { name: 'Lead Converted',      value: 'lead.converted'      },
          { name: 'Lead Deleted',        value: 'lead.deleted'        },
          { name: 'Client Created',      value: 'client.created'      },
          { name: 'Client Updated',      value: 'client.updated'      },
          { name: 'Check-in Submitted',  value: 'checkin.submitted'   },
          { name: 'All Events',          value: '*'                   },
        ],
        default: ['lead.created'],
        description: 'Which Brixfit events should trigger this workflow',
      },
      {
        displayName: 'Webhook Secret',
        name: 'webhookSecret',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        description: 'The secret returned when you registered this webhook in Brixfit. Used to verify payload authenticity.',
      },
      {
        displayName: 'Setup Instructions',
        name: 'setupInstructions',
        type: 'notice',
        default: `
**How to connect this trigger to Brixfit:**

1. Activate this workflow to get your webhook URL (shown below)
2. Copy the URL
3. Go to **Brixfit → Developer → Webhooks** (or use the API)
4. Create a new webhook with this URL and select the same events as above
5. Copy the secret shown on creation and paste it in the "Webhook Secret" field above
        `.trim(),
      },
    ],
  }

  // Called when workflow is activated — nothing to do here since coach sets up
  // the webhook manually in the Brixfit dashboard.
  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        return false
      },
      async create(this: IHookFunctions): Promise<boolean> {
        return true
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        return true
      },
    },
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req           = this.getRequestObject()
    const body          = this.getBodyData()
    const secret        = this.getNodeParameter('webhookSecret', '') as string
    const allowedEvents = this.getNodeParameter('events', ['*']) as string[]

    // ── Signature verification (if secret configured) ──────────────────────
    if (secret) {
      const signature = (req.headers['x-brixfit-signature'] as string) ?? ''

      // C1 FIX: Use the raw request bytes for HMAC computation.
      // n8n's getBodyData() returns an already-parsed object — JSON.stringify()
      // on that object can produce different bytes (key order, whitespace) than
      // the original payload that was signed. We use req.rawBody (a Buffer set
      // by n8n's Express middleware) to get the exact original bytes.
      // Fallback to JSON.stringify only if rawBody is unavailable (older n8n).
      const rawReq  = req as unknown as { rawBody?: Buffer | string }
      const rawBody = rawReq.rawBody != null
        ? (Buffer.isBuffer(rawReq.rawBody)
            ? rawReq.rawBody.toString('utf8')
            : String(rawReq.rawBody))
        : JSON.stringify(body)

      // C1 FIX: Use Node.js crypto (synchronous, available in all n8n versions)
      // instead of the async Web Crypto API (crypto.subtle) which is not
      // guaranteed to be available in all n8n runtime environments.
      const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')

      // C2 FIX: Timing-safe comparison via timingSafeEqual.
      // String !== comparison is not constant-time — an attacker who can measure
      // response latency can enumerate the correct HMAC byte-by-byte.
      const sigBuf = Buffer.from(signature)
      const expBuf = Buffer.from(expected)
      const valid  = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)

      if (!valid) {
        return { webhookResponse: { status: 401, body: JSON.stringify({ error: 'Invalid signature' }) } }
      }
    }

    // ── Event filtering ────────────────────────────────────────────────────
    const event     = (body as IDataObject).event as string
    const listenAll = allowedEvents.includes('*')

    if (!listenAll && !allowedEvents.includes(event)) {
      return { webhookResponse: { status: 200, body: JSON.stringify({ ok: true, skipped: true }) } }
    }

    return {
      workflowData: [[{ json: body as IDataObject }]],
    }
  }
}
