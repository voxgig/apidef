import { ApiDefContext } from '../types';
declare function makeFlowBuilder(ctx: ApiDefContext): Promise<Function>;
export { makeFlowBuilder, flowFileBases, };
declare function flowFileBases(names: string[]): {
    [name: string]: string;
};
