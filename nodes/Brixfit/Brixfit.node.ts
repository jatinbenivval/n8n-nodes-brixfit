import type {
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  INode,
  IRequestOptions,
  IDataObject,
  ResourceMapperFields,
  ResourceMapperField,
  INodePropertyOptions,
} from 'n8n-workflow'
import { NodeOperationError, NodeConnectionTypes } from 'n8n-workflow'
import { validateBaseUrl, validateId, REQUEST_TIMEOUT_MS } from './Brixfit.utils'

// ── Parse API response helper ────────────────────────────────────────────────
function parseApiResponse(response: unknown, node: INode, itemIndex: number): IDataObject {
  if (typeof response === 'string') {
    try {
      return JSON.parse(response) as IDataObject
    } catch {
      throw new NodeOperationError(
        node,
        `Brixfit API returned a non-JSON response. Raw response (first 200 chars): ${response.slice(0, 200)}`,
        { itemIndex },
      )
    }
  }
  return response as IDataObject
}

export class Brixfit implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Brixfit',
    name: 'brixfit',
    icon: 'file:icon.png',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
    description: 'Manage leads, clients, check-ins and webhooks in Brixfit Coaching CRM',
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
      alias: ['brixfit', 'coaching', 'fitness', 'crm', 'leads', 'clients'],
    },
    properties: [

      // ── Resource selector ──────────────────────────────────────────────────
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Lead',     value: 'lead'    },
          { name: 'Client',   value: 'client'  },
          { name: 'Check-in', value: 'checkin' },
          { name: 'Webhook',  value: 'webhook' },
        ],
        default: 'lead',
      },

      // ── Lead operations ────────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['lead'] } },
        options: [
          { name: 'Create',              value: 'create',             description: 'Create a new lead',                          action: 'Create a lead'            },
          { name: 'Delete',              value: 'delete',             description: 'Delete a lead permanently',                  action: 'Delete a lead'            },
          { name: 'Get',                 value: 'get',                description: 'Get a lead by ID',                           action: 'Get a lead'               },
          { name: 'Get All',             value: 'getAll',             description: 'List all leads',                             action: 'Get all leads'            },
          { name: 'Get Health Report',   value: 'getHealthReport',    description: 'Get the latest AI health report for a lead', action: 'Get lead health report'   },
          { name: 'List Health Reports', value: 'listHealthReports',  description: 'List all AI health reports for a lead',      action: 'List lead health reports' },
          { name: 'Update',              value: 'update',             description: 'Update a lead',                              action: 'Update a lead'            },
          { name: 'Update Status',       value: 'updateStatus',       description: "Change a lead's pipeline status",            action: 'Update lead status'       },
        ],
        default: 'getAll',
      },

      // ── Client operations ──────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['client'] } },
        options: [
          { name: 'Deactivate',          value: 'deactivate',         description: 'Deactivate a client account',                   action: 'Deactivate a client'        },
          { name: 'Get',                 value: 'get',                description: 'Get a client by ID',                            action: 'Get a client'               },
          { name: 'Get All',             value: 'getAll',             description: 'List all clients',                              action: 'Get all clients'            },
          { name: 'Get Check-ins',       value: 'getCheckins',        description: 'Get all check-ins for a client',                action: 'Get client check-ins'       },
          { name: 'Get Health Report',   value: 'getHealthReport',    description: 'Get the latest AI health report for a client',  action: 'Get client health report'   },
          { name: 'List Health Reports', value: 'listHealthReports',  description: 'List all AI health reports for a client',       action: 'List client health reports' },
          { name: 'Update',              value: 'update',             description: 'Update a client',                               action: 'Update a client'            },
        ],
        default: 'getAll',
      },

      // ── Check-in operations ────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['checkin'] } },
        options: [
          { name: 'Get All',       value: 'getAll',      description: 'List all check-ins with optional filters', action: 'Get all check-ins'       },
          { name: 'Get by Client', value: 'getByClient', description: 'Get all check-ins for a specific client',  action: 'Get check-ins by client' },
        ],
        default: 'getAll',
      },

      // ── Webhook operations ─────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['webhook'] } },
        options: [
          { name: 'Create',          value: 'create',       description: 'Register a new webhook',      action: 'Create a webhook'          },
          { name: 'Delete',          value: 'delete',       description: 'Remove a webhook',             action: 'Delete a webhook'          },
          { name: 'Enable / Disable', value: 'toggleActive', description: 'Enable or disable a webhook', action: 'Enable or disable a webhook' },
          { name: 'Get All',         value: 'getAll',       description: 'List all webhooks',            action: 'Get all webhooks'          },
        ],
        default: 'getAll',
      },

      // ── Lead ID ────────────────────────────────────────────────────────────
      {
        displayName: 'Lead ID',
        name: 'leadId',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['get', 'update', 'updateStatus', 'delete', 'getHealthReport', 'listHealthReports'] } },
        default: '',
        description: 'The unique ID of the lead',
      },

      // ── Return All (lead / client / checkin getAll) ────────────────────────
      {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        displayOptions: { show: { resource: ['lead', 'client', 'checkin'], operation: ['getAll'] } },
        description: 'Whether to return all results instead of only one page. Uses automatic pagination.',
      },

      // ── Lead create — dynamic fields via resourceMapper ────────────────────
      {
        displayName: 'Name',
        name: 'name',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['create'] } },
        default: '',
        description: 'Full name of the lead',
      },
      {
        displayName: 'Lead Fields',
        name: 'leadFields',
        type: 'resourceMapper',
        noDataExpression: true,
        default: { mappingMode: 'defineBelow', value: null },
        displayOptions: { show: { resource: ['lead'], operation: ['create'] } },
        typeOptions: {
          resourceMapper: {
            resourceMapperMethod: 'getLeadFields',
            mode: 'add',
            fieldWords: { singular: 'field', plural: 'fields' },
            addAllFields: false,
            multiKeyMatch: false,
          },
        },
        description: 'Fields defined in your Brixfit lead form. Click "Refresh" to load the latest fields from your account.',
      },

      // ── Lead update — dynamic fields ───────────────────────────────────────
      {
        displayName: 'Update Fields',
        name: 'leadUpdateFields',
        type: 'resourceMapper',
        noDataExpression: true,
        default: { mappingMode: 'defineBelow', value: null },
        displayOptions: { show: { resource: ['lead'], operation: ['update'] } },
        typeOptions: {
          resourceMapper: {
            resourceMapperMethod: 'getLeadUpdateFields',
            mode: 'update',
            fieldWords: { singular: 'field', plural: 'fields' },
            addAllFields: false,
            multiKeyMatch: false,
          },
        },
        description: 'Fields to update on this lead',
      },

      // ── Lead update status — dynamic dropdown ─────────────────────────────
      {
        displayName: 'Status',
        name: 'status',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getLeadStatuses' },
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['updateStatus'] } },
        default: '',
        description: 'New pipeline status — loaded from your Brixfit account. Click "Refresh" to update the list.',
      },

      // ── Client ID ──────────────────────────────────────────────────────────
      {
        displayName: 'Client ID',
        name: 'clientId',
        type: 'string',
        required: true,
        displayOptions: {
          show: {
            resource: ['client'],
            operation: ['get', 'update', 'deactivate', 'getCheckins', 'getHealthReport', 'listHealthReports'],
          },
        },
        default: '',
        description: 'The unique ID of the client',
      },

      // ── Client update fields ───────────────────────────────────────────────
      {
        displayName: 'Update Fields',
        name: 'clientUpdateFields',
        type: 'collection',
        placeholder: 'Add Field',
        displayOptions: { show: { resource: ['client'], operation: ['update'] } },
        default: {},
        options: [
          {
            displayName: 'Account Status',
            name: 'account_status',
            type: 'options',
            options: [
              { name: 'Active',   value: 'active'   },
              { name: 'Inactive', value: 'inactive' },
              { name: 'Paused',   value: 'paused'   },
            ],
            default: 'active',
          },
          { displayName: 'End Date', name: 'end_date', type: 'dateTime', default: '', description: 'Subscription end date' },
          { displayName: 'Goal',     name: 'goal',     type: 'string',   default: '' },
          { displayName: 'Notes',    name: 'notes',    type: 'string',   default: '', typeOptions: { rows: 3 } },
          { displayName: 'Phone',    name: 'phone',    type: 'string',   default: '' },
        ],
      },

      // ── Check-in: Get by Client ────────────────────────────────────────────
      {
        displayName: 'Client ID',
        name: 'checkinClientId',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['checkin'], operation: ['getByClient'] } },
        default: '',
        description: 'Fetch all check-ins submitted by this client',
      },
      {
        displayName: 'Options',
        name: 'checkinClientOptions',
        type: 'collection',
        placeholder: 'Add Option',
        displayOptions: { show: { resource: ['checkin'], operation: ['getByClient'] } },
        default: {},
        options: [
          {
            displayName: 'Status',
            name: 'status',
            type: 'options',
            options: [
              { name: 'All',       value: ''          },
              { name: 'Completed', value: 'completed' },
              { name: 'Pending',   value: 'pending'   },
              { name: 'Reviewed',  value: 'reviewed'  },
            ],
            default: '',
          },
          { displayName: 'From Date', name: 'from_date', type: 'string', default: '', description: 'YYYY-MM-DD' },
          { displayName: 'To Date',   name: 'to_date',   type: 'string', default: '', description: 'YYYY-MM-DD' },
          { displayName: 'Page',      name: 'page',      type: 'number', default: 1  },
          { displayName: 'Per Page',  name: 'per_page',  type: 'number', default: 20 },
        ],
      },

      // ── Client: Get Check-ins options ──────────────────────────────────────
      {
        displayName: 'Options',
        name: 'clientCheckinOptions',
        type: 'collection',
        placeholder: 'Add Option',
        displayOptions: { show: { resource: ['client'], operation: ['getCheckins'] } },
        default: {},
        options: [
          {
            displayName: 'Status',
            name: 'status',
            type: 'options',
            options: [
              { name: 'All',       value: ''          },
              { name: 'Completed', value: 'completed' },
              { name: 'Pending',   value: 'pending'   },
              { name: 'Reviewed',  value: 'reviewed'  },
            ],
            default: '',
          },
          { displayName: 'From Date', name: 'from_date', type: 'string', default: '', description: 'YYYY-MM-DD' },
          { displayName: 'To Date',   name: 'to_date',   type: 'string', default: '', description: 'YYYY-MM-DD' },
          { displayName: 'Page',      name: 'page',      type: 'number', default: 1  },
          { displayName: 'Per Page',  name: 'per_page',  type: 'number', default: 20 },
        ],
      },

      // ── Health reports list options ────────────────────────────────────────
      {
        displayName: 'Options',
        name: 'healthReportListOptions',
        type: 'collection',
        placeholder: 'Add Option',
        displayOptions: {
          show: {
            resource: ['lead', 'client'],
            operation: ['listHealthReports'],
          },
        },
        default: {},
        options: [
          { displayName: 'Page',     name: 'page',     type: 'number', default: 1,  description: 'Page number (starts at 1)'   },
          { displayName: 'Per Page', name: 'per_page', type: 'number', default: 10, description: 'Results per page (max 50)'   },
        ],
      },

      // ── List filters — lead / client ───────────────────────────────────────
      {
        displayName: 'Filters',
        name: 'filters',
        type: 'collection',
        placeholder: 'Add Filter',
        displayOptions: {
          show: {
            resource: ['lead', 'client'],
            operation: ['getAll'],
          },
        },
        default: {},
        options: [
          { displayName: 'Search',   name: 'search',   type: 'string', default: '' },
          { displayName: 'Status',   name: 'status',   type: 'string', default: '' },
          { displayName: 'Page',     name: 'page',     type: 'number', default: 1  },
          { displayName: 'Per Page', name: 'per_page', type: 'number', default: 20, description: 'Ignored when Return All is enabled' },
          // Sort is only relevant for leads
          {
            displayName: 'Sort',
            name: 'sort',
            type: 'options',
            displayOptions: { show: { '/resource': ['lead'] } },
            options: [
              { name: 'Created — Newest First', value: 'created_at:desc'  },
              { name: 'Created — Oldest First', value: 'created_at:asc'   },
              { name: 'Updated — Newest First', value: 'updated_at:desc'  },
              { name: 'Updated — Oldest First', value: 'updated_at:asc'   },
              { name: 'Name (A–Z)',              value: 'name:asc'         },
              { name: 'Name (Z–A)',              value: 'name:desc'        },
              { name: 'Email (A–Z)',             value: 'email:asc'        },
              { name: 'Email (Z–A)',             value: 'email:desc'       },
            ],
            default: 'created_at:desc',
          },
        ],
      },

      // ── List filters — checkin getAll ──────────────────────────────────────
      {
        displayName: 'Filters',
        name: 'filters',
        type: 'collection',
        placeholder: 'Add Filter',
        displayOptions: {
          show: {
            resource: ['checkin'],
            operation: ['getAll'],
          },
        },
        default: {},
        options: [
          { displayName: 'Client ID', name: 'client_id', type: 'string', default: '' },
          {
            displayName: 'Status',
            name: 'status',
            type: 'options',
            options: [
              { name: 'All',       value: ''          },
              { name: 'Completed', value: 'completed' },
              { name: 'Overdue',   value: 'overdue'   },
              { name: 'Pending',   value: 'pending'   },
              { name: 'Reviewed',  value: 'reviewed'  },
            ],
            default: '',
          },
          { displayName: 'From Date', name: 'from_date', type: 'string', default: '', description: 'YYYY-MM-DD' },
          { displayName: 'To Date',   name: 'to_date',   type: 'string', default: '', description: 'YYYY-MM-DD' },
          { displayName: 'Page',      name: 'page',      type: 'number', default: 1  },
          { displayName: 'Per Page',  name: 'per_page',  type: 'number', default: 20, description: 'Ignored when Return All is enabled' },
        ],
      },

      // ── Webhook ID ─────────────────────────────────────────────────────────
      {
        displayName: 'Webhook ID',
        name: 'webhookId',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['webhook'], operation: ['delete', 'toggleActive'] } },
        default: '',
        description: 'The unique ID of the webhook',
      },

      // ── Webhook enable/disable ─────────────────────────────────────────────
      {
        displayName: 'Active',
        name: 'webhookIsActive',
        type: 'boolean',
        required: true,
        displayOptions: { show: { resource: ['webhook'], operation: ['toggleActive'] } },
        default: true,
        description: 'Whether to enable (true) or disable (false) this webhook',
      },

      // ── Webhook create ─────────────────────────────────────────────────────
      {
        displayName: 'URL',
        name: 'webhookUrl',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
        default: '',
        description: 'HTTPS URL to receive event notifications',
      },
      {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        required: true,
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
        options: [
          { name: 'Check-in Submitted',  value: 'checkin.submitted'   },
          { name: 'Client Created',      value: 'client.created'      },
          { name: 'Client Updated',      value: 'client.updated'      },
          { name: 'Lead Converted',      value: 'lead.converted'      },
          { name: 'Lead Created',        value: 'lead.created'        },
          { name: 'Lead Deleted',        value: 'lead.deleted'        },
          { name: 'Lead Status Changed', value: 'lead.status_changed' },
          { name: 'Lead Updated',        value: 'lead.updated'        },
        ],
        default: ['lead.created'],
      },
      {
        displayName: 'Description',
        name: 'webhookDescription',
        type: 'string',
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
        default: '',
        description: 'Optional label for this webhook (max 255 chars)',
      },
    ],
  }

  // ── Dynamic field and option loading ────────────────────────────────────────
  methods = {
    loadOptions: {
      // Fetch the coach's custom lead pipeline statuses for the Update Status dropdown
      async getLeadStatuses(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const credentials = await this.getCredentials('brixfitApi')
        const baseUrl = validateBaseUrl(credentials.baseUrl as string, this.getNode()) + '/api/public/v1'
        try {
          const response = await this.helpers.request({
            method: 'GET',
            url: `${baseUrl}/leads/statuses`,
            headers: { 'X-API-Key': credentials.apiKey as string },
            json: true,
            timeout: REQUEST_TIMEOUT_MS,
          }) as { data?: Array<{ value: string; sort_order?: number }> }
          return (response.data ?? []).map(s => ({ name: s.value, value: s.value }))
        } catch (err) {
          throw new Error(
            `Failed to load lead statuses: ${err instanceof Error ? err.message : String(err)}. ` +
            'Check your API key and try refreshing.',
          )
        }
      },
    },
    resourceMapping: {
      async getLeadFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
        return loadLeadFieldsFromApi(this, false)
      },
      async getLeadUpdateFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
        return loadLeadFieldsFromApi(this, true)
      },
    },
  }

  // ── Execute ─────────────────────────────────────────────────────────────────
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items      = this.getInputData()
    const returnData: INodeExecutionData[] = []
    const credentials = await this.getCredentials('brixfitApi')
    const baseUrl     = validateBaseUrl(credentials.baseUrl as string, this.getNode()) + '/api/public/v1'

    for (let i = 0; i < items.length; i++) {
      const resource  = this.getNodeParameter('resource', i) as string
      const operation = this.getNodeParameter('operation', i) as string

      // Fresh headers per iteration — avoid shared object mutation across items
      const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': credentials.apiKey as string,
      }
      let requestOptions: IRequestOptions = { method: 'GET', url: '', headers, json: true, timeout: REQUEST_TIMEOUT_MS }

      try {
        // ── LEAD ──────────────────────────────────────────────────────────────
        if (resource === 'lead') {
          if (operation === 'getAll') {
            const returnAll = this.getNodeParameter('returnAll', i, false) as boolean
            const filters   = this.getNodeParameter('filters', i, {}) as IDataObject
            const qs        = Object.fromEntries(
              Object.entries(filters).filter(([, v]) => v !== '' && v !== null && v !== undefined),
            ) as IDataObject

            if (returnAll) {
              let page = 1
              while (true) {
                const r = await this.helpers.request({
                  ...requestOptions,
                  url: `${baseUrl}/leads`,
                  qs: { ...qs, page, per_page: 100 },
                })
                const p = parseApiResponse(r, this.getNode(), i)
                const rows = (p.data ?? p) as IDataObject[]
                if (Array.isArray(rows)) rows.forEach(row => returnData.push({ json: row, pairedItem: { item: i } }))
                const meta = p.meta as { total_pages?: number } | null
                if (!meta || page >= (meta.total_pages ?? 1)) break
                page++
              }
              continue
            }
            requestOptions = { ...requestOptions, url: `${baseUrl}/leads`, qs }

          } else if (operation === 'get') {
            const id = validateId(this.getNodeParameter('leadId', i) as string, 'Lead ID', this.getNode(), i)
            requestOptions = { ...requestOptions, url: `${baseUrl}/leads/${id}` }

          } else if (operation === 'create') {
            const name       = this.getNodeParameter('name', i) as string
            const mapperData = this.getNodeParameter('leadFields', i, { mappingMode: 'defineBelow', value: null }) as { value: Record<string, unknown> | null }
            requestOptions   = {
              ...requestOptions,
              method: 'POST',
              url:    `${baseUrl}/leads`,
              body:   { name, ...(mapperData.value ?? {}) } as IDataObject,
            }

          } else if (operation === 'update') {
            const id         = validateId(this.getNodeParameter('leadId', i) as string, 'Lead ID', this.getNode(), i)
            const mapperData = this.getNodeParameter('leadUpdateFields', i, { mappingMode: 'defineBelow', value: null }) as { value: Record<string, unknown> | null }
            requestOptions   = { ...requestOptions, method: 'PATCH', url: `${baseUrl}/leads/${id}`, body: (mapperData.value ?? {}) as IDataObject }

          } else if (operation === 'updateStatus') {
            const id     = validateId(this.getNodeParameter('leadId', i) as string, 'Lead ID', this.getNode(), i)
            const status = this.getNodeParameter('status', i) as string
            requestOptions = { ...requestOptions, method: 'PATCH', url: `${baseUrl}/leads/${id}`, body: { status } as IDataObject }

          } else if (operation === 'delete') {
            const id = validateId(this.getNodeParameter('leadId', i) as string, 'Lead ID', this.getNode(), i)
            requestOptions = { ...requestOptions, method: 'DELETE', url: `${baseUrl}/leads/${id}` }

          } else if (operation === 'getHealthReport') {
            const id = validateId(this.getNodeParameter('leadId', i) as string, 'Lead ID', this.getNode(), i)
            requestOptions = { ...requestOptions, url: `${baseUrl}/leads/${id}/health-report` }

          } else if (operation === 'listHealthReports') {
            const id   = validateId(this.getNodeParameter('leadId', i) as string, 'Lead ID', this.getNode(), i)
            const opts = this.getNodeParameter('healthReportListOptions', i, {}) as IDataObject
            const qs: IDataObject = {}
            if (opts.page)     qs.page     = opts.page
            if (opts.per_page) qs.per_page = opts.per_page
            requestOptions = { ...requestOptions, url: `${baseUrl}/leads/${id}/health-reports`, qs }
          }

        // ── CLIENT ────────────────────────────────────────────────────────────
        } else if (resource === 'client') {
          if (operation === 'getAll') {
            const returnAll = this.getNodeParameter('returnAll', i, false) as boolean
            const filters   = this.getNodeParameter('filters', i, {}) as IDataObject
            const qs        = Object.fromEntries(
              Object.entries(filters).filter(([, v]) => v !== '' && v !== null && v !== undefined),
            ) as IDataObject

            if (returnAll) {
              let page = 1
              while (true) {
                const r = await this.helpers.request({
                  ...requestOptions,
                  url: `${baseUrl}/clients`,
                  qs: { ...qs, page, per_page: 100 },
                })
                const p = parseApiResponse(r, this.getNode(), i)
                const rows = (p.data ?? p) as IDataObject[]
                if (Array.isArray(rows)) rows.forEach(row => returnData.push({ json: row, pairedItem: { item: i } }))
                const meta = p.meta as { total_pages?: number } | null
                if (!meta || page >= (meta.total_pages ?? 1)) break
                page++
              }
              continue
            }
            requestOptions = { ...requestOptions, url: `${baseUrl}/clients`, qs }

          } else if (operation === 'get') {
            const id = validateId(this.getNodeParameter('clientId', i) as string, 'Client ID', this.getNode(), i)
            requestOptions = { ...requestOptions, url: `${baseUrl}/clients/${id}` }

          } else if (operation === 'update') {
            const id    = validateId(this.getNodeParameter('clientId', i) as string, 'Client ID', this.getNode(), i)
            const body  = this.getNodeParameter('clientUpdateFields', i, {}) as IDataObject
            const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== '' && v !== null)) as IDataObject
            requestOptions = { ...requestOptions, method: 'PATCH', url: `${baseUrl}/clients/${id}`, body: clean }

          } else if (operation === 'deactivate') {
            const id = validateId(this.getNodeParameter('clientId', i) as string, 'Client ID', this.getNode(), i)
            requestOptions = { ...requestOptions, method: 'DELETE', url: `${baseUrl}/clients/${id}` }

          } else if (operation === 'getCheckins') {
            const clientId = validateId(this.getNodeParameter('clientId', i) as string, 'Client ID', this.getNode(), i)
            const opts     = this.getNodeParameter('clientCheckinOptions', i, {}) as IDataObject
            const qs: IDataObject = { client_id: clientId }
            if (opts.status)    qs.status    = opts.status
            if (opts.from_date) qs.from_date = opts.from_date
            if (opts.to_date)   qs.to_date   = opts.to_date
            if (opts.page)      qs.page      = opts.page
            if (opts.per_page)  qs.per_page  = opts.per_page
            requestOptions = { ...requestOptions, url: `${baseUrl}/checkins`, qs }

          } else if (operation === 'getHealthReport') {
            const id = validateId(this.getNodeParameter('clientId', i) as string, 'Client ID', this.getNode(), i)
            requestOptions = { ...requestOptions, url: `${baseUrl}/clients/${id}/health-report` }

          } else if (operation === 'listHealthReports') {
            const id   = validateId(this.getNodeParameter('clientId', i) as string, 'Client ID', this.getNode(), i)
            const opts = this.getNodeParameter('healthReportListOptions', i, {}) as IDataObject
            const qs: IDataObject = {}
            if (opts.page)     qs.page     = opts.page
            if (opts.per_page) qs.per_page = opts.per_page
            requestOptions = { ...requestOptions, url: `${baseUrl}/clients/${id}/health-reports`, qs }
          }

        // ── CHECKIN ───────────────────────────────────────────────────────────
        } else if (resource === 'checkin') {
          if (operation === 'getAll') {
            const returnAll = this.getNodeParameter('returnAll', i, false) as boolean
            const filters   = this.getNodeParameter('filters', i, {}) as IDataObject
            const qs        = Object.fromEntries(
              Object.entries(filters).filter(([, v]) => v !== '' && v !== null && v !== undefined),
            ) as IDataObject

            if (returnAll) {
              let page = 1
              while (true) {
                const r = await this.helpers.request({
                  ...requestOptions,
                  url: `${baseUrl}/checkins`,
                  qs: { ...qs, page, per_page: 100 },
                })
                const p = parseApiResponse(r, this.getNode(), i)
                const rows = (p.data ?? p) as IDataObject[]
                if (Array.isArray(rows)) rows.forEach(row => returnData.push({ json: row, pairedItem: { item: i } }))
                const meta = p.meta as { total_pages?: number } | null
                if (!meta || page >= (meta.total_pages ?? 1)) break
                page++
              }
              continue
            }
            requestOptions = { ...requestOptions, url: `${baseUrl}/checkins`, qs }

          } else if (operation === 'getByClient') {
            const clientId = validateId(this.getNodeParameter('checkinClientId', i) as string, 'Client ID', this.getNode(), i)
            const opts     = this.getNodeParameter('checkinClientOptions', i, {}) as IDataObject
            const qs: IDataObject = { client_id: clientId }
            if (opts.status)    qs.status    = opts.status
            if (opts.from_date) qs.from_date = opts.from_date
            if (opts.to_date)   qs.to_date   = opts.to_date
            if (opts.page)      qs.page      = opts.page
            if (opts.per_page)  qs.per_page  = opts.per_page
            requestOptions = { ...requestOptions, url: `${baseUrl}/checkins`, qs }
          }

        // ── WEBHOOK ───────────────────────────────────────────────────────────
        } else if (resource === 'webhook') {
          if (operation === 'getAll') {
            requestOptions = { ...requestOptions, url: `${baseUrl}/webhooks` }

          } else if (operation === 'create') {
            const webhookUrl = this.getNodeParameter('webhookUrl', i) as string
            // Client-side HTTPS validation for clearer error messages
            if (!webhookUrl.startsWith('https://')) {
              throw new NodeOperationError(this.getNode(), 'Webhook URL must use HTTPS.', { itemIndex: i })
            }
            const events = this.getNodeParameter('events', i) as string[]
            const desc   = this.getNodeParameter('webhookDescription', i, '') as string
            requestOptions = {
              ...requestOptions,
              method: 'POST',
              url:    `${baseUrl}/webhooks`,
              body:   { url: webhookUrl, events, description: desc || undefined } as IDataObject,
            }

          } else if (operation === 'toggleActive') {
            const id       = validateId(this.getNodeParameter('webhookId', i) as string, 'Webhook ID', this.getNode(), i)
            const isActive = this.getNodeParameter('webhookIsActive', i) as boolean
            requestOptions = { ...requestOptions, method: 'PATCH', url: `${baseUrl}/webhooks/${id}`, body: { is_active: isActive } as IDataObject }

          } else if (operation === 'delete') {
            const id = validateId(this.getNodeParameter('webhookId', i) as string, 'Webhook ID', this.getNode(), i)
            requestOptions = { ...requestOptions, method: 'DELETE', url: `${baseUrl}/webhooks/${id}` }
          }
        }

        const response = await this.helpers.request(requestOptions)
        const parsed   = parseApiResponse(response, this.getNode(), i)
        const result   = parsed.data ?? parsed

        if (Array.isArray(result)) {
          result.forEach((item: IDataObject) => returnData.push({ json: item, pairedItem: { item: i } }))
        } else {
          returnData.push({ json: result as IDataObject, pairedItem: { item: i } })
        }

      } catch (err) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: err instanceof Error ? err.message : String(err) }, pairedItem: { item: i } })
        } else {
          throw new NodeOperationError(this.getNode(), err as Error, { itemIndex: i })
        }
      }
    }

    return [returnData]
  }
}

// ── Shared helper: fetch lead field definitions from Brixfit API ─────────────
async function loadLeadFieldsFromApi(
  context: ILoadOptionsFunctions,
  includeNameField: boolean,
): Promise<ResourceMapperFields> {
  const credentials = await context.getCredentials('brixfitApi')
  // FIX: validate baseUrl here too to prevent SSRF via loadOptions
  const baseUrl = validateBaseUrl(credentials.baseUrl as string, context.getNode()) + '/api/public/v1'

  let rawFields: Array<{ field_key: string; label: string; field_type: string; is_required: boolean }> = []
  try {
    const response = await context.helpers.request({
      method: 'GET',
      url: `${baseUrl}/fields/leads`,
      headers: { 'X-API-Key': credentials.apiKey as string },
      json: true,
      timeout: REQUEST_TIMEOUT_MS,
    }) as { data?: typeof rawFields }
    rawFields = response.data ?? []
  } catch (err) {
    throw new Error(
      `Failed to load lead fields from Brixfit API: ${err instanceof Error ? err.message : String(err)}. ` +
      'Check that your API key is valid and that your Brixfit account has custom fields configured.',
    )
  }

  const typeMap: Record<string, ResourceMapperField['type']> = {
    string:  'string',
    number:  'number',
    boolean: 'boolean',
    date:    'string',
  }

  const fields: ResourceMapperField[] = []

  if (includeNameField) {
    fields.push({
      id: 'name', displayName: 'Name', required: false, defaultMatch: false,
      display: true, type: 'string', canBeUsedToMatch: false,
    })
  }

  fields.push(
    { id: 'email',  displayName: 'Email',  required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true  },
    { id: 'phone',  displayName: 'Phone',  required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
    { id: 'status', displayName: 'Status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
  )

  for (const f of rawFields) {
    if (['email', 'phone', 'status', 'name'].includes(f.field_key)) continue
    fields.push({
      id:               f.field_key,
      displayName:      f.label,
      required:         f.is_required ?? false,
      defaultMatch:     false,
      display:          true,
      type:             typeMap[f.field_type] ?? 'string',
      canBeUsedToMatch: false,
    })
  }

  return { fields }
}
