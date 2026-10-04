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
  toNodeError,
  validateId,
} from './Brixfit.utils'

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

        const result = await run(this, resource, operation, param, id)
        for (const row of result) push(row)
      } catch (err) {
        if (this.continueOnFail()) {
          push({ error: err instanceof Error ? err.message : String(err) })
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
): Promise<IDataObject[]> {
  const one = async (method: IHttpRequestMethods, path: string, options: { qs?: IDataObject; body?: IDataObject } = {}) => {
    const res = await brixfitRequest(ctx, method, path, options)
    const data = res.data ?? res
    return Array.isArray(data) ? (data as IDataObject[]) : [data as IDataObject]
  }

  // Shared by lead/client/check-in "Get Many": honours Return All, otherwise one page.
  const list = async (path: string) => {
    const qs = compact(param('filters', {}) as IDataObject)
    return param('returnAll', false) ? brixfitGetAll(ctx, path, qs) : one('GET', path, { qs })
  }

  const checkinsFor = (clientId: string, optionsParam: string) =>
    one('GET', '/checkins', { qs: { client_id: clientId, ...compact(param(optionsParam, {}) as IDataObject) } })

  const reportQs = () => compact(param('healthReportListOptions', {}) as IDataObject)

  switch (`${resource}.${operation}`) {
    // ── Lead ───────────────────────────────────────────────────────────────
    case 'lead.getAll':           return list('/leads')
    case 'lead.get':              return one('GET', `/leads/${id('leadId', 'Lead ID')}`)
    case 'lead.create': {
      const mapped = param('leadFields', { value: null }) as { value: IDataObject | null }
      return one('POST', '/leads', { body: { name: param('name') as string, ...(mapped.value ?? {}) } })
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
      return one('POST', '/webhooks', { body: { url, events: param('events') as string[], description: description || undefined } })
    }
    case 'webhook.toggleActive':  return one('PATCH', `/webhooks/${id('webhookId', 'Webhook ID')}`, { body: { is_active: param('webhookIsActive') as boolean } })
    case 'webhook.delete':        return one('DELETE', `/webhooks/${id('webhookId', 'Webhook ID')}`)
  }

  throw new NodeOperationError(ctx.getNode(), `Unsupported operation: ${resource} → ${operation}`)
}
