"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFlows = resolveFlows;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const flowHeuristic01_1 = require("./flow/flowHeuristic01");
async function resolveFlows(ctx) {
    // let guide: Record<string, any> = ctx.model.main.api.guide
    let flows = [];
    if ('heuristic01' === ctx.opts.strategy) {
        flows = await (0, flowHeuristic01_1.flowHeuristic01)(ctx);
    }
    else {
        throw new Error('Unknown guide strategy: ' + ctx.opts.strategy);
    }
    return () => {
        (0, jostraca_1.Folder)({ name: 'flow' }, () => {
            const barrel = [
                '# Flows\n'
            ];
            (0, jostraca_1.each)(flows, (flow) => {
                let flowfile = node_path_1.default.join(ctx.opts.folder, 'flow', (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) +
                    flow.Name + 'Flow.jsonic');
                let flowModelSrc = JSON.stringify(flow.model, null, 2);
                let flowsrc = `# ${flow.Name}Flow

main: sdk: flow: ${flow.Name}Flow:
` + flowModelSrc;
                barrel.push(`@"${node_path_1.default.basename(flowfile)}"`);
                (0, jostraca_1.File)({ name: node_path_1.default.basename(flowfile) }, () => (0, jostraca_1.Content)(flowsrc));
            });
            (0, jostraca_1.File)({
                name: (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'flow-index.jsonic'
            }, () => (0, jostraca_1.Content)(barrel.join('\n')));
        });
    };
}
//# sourceMappingURL=flow.js.map