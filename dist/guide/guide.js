"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGuide = buildGuide;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const aontu_1 = require("aontu");
const struct_1 = require("@voxgig/struct");
const heuristic01_1 = require("./heuristic01");
const utility_1 = require("../utility");
// Log non-fatal wierdness.
const dlog = (0, utility_1.getdlog)('apidef', __filename);
async function buildGuide(ctx) {
    const errs = [];
    // console.log(ctx)
    const folder = node_path_1.default.resolve(ctx.opts.folder);
    // console.log('GUIDE folder', folder)
    try {
        const basejres = await buildBaseGuide(ctx);
    }
    catch (err) {
        errs.push(err);
    }
    handleErrors(ctx, errs);
    let src = '';
    let guidePath = node_path_1.default.join(folder, 'guide', (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'guide.jsonic');
    try {
        src = ctx.fs.readFileSync(guidePath, 'utf8');
    }
    catch (err) {
        errs.push(err);
    }
    handleErrors(ctx, errs);
    const opts = {
        path: guidePath
    };
    const guideRoot = (0, aontu_1.Aontu)(src, opts);
    errs.push(...guideRoot.err);
    handleErrors(ctx, errs);
    let genctx = new aontu_1.Context({ root: guideRoot });
    const guideModel = guideRoot.gen(genctx);
    errs.push(...genctx.err);
    handleErrors(ctx, errs);
    return guideModel;
}
function handleErrors(ctx, errs) {
    if (0 < errs.length) {
        let topmsg = [];
        for (let err of errs) {
            topmsg.push((err?.message?.split('\n')[0]) || '');
            ctx.log.error({ err });
        }
        throw new Error('SUMMARY: ' + topmsg.join('; '));
    }
}
async function buildBaseGuide(ctx) {
    let baseguide = {};
    if ('heuristic01' === ctx.opts.strategy) {
        baseguide = await (0, heuristic01_1.heuristic01)(ctx);
    }
    else {
        throw new Error('Unknown guide strategy: ' + ctx.opts.strategy);
    }
    const guideBlocks = [
        '# Guide',
        '',
        'guide: {',
    ];
    (0, struct_1.items)(baseguide.entity).map(([entityname, entity]) => {
        guideBlocks.push(`
  entity: ${entityname}: {` +
            (0 < entity.why_name.length ? ' # name:' + entity.why_name.join(';') : ''));
        (0, struct_1.items)(entity.path).map(([pathname, path]) => {
            guideBlocks.push(`    path: '${pathname}': op: {` +
                (0 < path.why_ent.length ? ' # ent:' + path.why_ent.join(';') : ''));
            (0, struct_1.items)(path.op).map(([opname, op]) => {
                guideBlocks.push(`      '${opname}': method: ${op.method}` +
                    (0 < op.why_op.length ? ' # ' + op.why_op : ''));
                if (op.transform?.reqform) {
                    guideBlocks.push(`      '${opname}': transform: reqform: ${JSON.stringify(op.transform.reqform)}`);
                }
            });
            guideBlocks.push(`    }`);
        });
        guideBlocks.push(`  }`);
    });
    guideBlocks.push('', '}');
    const guideSrc = guideBlocks.join('\n');
    ctx.note.guide = { base: guideSrc };
    const baseGuideFileName = (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'base-guide.jsonic';
    const jostraca = (0, jostraca_1.Jostraca)({
        folder: ctx.opts.folder + '/guide',
        now: ctx.spec.now,
        fs: () => ctx.fs,
        log: ctx.log,
    });
    const root = () => (0, jostraca_1.Project)({ folder: '.' }, async () => {
        (0, jostraca_1.File)({ name: baseGuideFileName }, () => (0, jostraca_1.Content)(guideSrc));
    });
    const jres = await jostraca.generate({
        existing: { txt: { merge: true } }
    }, root);
    return jres;
}
//# sourceMappingURL=guide.js.map