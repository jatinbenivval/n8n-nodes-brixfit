import { createHmac, timingSafeEqual } from 'crypto'
import type {
  IHookFunctions,
  IWebhookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  IDataObject,
} from 'n8n-workflow'
import { NodeConnectionTypes } from 'n8n-workflow'
import { validateBaseUrl, REQUEST_TIMEOUT_MS } from './Brixfit.utils'

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
        ],
        default: ['lead.created'],
        description: 'Which Brixfit events should trigger this workflow',
      },
      {
        displayName: 'Webhook Secret (Manual Override)',
        name: 'webhookSecret',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        description: 'Leave blank — the webhook secret is managed automatically when this workflow is activated. Only set this if you have manually created a Brixfit webhook and want to reuse its secret.',
      },
    ],
  }

  // ── Lifecycle hooks (auto-registration) ────────────────────────────────────
  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData('node')
        const webhookId  = staticData.webhookId as string | undefined
        if (!webhookId) return false

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

        const credentials = await this.getCredentials('brixfitApi')
        const baseUrl     = validateBaseUrl(credentials.baseUrl as string, this.getNode()) + '/api/public/v1'
        const apiKey      = credentials.apiKey as string

        const response = await this.helpers.request({
          method: 'POST',
          url: `${baseUrl}/webhooks`,
          headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
          body: { url: webhookUrl, events, description: 'Created automatically by n8n' },
          json: true,
          timeout: REQUEST_TIMEOUT_MS,
        })

        const data = response?.data as { id?: string; secret?: string } | null
        if (!data?.id) return false

        const staticData            = this.getWorkflowStaticData('node')
        staticData.webhookId        = data.id
        staticData.webhookSecret    = data.secret ?? ''
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
          // Ignore errors — webhook may have been removed from the Brixfit dashboard already
        }

        delete staticData.webhookId
        delete staticData.webhookSecret
        return true
      },
    },
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req           = this.getRequestObject()
    const body          = this.getBodyData()
    const allowedEvents = this.getNodeParameter('events', ['lead.created']) as string[]

    // Prefer the auto-registered secret; fall back to manual override field
    const staticData   = this.getWorkflowStaticData('node')
    const manualSecret = this.getNodeParameter('webhookSecret', '') as string
    const secret       = (staticData.webhookSecret as string) || manualSecret

    // ── Signature verification ──────────────────────────────────────────────
    if (secret) {
      const signature = (req.headers['x-brixfit-signature'] as string) ?? ''

      // Use the original raw bytes for HMAC — JSON.stringify can produce different
      // bytes (key order, whitespace) than the original signed payload.
      const rawReq  = req as unknown as { rawBody?: Buffer | string }
      const rawBody = rawReq.rawBody != null
        ? (Buffer.isBuffer(rawReq.rawBody)
            ? rawReq.rawBody.toString('utf8')
            : String(rawReq.rawBody))
        : JSON.stringify(body)

      const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')

      const sigBuf = Buffer.from(signature)
      const expBuf = Buffer.from(expected)
      const valid  = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)

      if (!valid) {
        return { webhookResponse: { status: 401, body: JSON.stringify({ error: 'Invalid signature' }) } }
      }
    }

    // ── Event filtering ────────────────────────────────────────────────────
    const event = (body as IDataObject).event as string

    if (event && !allowedEvents.includes(event)) {
      return { webhookResponse: { status: 200, body: JSON.stringify({ ok: true, skipped: true }) } }
    }

    return {
      workflowData: [[{ json: body as IDataObject }]],
    }
  }
}
