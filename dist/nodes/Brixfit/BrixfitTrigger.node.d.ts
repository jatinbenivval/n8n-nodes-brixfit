import type { IHookFunctions, IWebhookFunctions, INodeType, INodeTypeDescription, IWebhookResponseData } from 'n8n-workflow';
/**
 * BrixfitTrigger — receives webhook events from Brixfit and starts n8n workflows.
 *
 * How it works:
 * 1. When you activate the workflow, n8n exposes a webhook URL
 * 2. You paste that URL in Brixfit → Developer → Webhooks (or via API)
 * 3. Brixfit POSTs signed payloads to your URL on every selected event
 * 4. This node validates the signature and passes the event data downstream
 */
export declare class BrixfitTrigger implements INodeType {
    description: INodeTypeDescription;
    webhookMethods: {
        default: {
            checkExists(this: IHookFunctions): Promise<boolean>;
            create(this: IHookFunctions): Promise<boolean>;
            delete(this: IHookFunctions): Promise<boolean>;
        };
    };
    webhook(this: IWebhookFunctions): Promise<IWebhookResponseData>;
}
//# sourceMappingURL=BrixfitTrigger.node.d.ts.map