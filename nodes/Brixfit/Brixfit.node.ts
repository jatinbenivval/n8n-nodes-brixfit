import type {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestMethods,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow'
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow'
import { brixfitProperties } from './Brixfit.properties'
import { loadLeadFields } from './Brixfit.fields'
import {
  brixfitGetAll,
  brixfitRequest,
  compact,
  dateOnly,
  idempotencyKeyFor,
  toNodeError,
  validateId,
} from './Brixfit.utils'

const label = (name: unknown, email: unknown) => {
  const n = String(name ?? '').trim() || 'Unnamed'
  return email ? `${n} (${String(email)})` : n
}

type Param = (name: string, fallback?: unknown) => unknown

export class Brixfit implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Brixfit',
    name: 'brixfit',
    icon: 'file:icon.png',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
    description: 'Manage leads, clients, check-ins, forms and webhooks in Brixfit Coaching CRM',
    defaults: { name: 'Brixfit' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    usableAsTool: true,
    credentials: [{ name: 'brixfitApi', required: true }],
    codex: {
      categories: ['CRM'],
      subcategories: { CRM: ['Fitness & Coaching'] },
      resources: {
        primaryDocumentation: [{ url: 'https://brixfit.app/api-docs' }],
        credentialDocumentation: [{ url: 'https://brixfit.app/coach/developer' }],
      },
      alias: ['brixfit', 'coaching', 'fitness', 'crm', 'leads', 'clients', 'onboarding', 'form'],
    },
    properties: brixfitProperties,
  }

  methods = {
    loadOptions: {
      // Lead pipeline statuses for the Update Status dropdown.
      // Client names for the client pickers. Newest 500 so the list stays quick; use an expression for older ones.
      async getClients(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        try {
          const rows = await brixfitGetAll(this, '/clients', {}, 5)
          return rows.map((c) => ({ name: label(c.full_name, c.email), value: String(c.id), description: c.account_status ? String(c.account_status) : undefined }))
        } catch (err) {
          throw toNodeError(err, this.getNode())
        }
      },
      // Lead names for the lead picker (newest first).
      async getLeads(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        try {
          const rows = await brixfitGetAll(this, '/leads', { sort: 'created_at:desc' }, 5)
          return rows.map((l) => ({ name: label(l.name, l.email), value: String(l.id), description: l.status ? String(l.status) : undefined }))
        } catch (err) {
          throw toNodeError(err, this.getNode())
        }
      },
      async getLeadStatuses(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        try {
          const res = await brixfitRequest(this, 'GET', '/leads/statuses')
          return ((res.data ?? []) as Array<{ value: string }>).map((s) => ({ name: s.value, value: s.value }))
        } catch (err) {
          throw toNodeError(err, this.getNode())
        }
      },
    },
    resourceMapping: {
      getLeadFields:       async function (this: ILoadOptionsFunctions) { return loadLeadFields(this, false) },
      getLeadUpdateFields: async function (this: ILoadOptionsFunctions) { return loadLeadFields(this, true) },
    },
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData()
    const out: INodeExecutionData[] = []

    for (let i = 0; i < items.length; i++) {
      const push = (row: IDataObject) => out.push({ json: row, pairedItem: { item: i } })

      try {
        const resource  = this.getNodeParameter('resource', i) as string
        const operation = this.getNodeParameter('operation', i) as string
        const param: Param = (name, fallback) => this.getNodeParameter(name, i, fallback)
        const id = (name: string, label: string) =>
          validateId(param(name) as string, label, this.getNode(), i)

        const result = await run(this, resource, operation, param, id, i)
        for (const row of result) push(row)
      } catch (err) {
        if (this.continueOnFail()) {
          // Same readable message and fix hint the node would throw, so an error branch can act on it.
          const nodeError = toNodeError(err, this.getNode(), i)
          push(compact({ error: nodeError.message, hint: nodeError.description ?? '' }))
        } else {
          throw toNodeError(err, this.getNode(), i)
        }
      }
    }

    return [out]
  }
}

// ── Operation dispatch ───────────────────────────────────────────────────────
// Each branch returns rows for the output. Anything list-shaped is unwrapped; a single object becomes one row.

async function run(
  ctx: IExecuteFunctions,
  resource: string,
  operation: string,
  param: Param,
  id: (name: string, label: string) => string,
  itemIndex: number,
): Promise<IDataObject[]> {
  const one = async (method: IHttpRequestMethods, path: string, options: { qs?: IDataObject; body?: IDataObject; idempotencyKey?: string } = {}) => {
    const res = await brixfitRequest(ctx, method, path, options)
    const data = res.data ?? res
    return Array.isArray(data) ? (data as IDataObject[]) : [data as IDataObject]
  }

  // Shared by lead/client/check-in "Get Many": honours Return All, otherwise one page.
  const list = async (path: string) => {
    const qs = dateOnly(compact(param('filters', {}) as IDataObject))
    return param('returnAll', false) ? brixfitGetAll(ctx, path, qs) : one('GET', path, { qs })
  }

  const checkinsFor = (clientId: string, optionsParam: string) =>
    one('GET', '/checkins', { qs: { client_id: clientId, ...dateOnly(compact(param(optionsParam, {}) as IDataObject)) } })

  const reportQs = () => compact(param('healthReportListOptions', {}) as IDataObject)

  switch (`${resource}.${operation}`) {
    // ── Lead ───────────────────────────────────────────────────────────────
    case 'lead.getAll':           return list('/leads')
    case 'lead.get':              return one('GET', `/leads/${id('leadId', 'Lead ID')}`)
    case 'lead.create': {
      const mapped = param('leadFields', { value: null }) as { value: IDataObject | null }
      const body = { name: param('name') as string, ...(mapped.value ?? {}) }
      return one('POST', '/leads', { body, idempotencyKey: idempotencyKeyFor(ctx, `lead.create:${itemIndex}`, body) })
    }
    case 'lead.update': {
      const mapped = param('leadUpdateFields', { value: null }) as { value: IDataObject | null }
      return one('PATCH', `/leads/${id('leadId', 'Lead ID')}`, { body: mapped.value ?? {} })
    }
    case 'lead.updateStatus':     return one('PATCH', `/leads/${id('leadId', 'Lead ID')}`, { body: { status: param('status') as string } })
    case 'lead.delete':           return one('DELETE', `/leads/${id('leadId', 'Lead ID')}`)
    case 'lead.getHealthReport':  return one('GET', `/leads/${id('leadId', 'Lead ID')}/health-report`)
    case 'lead.listHealthReports': return one('GET', `/leads/${id('leadId', 'Lead ID')}/health-reports`, { qs: reportQs() })

    // ── Client ─────────────────────────────────────────────────────────────
    case 'client.getAll':         return list('/clients')
    case 'client.get':            return one('GET', `/clients/${id('clientId', 'Client ID')}`)
    case 'client.update':         return one('PATCH', `/clients/${id('clientId', 'Client ID')}`, { body: compact(param('clientUpdateFields', {}) as IDataObject) })
    case 'client.deactivate':     return one('DELETE', `/clients/${id('clientId', 'Client ID')}`)
    case 'client.getCheckins':    return checkinsFor(id('clientId', 'Client ID'), 'clientCheckinOptions')
    case 'client.getHealthReport': return one('GET', `/clients/${id('clientId', 'Client ID')}/health-report`)
    case 'client.listHealthReports': return one('GET', `/clients/${id('clientId', 'Client ID')}/health-reports`, { qs: reportQs() })
    case 'client.getOnboarding':  return one('GET', `/clients/${id('clientId', 'Client ID')}/onboarding`)

    // ── Check-in ───────────────────────────────────────────────────────────
    case 'checkin.get':           return one('GET', `/checkins/${id('checkinId', 'Check-in ID')}`)
    case 'checkin.getAll':        return list('/checkins')
    case 'checkin.getByClient':   return checkinsFor(id('checkinClientId', 'Client ID'), 'checkinClientOptions')

    // ── Form ───────────────────────────────────────────────────────────────
    case 'form.getAll':           return one('GET', '/forms')
    case 'form.get':              return one('GET', `/forms/${param('formType') as string}`)

    // ── Webhook ────────────────────────────────────────────────────────────
    case 'webhook.getAll':        return one('GET', '/webhooks')
    case 'webhook.create': {
      const url = param('webhookUrl') as string
      if (!url.startsWith('https://')) throw new NodeOperationError(ctx.getNode(), 'Webhook URL must use HTTPS.')
      const description = param('webhookDescription', '') as string
      const body = { url, events: param('events') as string[], description: description || undefined }
      return one('POST', '/webhooks', { body, idempotencyKey: idempotencyKeyFor(ctx, `webhook.create:${itemIndex}`, body) })
    }
    case 'webhook.toggleActive':  return one('PATCH', `/webhooks/${id('webhookId', 'Webhook ID')}`, { body: { is_active: param('webhookIsActive') as boolean } })
    case 'webhook.delete':        return one('DELETE', `/webhooks/${id('webhookId', 'Webhook ID')}`)
  }

  throw new NodeOperationError(ctx.getNode(), `Unsupported operation: ${resource} → ${operation}`)
}
