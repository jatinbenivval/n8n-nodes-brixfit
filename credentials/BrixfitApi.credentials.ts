import type { ICredentialType, ICredentialTestRequest, INodeProperties } from 'n8n-workflow'

export class BrixfitApi implements ICredentialType {
  name = 'brixfitApi'
  displayName = 'Brixfit API'
  documentationUrl = 'https://brixfit.app/coach/developer'
  icon = 'file:brixfit.svg' as const

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      placeholder: 'brx_xxxxxxxxxxxxxxxx',
      description: 'Your Brixfit API key. Generate one in Brixfit → Developer → API Keys.',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://brixfit.app',
      description: 'Leave as-is unless you are using a self-hosted Brixfit instance.',
    },
  ]

  // Fires a real HTTP call when the user clicks "Save" / "Test connection" in n8n.
  // HTTP 200 = credential valid. HTTP 401/403 = bad API key (n8n surfaces the error automatically).
  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.baseUrl}}',
      url: '/api/public/v1/leads',
      headers: {
        'X-API-Key': '={{$credentials.apiKey}}',
      },
      qs: { per_page: 1 },
    },
  }
}
