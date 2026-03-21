import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IRequestOptions,
  IDataObject,
} from 'n8n-workflow'
import { NodeOperationError } from 'n8n-workflow'

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
    requestDefaults: {
      baseURL: '={{$credentials.baseUrl}}/api/public/v1',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': '={{$credentials.apiKey}}',
      },
    },
    properties: [
      // ── Resource selector ────────────────────────────────────────────────
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Lead',    value: 'lead'   },
          { name: 'Client',  value: 'client' },
          { name: 'Check-in', value: 'checkin' },
          { name: 'Webhook', value: 'webhook' },
        ],
        default: 'lead',
      },

      // ── Lead operations ───────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['lead'] } },
        options: [
          { name: 'Create',        value: 'create',       description: 'Create a new lead',           action: 'Create a lead'         },
          { name: 'Get',           value: 'get',          description: 'Get a lead by ID',            action: 'Get a lead'            },
          { name: 'Get All',       value: 'getAll',       description: 'List all leads',              action: 'Get all leads'         },
          { name: 'Update',        value: 'update',       description: 'Update a lead',               action: 'Update a lead'         },
          { name: 'Update Status', value: 'updateStatus', description: 'Change a lead\'s status',     action: 'Update lead status'    },
          { name: 'Delete',        value: 'delete',       description: 'Delete a lead permanently',   action: 'Delete a lead'         },
        ],
        default: 'getAll',
      },

      // ── Client operations ─────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['client'] } },
        options: [
          { name: 'Get',     value: 'get',    description: 'Get a client by ID', action: 'Get a client'     },
          { name: 'Get All', value: 'getAll', description: 'List all clients',   action: 'Get all clients'  },
        ],
        default: 'getAll',
      },

      // ── Check-in operations ───────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['checkin'] } },
        options: [
          { name: 'Get All', value: 'getAll', description: 'List check-ins', action: 'Get all check-ins' },
        ],
        default: 'getAll',
      },

      // ── Webhook operations ────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['webhook'] } },
        options: [
          { name: 'Create', value: 'create', description: 'Register a new webhook',  action: 'Create a webhook'  },
          { name: 'Get All', value: 'getAll', description: 'List all webhooks',       action: 'Get all webhooks'  },
          { name: 'Delete',  value: 'delete', description: 'Remove a webhook',        action: 'Delete a webhook'  },
        ],
        default: 'getAll',
      },

      // ── Shared: ID field ──────────────────────────────────────────────────
      {
        displayName: 'Lead ID',
        name: 'leadId',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['get', 'update', 'updateStatus', 'delete'] } },
        default: '',
        description: 'The ID of the lead',
      },
      {
        displayName: 'Client ID',
        name: 'clientId',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['client'], operation: ['get'] } },
        default: '',
      },
      {
        displayName: 'Webhook ID',
        name: 'webhookId',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['webhook'], operation: ['delete'] } },
        default: '',
      },

      // ── Lead create fields ────────────────────────────────────────────────
      {
        displayName: 'Name',
        name: 'name',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['create'] } },
        default: '',
      },
      {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        displayOptions: { show: { resource: ['lead'], operation: ['create'] } },
        default: {},
        options: [
          { displayName: 'Email',  name: 'email',  type: 'string', default: '' },
          { displayName: 'Phone',  name: 'phone',  type: 'string', default: '' },
          { displayName: 'BMI',    name: 'bmi',    type: 'number', default: 0  },
          { displayName: 'Status', name: 'status', type: 'string', default: 'new' },
        ],
      },

      // ── Lead update fields ────────────────────────────────────────────────
      {
        displayName: 'Update Fields',
        name: 'updateFields',
        type: 'collection',
        placeholder: 'Add Field',
        displayOptions: { show: { resource: ['lead'], operation: ['update'] } },
        default: {},
        options: [
          { displayName: 'Name',   name: 'name',   type: 'string', default: '' },
          { displayName: 'Email',  name: 'email',  type: 'string', default: '' },
          { displayName: 'Phone',  name: 'phone',  type: 'string', default: '' },
          { displayName: 'BMI',    name: 'bmi',    type: 'number', default: 0  },
          { displayName: 'Status', name: 'status', type: 'string', default: '' },
        ],
      },

      // ── Lead update status ────────────────────────────────────────────────
      {
        displayName: 'Status',
        name: 'status',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['lead'], operation: ['updateStatus'] } },
        default: '',
        description: 'New status value (must match a status defined in your Brixfit pipeline)',
      },

      // ── List options ──────────────────────────────────────────────────────
      {
        displayName: 'Filters',
        name: 'filters',
        type: 'collection',
        placeholder: 'Add Filter',
        displayOptions: { show: { operation: ['getAll'] } },
        default: {},
        options: [
          { displayName: 'Search',   name: 'search',    type: 'string',  default: '' },
          { displayName: 'Status',   name: 'status',    type: 'string',  default: '' },
          { displayName: 'Page',     name: 'page',      type: 'number',  default: 1  },
          { displayName: 'Per Page', name: 'per_page',  type: 'number',  default: 20 },
          // Check-in specific
          { displayName: 'Client ID',  name: 'client_id', type: 'string', displayOptions: { show: { '/resource': ['checkin'] } }, default: '' },
          { displayName: 'From Date',  name: 'from_date', type: 'string', displayOptions: { show: { '/resource': ['checkin'] } }, default: '', description: 'YYYY-MM-DD' },
          { displayName: 'To Date',    name: 'to_date',   type: 'string', displayOptions: { show: { '/resource': ['checkin'] } }, default: '', description: 'YYYY-MM-DD' },
        ],
      },

      // ── Webhook create ────────────────────────────────────────────────────
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

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData()
    const returnData: INodeExecutionData[] = []
    const credentials = await this.getCredentials('brixfitApi')
    const baseUrl = `${credentials.baseUrl}/api/public/v1`
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': credentials.apiKey as string,
    }

    for (let i = 0; i < items.length; i++) {
      const resource  = this.getNodeParameter('resource', i) as string
      const operation = this.getNodeParameter('operation', i) as string

      let requestOptions: IRequestOptions = { method: 'GET', url: '', headers, json: true }

      try {
        if (resource === 'lead') {
          if (operation === 'getAll') {
            const filters = this.getNodeParameter('filters', i, {}) as IDataObject
            const qs = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')) as IDataObject
            requestOptions = { ...requestOptions, url: `${baseUrl}/leads`, qs }
          } else if (operation === 'get') {
            const id = this.getNodeParameter('leadId', i) as string
            requestOptions = { ...requestOptions, url: `${baseUrl}/leads/${id}` }
          } else if (operation === 'create') {
            const name = this.getNodeParameter('name', i) as string
            const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject
            requestOptions = { ...requestOptions, method: 'POST', url: `${baseUrl}/leads`, body: { name, ...extra } as IDataObject }
          } else if (operation === 'update') {
            const id = this.getNodeParameter('leadId', i) as string
            const body = this.getNodeParameter('updateFields', i, {}) as IDataObject
            requestOptions = { ...requestOptions, method: 'PATCH', url: `${baseUrl}/leads/${id}`, body }
          } else if (operation === 'updateStatus') {
            const id     = this.getNodeParameter('leadId', i) as string
            const status = this.getNodeParameter('status', i) as string
            requestOptions = { ...requestOptions, method: 'PATCH', url: `${baseUrl}/leads/${id}`, body: { status } as IDataObject }
          } else if (operation === 'delete') {
            const id = this.getNodeParameter('leadId', i) as string
            requestOptions = { ...requestOptions, method: 'DELETE', url: `${baseUrl}/leads/${id}` }
          }
        } else if (resource === 'client') {
          if (operation === 'getAll') {
            const filters = this.getNodeParameter('filters', i, {}) as IDataObject
            const qs = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')) as IDataObject
            requestOptions = { ...requestOptions, url: `${baseUrl}/clients`, qs }
          } else if (operation === 'get') {
            const id = this.getNodeParameter('clientId', i) as string
            requestOptions = { ...requestOptions, url: `${baseUrl}/clients/${id}` }
          }
        } else if (resource === 'checkin') {
          const filters = this.getNodeParameter('filters', i, {}) as IDataObject
          const qs = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')) as IDataObject
          requestOptions = { ...requestOptions, url: `${baseUrl}/checkins`, qs }
        } else if (resource === 'webhook') {
          if (operation === 'getAll') {
            requestOptions = { ...requestOptions, url: `${baseUrl}/webhooks` }
          } else if (operation === 'create') {
            const url    = this.getNodeParameter('webhookUrl', i) as string
            const events = this.getNodeParameter('events', i) as string[]
            const desc   = this.getNodeParameter('webhookDescription', i, '') as string
            requestOptions = { ...requestOptions, method: 'POST', url: `${baseUrl}/webhooks`, body: { url, events, description: desc || undefined } as IDataObject }
          } else if (operation === 'delete') {
            const id = this.getNodeParameter('webhookId', i) as string
            requestOptions = { ...requestOptions, method: 'DELETE', url: `${baseUrl}/webhooks/${id}` }
          }
        }

        const response = await this.helpers.request(requestOptions)
        const parsed   = typeof response === 'string' ? JSON.parse(response) : response
        const result   = parsed.data ?? parsed

        if (Array.isArray(result)) {
          result.forEach((item: IDataObject) => returnData.push({ json: item }))
        } else {
          returnData.push({ json: result as IDataObject })
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
