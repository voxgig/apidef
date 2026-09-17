"use strict";
// TODO: move this to sdkgen
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
    /*
    if ('heuristic01' === ctx.opts.strategy) {
      try {
        flows = await flowHeuristic01(ctx)
      }
      catch (err: any) {
        err.foo = { x: 1, y: [2] }
        err.foo.z = err.foo
        ctx.warn({
          step: 'flow',
          note: 'Unable to resolve flows due to unexpected error: ' + err.message,
          err,
        })
        return flowBuilder
      }
    }
    else {
      ctx.warn({
        step: 'flow',
        note: 'Unable to resolve flows: unknown guide strategy: ' + ctx.opts.strategy
      })
      return flowBuilder
    }
    */
    // FLOW FILE NAMES MUST BE UNIQUE WHEN CASE IS IGNORED.
    //
    // The file name is the flow name, and flow names are camel case derived
    // from the entity name, so two entities whose names differ only in where
    // the underscores fall produce two flow names that differ only in case.
    // checkly's spec carries schemas `StaticIP` and `StaticIp`: apidef makes
    // the entities `static_i_p` and `static_ip`, and the flows
    // `BasicStaticIPFlow` and `BasicStaticIpFlow`.
    //
    // On a case-insensitive filesystem - APFS and NTFS, so macOS and Windows
    // by default - those are ONE file. The second write silently replaced the
    // first, flow-index.aon still imported both names (which resolved to the
    // same file), and the model came out with 113 flows for 114 entities. The
    // entity left without a flow then failed generation outright, in the go
    // test template, as `getModelPath: path not found at
    // 'main.kit.flow.BasicStaticIPFlow'` - a message that points at the
    // lookup and says nothing about the file that was overwritten.
    //
    // snakify does not separate them (both give `basic_static_ip_flow`), so
    // the discriminator is positional: every member of a colliding group is
    // suffixed, in sorted-name order, so the names are stable across runs and
    // no member keeps the bare name. Flows that do not collide are untouched.
    // Only the FILE name changes - `flow.name`, and so the model key the
    // generator looks up, is left exactly as it was.
    const flownames = [];
    (0, jostraca_1.each)(flows, (flow) => flownames.push(String(flow.name)));
    const filebase = flowFileBases(flownames);
    for (const name of flownames) {
        if (name !== filebase[name] && ctx.warn) {
            ctx.warn({
                step: 'flow',
                note: 'flow name ' + name + ' collides with another when case is' +
                    ' ignored: file written as ' + filebase[name] + '.aon'
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
                    (filebase[flow.name] || flow.name) + '.aon');
                let flowModelSrc = (0, utility_1.formatJsonSrc)(JSON.stringify(flow, null, 2));
                let flowsrc = `# ${(0, utility_1.nom)(flow, 'Name')}

main: ${types_1.KIT}: flow: ${flow.name}:
` + flowModelSrc;
                // `./` — see the entity barrel: aontu 0.65 reads a bare
                // single-segment include as a package name and refuses it.
                barrel.push(`@"./${node_path_1.default.basename(flowfile)}"`);
                (0, jostraca_1.File)({ name: node_path_1.default.basename(flowfile) }, () => (0, jostraca_1.Content)(flowsrc));
            });
            const barrelFile = (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'flow-index.aon';
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