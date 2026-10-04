import type { INodeProperties } from 'n8n-workflow'
import { WEBHOOK_EVENT_OPTIONS } from './events'

// Parameter names are part of saved workflows — never rename them.

const CHECKIN_STATUS_OPTIONS = [
  { name: 'All',       value: ''          },
  { name: 'Completed', value: 'completed' },
  { name: 'Pending',   value: 'pending'   },
  { name: 'Reviewed',  value: 'reviewed'  },
]

// Same options appear under Check-in → Get by Client and Client → Get Check-ins.
const checkinOptions = (name: string, resource: string, operation: string): INodeProperties => ({
  displayName: 'Options',
  name,
  type: 'collection',
  placeholder: 'Add Option',
  displayOptions: { show: { resource: [resource], operation: [operation] } },
  default: {},
  options: [
    { displayName: 'From Date', name: 'from_date', type: 'string', default: '', description: 'YYYY-MM-DD' },
    { displayName: 'Page',      name: 'page',      type: 'number', default: 1 },
    { displayName: 'Per Page',  name: 'per_page',  type: 'number', default: 20 },
    { displayName: 'Status',    name: 'status',    type: 'options', options: CHECKIN_STATUS_OPTIONS, default: '' },
    { displayName: 'To Date',   name: 'to_date',   type: 'string', default: '', description: 'YYYY-MM-DD' },
  ],
})

export const brixfitProperties: INodeProperties[] = [
  // ── Resource ───────────────────────────────────────────────────────────────
  {
    displayName: 'Resource',
    name: 'resource',
    type: 'options',
    noDataExpression: true,
    options: [
      { name: 'Check-in', value: 'checkin' },
      { name: 'Client',   value: 'client'  },
      { name: 'Form',     value: 'form'    },
      { name: 'Lead',     value: 'lead'    },
      { name: 'Webhook',  value: 'webhook' },
    ],
    default: 'lead',
  },

  // ── Operations ─────────────────────────────────────────────────────────────
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['lead'] } },
    options: [
      { name: 'Create',              value: 'create',            description: 'Create a new lead',                          action: 'Create a lead'            },
      { name: 'Delete',              value: 'delete',            description: 'Delete a lead permanently',                  action: 'Delete a lead'            },
      { name: 'Get',                 value: 'get',               description: 'Get a lead by ID',                           action: 'Get a lead'               },
      { name: 'Get Many',            value: 'getAll',            description: 'List leads',                                 action: 'Get many leads'           },
      { name: 'Get Health Report',   value: 'getHealthReport',   description: 'Get the latest AI health report for a lead', action: 'Get lead health report'   },
      { name: 'List Health Reports', value: 'listHealthReports', description: 'List all AI health reports for a lead',      action: 'List lead health reports' },
      { name: 'Update',              value: 'update',            description: 'Update a lead',                              action: 'Update a lead'            },
      { name: 'Update Status',       value: 'updateStatus',      description: "Change a lead's pipeline status",            action: 'Update lead status'       },
    ],
    default: 'getAll',
  },
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['client'] } },
    options: [
      { name: 'Deactivate',          value: 'deactivate',        description: 'Deactivate a client account',                  action: 'Deactivate a client'        },
      { name: 'Get',                 value: 'get',               description: 'Get a client by ID',                           action: 'Get a client'               },
      { name: 'Get Check-ins',       value: 'getCheckins',       description: 'Get all check-ins for a client',               action: 'Get client check-ins'       },
      { name: 'Get Health Report',   value: 'getHealthReport',   description: 'Get the latest AI health report for a client', action: 'Get client health report'   },
      { name: 'Get Many',            value: 'getAll',            description: 'List clients',                                 action: 'Get many clients'           },
      { name: 'Get Onboarding',      value: 'getOnboarding',     description: "Get a client's onboarding status and answers", action: 'Get client onboarding'      },
      { name: 'List Health Reports', value: 'listHealthReports', description: 'List all AI health reports for a client',      action: 'List client health reports' },
      { name: 'Update',              value: 'update',            description: 'Update a client',                              action: 'Update a client'            },
    ],
    default: 'getAll',
  },
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['checkin'] } },
    options: [
      { name: 'Get Many',      value: 'getAll',      description: 'List check-ins with optional filters',    action: 'Get many check-ins'      },
      { name: 'Get by Client', value: 'getByClient', description: 'Get all check-ins for a specific client', action: 'Get check-ins by client' },
    ],
    default: 'getAll',
  },
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['form'] } },
    options: [
      { name: 'Get',      value: 'get',    description: 'Get the lead or onboarding form with all its questions', action: 'Get a form'        },
      { name: 'Get Many', value: 'getAll', description: 'List your lead and onboarding forms',                    action: 'Get many forms'    },
    ],
    default: 'getAll',
  },
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['webhook'] } },
    options: [
      { name: 'Create',           value: 'create',       description: 'Register a new webhook', action: 'Create a webhook'            },
      { name: 'Delete',           value: 'delete',       description: 'Remove a webhook',       action: 'Delete a webhook'            },
      { name: 'Enable / Disable', value: 'toggleActive', description: 'Enable or disable a webhook', action: 'Enable or disable a webhook' },
      { name: 'Get Many',         value: 'getAll',       description: 'List webhooks',          action: 'Get many webhooks'           },
    ],
    default: 'getAll',
  },

  // ── IDs ────────────────────────────────────────────────────────────────────
  {
    displayName: 'Lead ID',
    name: 'leadId',
    type: 'string',
    required: true,
    displayOptions: { show: { resource: ['lead'], operation: ['get', 'update', 'updateStatus', 'delete', 'getHealthReport', 'listHealthReports'] } },
    default: '',
    description: 'The unique ID of the lead',
  },
  {
    displayName: 'Client ID',
    name: 'clientId',
    type: 'string',
    required: true,
    displayOptions: {
      show: {
        resource: ['client'],
        operation: ['get', 'update', 'deactivate', 'getCheckins', 'getHealthReport', 'listHealthReports', 'getOnboarding'],
      },
    },
    default: '',
    description: 'The unique ID of the client',
  },
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
    displayName: 'Webhook ID',
    name: 'webhookId',
    type: 'string',
    required: true,
    displayOptions: { show: { resource: ['webhook'], operation: ['delete', 'toggleActive'] } },
    default: '',
    description: 'The unique ID of the webhook',
  },

  // ── Return All ─────────────────────────────────────────────────────────────
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['lead', 'client', 'checkin'], operation: ['getAll'] } },
    description: 'Whether to return all results instead of only one page. Uses automatic pagination.',
  },

  // ── Form ───────────────────────────────────────────────────────────────────
  {
    displayName: 'Form Type',
    name: 'formType',
    type: 'options',
    required: true,
    displayOptions: { show: { resource: ['form'], operation: ['get'] } },
    options: [
      { name: 'Lead Form',       value: 'lead',       description: 'Public form that captures new leads' },
      { name: 'Onboarding Form', value: 'onboarding', description: 'Form your clients complete after joining' },
    ],
    default: 'lead',
  },

  // ── Lead create / update ───────────────────────────────────────────────────
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
    description: 'Questions from your Brixfit lead form. Fields marked * are required by your form. Click "Refresh" to reload them.',
  },
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
  {
    displayName: 'Status',
    name: 'status',
    type: 'options',
    typeOptions: { loadOptionsMethod: 'getLeadStatuses' },
    required: true,
    displayOptions: { show: { resource: ['lead'], operation: ['updateStatus'] } },
    default: '',
    description: 'New pipeline status, loaded from your Brixfit account. Click "Refresh" to update the list.',
  },

  // ── Client update ──────────────────────────────────────────────────────────
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

  // ── Check-in options (shared shape) ────────────────────────────────────────
  checkinOptions('checkinClientOptions', 'checkin', 'getByClient'),
  checkinOptions('clientCheckinOptions', 'client', 'getCheckins'),

  {
    displayName: 'Options',
    name: 'healthReportListOptions',
    type: 'collection',
    placeholder: 'Add Option',
    displayOptions: { show: { resource: ['lead', 'client'], operation: ['listHealthReports'] } },
    default: {},
    options: [
      { displayName: 'Page',     name: 'page',     type: 'number', default: 1,  description: 'Page number (starts at 1)' },
      { displayName: 'Per Page', name: 'per_page', type: 'number', default: 10, description: 'Results per page (max 50)' },
    ],
  },

  // ── List filters ───────────────────────────────────────────────────────────
  {
    displayName: 'Filters',
    name: 'filters',
    type: 'collection',
    placeholder: 'Add Filter',
    displayOptions: { show: { resource: ['lead', 'client'], operation: ['getAll'] } },
    default: {},
    options: [
      { displayName: 'Page',     name: 'page',     type: 'number', default: 1 },
      { displayName: 'Per Page', name: 'per_page', type: 'number', default: 20, description: 'Ignored when Return All is enabled' },
      { displayName: 'Search',   name: 'search',   type: 'string', default: '' },
      {
        displayName: 'Sort',
        name: 'sort',
        type: 'options',
        displayOptions: { show: { '/resource': ['lead'] } },
        options: [
          { name: 'Created — Newest First', value: 'created_at:desc' },
          { name: 'Created — Oldest First', value: 'created_at:asc'  },
          { name: 'Updated — Newest First', value: 'updated_at:desc' },
          { name: 'Updated — Oldest First', value: 'updated_at:asc'  },
          { name: 'Name (A–Z)',             value: 'name:asc'        },
          { name: 'Name (Z–A)',             value: 'name:desc'       },
          { name: 'Email (A–Z)',            value: 'email:asc'       },
          { name: 'Email (Z–A)',            value: 'email:desc'      },
        ],
        default: 'created_at:desc',
      },
      { displayName: 'Status', name: 'status', type: 'string', default: '', description: 'Lead pipeline status or client account status' },
    ],
  },
  {
    displayName: 'Filters',
    name: 'filters',
    type: 'collection',
    placeholder: 'Add Filter',
    displayOptions: { show: { resource: ['checkin'], operation: ['getAll'] } },
    default: {},
    options: [
      { displayName: 'Client ID', name: 'client_id', type: 'string', default: '' },
      { displayName: 'From Date', name: 'from_date', type: 'string', default: '', description: 'YYYY-MM-DD' },
      { displayName: 'Page',      name: 'page',      type: 'number', default: 1 },
      { displayName: 'Per Page',  name: 'per_page',  type: 'number', default: 20, description: 'Ignored when Return All is enabled' },
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
      { displayName: 'To Date', name: 'to_date', type: 'string', default: '', description: 'YYYY-MM-DD' },
    ],
  },

  // ── Webhook create / toggle ────────────────────────────────────────────────
  {
    displayName: 'Active',
    name: 'webhookIsActive',
    type: 'boolean',
    required: true,
    displayOptions: { show: { resource: ['webhook'], operation: ['toggleActive'] } },
    default: true,
    description: 'Whether to enable or disable this webhook',
  },
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
    options: WEBHOOK_EVENT_OPTIONS,
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
]
