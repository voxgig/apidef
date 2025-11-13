"use strict";
// TODO:
// Support these:
/*
/foo{bar}
/{bar}zed
/foo{bar}zed/
/{a}{b}
/reports/{id}.pdf
/.{lang}/help
/range/{start}-{end}
/{id}
/items/{id}/
/files;rev={rev}
 */
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
const aontu = new aontu_1.Aontu();
async function buildGuide(ctx) {
    const log = ctx.log;
    const errs = [];
    const folder = node_path_1.default.resolve(ctx.opts.folder);
    try {
        const basejres = await buildBaseGuide(ctx);
    }
    catch (err) {
        console.log(err);
        errs.push(err);
    }
    handleErrors(ctx, errs);
    let src = '';
    let guidepath = node_path_1.default.join(folder, 'guide', (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'guide.jsonic');
    log.info({
        point: 'generate-guide',
        note: guidepath.replace(process.cwd(), '.'),
        guidepath,
    });
    try {
        src = ctx.fs.readFileSync(guidepath, 'utf8');
    }
    catch (err) {
        errs.push(err);
    }
    handleErrors(ctx, errs);
    if (0 === errs.length) {
        const opts = {
            path: guidepath,
            fs: ctx.fs,
        };
        const guideModel = aontu.generate(src, opts);
        // console.dir(guideModel, { depth: null })
        handleErrors(ctx, errs);
        return guideModel;
    }
}
function handleErrors(ctx, errs) {
    if (0 < errs.length) {
        const topmsg = [];
        for (let err of errs) {
            err = err instanceof Error ? err :
                err.err instanceof Error ? err.err :
                    Array.isArray(err.err) && null != err.err[0] ? err.err[0] :
                        err;
            const msg = 'string' === typeof err?.message ? err.message :
                err instanceof Error ? err.message : '' + err;
            topmsg.push(msg);
        }
        const summary = new Error(`SUMMARY (${errs.length} errors): ` + topmsg.join(' | '));
        ctx.log.error(summary);
        summary.errs = () => errs;
        throw summary;
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
    // console.dir(baseguide, { depth: null })
    const guideBlocks = [
        '# Guide',
        '',
        'guide: {',
    ];
    const metrics = baseguide.metrics;
    // TODO: these should influence the IS_ENTCMP_METHOD_RATE etc. values
    const epr = 0 < metrics.count.path ? (metrics.count.entity / metrics.count.path).toFixed(3) : -1;
    const emr = 0 < metrics.count.method ? (metrics.count.entity / metrics.count.method).toFixed(3) : -1;
    ctx.log.info({
        point: 'metrics',
        metrics,
        note: `epr=${epr}  emr=${emr}  ` +
            `(entity=${metrics.count.entity} ` +
            `paths=${metrics.count.path} methods=${metrics.count.method})`
    });
    validateBaseBuide(ctx, baseguide);
    const sw = (s) => ctx.opts.why?.show ? s : '';
    const qs = (s) => JSON.stringify(s);
    guideBlocks.push(`  metrics: count: entity: ${metrics.count.entity}
  metrics: count: path: ${metrics.count.path}
  metrics: count: method: ${metrics.count.method}`);
    (0, struct_1.items)(baseguide.entity).map(([entname, entity]) => {
        guideBlocks.push(`
  entity: ${entname}: {` +
            sw(0 < entity.why_name?.length ? '  # name:' + entity.why_name.join(';') : ''));
        (0, struct_1.items)(entity.path).map(([pathstr, path]) => {
            (0, utility_1.debugpath)(pathstr, null, 'BASE-GUIDE', entname, pathstr, (0, utility_1.formatJSONIC)(path, { hsepd: 0, $: true, color: true }));
            guideBlocks.push(`    path: ${qs(pathstr)}: {` +
                sw(0 < path.why_path?.length ?
                    '  # ent:' + entname + ':' + path.why_path.join(';') : ''));
            if (!(0, struct_1.isempty)(path.action)) {
                (0, struct_1.items)(path.action).map(([actname, actdesc]) => {
                    guideBlocks.push(`      action: ${qs(actname)}: kind: *${qs(actdesc.kind)}|top` +
                        sw(0 < path.action_why[actname]?.length ?
                            '  # ' + path.action_why[actname].join(';') : ''));
                });
            }
            if (!(0, struct_1.isempty)(path.rename?.param)) {
                (0, struct_1.items)(path.rename.param).map(([psrc, ptgt]) => {
                    guideBlocks.push(`      rename: param: ${qs(psrc)}: *${qs(ptgt)}` +
                        sw(0 < path.rename_why.param_why?.[psrc]?.length ?
                            '  # ' + path.rename_why.param_why[psrc].join(';') : ''));
                });
            }
            (0, struct_1.items)(path.op).map(([opname, op]) => {
                guideBlocks.push(`      op: ${opname}: method: *${op.method}` +
                    sw(0 < op.why_op.length ? '  # ' + op.why_op : ''));
                if (op.transform?.reqform) {
                    guideBlocks.push(`      op: ${opname}: transform: req: *${qs(op.transform.reqform)}|top`);
                }
                if (op.transform?.resform) {
                    guideBlocks.push(`      op: ${opname}: transform: res: *${qs(op.transform.resform)}|top`);
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
function validateBaseBuide(ctx, baseguide) {
    const srcm = {};
    // Each orig path.
    (0, jostraca_1.each)(ctx.def.paths, (pdef) => {
        const pathStr = pdef.key$;
        // Each orig method.
        (0, jostraca_1.each)(pdef, (mdef) => {
            if (mdef.key$.match(/^get|post|put|patch|delete|head|options$/i)) {
                let key = pathStr + ' ' + mdef.key$.toUpperCase();
                let desc = (srcm[key] = (srcm[key] || { c: 0 }));
                desc.c++;
            }
        });
    });
    const genm = {};
    // Each entity.
    (0, jostraca_1.each)(baseguide.entity, (entm) => {
        if ((0, struct_1.isempty)(entm.path)) {
            ctx.warn({
                note: `No paths defined for entity=${entm.name}`,
                entm,
            });
        }
        // Each path.
        (0, jostraca_1.each)(entm.path, (pathm, pathStr) => {
            if ((0, struct_1.isempty)(pathm.op)) {
                ctx.warn({
                    note: `No operations defined for entity=${entm.name} path=${pathStr}`,
                    path: pathStr,
                    entm,
                    pathm,
                });
            }
            // Each op.
            (0, jostraca_1.each)(pathm.op, (odef) => {
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
        for (let i = 0, j = 0; i < srcp.length || j < genp.length; i++, j++) {
            let srcps = srcp[i];
            let genps = genp[j];
            let prefix = '     ';
            if (srcps !== genps) {
                prefix = ' *** ';
                if (srcps === genp[j + 1]) {
                    j++;
                }
                else if (genps === srcp[i + 1]) {
                    i++;
                }
            }
            console.log(prefix, srcps.padEnd(60, ' '), genps);
        }
        throw new Error('PATH MISMATCH');
    }
}
//# sourceMappingURL=guide.js.map