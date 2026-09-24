"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.heuristic01 = heuristic01;
exports.pathResource = pathResource;
exports.sharedRoutes = sharedRoutes;
const ordu_1 = require("ordu");
const jostraca_1 = require("jostraca");
const struct_1 = require("@voxgig/struct");
const utility_1 = require("../utility");
const utility_2 = require("../utility");
const jostraca_2 = require("jostraca");
const entity_1 = require("../transform/entity");
const refcount_1 = require("../refcount");
const KONSOLE_LOG = console['log'];
// Log non - fatal wierdness.
const dlog = (0, utility_2.getdlog)('apidef', __filename);
// A schema whose per-use occurrences, over the method count or over the path
// count, fall below these rates names an entity rather than a shared shape.
const IS_ENTCMP_METHOD_RATE = 0.21;
const IS_ENTCMP_PATH_RATE = 0.41;
const METHOD_IDOP = {
    GET: 'load',
    // QUERY (RFC 10008) is a safe, idempotent read carrying its filter in the
    // request body — a "GET with a body". Treat it as a load; ResolveOperation
    // promotes it to `list` when the response is a collection.
    QUERY: 'load',
    POST: 'create',
    PUT: 'update',
    DELETE: 'remove',
    PATCH: 'patch',
    HEAD: 'head',
    OPTIONS: 'OPTIONS',
};
// Tried in order: the first shape a path matches decides how its entity is named.
const ENTITY_PATH_SHAPES = ['t/p/t/', 't/p/', 'p/t/', 't/', 't/p/p'];
// The matched part that gives each shape its name.
const PATH_NAME_INDEX = {
    't/p/t/': 2, 't/p/': 0, 'p/t/': 1, 't/': 0, 't/p/p': 0,
};
const READ_METHODS = ['GET', 'QUERY', 'HEAD', 'OPTIONS'];
const METHOD_CONSIDER_ORDER = {
    'GET': 100,
    'QUERY': 150,
    'POST': 200,
    'PUT': 300,
    'PATCH': 400,
    'DELETE': 500,
    'HEAD': 600,
    'OPTIONS': 700,
};
async function heuristic01(ctx) {
    const analysis = new ordu_1.Ordu({ select: { sort: true } }).add([
        Prepare,
        {
            select: 'def.paths', apply: [
                MeasurePath,
                { select: '', apply: MeasureMethod },
                PreparePath
            ]
        },
        { select: selectCmpXrefs, apply: MeasureRef },
        { select: selectAllMethods, apply: MeasureEnvelope },
        MeasureEnvelopeItems,
        { select: selectAllMethods, apply: MeasureSharing },
        MeasureShared,
        {
            select: selectAllMethods, apply: [
                ResolveEntityComponent,
                ResolveEntityName,
                RenameParams,
                FindActions,
                ResolveOperation,
                ResolveTransform,
                // ShowNode,
            ]
        },
        { select: 'work.entmap', apply: BuildEntity }
    ]);
    const result = analysis.execSync(ctx, {});
    if (result.err) {
        throw result.err;
    }
    const guide = result.data.guide;
    (0, entity_1.mergeCollectionPaths)(guide, ctx.log);
    const metrics = guide.metrics;
    const entities = Object.values(guide.entity);
    const entityCount = entities.length;
    let totalPaths = 0;
    let totalOps = 0;
    for (const ent of entities) {
        const pathKeys = (0, utility_2.sortedKeys)(ent.path || {});
        totalPaths += pathKeys.length;
        for (const p of pathKeys) {
            totalOps += (0, utility_2.sortedKeys)(ent.path[p].op || {}).length;
        }
    }
    ctx.log.info({
        point: 'heuristic01',
        note: `entities=${entityCount} paths=${metrics.count.path}` +
            ` methods=${metrics.count.method} tags=${metrics.count.tag}` +
            ` cmps=${metrics.count.cmp}` +
            ` entity-paths=${totalPaths} entity-ops=${totalOps}`,
    });
    return guide;
}
function ShowNode(spec) {
    KONSOLE_LOG('NODE', spec.node.key, spec.node.val);
}
function Prepare(spec) {
    const guide = {
        control: {},
        entity: {},
        metrics: {
            count: {
                path: 0,
                field: 0,
                method: 0,
                tag: 0,
                cmp: 0,
                entity: 0,
                origcmprefs: {},
            },
            found: {
                tag: {},
                cmp: {},
            }
        },
    };
    Object.assign(spec.data, {
        def: spec.ctx.def,
        guide,
        work: {
            pathmap: {},
            entmap: {},
            envelope: {},
            sharing: { routes: [], records: {}, yields: {} },
            entity: {
                count: {
                    seen: 0,
                    unresolved: 0,
                }
            },
        }
    });
}
// Expects to run over paths
function MeasurePath(spec) {
    const guide = spec.data.guide;
    const metrics = guide.metrics;
    const pathdef = spec.node.val;
    metrics.count.path++;
    metrics.count.method += ((pathdef.get ? 1 : 0) +
        (pathdef.post ? 1 : 0) +
        (pathdef.put ? 1 : 0) +
        (pathdef.patch ? 1 : 0) +
        (pathdef.delete ? 1 : 0) +
        (pathdef.head ? 1 : 0) +
        (pathdef.options ? 1 : 0) +
        (pathdef.query ? 1 : 0));
}
// Expects to run over paths.<method>
function MeasureMethod(spec) {
    const guide = spec.data.guide;
    const metrics = guide.metrics;
    const methoddef = spec.node.val;
    const pathtags = methoddef.tags;
    if (Array.isArray(pathtags)) {
        for (let tag of pathtags) {
            if ('string' === typeof tag && 0 < tag.length) {
                if (!metrics.found.tag[tag]) {
                    metrics.count.tag++;
                    metrics.found.tag[tag] = {
                        name: tag,
                        canon: (0, utility_2.canonize)(tag),
                    };
                }
            }
        }
    }
}
function PreparePath(spec) {
    const work = spec.data.work;
    const pathstr = spec.node.key;
    const pathdef = spec.node.val;
    const pathdesc = {
        path: pathstr,
        def: pathdef,
        parts: pathstr.split('/').filter((p) => '' != p),
        op: {}
    };
    work.pathmap[pathstr] = pathdesc;
}
function selectCmpXrefs(_source, spec) {
    const counts = (0, refcount_1.countRefs)(spec.ctx.def);
    return Object.keys(counts)
        .sort(refcount_1.byCodePoint)
        .filter(val => val.match(/\/(components\/schemas|definitions)\//))
        .map(val => ({ val, count: counts[val] }));
}
function MeasureRef(spec) {
    const guide = spec.data.guide;
    const metrics = guide.metrics;
    const xref = spec.node.val;
    let m = xref.val.match(/\/(components\/schemas|definitions)\/(.+)$/);
    if (m) {
        const name = (0, utility_2.canonizeCmpName)(m[2]);
        if (null == metrics.count.origcmprefs[name]) {
            metrics.count.cmp++;
            metrics.count.origcmprefs[name] = 0;
        }
        metrics.count.origcmprefs[name] =
            (0, refcount_1.satAdd)(metrics.count.origcmprefs[name], xref.count);
        if (null == metrics.found.cmp[name]) {
            metrics.found.cmp[name] = { orig: m[2] };
        }
    }
}
// Being an envelope belongs to the component, not to one operation: it names
// through the record it carries only when every operation answering with it
// unwraps it, so the operations on one resource are never split between the
// record's name and the envelope's. An operation unwraps only the response
// ResolveTransform reads. The entry is the item's reference, or '' for none.
function MeasureEnvelope(spec) {
    const work = spec.data.work;
    const mdesc = spec.node.val;
    const opname = methodOpname(mdesc, matchEntityPath(work.pathmap[mdesc.path].parts), []);
    const unwrapref = getResponseSchema(successResponse(mdesc.responses))?.['x-ref'];
    for (const schema of successSchemas(mdesc.responses)) {
        const xref = schema['x-ref'];
        if (null != xref) {
            const itemref = null == opname || xref !== unwrapref ? null :
                (0, utility_1.envelopeItemRef)(schema, opname);
            work.envelope[xref] = '' === work.envelope[xref] || null == itemref ? '' : itemref;
        }
    }
}
// An item carried by more than one envelope is named by none of them: the
// envelopes' own names are then what tell the resources apart.
function MeasureEnvelopeItems(spec) {
    const envelope = spec.data.work.envelope;
    const carriers = {};
    for (const itemref of Object.values(envelope)) {
        carriers[itemref] = (carriers[itemref] ?? 0) + 1;
    }
    for (const xref of Object.keys(envelope)) {
        if (1 < carriers[envelope[xref]]) {
            envelope[xref] = '';
        }
    }
}
// Records every route whose operation answers with a response component, and
// whether that component declares an `id`, before any method is named.
function MeasureSharing(spec) {
    const work = spec.data.work;
    const mdesc = spec.node.val;
    const parts = work.pathmap[mdesc.path].parts;
    const op = methodOpname(mdesc, matchEntityPath(parts), []) ?? '';
    const sharing = work.sharing;
    const xrefs = findPotentialSchemaRefs(mdesc.path, mdesc.method, mdesc.responses, work.envelope, []);
    for (const xref of xrefs) {
        const m = xref.match(/\/(components\/schemas|definitions)\/(.+)$/);
        if (null != m) {
            const cmp = (0, utility_2.canonizeCmpName)(m[2]);
            sharing.routes.push({ cmp, method: mdesc.method, path: mdesc.path, op });
            sharing.records[cmp] = true === sharing.records[cmp] || declaresId(refSchema(spec.data.def, xref));
        }
    }
}
function MeasureShared(spec) {
    const sharing = spec.data.work.sharing;
    const records = Object.keys(sharing.records).filter((cmp) => sharing.records[cmp]);
    for (const key of sharedRoutes(sharing.routes, records)) {
        sharing.yields[key] = true;
    }
}
function selectAllMethods(_source, spec) {
    const ctx = spec.ctx;
    let caught = { methods: [] };
    for (const [path, pdef] of (0, utility_2.sortedEntries)(ctx.def.paths)) {
        for (const [m, mdef] of (0, utility_2.sortedEntries)(pdef)) {
            const method = m.toUpperCase();
            caught.methods.push({
                path,
                method,
                summary: mdef.summary,
                operationId: mdef.operationId,
                tags: mdef.tags,
                parameters: mdef.parameters,
                responses: mdef.responses,
                requestBody: mdef.requestBody,
                // Carried so authExchangeOp can see a per-operation `security: []`.
                // Everything downstream ignores it.
                security: mdef.security,
            });
        }
    }
    caught.methods.sort((a, b) => {
        if (a.path < b.path) {
            return -1;
        }
        else if (a.path > b.path) {
            return 1;
        }
        else if (METHOD_CONSIDER_ORDER[a.method] < METHOD_CONSIDER_ORDER[b.method]) {
            return -1;
        }
        else if (METHOD_CONSIDER_ORDER[a.method] > METHOD_CONSIDER_ORDER[b.method]) {
            return 1;
        }
        else {
            return 0;
        }
    });
    return caught.methods || [];
}
function ResolveEntityComponent(spec) {
    const guide = spec.data.guide;
    const metrics = guide.metrics;
    const work = spec.data.work;
    const methodDef = spec.node.val;
    const methodName = methodDef.method;
    const pathStr = methodDef.path;
    const parts = work.pathmap[pathStr].parts;
    let why_cmp = [];
    let responses = methodDef.responses;
    let origxrefs = findPotentialSchemaRefs(pathStr, methodName, responses, work.envelope, why_cmp).map(val => ({
        val
    }));
    let cmpxrefs = origxrefs
        .filter(xref => xref.val.includes('schema') || xref.val.includes('definitions'))
        .map(xref => {
        let m = xref.val.match(/\/components\/schemas\/(.+)$/);
        if (!m) {
            m = xref.val.match(/\/definitions\/(.+)$/);
        }
        if (m) {
            const cmp = (0, utility_2.canonizeCmpName)(m[1]);
            xref.cmp = cmp;
            xref.origcmp = m[1];
            xref.origcmpref = cmp;
        }
        return xref;
    })
        .filter(xref => null != xref.cmp)
        .filter(xref => !xref.val.includes('Meta'));
    let cleanxrefs = cmpxrefs
        .map(xref => {
        // Guarded wrapper-suffix stripping folds e.g. BeneficiaryPageResponse
        // into beneficiary — but only when the remainder is itself a schema
        // measured by MeasureRef (keys are canonizeCmpName, pre-clean).
        xref.cmp = (0, utility_2.cleanComponentName)(xref.cmp, (n) => null != metrics.count.origcmprefs[n]);
        return xref;
    });
    let goodxrefs = cleanxrefs
        .filter(xref => {
        if (cleanxrefs.length <= 1
            || pathStr.toLowerCase().includes('/' + xref.cmp + '/')
            // || entityOccursInPath(pathStr.toLowerCase(), xref.cmp)
            || entityOccursInPath(parts, xref.cmp)) {
            return true;
        }
        // Exclude high frequency suspicious cmps as probably meta data
        const cmprefs = metrics.count.origcmprefs[xref.origcmpref] ?? 0;
        const mcount = metrics.count.method;
        const pcount = metrics.count.path;
        const method_rate = (0 < mcount ? (cmprefs / mcount) : -1);
        const path_rate = (0 < pcount ? (cmprefs / pcount) : -1);
        const infrequent = method_rate < IS_ENTCMP_METHOD_RATE
            || path_rate < IS_ENTCMP_PATH_RATE;
        if (!infrequent) {
            (0, utility_2.debugpath)(pathStr, methodName, 'CMP-INFREQ', xref.val, 'method:', method_rate, IS_ENTCMP_METHOD_RATE, 'path:', path_rate, IS_ENTCMP_PATH_RATE);
        }
        return infrequent;
    });
    // .sort((a, b) => a.path.length - b.path.length)
    const fcmp = goodxrefs[0];
    let out = undefined;
    if (null != fcmp) {
        out = makeMethodEntityDesc({
            ref: fcmp.val,
            cmp: fcmp.cmp,
            origcmp: fcmp.origcmp,
            origcmpref: fcmp.origcmpref,
            entname: fcmp.cmp,
        });
    }
    const tags = methodDef.tags ?? [];
    const goodtags = tags.filter((tag) => {
        const tagdesc = metrics.found.tag[tag];
        const ctag = tagdesc?.canon;
        return (!!metrics.found.cmp[ctag] // tag matches a cmp
            || null == fcmp // there's no cmp, so use tag
        );
    });
    (0, utility_2.debugpath)(pathStr, methodName, 'TAGS', tags, goodtags, fcmp, methodDef, metrics.found);
    const ftag = goodtags[0];
    if (null != ftag) {
        const tagdesc = metrics.found.tag[ftag];
        const tagcmp = metrics.found.cmp[tagdesc.canon];
        if (tagdesc && (tagcmp || null == fcmp)) {
            if (null == out) {
                out = makeMethodEntityDesc({
                    ref: 'tag',
                    cmp: tagdesc.canon,
                    origcmp: ftag,
                    why_cmp,
                    entname: tagdesc.canon,
                });
                why_cmp.push('tag=' + out.cmp);
            }
            else if ((pathStr.includes('/' + ftag + '/') || pathStr.includes('/' + tagdesc.canon + '/'))
                && out.cmp !== tagdesc.canon) {
                const rescmp = out.cmp;
                const rescmpoccur = metrics.count.origcmprefs[out.origcmpref ?? ''] ?? 0;
                out = makeMethodEntityDesc({
                    ref: 'tag',
                    cmp: tagdesc.canon,
                    origcmp: ftag,
                    why_cmp,
                    entname: tagdesc.canon,
                });
                out.rescmp = rescmp;
                out.rescmpoccur = rescmpoccur;
                why_cmp.push('tag/path=' + out.cmp);
            }
        }
    }
    if (null != out) {
        why_cmp.push('cmp/resolve=' + out.cmp);
        out.why_cmp = why_cmp;
        out.cmpoccur = metrics.count.origcmprefs[out.origcmpref ?? ''] ?? 0;
        out.path_rate = 0 == metrics.count.path ? -1 : (out.cmpoccur / metrics.count.path);
        out.method_rate = 0 == metrics.count.method ? -1 : (out.cmpoccur / metrics.count.method);
        methodDef.MethodEntity = out;
    }
    (0, utility_2.debugpath)(pathStr, methodName, 'CMP-NAME', out, origxrefs, cleanxrefs, goodxrefs, goodtags);
}
function ResolveEntityName(spec) {
    const ctx = spec.ctx;
    const data = spec.data;
    const mdesc = spec.node.val;
    const methodName = mdesc.method;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const pathDesc = work.pathmap[pathStr];
    const parts = pathDesc.parts;
    work.entity.count.seen++;
    let ment;
    ment = mdesc.MethodEntity;
    const why_path = [];
    if (null == ment) {
        why_path.push('no-desc');
        mdesc.MethodEntity = makeMethodEntityDesc({});
        ment = mdesc.MethodEntity;
    }
    why_path.push(...(ment.why_cmp ?? []));
    let entname;
    const pm = matchEntityPath(parts);
    if ('t/p/t/' === pm?.expr) {
        entname = entityPathMatch_tpte(data, pm, mdesc, why_path);
    }
    else if ('t/p/' === pm?.expr) {
        entname = entityPathMatch_tpe(data, pm, mdesc, why_path);
    }
    else if ('p/t/' === pm?.expr) {
        entname = entityPathMatch_pte(data, pm, mdesc, why_path);
    }
    else if ('t/' === pm?.expr) {
        entname = entityPathMatch_te(data, pm, mdesc, why_path);
    }
    else if ('t/p/p' === pm?.expr) {
        entname = entityPathMatch_tpp(data, pm, mdesc, why_path);
    }
    else {
        entname = inferEntityName(mdesc, parts, why_path);
        if (null == entname) {
            work.entity.count.unresolved++;
            entname = 'entity' + work.entity.count.unresolved;
        }
    }
    entname = (0, utility_2.resplitFromCmp)(entname, ment.cmp, why_path);
    // Keep the pre-truncation name so a truncated-name collision can tell a
    // re-encounter of the SAME origin (merge) from a genuinely different one
    // (numeric suffix) — see ensureMinEntityName.
    const rawEntname = entname;
    entname = (0, utility_2.ensureMinEntityName)(entname, work.entmap);
    const entdesc = work.entmap[entname] = work.entmap[entname] ?? {
        name: entname,
        id: 'N' + ('' + Math.random()).substring(2, 10),
        op: {},
        why_path,
        ...ment,
        longname: rawEntname,
    };
    entdesc.path = (entdesc.path || {});
    entdesc.path[pathStr] = entdesc.path[pathStr] || {
        rename: { param: {} },
        why_rename: { why_param: {} },
        pm,
    };
    entdesc.path[pathStr].op = entdesc.path[pathStr].op || {};
    entdesc.path[pathStr].why_path = why_path;
    ment.entname = entname;
    ment.pm = pm;
    // Which entity took each path+method, in resolution order. verbOnParent
    // reads the item path's GET owner from here: a t/p/ item path can be
    // split across entities by method (a PUT answering with a one-off
    // acknowledgement is named after it), and the parent of a verb is the
    // entity a read of the item returns.
    work.pathowner = work.pathowner ?? {};
    work.pathowner[pathStr] = work.pathowner[pathStr] ?? {};
    work.pathowner[pathStr][methodName] = entname;
    // Same guard, same reason: the formatting is the cost, not the call.
    if ((0, utility_2.debugpathOn)()) {
        (0, utility_2.debugpath)(pathStr, methodName, 'RESOLVE-ENTITY-NAME', (0, utility_2.formatJSONIC)({ entdesc, ment }, { hsepd: 0, $: true, color: true }));
    }
}
function RenameParams(spec) {
    const ctx = spec.ctx;
    const data = spec.data;
    const mdesc = spec.node.val;
    const ment = mdesc.MethodEntity;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const entname = mdesc.MethodEntity.entname;
    const entdesc = work.entmap[entname];
    const pathdesc = spec.data.work.pathmap[pathStr];
    const methodName = mdesc.method;
    const pathDesc = entdesc.path[pathStr];
    pathDesc.rename = (pathDesc.rename ?? { param: {} });
    pathDesc.why_rename = (pathDesc.why_rename ?? { why_param: {} });
    pathDesc.action = (pathDesc.action ?? {});
    pathDesc.why_action = (pathDesc.why_action ?? {});
    const paramRenameCapture = {
        rename: pathDesc.rename.param = (pathDesc.rename.param ?? {}),
        why: pathDesc.why_rename.why_param = (pathDesc.why_rename.why_param ?? {}),
    };
    const parts = pathdesc.parts;
    const applySnakeCaseRename = () => {
        for (const part of parts) {
            const m = part.match(/^\{(.+)\}$/);
            if (!m)
                continue;
            const placeholder = m[1];
            const snake = (0, utility_2.depluralize)((0, jostraca_2.snakify)((0, utility_2.normalizeFieldName)(placeholder)));
            if (snake !== placeholder && paramRenameCapture.rename[placeholder] === undefined) {
                paramRenameCapture.why[placeholder] = (paramRenameCapture.why[placeholder] ?? []);
                updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, placeholder, snake, 'snake-case');
            }
        }
    };
    // id needs to be t/p/
    const multParamEndMatch = (0, utility_2.pathMatch)(mdesc.path, 'p/p/');
    if (multParamEndMatch) {
        applySnakeCaseRename();
        ment.rename = paramRenameCapture.rename;
        ment.why_rename = paramRenameCapture.why;
        return;
    }
    const origParams = [];
    for (let partI = 0; partI < parts.length; partI++) {
        let partStr = parts[partI];
        if (isParam(partStr)) {
            origParams.push(partStr.replace(/[\}\{\*]/g, ''));
            const why = [];
            const oldParam = partStr.substring(1, partStr.length - 1);
            paramRenameCapture.why[oldParam] = (paramRenameCapture.why[oldParam] ?? []);
            const lastPart = partI === parts.length - 1;
            const secondLastPart = partI === parts.length - 2;
            const notLastPart = partI < parts.length - 1;
            const hasParent = 0 < partI && !isParam(parts[partI - 1]);
            const parentName = hasParent ? (0, utility_2.canonize)(parts[partI - 1]) : null;
            const not_exact_id = 'id' !== oldParam;
            const probably_an_id = oldParam.endsWith('id')
                || oldParam.endsWith('Id')
                || (0, utility_2.canonize)(oldParam) === parentName
                // GitHub-style `<parent>_number` keys (pull_number, issue_number):
                // the parent's own key under another name. Only when the param sits
                // under its own entity, so a nested collection keeps its parent key.
                || (oldParam.endsWith('_number') && parentName === entdesc.name);
            (0, utility_2.debugpath)(pathStr, mdesc.method, 'RENAME-PARAM-PART', parts, partI, partStr, {
                lastPart,
                secondLastPart,
                notLastPart,
                hasParent,
                parentName,
                not_exact_id,
                probably_an_id,
            });
            // Id-like not at end, and after a possible entname.
            // .../parentent/{id}/...
            if (probably_an_id
                && hasParent
                && notLastPart) {
                why.push('maybe-parent');
                // actually an action
                if (secondLastPart
                    && parentName !== entdesc.name
                    && entdesc.name.startsWith(parentName + '_')) {
                    updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'action-parent:' + entdesc.name);
                    why.push('action');
                    updateAction(methodName, oldParam, parts[partI + 1], entdesc, pathDesc, 'action-not-parent');
                }
                else if (hasParent && parentName === entdesc.name) {
                    updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'id-parent-ent');
                    why.push('id-parent-ent');
                }
                else {
                    updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, parentName + '_id', 'parent:' + parentName);
                    why.push('parent');
                }
            }
            // /api/foo/{foo}/bar/...
            // param matches parent entname, but is not _id format
            // At end, but not called id.
            // .../ent/{not-id}
            else if (lastPart
                && not_exact_id
                && (!hasParent
                    || (parentName === entdesc.name
                        || entdesc.name.endsWith('_' + parentName)))) {
                updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'end-id;' + methodName + ';parent=' + hasParent + '/' + parentName);
                why.push('end-id');
            }
            // Mot at end, has preceding non-param part.
            // .../parentent/{paramname}/...
            else if (notLastPart
                && 1 < partI
                && hasParent) {
                why.push('has-parent');
                // Actually primary ent with an action$ suffix
                if (secondLastPart) {
                    why.push('second-last');
                    if ('id' !== oldParam
                        // && fixEntName(partStr) === entdesc.name
                        && (0, utility_2.canonize)(partStr) === entdesc.name) {
                        updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'end-action');
                        why.push('end-action');
                        updateAction(methodName, oldParam, parts[partI + 1], entdesc, pathDesc, 'end-action');
                    }
                    else {
                        why.push('not-end-action');
                    }
                }
                // Not primary ent.
                else {
                    why.push('default');
                    let newParamName = parentName + '_id';
                    if (newParamName != oldParam) {
                        updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, newParamName, 'not-primary');
                        why.push('not-primary');
                    }
                }
            }
            why.push('done');
            if (paramRenameCapture.rename[oldParam] === oldParam) {
                why.push('delete-dup');
                delete paramRenameCapture.rename[oldParam];
                delete paramRenameCapture.why[oldParam];
            }
            (0, utility_2.debugpath)(pathStr, methodName, 'RENAME-PARAM', {
                pathStr,
                methodName,
                partStr,
                why,
                oldParam,
                lastPart,
                secondLastPart,
                notLastPart,
                hasParent,
                parentName,
                not_exact_id,
                probably_an_id,
                paramRenameCapture,
                entdesc
            });
        }
    }
    applySnakeCaseRename();
    ment.rename = paramRenameCapture.rename;
    ment.why_rename = paramRenameCapture.why;
    ment.rename_orig = origParams;
}
function FindActions(spec) {
    const mdesc = spec.node.val;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const ment = mdesc.MethodEntity;
    const entname = ment.entname;
    const entdesc = work.entmap[entname];
    const pathdesc = entdesc.path[pathStr];
    const methodName = mdesc.method;
    pathdesc.action = (pathdesc.action ?? {});
    pathdesc.why_action = (pathdesc.why_action ?? {});
    const parts = spec.data.work.pathmap[pathStr].parts;
    const fourthLastPart = parts[parts.length - 4];
    const fourthLastPartCanon = (0, utility_2.canonize)(fourthLastPart);
    const thirdLastPart = parts[parts.length - 3];
    const thirdLastPartCanon = (0, utility_2.canonize)(thirdLastPart);
    const secondLastPart = parts[parts.length - 2];
    const secondLastPartCanon = (0, utility_2.canonize)(secondLastPart);
    const lastPart = parts[parts.length - 1];
    const lastPartCanon = (0, utility_2.canonize)(lastPart);
    const cmp = ment.cmp;
    if (null != ment.verb_on_parent) {
        pathdesc.action[lastPartCanon] = pathdesc.action[lastPartCanon] ?? {
            why_action: ['ent', entdesc.name, 'verb-on-parent', lastPart, methodName],
        };
    }
    // /api/foo/bar where foo is the entity and bar is the action, no id param
    else if (secondLastPartCanon === cmp
        || secondLastPartCanon === ment.origcmp
        || secondLastPartCanon === entname) {
        if (!isParam(lastPart)) {
            updateAction(methodName, lastPart, lastPartCanon, entdesc, pathdesc, 'no-param');
        }
    }
    //  /api/foo/{param}/action
    else if (thirdLastPartCanon === cmp
        || thirdLastPartCanon === ment.origcmp
        || thirdLastPartCanon === entname) {
        if (isParam(secondLastPart) && !isParam(lastPart)) {
            updateAction(methodName, lastPart, lastPartCanon, entdesc, pathdesc, 'ent-param-2nd-last');
        }
    }
    //  /api/foo/{param}/action/subaction
    else if (fourthLastPartCanon === cmp
        || fourthLastPartCanon === ment.origcmp
        || fourthLastPartCanon === entname) {
        if (isParam(thirdLastPart) && !isParam(secondLastPart) && !isParam(lastPart)) {
            const oldActionName = secondLastPart + '/' + lastPart;
            const actionName = secondLastPartCanon + '_' + lastPartCanon;
            updateAction(methodName, oldActionName, actionName, entdesc, pathdesc, 'ent-param-3rd-last');
        }
    }
    (0, utility_2.debugpath)(pathStr, methodName, 'FIND-ACTIONS', cmp, parts, pathdesc.action, pathdesc.why_action);
    // return pathdesc.action
}
function ResolveOperation(spec) {
    const mdesc = spec.node.val;
    const ment = mdesc.MethodEntity;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const parts = work.pathmap[pathStr].parts;
    const entname = mdesc.MethodEntity.entname;
    const entdesc = work.entmap[entname];
    const methodName = mdesc.method;
    const why_op = ment.why_op = [];
    let opname = METHOD_IDOP[methodName];
    let standard_opname = opname;
    if (null == opname) {
        why_op.push('no-op:' + methodName);
        return;
    }
    if ('load' === standard_opname) {
        const islist = isListResponse(mdesc, ment.pm, pathStr, why_op);
        opname = islist ? 'list' : opname;
    }
    else {
        why_op.push('not-load');
    }
    ment.opname = opname;
    ment.why_opname = why_op;
    // Tally access-token exchanges per entity. An entity whose ops are ALL
    // exchange is deactivated in BuildEntity: it is credential plumbing, not a
    // resource. Counted here rather than in BuildEntity because this is where
    // an op is known to be real — the `no-op` early return above has already
    // discarded the methods that never become operations.
    entdesc.total_ops = (entdesc.total_ops ?? 0) + 1;
    if (null != (0, utility_1.authExchangeOp)(mdesc, (0, utility_1.specSecuredByDefault)(spec.data.def))) {
        entdesc.authexchange_ops = (entdesc.authexchange_ops ?? 0) + 1;
    }
    const op = entdesc.path[pathStr].op;
    const opdef = {
        method: methodName,
        why_op: why_op.join(';')
    };
    if (null == op[opname]) {
        op[opname] = opdef;
    }
    // Conflicting methods for same operation
    // METHOD_CONSIDER_ORDER wins
    // Add operation using method name
    else {
        op[methodName.toLowerCase()] = opdef;
    }
    (0, utility_2.debugpath)(pathStr, methodName, 'ResolveOperation', standard_opname, opname, why_op, op);
}
function ResolveTransform(spec) {
    const mdesc = spec.node.val;
    const ment = mdesc.MethodEntity;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const entname = mdesc.MethodEntity.entname;
    const entdesc = work.entmap[entname];
    const pathdesc = entdesc.path[pathStr];
    const methodName = mdesc.method;
    const opname = ment.opname;
    const op = pathdesc.op;
    // Only specify transforms if they are not defaults
    const transform = {
        req: undefined,
        res: undefined,
    };
    const resprops = getResponseSchema(successResponse(mdesc.responses))?.properties;
    (0, utility_2.debugpath)(pathStr, methodName, 'TRANSFORM-RES', (0, struct_1.keysof)(resprops));
    if (resprops) {
        if ((0, utility_1.isEntityWrapperProp)(resprops[entdesc.origname])) {
            transform.res = '`body.' + entdesc.origname + '`';
        }
        else if ((0, utility_1.isEntityWrapperProp)(resprops[entdesc.name])) {
            transform.res = '`body.' + entdesc.name + '`';
        }
        else {
            // The wrapper is often named for the CARDINALITY rather than the
            // entity — `{item: {...}}` from a load, `{items: [...]}` from a list —
            // which the entity-name rules above cannot see. Left unwrapped, list()
            // hands back the envelope where the caller expects an array, and the
            // envelope key is mistaken for a field of the entity.
            const envelope = (0, utility_1.envelopeProp)(resprops, opname);
            if (null != envelope) {
                transform.res = '`body.' + envelope + '`';
            }
        }
    }
    const reqschema = getRequestBodySchema(mdesc.requestBody);
    const reqprops = reqschema?.properties;
    (0, utility_2.debugpath)(pathStr, methodName, 'TRANSFORM-REQ', (0, struct_1.keysof)(reqprops));
    if (reqschema) {
        if (null != reqprops?.[entdesc.origname]) {
            transform.req = { [entdesc.origname]: '`reqdata`' };
        }
        else if (null != reqprops?.[entdesc.name]) {
            transform.req = { [entdesc.name]: '`reqdata`' };
        }
        else {
            // A CLOSED body schema names every property the server will accept, so
            // the body is those properties — not the whole request payload. The
            // payload also carries the op's PATH params (`id` for
            // `PUT /item/{id}`), and a closed shape rejects the entire request over
            // that one extra key: every update came back 400 with `invalid-data`.
            const body = (0, utility_1.closedBodyTransform)(reqschema);
            if (null != body) {
                transform.req = body;
            }
        }
    }
    if (!(0, struct_1.isempty)(transform) && null != op[opname]) {
        op[opname].transform = transform;
    }
}
function BuildEntity(spec) {
    const entdesc = spec.node.val;
    const guide = spec.data.guide;
    guide.metrics.count.entity++;
    const entityMap = guide.entity;
    const path = {};
    const rename_param = (pathdesc) => {
        const out = {};
        (0, jostraca_1.each)(pathdesc.rename.param, (item) => {
            out[item.key$] = {
                target: item.val$,
                why_rename: pathdesc.why_rename.why_param[item.key$]
            };
        });
        return out;
    };
    (0, jostraca_1.each)(entdesc.path, (pathdesc, pathstr) => {
        const guidepath = {
            why_path: pathdesc.why_path,
            action: pathdesc.action,
            rename: {
                param: rename_param(pathdesc)
            },
            op: pathdesc.op
        };
        path[pathstr] = guidepath;
    });
    const guideEntity = {
        name: entdesc.name,
        orig: entdesc.origcmp,
        path,
    };
    if (0 < entdesc.authexchange_ops && entdesc.authexchange_ops === entdesc.total_ops) {
        guideEntity.active = false;
        guideEntity.why_inactive = 'auth-exchange';
    }
    entityMap[entdesc.name] = guideEntity;
}
function entityPathMatch_tpte(data, pm, mdesc, why) {
    const ment = mdesc.MethodEntity;
    const pathNameIndex = PATH_NAME_INDEX['t/p/t/'];
    why.push('path=t/p/t/');
    const origPathName = pm[pathNameIndex];
    let entname = (0, utility_2.canonize)(origPathName);
    let ecm = undefined;
    if (null != ment.cmp) {
        const parent = verbOnParent(data, pm, mdesc);
        if (null != parent) {
            entname = parent;
            ment.verb_on_parent = (0, struct_1.getelem)(pm, -1);
            why.push('verb-on-parent=' + parent);
        }
        else {
            ecm = entityCmpMatch(data, entname, mdesc, why);
            entname = ecm.name;
            why.push('has-cmp=' + ecm.orig);
        }
    }
    else if (probableEntityMethod(data, mdesc, pm, why)) {
        ecm = entityCmpMatch(data, entname, mdesc, why);
        if (ecm.cmpish) {
            entname = ecm.name;
            why.push('prob-ent=' + ecm.orig);
        }
        else if (endsWithCmp(data, pm)) {
            entname = (0, utility_2.canonize)((0, struct_1.getelem)(pm, -1));
            why.push('prob-ent-last=' + ecm.orig);
        }
        else if (0 < (0, utility_2.findPathsWithPrefix)(data, pm.path, { strict: true })) {
            entname = (0, utility_2.canonize)((0, struct_1.getelem)(pm, -1));
            why.push('prob-ent-prefix=' + ecm.orig);
        }
        else {
            entname = (0, utility_2.canonize)((0, struct_1.getelem)(pm, -3)) + '_' + entname;
            why.push('prob-ent-part');
        }
    }
    // Probably an entity action suffix
    else {
        why.push('prob-ent-act');
        entname = (0, utility_2.canonize)((0, struct_1.getelem)(pm, -3));
    }
    return entname;
}
function endsWithCmp(data, pm) {
    const last = (0, utility_2.canonize)((0, struct_1.getelem)(pm, -1));
    return isOrigCmp(data, last);
}
function verbOnParent(data, pm, mdesc) {
    const method = mdesc.method;
    if (READ_METHODS.includes(method)) {
        return null;
    }
    const ment = mdesc.MethodEntity;
    if (1 < (ment.rescmpoccur ?? ment.cmpoccur ?? 0)) {
        return null;
    }
    const lit = (0, jostraca_2.snakify)((0, struct_1.getelem)(pm, -1));
    if ('' === lit || (0, utility_2.depluralize)(lit) !== lit) {
        return null;
    }
    const verb = (0, utility_2.canonize)((0, struct_1.getelem)(pm, -1));
    const cmp = String(ment.rescmp ?? ment.cmp ?? '');
    if ('' === verb || cmp === verb || cmp.endsWith('_' + verb)) {
        return null;
    }
    const defpaths = data.def?.paths ?? {};
    // Paths compare with parameters normalised: the item path may spell its
    // key `{id}` where the verb path spells it `{thing_number}`.
    const normalize = (p) => p.replace(/\{[^}]+\}/g, '{}');
    const itemNorm = normalize(pm.path.replace(/\/[^/]+$/, ''));
    const prefix = normalize(pm.path) + '/';
    let itemPath = undefined;
    for (const p of Object.keys(defpaths)) {
        const pn = normalize(p);
        if (pn === itemNorm) {
            itemPath = p;
        }
        // A leaf: no path continues past the verb. Compared on a segment
        // boundary, so `/merge` is not "extended" by `/merge-async`.
        else if (pn.startsWith(prefix)) {
            return null;
        }
    }
    if (null == itemPath) {
        return null;
    }
    // Methods resolve in path order, so the item path's owners are already
    // known. The parent is the entity a READ of the item returns: a PUT on
    // the item answering with a one-off acknowledgement is named after that
    // and must not claim the verb. Fall back to any owner, then the literal.
    const owners = data.work.pathowner?.[itemPath] ?? {};
    const parent = owners.GET ?? owners.QUERY ??
        Object.values(owners).sort()[0];
    if (null != parent) {
        return parent;
    }
    return (0, utility_2.canonize)((0, struct_1.getelem)(pm, -3));
}
function isOrigCmp(data, name) {
    return null != data.guide.metrics.count.origcmprefs[name];
}
function entityOccursInPath(parts, entname) {
    return parts.some(p => p[0] !== '{' && (0, utility_2.canonize)(p.toLowerCase()) === entname);
}
function entityPathMatch_tpe(data, pm, mdesc, why) {
    const ment = mdesc.MethodEntity;
    const pathNameIndex = PATH_NAME_INDEX['t/p/'];
    why.push('path=t/p/');
    const origPathName = pm[pathNameIndex];
    let entname = (0, utility_2.canonize)(origPathName);
    if (null != ment.cmp || probableEntityMethod(data, mdesc, pm, why)) {
        let ecm = entityCmpMatch(data, entname, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
function entityPathMatch_pte(data, pm, mdesc, why) {
    const ment = mdesc.MethodEntity;
    const pathNameIndex = PATH_NAME_INDEX['p/t/'];
    why.push('path=p/t/');
    const origPathName = pm[pathNameIndex];
    let entname = (0, utility_2.canonize)(origPathName);
    if (null != ment.cmp || probableEntityMethod(data, mdesc, pm, why)) {
        let ecm = entityCmpMatch(data, entname, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
function entityPathMatch_te(data, pm, mdesc, why) {
    const ment = mdesc.MethodEntity;
    const pathNameIndex = PATH_NAME_INDEX['t/'];
    why.push('path=t/');
    const origPathName = pm[pathNameIndex];
    let entname = (0, utility_2.canonize)(origPathName);
    if (null != ment.cmp || probableEntityMethod(data, mdesc, pm, why)) {
        let ecm = entityCmpMatch(data, entname, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
function entityPathMatch_tpp(data, pm, mdesc, why) {
    const ment = mdesc.MethodEntity;
    const pathNameIndex = PATH_NAME_INDEX['t/p/p'];
    why.push('path=t/p/p');
    const origPathName = pm[pathNameIndex];
    let entname = (0, utility_2.canonize)(origPathName);
    if (null != ment.cmp || probableEntityMethod(data, mdesc, pm, why)) {
        let ecm = entityCmpMatch(data, entname, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
function getRequestBodySchema(requestBody) {
    return requestBody?.content?.['application/json']?.schema ??
        requestBody?.schema;
}
// The response an operation's result is read from.
function successResponse(responses) {
    return responses?.[200] ?? responses?.[201];
}
// The response schemas an operation answers with when it succeeds, in the
// order they are tried.
function successSchemas(responses) {
    return ['200', '201']
        .map((rescode) => getResponseSchema(responses?.[rescode]))
        .filter((schema) => null != schema);
}
function getResponseSchema(response) {
    return response?.content?.['application/json']?.schema ??
        response?.schema;
}
function inferEntityName(mdesc, parts, why) {
    // Try operationId: e.g. "getUser" -> "user", "listProducts" -> "product"
    if (mdesc.operationId) {
        const opid = (0, utility_2.canonize)(mdesc.operationId);
        if (opid.length >= 3) {
            why.push('infer-opid');
            return opid;
        }
    }
    // Try response schema title
    const response = mdesc.responses?.[200] ?? mdesc.responses?.[201];
    const resSchema = getResponseSchema(response);
    if (resSchema?.title) {
        const title = (0, utility_2.canonize)(resSchema.title);
        if (title.length >= 3) {
            why.push('infer-res-title');
            return title;
        }
    }
    // Try last non-param path segment
    for (let i = parts.length - 1; i >= 0; i--) {
        if (!isParam(parts[i])) {
            const seg = (0, utility_2.canonize)(parts[i]);
            if (seg.length >= 3) {
                why.push('infer-path-seg');
                return seg;
            }
        }
    }
    return null;
}
function probableEntityMethod(data, mdesc, pm, why) {
    const request = mdesc.requestBody;
    const reqSchema = getRequestBodySchema(request);
    const response = mdesc.responses?.['201'] || mdesc.responses?.['200'];
    const resSchema = getResponseSchema(response);
    const noResponse = null == resSchema && null != mdesc.responses?.['204'];
    let prob_why = '';
    let probent = false;
    if (noResponse) {
        // No response at all means not an action, thus probably an entity.
        prob_why = 'nores';
        probent = true;
    }
    else if (null != reqSchema) {
        if ('POST' === mdesc.method
            && !pm.expr.endsWith('/p/')
            // A real entity would probably occur in at least one other t/p path
            // otherwise this is probably an action
            && (1 < (0, utility_2.sortedKeys)(data.def.paths).filter(path => path.includes('/' + pm[pm.length - 1] + '/')).length)) {
            prob_why = 'post';
            probent = true;
        }
        else if (('PUT' === mdesc.method || 'PATCH' === mdesc.method)
            && pm.expr.endsWith('/p/')) {
            prob_why = 'putish';
            probent = true;
        }
        // QUERY (RFC 10008) carries a filter body but is a safe read, so — like
        // GET — it implies an entity, not an action.
        else if ('QUERY' === mdesc.method) {
            prob_why = 'query';
            probent = true;
        }
    }
    else if ('GET' === mdesc.method) {
        prob_why = 'get';
        probent = true;
    }
    const rescodes = (0, utility_2.sortedKeys)(mdesc.responses ?? {});
    (0, utility_2.debugpath)(mdesc.path, mdesc.method, 'PROBABLE-ENTITY-RESPONSE', { mdesc, responses: rescodes, probent, prob_why });
    why.push('entres=' + probent + '/' + rescodes + ('' === prob_why ? '' : '/' + prob_why));
    return probent;
}
function entityCmpMatch(data, entname, mdesc, why) {
    const ment = mdesc.MethodEntity;
    let out = {
        name: entname,
        orig: ment.origcmp ?? entname,
        cmpish: false,
        pathish: true,
    };
    const cmpInfrequent = (ment.method_rate < IS_ENTCMP_METHOD_RATE
        || ment.path_rate < IS_ENTCMP_PATH_RATE);
    const cmpShared = true === data.work.sharing.yields[ment.origcmpref + ' ' + mdesc.method + ' ' + mdesc.path];
    if (null != ment.cmp
        && entname != ment.cmp
        && !ment.cmp.startsWith(entname)) {
        if (cmpInfrequent && cmpShared) {
            why.push('cmp-shared');
        }
        if (cmpInfrequent && !cmpShared) {
            why.push('cmp-primary');
            out.name = ment.cmp;
            out.orig = ment.origcmp;
            out.cmpish = true;
            out.pathish = false;
            why.push('cmp-infreq');
        }
        else if (cmpOccursInPath(data, ment.cmp)) {
            why.push('cmp-path');
            out.name = ment.cmp;
            out.orig = ment.origcmp;
            out.cmpish = true;
            out.pathish = false;
            why.push('cmp-inpath');
        }
        else {
            why.push('path-over-cmp');
        }
    }
    else if ('DELETE' === mdesc.method
        && null == ment.cmp) {
        let cmps = findcmps(data, mdesc.path, ['responses'], { uniq: true });
        if (1 === cmps.length) {
            out.name = cmps[0].cmp;
            out.orig = cmps[0].origcmp;
            out.cmpish = true;
            out.pathish = false;
            why.push('cmp-found-delete');
        }
        else {
            why.push('path-primary-delete');
        }
    }
    else {
        why.push('path-primary');
    }
    (0, utility_2.debugpath)(mdesc.path, mdesc.method, 'ENTITY-CMP-NAME', mdesc.path, mdesc.method, entname + '->', out, why, ment, IS_ENTCMP_METHOD_RATE, IS_ENTCMP_PATH_RATE);
    return out;
}
function cmpOccursInPath(data, cmpname) {
    if (null == data.work.potentialCmpsFromPaths) {
        data.work.potentialCmpsFromPaths = {};
        (0, jostraca_1.each)(data.def.paths, (_pathdef, pathstr) => {
            const parts = data.work.pathmap[pathstr].parts;
            parts
                .filter(p => !p.startsWith('{'))
                .map(p => data.work.potentialCmpsFromPaths[(0, utility_2.canonize)(p)] = true);
        });
    }
    return null != data.work.potentialCmpsFromPaths[cmpname];
}
function matchEntityPath(parts) {
    for (const shape of ENTITY_PATH_SHAPES) {
        const pm = (0, utility_2.pathMatch)(parts, shape);
        if (null != pm) {
            return pm;
        }
    }
    return null;
}
// The resource a method's path names by itself, as its shape names it. A
// write to a singular trailing literal is a verb on another resource, and
// names none.
function pathResource(parts, method) {
    const pm = matchEntityPath(parts);
    if (null == pm) {
        return null;
    }
    const last = parts[parts.length - 1];
    if (!READ_METHODS.includes(method) && !isParam(last)) {
        const lit = (0, jostraca_2.snakify)(last);
        if ('' !== lit && (0, utility_2.depluralize)(lit) === lit) {
            return null;
        }
    }
    return (0, utility_2.canonize)(pm[PATH_NAME_INDEX[pm.expr]]);
}
// The routes that keep their own path's name for the component they answer
// with, each keyed `cmp METHOD path`: those of a component that several
// resources share, where a record (one that declares an `id`) is never shared.
function sharedRoutes(routes, records) {
    const bycmp = {};
    for (const route of routes) {
        const parts = route.path.split('/').filter((p) => '' !== p);
        const resource = pathResource(parts, route.method);
        if (null != resource && !records.includes(route.cmp)) {
            (bycmp[route.cmp] = bycmp[route.cmp] ?? []).push({ ...route, parts, resource });
        }
    }
    const taking = [];
    for (const cmp of Object.keys(bycmp).sort()) {
        const names = new Set(bycmp[cmp].map((entry) => entry.resource));
        const counted = bycmp[cmp].filter((entry) => !isSharingView(entry, names));
        const group = aliasGroups(counted);
        if (new Set(counted.map((entry) => group[entry.resource])).size < 2) {
            continue;
        }
        const members = {};
        for (const name of new Set(counted.map((entry) => entry.resource))) {
            members[group[name]] = (members[group[name]] ?? 0) + 1;
        }
        taking.push(...counted.filter((entry) => 1 === members[group[entry.resource]]));
    }
    const cmps = {};
    const routesOf = {};
    for (const entry of taking) {
        (cmps[entry.resource] = cmps[entry.resource] ?? new Set()).add(entry.cmp);
        const key = entry.resource + ' ' + entry.op + ' ' + paramNames(entry.parts);
        (routesOf[key] = routesOf[key] ?? new Set()).add(entry.path);
    }
    const blocked = new Set(Object.keys(cmps).filter((name) => 1 < cmps[name].size));
    for (const key of Object.keys(routesOf)) {
        if (1 < routesOf[key].size) {
            blocked.add(key.split(' ')[0]);
        }
    }
    return taking
        .filter((entry) => !blocked.has(entry.resource))
        .map((entry) => entry.cmp + ' ' + entry.method + ' ' + entry.path)
        .sort();
}
// A route beneath a segment that names another of the component's resources
// is a view of that resource, such as `/builds/latest` of `/builds`.
function isSharingView(entry, names) {
    for (let i = 1; i < entry.parts.length; i++) {
        const name = pathResource(entry.parts.slice(0, i), 'GET');
        if (null != name && name !== entry.resource && names.has(name)) {
            return true;
        }
    }
    return false;
}
// Item routes under the same parent keyed by the same parameters address the
// same records, so the resources they name are one: each maps to its group.
function aliasGroups(entries) {
    const group = {};
    const find = (name) => group[name] === name ? name : find(group[name]);
    for (const entry of entries) {
        group[entry.resource] = entry.resource;
    }
    const first = {};
    for (const entry of entries) {
        if (!isParam(entry.parts[entry.parts.length - 1])) {
            continue;
        }
        const pm = matchEntityPath(entry.parts);
        const parent = entry.parts.slice(0, pm.index + PATH_NAME_INDEX[pm.expr])
            .map((p) => isParam(p) ? '{}' : p).join('/');
        const key = parent + ' ' + paramNames(entry.parts);
        const other = first[key] = first[key] ?? entry.resource;
        const [a, b] = [find(other), find(entry.resource)].sort();
        group[b] = a;
    }
    for (const name of Object.keys(group)) {
        group[name] = find(name);
    }
    return group;
}
function paramNames(parts) {
    return parts.filter(isParam).sort().join(',');
}
// The schema a local `$ref` pointer names in the definition.
function refSchema(def, xref) {
    if (!xref.startsWith('#/')) {
        return undefined;
    }
    let node = def;
    for (const seg of xref.slice(2).split('/')) {
        const key = seg.replace(/~1/g, '/').replace(/~0/g, '~');
        node = null != node && 'object' === typeof node && Object.prototype.hasOwnProperty.call(node, key)
            ? node[key] : undefined;
    }
    return node;
}
function declaresId(schema) {
    return null != schema && 'object' === typeof schema && null != resolveSchemaProperties(schema).id;
}
// The operation ResolveOperation will assign, needed before the entity is
// named: whether a response unwraps as an envelope depends on it.
function methodOpname(mdesc, pm, why) {
    const opname = METHOD_IDOP[mdesc.method];
    return 'load' === opname && isListResponse(mdesc, pm, mdesc.path, why) ? 'list' : opname;
}
function isListResponse(mdesc, pm, pathStr, why) {
    let islist = false;
    let schema;
    const endParamAnchored = !!(pm && pm.expr.endsWith('p/'));
    const endParamBare = !!(pm && !endParamAnchored && pm.expr.endsWith('p'));
    if (endParamAnchored) {
        why.push('end-param');
    }
    else {
        schema = getResponseSchema(successResponse(mdesc.responses));
        if (null == schema) {
            why.push('no-schema');
        }
        else {
            if (schema.type === 'array') {
                why.push('array');
                islist = true;
            }
            if (!islist && !endParamBare) {
                const properties = resolveSchemaProperties(schema);
                (0, jostraca_1.each)(properties, (prop) => {
                    if (prop.type === 'array') {
                        why.push('array-prop:' + prop.key$);
                        islist = true;
                    }
                });
            }
            if (!islist) {
                why.push(endParamBare ? 'end-param' : 'not-list');
            }
        }
    }
    (0, utility_2.debugpath)(pathStr, mdesc.method, 'IS-LIST', islist, why, schema);
    return islist;
}
function resolveSchemaProperties(schema) {
    let properties = {};
    // This is definitely heuristic!
    if (schema.allOf) {
        for (let i = schema.allOf.length - 1; -1 < i; --i) {
            properties = (0, struct_1.merge)([properties, schema.allOf[i].properties || {}]);
        }
    }
    if (schema.properties) {
        properties = (0, struct_1.merge)([properties, schema.properties]);
    }
    return properties;
}
function updateAction(methodName, oldParam, actionName, entityDesc, pathdesc, why) {
    if (
    // Entity not already encoding action.
    !entityDesc.name.endsWith((0, utility_2.canonize)(actionName))
        && null == pathdesc.action[actionName]) {
        pathdesc.action[actionName] = {
            // kind: '`$BOOLEAN`',
            why_action: ['ent', `${entityDesc.name}`, `${why}`, `${oldParam}`, `${methodName}`]
        };
    }
}
function updateParamRename(ctx, data, path, method, paramRenameCapture, oldParamName, newParamName, why) {
    // A name that cannot be an identifier is not an improvement on the one the
    // specification gave. See docs/design/derived-names.md
    if (!/^[A-Za-z_]/.test(newParamName)) {
        ctx.log.debug({
            point: 'param-rename-skip',
            path,
            param: oldParamName,
            rejected: newParamName,
            note: 'derived parameter name is not an identifier, keeping the' +
                " specification's name"
        });
        return;
    }
    // The clash is with what the path's OTHER parameters end up called: their
    // rename if they have one, their canonical name if not.
    const otherParams = (path.match(/\{([^}]+)\}/g) || [])
        .map((seg) => seg.slice(1, -1))
        .filter((name) => name !== oldParamName);
    const takenBy = Object.keys(paramRenameCapture.rename)
        .find((other) => other !== oldParamName &&
        paramRenameCapture.rename[other] === newParamName) ??
        otherParams
            .find((other) => null == paramRenameCapture.rename[other] &&
            (0, utility_2.canonize)(other) === newParamName);
    if (null != takenBy) {
        ctx.log.debug({
            point: 'param-rename-collision',
            path,
            param: oldParamName,
            rejected: newParamName,
            takenBy,
            note: 'another parameter of this path already renames to ' +
                newParamName + ", keeping the specification's name"
        });
        return;
    }
    const existingNewName = paramRenameCapture.rename[oldParamName];
    const existingWhy = paramRenameCapture.why[oldParamName];
    (0, utility_2.debugpath)(path, method, 'UPDATE-PARAM-RENAME', path, oldParamName, newParamName, existingNewName);
    if (null == existingNewName) {
        paramRenameCapture.rename[oldParamName] = newParamName;
        if (!existingWhy.includes(why)) {
            existingWhy.push(why);
        }
    }
    else if (newParamName == existingNewName) {
    }
    else {
        ctx.warn({
            paramRenameCapture, oldParamName, newParamName, why,
            note: 'Param rename mismatch: existing: ' +
                oldParamName + ' -> ' + existingNewName + ' (why: ' + existingNewName + ') ' +
                ' proposed: ' + newParamName + ' (why: ' + why + ') ' +
                'for path: ' + path + '. method: ' + method
        });
    }
}
function isParam(partStr) {
    return '{' === partStr[0] && '}' === partStr[partStr.length - 1];
}
function findcmps(data, pathStr, underprops, opts) {
    const cmplist = [];
    const cmpset = new Set();
    (0, jostraca_1.each)(data.def.paths[pathStr])
        .map((md) => {
        underprops.map((up) => {
            let found = (0, utility_2.find)(md[up], 'x-ref');
            found.map((xref) => {
                let m = xref.val.match(/\/(components\/schemas|definitions)\/(.+)$/);
                if (m) {
                    cmplist.push(m[2]);
                    cmpset.add(m[2]);
                }
            });
        });
    });
    return (opts?.uniq ? Array.from(cmpset) : cmplist).map(n => ({ cmp: (0, utility_2.canonizeCmpName)(n), origcmp: n }));
}
function makeMethodEntityDesc(desc) {
    let ment = {
        cmp: desc.cmp ?? null,
        origcmp: desc.origcmp ?? null,
        origcmpref: desc.origcmpref ?? null,
        ref: desc.ref ?? '',
        why_cmp: desc.why_cmp ?? [],
        cmpoccur: desc.cmpoccur ?? 0,
        path_rate: desc.path_rate ?? 0,
        method_rate: desc.method_rate ?? 0,
        entname: desc.entname ?? '',
        why_op: desc.why_op ?? [],
        rename: desc.rename ?? { param: {} },
        why_rename: desc.why_rename ?? { why_param: {} },
        rename_orig: desc.rename_orig ?? [],
        opname: desc.opname ?? '',
        why_opname: desc.why_opname ?? [],
    };
    return ment;
}
function findPotentialSchemaRefs(pathStr, methodName, responses, envelope, why) {
    const xrefs = [];
    for (const schema of successSchemas(responses)) {
        if (null != schema['x-ref']) {
            // An envelope component names its wrapping, not the entity: the
            // component it carries takes its place.
            const itemref = envelope[schema['x-ref']];
            if ('' !== itemref) {
                why.push('envelope=' + cmpRefName(schema['x-ref']));
                xrefs.push(itemref);
            }
            else {
                xrefs.push(schema['x-ref']);
            }
        }
        else if ('array' === schema.type && null != schema.items?.['x-ref']) {
            xrefs.push(schema.items?.['x-ref']);
        }
    }
    (0, utility_2.debugpath)(pathStr, methodName, 'POTENTIAL-SCHEMA-REFS', xrefs);
    return xrefs;
}
function cmpRefName(xref) {
    const m = xref.match(/\/(components\/schemas|definitions)\/(.+)$/);
    return null == m ? xref : (0, utility_2.canonizeCmpName)(m[2]);
}
function hasMethod(def, pathStr, methodName) {
    const pathDef = def?.paths?.[pathStr];
    const found = (null != pathDef
        && (null != pathDef[methodName.toLowerCase()]
            || null != pathDef[methodName.toUpperCase()]));
    return found;
}
//# sourceMappingURL=heuristic01.js.map