"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveGuide = resolveGuide;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const struct_1 = require("@voxgig/struct");
const heuristic01_1 = require("./guide/heuristic01");
const utility_1 = require("./utility");
// Log non-fatal wierdness.
const dlog = (0, utility_1.getdlog)('apidef', __filename);
async function resolveGuide(ctx) {
    let baseguide = {};
    let override = ctx.model.main.api.guide;
    if ('heuristic01' === ctx.opts.strategy) {
        baseguide = await (0, heuristic01_1.heuristic01)(ctx);
    }
    else {
        throw new Error('Unknown guide strategy: ' + ctx.opts.strategy);
    }
    // Override generated base guide with custom hints 
    let guide = (0, struct_1.merge)([{}, baseguide, override]);
    // TODO: this is a hack!!!
    // Instead, update @voxgig/model, so that builders can request a reload of the entire
    // model. This allows builders to modify the model for later buidlers
    // during a single generation pass.
    guide = cleanGuide(guide);
    // TODO: FIX: sdk.jsonic should have final version of guide
    if (ctx.model.main?.api) {
        ctx.model.main.api.guide = guide;
    }
    else {
        dlog('missing', 'ctx.model.main.api');
    }
    const guideFile = node_path_1.default.join(ctx.opts.folder, (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'base-guide.jsonic');
    const guideBlocks = [
        '# Guide',
        '',
        'main: api: guide: { ',
    ];
    guideBlocks.push(...(0, jostraca_1.each)(baseguide.entity, (entity, entityname) => {
        guideBlocks.push(`
entity: ${entityname}: {`);
        (0, jostraca_1.each)(entity.path, (path, pathname) => {
            guideBlocks.push(`  path: '${pathname}': op: {`);
            (0, jostraca_1.each)(path.op, (op, opname) => {
                guideBlocks.push(`    '${opname}': method: ${op.method}`);
                if (op.transform?.reqform) {
                    guideBlocks.push(`    '${opname}': transform: reqform: ${JSON.stringify(op.transform.reqform)}`);
                }
            });
            guideBlocks.push(`  }`);
        });
        guideBlocks.push(`}`);
    }));
    guideBlocks.push('}');
    const guideSrc = guideBlocks.join('\n');
    return () => {
        // Save base guide for reference
        (0, jostraca_1.File)({ name: '../def/' + node_path_1.default.basename(guideFile) }, () => (0, jostraca_1.Content)(guideSrc));
    };
}
function cleanGuide(guide) {
    const clean = {
        control: guide.control,
        entity: {}
    };
    const exclude_entity = guide.exclude?.entity?.split(',');
    const include_entity = guide.include?.entity?.split(',');
    (0, jostraca_1.each)(guide.entity, (entity, name) => {
        if (exclude_entity.includes(name)) {
            return;
        }
        if (exclude_entity.includes('*')) {
            if (!include_entity.includes(name)) {
                return;
            }
        }
        let ent = clean.entity[name] = clean.entity[name] = { name, path: {} };
        (0, jostraca_1.each)(entity.path, (path, pathname) => {
            ent.path[pathname] = path;
        });
    });
    return clean;
}
//# sourceMappingURL=guide.js.map