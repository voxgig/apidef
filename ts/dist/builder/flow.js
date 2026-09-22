"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeFlowBuilder = makeFlowBuilder;
exports.flowFileBases = flowFileBases;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const types_1 = require("../types");
const utility_1 = require("../utility");
async function makeFlowBuilder(ctx) {
    const { apimodel, opts } = ctx;
    const flows = apimodel.main[types_1.KIT].flow;
    let flowBuilder = () => {
        ctx.warn({
            step: 'flow',
            note: 'Unable to generate flow definitions as flows were not resolved.'
        });
    };
    const flownames = [];
    (0, jostraca_1.each)(flows, (flow) => flownames.push(String(flow.name)));
    const filebase = flowFileBases(flownames);
    for (const name of flownames) {
        if (name !== filebase[name] && ctx.warn) {
            ctx.warn({
                step: 'flow',
                note: 'flow name ' + name + ' collides with another when case is' +
                    ' ignored: file written as ' + filebase[name] + '.aontu'
            });
        }
    }
    flowBuilder = () => {
        (0, jostraca_1.Folder)({ name: 'flow' }, () => {
            const barrel = [
                '# Flows\n'
            ];
            (0, jostraca_1.each)(flows, (flow) => {
                let flowfile = node_path_1.default.join(ctx.opts.folder, 'flow', (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) +
                    (filebase[flow.name] || flow.name) + '.aontu');
                let flowModelSrc = (0, utility_1.formatJsonSrc)(JSON.stringify(flow, null, 2));
                let flowsrc = `# ${(0, utility_1.nom)(flow, 'Name')}

main: ${types_1.KIT}: flow: ${flow.name}:
` + flowModelSrc;
                barrel.push(`@"./${node_path_1.default.basename(flowfile)}"`);
                (0, jostraca_1.File)({ name: node_path_1.default.basename(flowfile) }, () => (0, jostraca_1.Content)(flowsrc));
            });
            const barrelFile = (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'flow-index.aontu';
            const barrelContent = barrel.join('\n');
            (0, jostraca_1.File)({ name: barrelFile }, () => (0, jostraca_1.Content)(barrelContent));
        });
    };
    return flowBuilder;
}
// Flow file base names, unique when case is ignored. Every member of a
// colliding group is suffixed in sorted-name order, so no member keeps the
// bare name and the result is the same on every run. Names that do not
// collide are returned unchanged.
function flowFileBases(names) {
    const bylower = {};
    for (const name of names) {
        const lower = name.toLowerCase();
        bylower[lower] = bylower[lower] || [];
        bylower[lower].push(name);
    }
    const base = {};
    for (const lower of Object.keys(bylower)) {
        const group = bylower[lower].sort();
        if (1 === group.length) {
            base[group[0]] = group[0];
        }
        else {
            group.forEach((name, i) => (base[name] = name + '__' + (i + 1)));
        }
    }
    return base;
}
//# sourceMappingURL=flow.js.map