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
const graphql01_1 = require("./graphql01");
const utility_1 = require("../utility");
const KONSOLE_LOG = console['log'];
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
        errs.push(err);
    }
    handleErrors(ctx, errs);
    let src = '';
    let guidepath = node_path_1.default.join(folder, 'guide', (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'guide.aontu');
    log.info({
        point: 'generate-guide',
        note: (0, utility_1.relativizePath)(guidepath),
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
            errs,
        };
        // Only forward a *genuinely injected* fs.
        //
        // aontu resolves `@`-includes through @tabnas/multisource, which does:
        //   const P = null != ctx.meta?.fs ? Path.posix : Path
        // i.e. it switches to POSIX path semantics whenever an fs is present, on
        // the assumption that an injected fs is memfs keyed by POSIX paths.
        //
        // apidef defaults ctx.fs to the real node:fs (`opts.fs || Fs`), so
        // forwarding it unconditionally made multisource parse *Windows* paths
        // with Path.posix. 'D:\...\guide\x-guide.aontu' contains no '/', so the
        // include base resolved to '' and sibling includes were looked up against
        // the cwd instead of the guide folder — every build failed on Windows
        // with `source not found: <prefix>base-guide.aontu`. Linux and macOS were
        // unaffected because there Path and Path.posix are the same module.
        //
        // Callers that supply a real memfs (e.g. apidef-validate) still get it,
        // and still get the POSIX semantics they need.
        //
        // Uses the explicit ctx.fsInjected flag rather than `Fs !== ctx.fs`:
        // esModuleInterop compiles `import * as Fs` to __importStar(), which
        // builds a fresh wrapper per module, so identity comparison across
        // modules is always false.
        if (ctx.fsInjected) {
            opts.fs = ctx.fs;
        }
        // Record what was actually handed to aontu, not what we intended to hand
        // it, so the regression test fails if this block is ever changed back to
        // an unconditional assignment.
        ctx.work.guideAontuFs = undefined !== opts.fs;
        const guideModel = aontu.generate(src, opts);
        handleErrors(ctx, errs);
        return guideModel;
    }
}
function handleErrors(ctx, errs) {
    if (0 < errs.length) {
        const topmsg = [];
        const stacks = [];
        for (let err of errs) {
            err = err instanceof Error ? err :
                err.err instanceof Error ? err.err :
                    Array.isArray(err.err) && null != err.err[0] ? err.err[0] :
                        err;
            const msg = 'string' === typeof err?.message ? err.message :
                err instanceof Error ? err.message : '' + err;
            topmsg.push(msg);
            stacks.push('' + err.stack);
        }
        const summary = new Error(`SUMMARY (${errs.length} errors): ` + topmsg.join(' | '));
        summary.stack = stacks.join('\n');
        ctx.log.error(summary);
        summary.errs = () => errs;
        throw summary;
    }
}
async function buildBaseGuide(ctx) {
    let baseguide;
    if ('heuristic01' === ctx.opts.strategy) {
        baseguide = await (0, heuristic01_1.heuristic01)(ctx);
    }
    else if ('graphql01' === ctx.opts.strategy) {
        baseguide = await (0, graphql01_1.graphql01)(ctx);
    }
    else {
        throw new Error('Unknown guide strategy: ' + ctx.opts.strategy);
    }
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
    const qs = (v) => JSON.stringify(v);
    const qt = (v) => '(' + qs(v) + ')';
    guideBlocks.push(`  metrics: count: entity: ${metrics.count.entity}
  metrics: count: path: ${metrics.count.path}
  metrics: count: method: ${metrics.count.method}`);
    // NOTE: items(...) sorts the iteration elements, so the generated model code
    // is deterministic.
    // Emit one guide entry. REST guides key entries by path, GraphQL guides by
    // schema root field (`branch`); the body is otherwise identical, so both
    // share this emitter. GraphQL ops carry `optype` ALONGSIDE `method: POST`,
    // which keeps every downstream transform that reads gop.method working
    // unchanged while recording the query/mutation distinction.
    const emitEntry = (branch, entname, entity, entrykey, path) => {
        {
            (0, utility_1.debugpath)(entrykey, null, 'BASE-GUIDE', entname, entrykey, (0, utility_1.formatJSONIC)(path, { hsepd: 0, $: true, color: true }));
            guideBlocks.push(`    ${branch}: ${qs(entrykey)}: {` +
                sw(0 < path.why_path.length ?
                    '  # ent=' + entname + ';' +
                        (entity.orig !== entname && null != entity.orig ? 'orig=' + entity.orig + ';' : '') +
                        path.why_path.join(';') : ''));
            if (!(0, struct_1.isempty)(path.action)) {
                (0, struct_1.items)(path.action).map(([actname, actdesc]) => {
                    guideBlocks.push(`      action: ${qs(actname)}: {}` +
                        sw(0 < actdesc.why_action.length ?
                            '  # ' + actdesc.why_action.join(';') : ''));
                });
            }
            if (!(0, struct_1.isempty)(path.rename?.param)) {
                (0, struct_1.items)(path.rename.param).map(([psrc, rp]) => {
                    guideBlocks.push(`      rename: param: ${qs(psrc)}: *${qs(rp.target)}` +
                        sw(0 < rp.why_rename.length ?
                            '  # ' + rp.why_rename.join(';') : ''));
                });
            }
            (0, struct_1.items)(path.op).map(([opname, op]) => {
                guideBlocks.push(`      op: ${opname}: method: *${op.method}` +
                    sw(0 < op.why_op.length ? '  # ' + op.why_op : ''));
                if (null != op.optype) {
                    guideBlocks.push(`      op: ${opname}: optype: *${op.optype}`);
                }
                // Each transform is emitted only when set, and each on its own terms.
                // (An earlier req-GUARDED block pushed a second res line built from
                // op.transform.res — emitting `transform: res: *undefined` whenever a
                // request was wrapped but the response was not. Hence the separate
                // null checks below rather than one shared guard.)
                if (null != op.transform.res) {
                    guideBlocks.push(`      op: ${opname}: transform: res: *${qt(op.transform.res)}|top`);
                }
                // The req transform is a MAP of body property -> source expression
                // (see closedBodyTransform), so it takes one line per property. THE
                // SERIALISED GUIDE IS WHAT THE TRANSFORM STEP READS: a transform not
                // written here never reaches the model, which is why restricting a
                // closed request body had no effect until this existed. Only the map
                // form is representable as aontu paths; a scalar req is left alone.
                const reqmap = op.transform.req;
                if (null != reqmap && 'object' === typeof reqmap) {
                    (0, struct_1.items)(reqmap).map(([bodykey, source]) => {
                        if ('string' === typeof source) {
                            guideBlocks.push(`      op: ${opname}: transform: req: ` +
                                `${qs(bodykey)}: *${qt(source)}|top`);
                        }
                    });
                }
            });
            guideBlocks.push(`    }`);
        }
    };
    (0, struct_1.items)(baseguide.entity).map(([entname, entity]) => {
        guideBlocks.push(`
  entity: ${entname}: {`);
        // NOTE: items(...) sorts the entries, so output is deterministic.
        (0, struct_1.items)(entity.path).map(([pathstr, path]) => emitEntry('path', entname, entity, pathstr, path));
        (0, struct_1.items)(entity.field).map(([fieldstr, path]) => emitEntry('field', entname, entity, fieldstr, path));
        guideBlocks.push(`  }`);
    });
    guideBlocks.push('', '}');
    const guideSrc = guideBlocks.join('\n');
    ctx.note.guide = { base: guideSrc };
    const baseGuideFileName = (null == ctx.opts.outprefix ? '' : ctx.opts.outprefix) + 'base-guide.aontu';
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
// GraphQL coverage guard: every Query/Mutation root field must either be
// assigned to an entity op or be deliberately excluded by the classifier
// (machinery types, scalar returns). Mirrors the REST PATH MISMATCH check —
// silence about an unclassified field is how an API silently loses surface.
function validateGraphqlBaseGuide(ctx, baseguide) {
    const covered = {};
    (0, jostraca_1.each)(baseguide.entity, (entm) => {
        (0, jostraca_1.each)(entm.field, (fieldm, fieldStr) => {
            if (!(0, struct_1.isempty)(fieldm.op)) {
                covered[fieldStr] = true;
            }
        });
    });
    const uncovered = [];
    for (const roots of [ctx.def?.query, ctx.def?.mutation]) {
        for (const fname of Object.keys(roots ?? {}).sort()) {
            if (!covered[fname]) {
                uncovered.push(fname);
            }
        }
    }
    // Unclassified root fields are expected (scalars like `version`, machinery
    // returns), so this is a warning rather than a hard failure — but it is
    // always reported, so a missed entity is visible.
    if (0 < uncovered.length) {
        ctx.warn({
            note: `GraphQL root fields not mapped to an entity op: ` +
                uncovered.join(', '),
            uncovered,
        });
    }
    ctx.log.info({
        point: 'graphql-coverage',
        note: `mapped=${Object.keys(covered).length} unmapped=${uncovered.length}`,
    });
}
function validateBaseBuide(ctx, baseguide) {
    // GraphQL guides key entries by root field, not path: the path-based
    // reconciliation below has nothing to compare.
    if (true === ctx.def?.graphql) {
        return validateGraphqlBaseGuide(ctx, baseguide);
    }
    const srcm = {};
    // Each orig path.
    (0, jostraca_1.each)(ctx.def.paths, (pdef) => {
        const pathStr = pdef.key$;
        // Each orig method.
        (0, jostraca_1.each)(pdef, (mdef) => {
            if (mdef.key$.match(/^(get|post|put|patch|delete|head|options|query)$/i)) {
                let key = pathStr + ' ' + mdef.key$.toUpperCase();
                let desc = (srcm[key] = (srcm[key] || { c: 0 }));
                desc.c++;
            }
        });
    });
    const genm = {};
    // Collect all paths that have ops under any entity.
    const coveredPaths = {};
    (0, jostraca_1.each)(baseguide.entity, (entm) => {
        (0, jostraca_1.each)(entm.path, (pathm, pathStr) => {
            if (!(0, struct_1.isempty)(pathm.op)) {
                coveredPaths[pathStr] = true;
            }
        });
    });
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
                // Only warn if this path has no ops under any entity.
                // Paths covered elsewhere (e.g. as actions of another entity) are expected.
                if (!coveredPaths[pathStr]) {
                    ctx.warn({
                        note: `No operations defined for entity=${entm.name} path=${pathStr}`,
                        path: pathStr,
                        entm,
                        pathm,
                    });
                }
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
        KONSOLE_LOG('     ', 'SRC-PATH'.padEnd(60, ' '), 'GEN-PATH');
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
            KONSOLE_LOG(prefix, srcps.padEnd(60, ' '), genps);
        }
        throw new Error('PATH MISMATCH');
    }
}
//# sourceMappingURL=guide.js.map