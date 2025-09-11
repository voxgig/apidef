"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeFlowBuilder = makeFlowBuilder;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
const flowHeuristic01_1 = require("./flow/flowHeuristic01");
async function makeFlowBuilder(ctx) {
    let flows = [];
    let flowBuilder = () => {
        ctx.warn({
            step: 'flow',
            note: 'Unable to generate flow definitions as flows were not resolved.'
        });
    };
    if ('heuristic01' === ctx.opts.strategy) {
        try {
            flows = await (0, flowHeuristic01_1.flowHeuristic01)(ctx);
        }
        catch (err) {
            err.foo = { x: 1, y: [2] };
            err.foo.z = err.foo;
            ctx.warn({
                step: 'flow',
                note: 'Unable to resolve flows due to unexpected error: ' + err.message,
                err,
            });
            return flowBuilder;
        }
    }
    else {
        ctx.warn({
            step: 'flow',
            note: 'Unable to resolve flows: unknown guide strategy: ' + ctx.opts.strategy
        });
        return flowBuilder;
    }
    flowBuilder = () => {
        (0, jostraca_1.Folder)({ name: 'flow' }, () => {
            const barrel = [
                '# Flows\n'
            ];
            (0, jostraca_1.each)(flows, (flow) => {
                let flowfile = node_path_1.default.join(ctx.opts.folder, 'flow', (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) +
                    flow.Name + '.jsonic');
                let flowModelSrc = (0, utility_1.formatJsonSrc)(JSON.stringify(flow.model, null, 2));
                let flowsrc = `# ${flow.Name}

main: sdk: flow: ${flow.Name}:
` + flowModelSrc;
                barrel.push(`@"${node_path_1.default.basename(flowfile)}"`);
                (0, jostraca_1.File)({ name: node_path_1.default.basename(flowfile) }, () => (0, jostraca_1.Content)(flowsrc));
            });
            (0, jostraca_1.File)({
                name: (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'flow-index.jsonic'
            }, () => (0, jostraca_1.Content)(barrel.join('\n')));
        });
    };
    return flowBuilder;
}
//# sourceMappingURL=flow.js.map