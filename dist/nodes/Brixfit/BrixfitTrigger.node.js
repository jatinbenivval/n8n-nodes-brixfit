"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrixfitTrigger = void 0;
/**
 * BrixfitTrigger — receives webhook events from Brixfit and starts n8n workflows.
 *
 * How it works:
 * 1. When you activate the workflow, n8n exposes a webhook URL
 * 2. You paste that URL in Brixfit → Developer → Webhooks (or via API)
 * 3. Brixfit POSTs signed payloads to your URL on every selected event
 * 4. This node validates the signature and passes the event data downstream
 */
class BrixfitTrigger {
    constructor() {
        this.description = {
            displayName: 'Brixfit Trigger',
            name: 'brixfitTrigger',
            icon: 'file:brixfit.svg',
            group: ['trigger'],
            version: 1,
            description: 'Starts a workflow when a Brixfit event fires (lead created, status changed, check-in submitted, etc.)',
            defaults: { name: 'Brixfit Trigger' },
            inputs: [],
            outputs: ['main'],
            credentials: [{ name: 'brixfitApi', required: false }],
            webhooks: [
                {
                    name: 'default',
                    httpMethod: 'POST',
                    responseMode: 'onReceived',
                    path: 'webhook',
                },
            ],
            properties: [
                {
                    displayName: 'Events to Listen For',
                    name: 'events',
                    type: 'multiOptions',
                    options: [
                        { name: 'Lead Created', value: 'lead.created' },
                        { name: 'Lead Updated', value: 'lead.updated' },
                        { name: 'Lead Status Changed', value: 'lead.status_changed' },
                        { name: 'Lead Converted', value: 'lead.converted' },
                        { name: 'Lead Deleted', value: 'lead.deleted' },
                        { name: 'Client Created', value: 'client.created' },
                        { name: 'Client Updated', value: 'client.updated' },
                        { name: 'Check-in Submitted', value: 'checkin.submitted' },
                        { name: 'All Events', value: '*' },
                    ],
                    default: ['lead.created'],
                    description: 'Which Brixfit events should trigger this workflow',
                },
                {
                    displayName: 'Webhook Secret',
                    name: 'webhookSecret',
                    type: 'string',
                    typeOptions: { password: true },
                    default: '',
                    description: 'The secret returned when you registered this webhook in Brixfit. Used to verify payload authenticity.',
                },
                {
                    displayName: 'Setup Instructions',
                    name: 'setupInstructions',
                    type: 'notice',
                    default: `
**How to connect this trigger to Brixfit:**

1. Activate this workflow to get your webhook URL (shown below)
2. Copy the URL
3. Go to **Brixfit → Developer → Webhooks** (or use the API)
4. Create a new webhook with this URL and select the same events as above
5. Copy the secret shown on creation and paste it in the "Webhook Secret" field above
        `.trim(),
                },
            ],
        };
        // Called when workflow is activated — nothing to do here since coach sets up
        // the webhook manually in the Brixfit dashboard.
        this.webhookMethods = {
            default: {
                async checkExists() {
                    return false;
                },
                async create() {
                    return true;
                },
                async delete() {
                    return true;
                },
            },
        };
    }
    async webhook() {
        var _a;
        const req = this.getRequestObject();
        const body = this.getBodyData();
        const secret = this.getNodeParameter('webhookSecret', '');
        const allowedEvents = this.getNodeParameter('events', ['*']);
        // ── Signature verification (if secret configured) ──────────────────────
        if (secret) {
            const signature = (_a = req.headers['x-brixfit-signature']) !== null && _a !== void 0 ? _a : '';
            const rawBody = JSON.stringify(body);
            // Compute expected HMAC-SHA256 signature
            const enc = new TextEncoder();
            const keyData = enc.encode(secret);
            const msgData = enc.encode(rawBody);
            const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
            const sigBytes = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
            const expected = 'sha256=' + Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
            if (signature !== expected) {
                return { webhookResponse: { status: 401, body: JSON.stringify({ error: 'Invalid signature' }) } };
            }
        }
        // ── Event filtering ────────────────────────────────────────────────────
        const event = body.event;
        const listenAll = allowedEvents.includes('*');
        if (!listenAll && !allowedEvents.includes(event)) {
            return { webhookResponse: { status: 200, body: JSON.stringify({ ok: true, skipped: true }) } };
        }
        return {
            workflowData: [[{ json: body }]],
        };
    }
}
exports.BrixfitTrigger = BrixfitTrigger;
//# sourceMappingURL=BrixfitTrigger.node.js.map