"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrixfitApi = void 0;
class BrixfitApi {
    constructor() {
        this.name = 'brixfitApi';
        this.displayName = 'Brixfit API';
        this.documentationUrl = 'https://brixfit.app/coach/developer';
        this.icon = 'file:brixfit.svg';
        this.properties = [
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
        ];
    }
}
exports.BrixfitApi = BrixfitApi;
//# sourceMappingURL=BrixfitApi.credentials.js.map