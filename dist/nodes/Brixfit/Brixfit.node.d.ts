import type { IExecuteFunctions, ILoadOptionsFunctions, INodeExecutionData, INodeType, INodeTypeDescription, ResourceMapperFields } from 'n8n-workflow';
export declare class Brixfit implements INodeType {
    description: INodeTypeDescription;
    methods: {
        resourceMapping: {
            getLeadFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields>;
            getLeadUpdateFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields>;
        };
    };
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
//# sourceMappingURL=Brixfit.node.d.ts.map