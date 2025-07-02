"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveGuide = resolveGuide;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const heuristic01_1 = require("./guide/heuristic01");
async function resolveGuide(ctx) {
    let guide = ctx.model.main.api.guide;
    if ('heuristic01' === ctx.opts.strategy) {
        guide = await (0, heuristic01_1.heuristic01)(ctx);
    }
    else {
        throw new Error('Unknown guide strategy: ' + ctx.opts.strategy);
    }
    guide = cleanGuide(guide);
    ctx.model.main.api.guide = guide;
    const guideFile = node_path_1.default.join(ctx.opts.folder, (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'guide.jsonic');
    const guideBlocks = [
        '# Guide',
        '',
        'main: api: guide: { ',
        '',
    ];
    guideBlocks.push(...(0, jostraca_1.each)(guide.entity, (entity, entityname) => {
        guideBlocks.push(`\nentity: ${entityname}: {`);
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
        (0, jostraca_1.File)({ name: node_path_1.default.basename(guideFile) }, () => (0, jostraca_1.Content)(guideSrc));
    };
}
function cleanGuide(guide) {
    const clean = {
        control: guide.control,
        entity: {}
    };
    (0, jostraca_1.each)(guide.entity, (entity, name) => {
        let ent = clean.entity[name] = clean.entity[name] = { name, path: {} };
        (0, jostraca_1.each)(entity.path, (path, pathname) => {
            ent.path[pathname] = path;
        });
    });
    return clean;
}
//# sourceMappingURL=guide.js.map