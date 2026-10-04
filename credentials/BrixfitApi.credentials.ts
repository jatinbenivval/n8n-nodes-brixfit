import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow'

export class BrixfitApi implements ICredentialType {
  name = 'brixfitApi'
  displayName = 'Brixfit API'
  documentationUrl = 'https://brixfit.app/api-docs'
  icon = 'file:icon.png' as const

  properties: INodeProperties[] = [
    {
      displayName: 'Create a key in <a href="https://brixfit.app/coach/developer" target="_blank">Brixfit → Developer → API Keys</a>, paste it below, then click <b>Save</b>. n8n tests the connection automatically. Give the key only the permissions your workflows need: <b>Read-only</b> to read data, <b>Lead capture</b> to create leads, <b>Full access</b> for everything including the Brixfit Trigger.',
      name: 'setupNotice',
      type: 'notice',
      default: '',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      placeholder: 'brx_…',
      description: 'Starts with brx_. Shown only once when you create it in Brixfit.',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://brixfit.app',
      description: 'Leave as-is unless you use a self-hosted Brixfit instance.',
    },
  ]

  // n8n adds the key to every request made with `requestWithAuthentication`.
  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: { 'X-API-Key': '={{$credentials.apiKey}}' },
    },
  }

  // Runs on Save: 200 = connected, 401 = bad key (n8n shows the error).
  // `/me` accepts any valid key whatever its permissions, so a Lead capture or
  // Read-only key passes the test too.
  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.baseUrl}}',
      url: '/api/public/v1/me',
    },
  }
}
