import type { ICredentialType, INodeProperties } from 'n8n-workflow'

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
}
