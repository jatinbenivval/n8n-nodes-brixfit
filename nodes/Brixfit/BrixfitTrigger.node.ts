import { createHmac, timingSafeEqual } from 'crypto'
import type {
  IHookFunctions,
  IWebhookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  IDataObject,
} from 'n8n-workflow'
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow'
import { validateBaseUrl, REQUEST_TIMEOUT_MS } from './Brixfit.utils'

// Sorted fingerprint of an events array — used to detect when the user changes
// the event selection so we can force a webhook re-registration.
function eventsFingerprint(events: string[]): string {
  return [...events].sort().join(',')
}

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
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'brixfitApi', required: true }],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'webhook',
      },
    ],
    codex: {
      categories: ['CRM'],
      subcategories: { CRM: ['Fitness & Coaching'] },
      resources: {
        primaryDocumentation: [{ url: 'https://brixfit.app/docs/n8n' }],
        credentialDocumentation: [{ url: 'https://brixfit.app/coach/developer' }],
      },
      alias: ['brixfit', 'coaching', 'fitness', 'crm', 'leads', 'clients', 'trigger', 'webhook'],
    },
    properties: [

      // ── Auto-registration notice ───────────────────────────────────────────
      {
        displayName: '🔐 Webhook secret is managed automatically. When you activate this workflow, n8n registers a signed webhook in your Brixfit account and stores the secret securely. All incoming payloads are HMAC-SHA256 verified. Deactivating the workflow removes the webhook from Brixfit. No manual setup needed.',
        name: 'autoRegistrationNotice',
        type: 'notice',
        default: '',
      },

      // ── Events ────────────────────────────────────────────────────────────
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
          { name: 'Client Deleted',      value: 'client.deleted'      },
          { name: 'Check-in Submitted',  value: 'checkin.submitted'   },
        ],
        default: ['lead.created'],
        description: 'Which Brixfit events trigger this workflow. If you change this list, deactivate and reactivate the workflow to sync the registration.',
      },

      // ── Options ───────────────────────────────────────────────────────────
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
          {
            displayName: 'Require Valid Signature',
            name: 'requireSignature',
            type: 'boolean',
            default: true,
            description: 'Whether to reject requests that arrive without a valid HMAC-SHA256 signature. Disable only for testing — auto-registered webhooks always have a secret.',
          },
          {
            displayName: 'Replay Protection Window (Minutes)',
            name: 'replayWindowMinutes',
            type: 'number',
            default: 5,
            typeOptions: { minValue: 1, maxValue: 60 },
            description: 'Reject signed requests whose timestamp is older than this many minutes. Prevents replayed payloads. Set to 0 to disable.',
          },
          {
            displayName: 'Webhook Description',
            name: 'webhookDescription',
            type: 'string',
            default: '',
            placeholder: 'e.g. Lead nurture workflow',
            description: 'Label shown next to this webhook in Brixfit → Developer → Webhooks. Helps identify which n8n workflow owns each webhook.',
          },
          {
            displayName: 'Manual Webhook Secret',
            name: 'webhookSecret',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            description: 'Leave blank — the secret is auto-managed. Only set this if you manually created a Brixfit webhook outside n8n and want to use its secret.',
          },
        ],
      },
    ],
  }

  // ── Lifecycle hooks (auto-registration) ────────────────────────────────────
  webhookMethods = {
    default: {
      // Returns true → skip create (webhook already registered and up-to-date).
      // Returns false → run create (first activation, or events changed).
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData('node')
        const webhookId  = staticData.webhookId as string | undefined
        if (!webhookId) return false

        // If the user changed the event selection, force a re-registration so
        // Brixfit is always subscribed to exactly the events configured here.
        const currentFingerprint = eventsFingerprint(this.getNodeParameter('events') as string[])
        if (staticData.webhookEvents !== currentFingerprint) return false

        const credentials = await this.getCredentials('brixfitApi')
        const baseUrl     = validateBaseUrl(credentials.baseUrl as string, this.getNode()) + '/api/public/v1'
        const apiKey      = credentials.apiKey as string

        try {
          const response = await this.helpers.request({
            method: 'GET',
            url: `${baseUrl}/webhooks`,
            headers: { 'x-api-key': apiKey },
            json: true,
            timeout: REQUEST_TIMEOUT_MS,
          })
          const webhooks = (response?.data ?? []) as Array<{ id: string; is_active: boolean }>
          return webhooks.some(w => w.id === webhookId && w.is_active)
        } catch {
          return false
        }
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default')
        const events     = this.getNodeParameter('events') as string[]
        const options    = this.getNodeParameter('options', {}) as {
          webhookDescription?: string
        }
        const description = options.webhookDescription?.trim() || 'Created automatically by n8n'

        const credentials = await this.getCredentials('brixfitApi')
        const baseUrl     = validateBaseUrl(credentials.baseUrl as string, this.getNode()) + '/api/public/v1'
        const apiKey      = credentials.apiKey as string

        const response = await this.helpers.request({
          method: 'POST',
          url: `${baseUrl}/webhooks`,
          headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
          body: { url: webhookUrl, events, description },
          json: true,
          timeout: REQUEST_TIMEOUT_MS,
        })

        const data = response?.data as { id?: string; secret?: string } | null
        if (!data?.id) return false

        const staticData         = this.getWorkflowStaticData('node')
        staticData.webhookId     = data.id
        staticData.webhookSecret = data.secret ?? ''
        staticData.webhookEvents = eventsFingerprint(events)
        return true
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData('node')
        const webhookId  = staticData.webhookId as string | undefined
        if (!webhookId) return true

        const credentials = await this.getCredentials('brixfitApi')
        const baseUrl     = validateBaseUrl(credentials.baseUrl as string, this.getNode()) + '/api/public/v1'
        const apiKey      = credentials.apiKey as string

        try {
          await this.helpers.request({
            method: 'DELETE',
            url: `${baseUrl}/webhooks/${webhookId}`,
            headers: { 'x-api-key': apiKey },
            json: true,
            timeout: REQUEST_TIMEOUT_MS,
          })
        } catch {
          // Ignore — webhook may have already been deleted from the Brixfit dashboard
        }

        delete staticData.webhookId
        delete staticData.webhookSecret
        delete staticData.webhookEvents
        return true
      },
    },
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req           = this.getRequestObject()
    const body          = this.getBodyData() as IDataObject
    const allowedEvents = this.getNodeParameter('events', ['lead.created']) as string[]
    const options       = this.getNodeParameter('options', {}) as {
      requireSignature?:    boolean
      replayWindowMinutes?: number
      webhookSecret?:       string
    }

    const requireSignature   = options.requireSignature   ?? true
    const replayWindowMin    = options.replayWindowMinutes ?? 5

    // ── Resolve signing secret ──────────────────────────────────────────────
    // Priority: auto-registered secret (staticData) > manual override field
    const staticData   = this.getWorkflowStaticData('node')
    const manualSecret = options.webhookSecret ?? ''
    const secret       = (staticData.webhookSecret as string) || manualSecret

    if (requireSignature && !secret) {
      throw new NodeOperationError(
        this.getNode(),
        'No webhook secret is available. Activate this workflow to auto-register, or disable "Require Valid Signature" for testing.',
      )
    }

    // ── Signature verification ──────────────────────────────────────────────
    if (secret) {
      const signature = (req.headers['x-brixfit-signature'] as string) ?? ''

      // Use raw request bytes — JSON.stringify on the parsed body can differ
      // in key order / whitespace from what Brixfit actually signed.
      const rawReq  = req as unknown as { rawBody?: Buffer | string }
      const rawBody = rawReq.rawBody != null
        ? (Buffer.isBuffer(rawReq.rawBody) ? rawReq.rawBody.toString('utf8') : String(rawReq.rawBody))
        : JSON.stringify(body)

      const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
      const sigBuf   = Buffer.from(signature)
      const expBuf   = Buffer.from(expected)
      const valid    = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)

      if (!valid) {
        return { webhookResponse: { status: 401, body: JSON.stringify({ error: 'Invalid signature' }) } }
      }

      // ── Replay protection ───────────────────────────────────────────────
      // Only checked after signature passes — forged timestamps can't reach here.
      if (replayWindowMin > 0) {
        const tsHeader  = req.headers['x-brixfit-timestamp'] as string | undefined
        const tsMs      = tsHeader ? new Date(tsHeader).getTime() : NaN
        const windowMs  = replayWindowMin * 60 * 1000

        if (isNaN(tsMs) || Date.now() - tsMs > windowMs) {
          return { webhookResponse: { status: 401, body: JSON.stringify({ error: 'Request expired or missing timestamp' }) } }
        }
      }
    }

    // ── Event filtering ────────────────────────────────────────────────────
    const event = body.event as string

    if (event && !allowedEvents.includes(event)) {
      return { webhookResponse: { status: 200, body: JSON.stringify({ ok: true, skipped: true }) } }
    }

    // ── Flatten output ─────────────────────────────────────────────────────
    // Spread the nested `data` object to the top level so downstream nodes can
    // use $json.name, $json.email, etc. directly instead of $json.data.name.
    // Meta fields (event, timestamp, coach_id) are prefixed with _ to avoid
    // collisions with data fields.
    const data = (body.data ?? {}) as IDataObject
    const output: IDataObject = {
      ...data,
      _event:     body.event     ?? null,
      _timestamp: body.timestamp ?? null,
      _coach_id:  body.coach_id  ?? null,
    }

    return {
      workflowData: [[{ json: output }]],
    }
  }
}
