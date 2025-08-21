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
    validateBaseBuide(ctx, baseguide);
    (0, struct_1.items)(baseguide.entity).map(([entityname, entity]) => {
        guideBlocks.push(`
  entity: ${entityname}: {` +
            (0 < entity.why_name.length ? ' # name:' + entity.why_name.join(';') : ''));
        (0, struct_1.items)(entity.path).map(([pathstr, path]) => {
            guideBlocks.push(`    path: '${pathstr}': op: {` +
                (0 < path.why_ent.length ? ' # ent:' + path.why_ent.join(';') : ''));
            if (null != path.origpath && path.origpath !== pathstr) {
                guideBlocks.push(`      # origpath: ${path.origpath}`);
            }
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
    console.log(guideSrc);
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
function validateBaseBuide(ctx, baseguide) {
    const srcm = {};
    // Each orig path.
    (0, jostraca_1.each)(ctx.def.paths, (pdef) => {
        const pathStr = pdef.key$;
        // Each orig method.
        (0, jostraca_1.each)(pdef, (mdef) => {
            if (mdef.key$.match(/^get|post|put|patch|delete$/i)) {
                let key = pathStr + ' ' + mdef.key$;
                let desc = (srcm[key] = (srcm[key] || { c: 0 }));
                desc.c++;
            }
        });
    });
    // console.log('DEFPM', defpm)
    const genm = {};
    // Each entity.
    (0, jostraca_1.each)(baseguide.entity, (edef) => {
        // Each path.
        (0, jostraca_1.each)(edef.path, (pdef) => {
            // Each op.
            (0, jostraca_1.each)(pdef.op, (odef) => {
                let pathStr = pdef.origpath;
                let key = pathStr + ' ' + odef.method;
                let desc = (genm[key] = (genm[key] || { c: 0 }));
                desc.c++;
            });
        });
    });
    const srcp = Object.keys(srcm).sort()
        .reduce((a, k) => (a.push(k + ':c=' + srcm[k].c), a), []);
    const genp = Object.keys(genm).sort()
        .reduce((a, k) => (a.push(k + ':c=' + genm[k].c), a), []);
    // Check that all paths have been assigned to entities.
    if (srcp.join(';') !== genp.join(';')) {
        console.log('     ', 'SRC-PATH'.padEnd(60, ' '), 'GEN-PATH');
        for (let i = 0; i < srcp.length || i < genp.length; i++) {
            let srcps = srcp[i];
            let genps = genp[i];
            let prefix = '     ';
            if (srcps !== genps) {
                prefix = ' *** ';
            }
            console.log(prefix, srcps.padEnd(60, ' '), genps);
        }
        throw new Error('PATH MISMATCH');
    }
}
//# sourceMappingURL=guide.js.map