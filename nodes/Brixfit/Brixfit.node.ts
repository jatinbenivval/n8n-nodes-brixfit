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
} from 'n8n-workflow'
import { NodeOperationError } from 'n8n-workflow'

// ── Security constants ───────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS = 30_000

// C4 FIX: Validate and sanitize the baseUrl credential before use.
// Blocks SSRF attacks — prevents pointing the node at cloud metadata services,
// internal network hosts, or non-HTTP protocols.
function validateBaseUrl(raw: string, node: INode): string {
  const url = String(raw ?? '').trim().replace(/\/$/, '')
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new NodeOperationError(node, `Invalid Base URL: "${url}" is not a valid URL. Check your credential settings.`)
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new NodeOperationError(node, `Invalid Base URL: protocol must be http or https, got "${parsed.protocol}"`)
  }
  const h = parsed.hostname.toLowerCase()
  const blocked = ['localhost', '127.', '0.', '169.254.', '::1', '[::1]']
  const blockedPrefixes = ['10.', '192.168.']
  const is172 = /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  if (blocked.some(b => h === b || h.startsWith(b)) || blockedPrefixes.some(b => h.startsWith(b)) || is172) {
    throw new NodeOperationError(node, `Invalid Base URL: private/internal network addresses are not allowed.`)
  }
  return url
}

// C3 FIX: Validate resource ID parameters before interpolating into URLs.
// Blocks path traversal ("../webhooks"), query injection ("id?foo=bar"),
// and empty-string bugs that hit the wrong endpoint.
function validateId(raw: string, label: string, node: INode, itemIndex: number): string {
  const id = String(raw ?? '').trim()
  if (!id) {
    throw new NodeOperationError(node, `${label} cannot be empty`, { itemIndex })
  }
  // Allow UUIDs, numeric IDs, slugs — block any path/query special chars
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new NodeOperationError(
      node as never,
      `${label} contains invalid characters. Expected a plain ID (letters, numbers, hyphens, underscores).`,
      { itemIndex },
    )
  }
  return id
}

export class Brixfit implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Brixfit',
    name: 'brixfit',
    icon: 'file:brixfit.svg',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
    description: 'Manage leads, clients, and check-ins in Brixfit CRM',
    defaults: { name: 'Brixfit' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'brixfitApi', required: true }],
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
          { name: 'Create',        value: 'create',       description: 'Create a new lead',         action: 'Create a lead'       },
          { name: 'Get',           value: 'get',          description: 'Get a lead by ID',          action: 'Get a lead'          },
          { name: 'Get All',       value: 'getAll',       description: 'List all leads',            action: 'Get all leads'       },
          { name: 'Update',        value: 'update',       description: 'Update a lead',             action: 'Update a lead'       },
          { name: 'Update Status', value: 'updateStatus', description: "Change a lead's status",    action: 'Update lead status'  },
          { name: 'Delete',        value: 'delete',       description: 'Delete a lead permanently', action: 'Delete a lead'       },
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
          { name: 'Get',             value: 'get',             description: 'Get a client by ID',          action: 'Get a client'           },
          { name: 'Get All',         value: 'getAll',          description: 'List all clients',            action: 'Get all clients'         },
          { name: 'Update',          value: 'update',          description: 'Update a client',             action: 'Update a client'         },
          { name: 'Deactivate',      value: 'deactivate',      description: 'Deactivate a client account', action: 'Deactivate a client'     },
          { name: 'Get Check-ins',   value: 'getCheckins',     description: 'Get all check-ins for a client', action: 'Get client check-ins' },
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
          { name: 'Get All',          value: 'getAll',       description: 'List all check-ins with optional filters', action: 'Get all check-ins'        },
          { name: 'Get by Client',    value: 'getByClient',  description: 'Get all check-ins for a specific client',  action: 'Get check-ins by client'  },
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
          { name: 'Create',  value: 'create',  description: 'Register a new webhook', action: 'Create a webhook' },
          { name: 'Get All', value: 'getAll',  description: 'List all webhooks',      action: 'Get all webhooks' },
          { name: 'Delete',  value: 'delete',  description: 'Remove a webhook',       action: 'Delete a webhook' },
        ],
        default: 'getAll',
      },

      // ── Lead ID ────────────────────────────────────────────────────────────
      {
        displayName: 'Lead ID',
        name: 'leadId',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['get', 'update', 'updateStatus', 'delete'] } },
        default: '',
        description: 'The unique ID of the lead',
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

      // ── Lead update status ─────────────────────────────────────────────────
      {
        displayName: 'Status',
        name: 'status',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['updateStatus'] } },
        default: '',
        description: 'New status value — must match a status defined in your Brixfit pipeline',
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
            operation: ['get', 'update', 'deactivate', 'getCheckins'],
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
          { displayName: 'Goal',     name: 'goal',     type: 'string', default: '' },
          { displayName: 'Phone',    name: 'phone',    type: 'string', default: '' },
          { displayName: 'End Date', name: 'end_date', type: 'string', default: '', description: 'Subscription end date (YYYY-MM-DD)' },
          { displayName: 'Notes',    name: 'notes',    type: 'string', default: '', typeOptions: { rows: 3 } },
        ],
      },

      // ── Check-in: Get by Client (dedicated) ───────────────────────────────
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
              { name: 'All',       value: '' },
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

      // ── List filters (shared getAll) ───────────────────────────────────────
      {
        displayName: 'Filters',
        name: 'filters',
        type: 'collection',
        placeholder: 'Add Filter',
        displayOptions: {
          show: {
            operation: ['getAll'],
          },
        },
        default: {},
        options: [
          { displayName: 'Search',    name: 'search',    type: 'string', default: '' },
          { displayName: 'Status',    name: 'status',    type: 'string', default: '' },
          { displayName: 'Page',      name: 'page',      type: 'number', default: 1  },
          { displayName: 'Per Page',  name: 'per_page',  type: 'number', default: 20 },
          // Check-in only filters
          {
            displayName: 'Client ID',
            name: 'client_id',
            type: 'string',
            displayOptions: { show: { '/resource': ['checkin'] } },
            default: '',
          },
          {
            displayName: 'From Date',
            name: 'from_date',
            type: 'string',
            displayOptions: { show: { '/resource': ['checkin'] } },
            default: '',
            description: 'YYYY-MM-DD',
          },
          {
            displayName: 'To Date',
            name: 'to_date',
            type: 'string',
            displayOptions: { show: { '/resource': ['checkin'] } },
            default: '',
            description: 'YYYY-MM-DD',
          },
        ],
      },

      // ── Webhook ID ─────────────────────────────────────────────────────────
      {
        displayName: 'Webhook ID',
        name: 'webhookId',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['webhook'], operation: ['delete'] } },
        default: '',
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
      },
      {
        displayName: 'Description',
        name: 'webhookDescription',
        type: 'string',
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
        default: '',
      },
    ],
  }

  // ── Dynamic field loading ────────────────────────────────────────────────────
  methods = {
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
    // C4 FIX: validateBaseUrl blocks SSRF — rejects private IPs, non-http protocols
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
            const filters = this.getNodeParameter('filters', i, {}) as IDataObject
            const qs = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== 0)) as IDataObject
            requestOptions = { ...requestOptions, url: `${baseUrl}/leads`, qs }

          } else if (operation === 'get') {
            const id = validateId(this.getNodeParameter('leadId', i) as string, 'Lead ID', this.getNode(), i)
            requestOptions = { ...requestOptions, url: `${baseUrl}/leads/${id}` }

          } else if (operation === 'create') {
            const name = this.getNodeParameter('name', i) as string
            const mapperData = this.getNodeParameter('leadFields', i, { mappingMode: 'defineBelow', value: null }) as { value: Record<string, unknown> | null }
            const dynamicFields = mapperData.value ?? {}
            requestOptions = {
              ...requestOptions,
              method: 'POST',
              url: `${baseUrl}/leads`,
              body: { name, ...dynamicFields } as IDataObject,
            }

          } else if (operation === 'update') {
            const id = validateId(this.getNodeParameter('leadId', i) as string, 'Lead ID', this.getNode(), i)
            const mapperData = this.getNodeParameter('leadUpdateFields', i, { mappingMode: 'defineBelow', value: null }) as { value: Record<string, unknown> | null }
            const body = (mapperData.value ?? {}) as IDataObject
            requestOptions = { ...requestOptions, method: 'PATCH', url: `${baseUrl}/leads/${id}`, body }

          } else if (operation === 'updateStatus') {
            const id     = validateId(this.getNodeParameter('leadId', i) as string, 'Lead ID', this.getNode(), i)
            const status = this.getNodeParameter('status', i) as string
            requestOptions = { ...requestOptions, method: 'PATCH', url: `${baseUrl}/leads/${id}`, body: { status } as IDataObject }

          } else if (operation === 'delete') {
            const id = validateId(this.getNodeParameter('leadId', i) as string, 'Lead ID', this.getNode(), i)
            requestOptions = { ...requestOptions, method: 'DELETE', url: `${baseUrl}/leads/${id}` }
          }

        // ── CLIENT ────────────────────────────────────────────────────────────
        } else if (resource === 'client') {
          if (operation === 'getAll') {
            const filters = this.getNodeParameter('filters', i, {}) as IDataObject
            const qs = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== 0)) as IDataObject
            requestOptions = { ...requestOptions, url: `${baseUrl}/clients`, qs }

          } else if (operation === 'get') {
            const id = validateId(this.getNodeParameter('clientId', i) as string, 'Client ID', this.getNode(), i)
            requestOptions = { ...requestOptions, url: `${baseUrl}/clients/${id}` }

          } else if (operation === 'update') {
            const id   = validateId(this.getNodeParameter('clientId', i) as string, 'Client ID', this.getNode(), i)
            const body = this.getNodeParameter('clientUpdateFields', i, {}) as IDataObject
            const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== '' && v !== null)) as IDataObject
            requestOptions = { ...requestOptions, method: 'PATCH', url: `${baseUrl}/clients/${id}`, body: clean }

          } else if (operation === 'deactivate') {
            const id = validateId(this.getNodeParameter('clientId', i) as string, 'Client ID', this.getNode(), i)
            requestOptions = { ...requestOptions, method: 'DELETE', url: `${baseUrl}/clients/${id}` }

          } else if (operation === 'getCheckins') {
            const clientId = validateId(this.getNodeParameter('clientId', i) as string, 'Client ID', this.getNode(), i)
            const opts     = this.getNodeParameter('checkinClientOptions', i, {}) as IDataObject
            const qs: IDataObject = { client_id: clientId }
            if (opts.status)    qs.status    = opts.status
            if (opts.from_date) qs.from_date = opts.from_date
            if (opts.to_date)   qs.to_date   = opts.to_date
            if (opts.page)      qs.page      = opts.page
            if (opts.per_page)  qs.per_page  = opts.per_page
            requestOptions = { ...requestOptions, url: `${baseUrl}/checkins`, qs }
          }

        // ── CHECKIN ───────────────────────────────────────────────────────────
        } else if (resource === 'checkin') {
          if (operation === 'getAll') {
            const filters = this.getNodeParameter('filters', i, {}) as IDataObject
            const qs = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== 0)) as IDataObject
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
            const url    = this.getNodeParameter('webhookUrl', i) as string
            const events = this.getNodeParameter('events', i) as string[]
            const desc   = this.getNodeParameter('webhookDescription', i, '') as string
            requestOptions = {
              ...requestOptions,
              method: 'POST',
              url: `${baseUrl}/webhooks`,
              body: { url, events, description: desc || undefined } as IDataObject,
            }

          } else if (operation === 'delete') {
            const id = validateId(this.getNodeParameter('webhookId', i) as string, 'Webhook ID', this.getNode(), i)
            requestOptions = { ...requestOptions, method: 'DELETE', url: `${baseUrl}/webhooks/${id}` }
          }
        }

        const response = await this.helpers.request(requestOptions)
        const parsed   = typeof response === 'string' ? JSON.parse(response) : response
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
  const baseUrl = `${credentials.baseUrl}/api/public/v1`

  let rawFields: Array<{ field_key: string; label: string; field_type: string; is_required: boolean }> = []
  try {
    const response = await context.helpers.request({
      method: 'GET',
      url: `${baseUrl}/fields/leads`,
      headers: { 'X-API-Key': credentials.apiKey as string },
      json: true,
    }) as { data?: typeof rawFields }
    rawFields = response.data ?? []
  } catch {
    // Return minimal fields if API call fails (e.g. bad credentials)
    rawFields = []
  }

  const typeMap: Record<string, ResourceMapperField['type']> = {
    string:  'string',
    number:  'number',
    boolean: 'boolean',
    date:    'string',
  }

  const fields: ResourceMapperField[] = []

  // Always include standard fields first
  if (!includeNameField) {
    // name is a separate required param on create — skip it here
  } else {
    fields.push({
      id:               'name',
      displayName:      'Name',
      required:         false,
      defaultMatch:     false,
      display:          true,
      type:             'string',
      canBeUsedToMatch: false,
    })
  }

  fields.push(
    {
      id:               'email',
      displayName:      'Email',
      required:         false,
      defaultMatch:     false,
      display:          true,
      type:             'string',
      canBeUsedToMatch: true,
    },
    {
      id:               'phone',
      displayName:      'Phone',
      required:         false,
      defaultMatch:     false,
      display:          true,
      type:             'string',
      canBeUsedToMatch: false,
    },
    {
      id:               'status',
      displayName:      'Status',
      required:         false,
      defaultMatch:     false,
      display:          true,
      type:             'string',
      canBeUsedToMatch: false,
    },
  )

  // Append dynamic custom fields from the coach's Brixfit account
  for (const f of rawFields) {
    // Skip if already in standard fields above
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
