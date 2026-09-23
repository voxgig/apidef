"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateGuideIncludes = migrateGuideIncludes;
exports.prefixGuideInclude = prefixGuideInclude;
exports.findConflict = findConflict;
exports.guideConflictMessage = guideConflictMessage;
exports.missingGuideMessage = missingGuideMessage;
exports.baseGuideHeader = baseGuideHeader;
exports.guideEntrySource = guideEntrySource;
exports.migrateLegacyGuide = migrateLegacyGuide;
exports.migrateGuideIncludePrefix = migrateGuideIncludePrefix;
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
function migrateGuideIncludes(src, guideprefix) {
    let migrated = src
        .replace(/@"@voxgig\/apidef\/model\/guide\.aon"/g, '@"@voxgig/apidef/model/guide.aontu"');
    // The sibling include is written bare or with `./`; both name this file.
    for (const dir of ['', './']) {
        migrated = migrated
            .split('@"' + dir + guideprefix + 'base-guide.aon"')
            .join('@"' + dir + guideprefix + 'base-guide.aontu"');
    }
    return migrated;
}
// aontu refuses a bare sibling include, so it gains the `./` it needs.
function prefixGuideInclude(src, guideprefix) {
    return src
        .split('@"' + guideprefix + 'base-guide.aontu"')
        .join('@"./' + guideprefix + 'base-guide.aontu"');
}
// A `.aon` entry file is unresolvable: aontu reads only `.aontu` as source.
// So this renames AND rewrites both includes — a repair, not a convenience.
function migrateLegacyGuide(fs, folder, guideprefix) {
    const guidepath = node_path_1.default.join(folder, 'guide', guideprefix + 'guide.aontu');
    const legacyguide = node_path_1.default.join(folder, 'guide', guideprefix + 'guide.aon');
    if (fs.existsSync(guidepath) || !fs.existsSync(legacyguide)) {
        return false;
    }
    fs.writeFileSync(guidepath, migrateGuideIncludes(String(fs.readFileSync(legacyguide, 'utf8')), guideprefix));
    try {
        fs.unlinkSync(legacyguide);
    }
    catch (_err) { }
    return true;
}
// A `.aontu` entry file may still include a `.aon` sibling, so the rename
// above never fires for it while its include still names an absent file.
function migrateLegacyGuideInclude(fs, guidepath, guideprefix) {
    return rewriteGuide(fs, guidepath, (src) => migrateGuideIncludes(src, guideprefix));
}
function migrateGuideIncludePrefix(fs, guidepath, guideprefix) {
    return rewriteGuide(fs, guidepath, (src) => prefixGuideInclude(src, guideprefix));
}
function rewriteGuide(fs, guidepath, rewrite) {
    if (!fs.existsSync(guidepath)) {
        return false;
    }
    const src = String(fs.readFileSync(guidepath, 'utf8'));
    const migrated = rewrite(src);
    if (migrated === src) {
        return false;
    }
    fs.writeFileSync(guidepath, migrated);
    return true;
}
function guideConflictMessage(path, conflict) {
    return `@voxgig/apidef: guide: unresolved merge conflict at ${path}:${conflict.line}\n` +
        `  ${conflict.text}\n` +
        `Resolve the marked block in ${path}.`;
}
function missingGuideMessage(path, guideprefix) {
    return `@voxgig/apidef: guide: ${path} defines no guide map; it needs the include ` +
        `@"./${guideprefix}base-guide.aontu".`;
}
function isPlainObject(val) {
    return null != val && 'object' === typeof val && !Array.isArray(val);
}
function findConflict(src) {
    const lines = String(src || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^(<{7}|>{7})(?!<|>)/.test(line) || /^={7}(?!=)\s*$/.test(line)) {
            return { line: i + 1, text: line.slice(0, 80) };
        }
    }
    return null;
}
async function buildGuide(ctx) {
    const log = ctx.log;
    const errs = [];
    const folder = node_path_1.default.resolve(ctx.opts.folder);
    try {
        await buildBaseGuide(ctx);
    }
    catch (err) {
        errs.push(err);
    }
    handleErrors(ctx, errs);
    let src = '';
    const guideprefix = null == ctx.opts.outprefix ? '' : ctx.opts.outprefix;
    let guidepath = node_path_1.default.join(folder, 'guide', guideprefix + 'guide.aontu');
    if (migrateLegacyGuide(ctx.fs, folder, guideprefix)) {
        log.info({ point: 'migrate-guide', note: 'guide.aon -> guide.aontu' });
    }
    if (migrateLegacyGuideInclude(ctx.fs, guidepath, guideprefix)) {
        log.info({
            point: 'migrate-guide-include',
            note: 'base-guide.aon -> base-guide.aontu'
        });
    }
    if (migrateGuideIncludePrefix(ctx.fs, guidepath, guideprefix)) {
        log.info({
            point: 'migrate-guide-prefix',
            note: 'base-guide.aontu -> ./base-guide.aontu'
        });
    }
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
    // Only the entry file: the base guide was just rewritten from the spec.
    const conflict = findConflict(src);
    if (null != conflict) {
        errs.push(new Error(guideConflictMessage((0, utility_1.relativizePath)(guidepath), conflict)));
    }
    handleErrors(ctx, errs);
    if (0 === errs.length) {
        const opts = {
            path: guidepath,
            errfs: ctx.fs,
        };
        if (ctx.fsInjected) {
            opts.fs = ctx.fs;
        }
        ctx.work.guideAontuFs = undefined !== opts.fs;
        // One AontuError carries every aontu failure, formatted: collect mode
        // leaves a generation-time failure's message empty.
        let guideModel;
        try {
            guideModel = aontu.generate(src, opts);
        }
        catch (err) {
            errs.push(err);
        }
        if (0 === errs.length && !isPlainObject(guideModel?.guide)) {
            errs.push(new Error(missingGuideMessage((0, utility_1.relativizePath)(guidepath), guideprefix)));
        }
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
    const guideprefix = null == ctx.opts.outprefix ? '' : ctx.opts.outprefix;
    const guideBlocks = [
        ...baseGuideHeader(guideprefix),
        '',
        'guide: {',
    ];
    const metrics = baseguide.metrics;
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
    // Root-field count is GraphQL-only; omit it for REST guides so their
    // emitted base-guide files stay byte-identical.
    if (0 < (metrics.count.field ?? 0)) {
        guideBlocks.push(`  metrics: count: field: ${metrics.count.field}`);
    }
    // NOTE: items(...) sorts the iteration elements, so the generated model code
    // is deterministic.
    // Emit one guide entry. REST guides key entries by path, GraphQL guides by
    // schema root field (`branch`); the body is otherwise identical, so both
    // share this emitter. GraphQL ops carry `optype` ALONGSIDE `method: POST`,
    // which keeps every downstream transform that reads gop.method working
    // unchanged while recording the query/mutation distinction.
    const emitEntry = (branch, entname, entity, entrykey, path) => {
        {
            if ((0, utility_1.debugpathOn)()) {
                (0, utility_1.debugpath)(entrykey, null, 'BASE-GUIDE', entname, entrykey, (0, utility_1.formatJSONIC)(path, { hsepd: 0, $: true, color: true }));
            }
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
                if (null != op.transform.res) {
                    guideBlocks.push(`      op: ${opname}: transform: res: *${qt(op.transform.res)}|top`);
                }
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
        if (false === entity.active) {
            const why = entity.why_inactive;
            guideBlocks.push(`    # Deactivated by the heuristic` +
                (null == why ? '' : ` (${why})`) + `. Set` +
                ` \`active: true\` here in guide.aontu to generate it as an entity.`);
            guideBlocks.push(`    active: *false`);
        }
        // NOTE: items(...) sorts the entries, so output is deterministic.
        (0, struct_1.items)(entity.path).map(([pathstr, path]) => emitEntry('path', entname, entity, pathstr, path));
        (0, struct_1.items)(entity.field).map(([fieldstr, path]) => emitEntry('field', entname, entity, fieldstr, path));
        guideBlocks.push(`  }`);
    });
    guideBlocks.push('', '}');
    const guideSrc = guideBlocks.join('\n');
    ctx.note.guide = { base: guideSrc };
    const guidefolder = node_path_1.default.join(ctx.opts.folder, 'guide');
    ctx.fs.mkdirSync(guidefolder, { recursive: true });
    ctx.fs.writeFileSync(node_path_1.default.join(guidefolder, guideprefix + 'base-guide.aontu'), guideSrc);
}
// The entry file a project writes once and owns; the CLI prints it.
function guideEntrySource(guideprefix) {
    return [
        '# Guide entry file: put customizations below the includes. The base guide',
        '# it includes is generated and overwritten on every build.',
        '@"@voxgig/apidef/model/guide.aontu"',
        '@"./' + guideprefix + 'base-guide.aontu"',
    ];
}
// Written into every base guide, so a reader of the file learns where an
// edit belongs before making one there.
function baseGuideHeader(guideprefix) {
    return [
        '# Generated from the API definition and overwritten on every build: do not',
        '# edit this file. Put customizations in the guide entry file, which includes',
        '# this one and overrides its defaults:',
        '#   ' + guideprefix + 'guide.aontu',
    ];
}
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