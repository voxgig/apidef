"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.heuristic01 = heuristic01;
const ordu_1 = require("ordu");
const jostraca_1 = require("jostraca");
const struct_1 = require("@voxgig/struct");
const utility_1 = require("../utility");
// Log non - fatal wierdness.
const dlog = (0, utility_1.getdlog)('apidef', __filename);
// Schema components that occur less than this rate(over total method count) qualify
// as unique entities, not shared schemas
const IS_ENTCMP_METHOD_RATE = 0.21;
const IS_ENTCMP_PATH_RATE = 0.41;
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
    // console.log('WORK', result.data.work)
    // console.log('GUIDE')
    // console.dir(guide, { depth: null })
    // TODO: move to Ordu
    // warnOnError('reviewEntityDescs', ctx.warn, () => reviewEntityDescs(ctx, result))
    return guide;
}
function ShowNode(spec) {
    console.log('NODE', spec.node.key, spec.node.val);
}
function Prepare(spec) {
    const guide = {
        control: {},
        entity: {},
        metrics: {
            count: {
                path: 0,
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
    // const pathstr = spec.node.key
    const pathdef = spec.node.val;
    metrics.count.path++;
    metrics.count.method += ((pathdef.get ? 1 : 0) +
        (pathdef.post ? 1 : 0) +
        (pathdef.put ? 1 : 0) +
        (pathdef.patch ? 1 : 0) +
        (pathdef.delete ? 1 : 0) +
        (pathdef.head ? 1 : 0) +
        (pathdef.options ? 1 : 0));
}
// Expects to run over paths.<method>
function MeasureMethod(spec) {
    const guide = spec.data.guide;
    const metrics = guide.metrics;
    // const methodstr = spec.node.key
    const methoddef = spec.node.val;
    const pathtags = methoddef.tags;
    if (Array.isArray(pathtags)) {
        for (let tag of pathtags) {
            if ('string' === typeof tag && 0 < tag.length) {
                if (!metrics.found.tag[tag]) {
                    metrics.count.tag++;
                    metrics.found.tag[tag] = {
                        name: tag,
                        canon: (0, utility_1.canonize)(tag),
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
    const out = (0, utility_1.find)(spec.ctx.def, 'x-ref')
        .filter(xref => xref.val.match(/\/(components\/schemas|definitions)\//));
    // console.log('selectCmpXrefs', out)
    return out;
}
function MeasureRef(spec) {
    const guide = spec.data.guide;
    const metrics = guide.metrics;
    let m = spec.node.val.val.match(/\/(components\/schemas|definitions)\/(.+)$/);
    if (m) {
        const name = (0, utility_1.canonize)(m[2]);
        if (null == metrics.count.origcmprefs[name]) {
            metrics.count.cmp++;
            metrics.count.origcmprefs[name] = 0;
        }
        metrics.count.origcmprefs[name]++;
        if (null == metrics.found.cmp[name]) {
            metrics.found.cmp[name] = { orig: m[2] };
        }
    }
}
function selectAllMethods(_source, spec) {
    const ctx = spec.ctx;
    // const paths = ctx.def.paths
    let caught = (0, utility_1.capture)(ctx.def, {
        paths: ['`$SELECT`', /.*/,
            ['`$SELECT`', /^get|post|put|patch|delete$/i,
                ['`$APPEND`', 'methods', {
                        path: '`select$=key.paths`',
                        method: { '`$UPPER`': '`$KEY`' },
                        summary: '`.summary`',
                        tags: '`.tags`',
                        parameters: '`.parameters`',
                        responses: '`.responses`',
                        requestBody: '`.requestBody`'
                    }]
            ]
        ]
    });
    // TODO: capture should return these empty objects
    caught = caught ?? {};
    caught.methods = caught.methods ?? [];
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
    // console.log(caught.methods.map((n: any) => n.path + ' ' + n.method))
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
    let origxrefs = findPotentialSchemaRefs(pathStr, methodName, responses).map(val => ({
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
            const cmp = (0, utility_1.canonize)(m[1]);
            xref.cmp = cmp;
            xref.origcmp = m[1];
            xref.origcmpref = cmp;
        }
        return xref;
    })
        .filter(xref => null != xref.cmp)
        // TODO: identify non - ent schemas
        .filter(xref => !xref.val.includes('Meta'));
    let cleanxrefs = cmpxrefs
        .map(xref => {
        // Redundancy in cmp name, remove request,response suffix
        // const lastPart = getelem(pathStr.split('/'), -1)
        const lastPart = (0, struct_1.getelem)(parts, -1);
        const lastPartLower = lastPart.toLowerCase();
        const lastPartCanon = (0, utility_1.canonize)(lastPart);
        if ('' !== lastPartCanon
            && (xref.cmp === lastPartCanon + '_response'
                || xref.cmp === lastPartCanon + '_request'
                || xref.origcmp.toLowerCase() === lastPartLower + 'response'
                || xref.origcmp.toLowerCase() === lastPartLower + 'request')) {
            let cparts = xref.cmp.split('_');
            // rec-canonize to deal with plural before removed suffix
            xref.cmp = (0, utility_1.canonize)(cparts.slice(0, cparts.length - 1).join('_'));
        }
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
        // console.log('RCN', xref.cmp, cmprefs, mcount, method_rate, IS_ENTCMP_METHOD_RATE, method_rate < IS_ENTCMP_METHOD_RATE)
        const infrequent = method_rate < IS_ENTCMP_METHOD_RATE
            || path_rate < IS_ENTCMP_PATH_RATE;
        if (!infrequent) {
            (0, utility_1.debugpath)(pathStr, methodName, 'CMP-INFREQ', xref.val, 'method:', method_rate, IS_ENTCMP_METHOD_RATE, 'path:', path_rate, IS_ENTCMP_PATH_RATE);
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
    (0, utility_1.debugpath)(pathStr, methodName, 'TAGS', tags, goodtags, fcmp, methodDef, metrics.found);
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
                out = makeMethodEntityDesc({
                    ref: 'tag',
                    cmp: tagdesc.canon,
                    origcmp: ftag,
                    why_cmp,
                    entname: tagdesc.canon,
                });
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
    (0, utility_1.debugpath)(pathStr, methodName, 'CMP-NAME', out, origxrefs, cleanxrefs, goodxrefs, goodtags);
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
    let pm = undefined;
    if (pm = (0, utility_1.pathMatch)(parts, 't/p/t/')) {
        entname = entityPathMatch_tpte(data, pm, mdesc, why_path);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 't/p/')) {
        entname = entityPathMatch_tpe(data, pm, mdesc, why_path);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 'p/t/')) {
        entname = entityPathMatch_pte(data, pm, mdesc, why_path);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 't/')) {
        entname = entityPathMatch_te(data, pm, mdesc, why_path);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 't/p/p')) {
        entname = entityPathMatch_tpp(data, pm, mdesc, why_path);
    }
    else {
        work.entity.count.unresolved++;
        entname = 'entity' + work.entity.count.unresolved;
    }
    const entdesc = work.entmap[entname] = work.entmap[entname] ?? {
        name: entname,
        id: 'N' + ('' + Math.random()).substring(2, 10),
        op: {},
        why_path,
        ...ment
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
    (0, utility_1.debugpath)(pathStr, methodName, 'RESOLVE-ENTITY-NAME', (0, utility_1.formatJSONIC)({ entdesc, ment }, { hsepd: 0, $: true, color: true }));
}
function RenameParams(spec) {
    const ctx = spec.ctx;
    const data = spec.data;
    const guide = data.guide;
    const metrics = guide.metrics;
    const mdesc = spec.node.val;
    const ment = mdesc.MethodEntity;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const entname = mdesc.MethodEntity.entname;
    const entdesc = work.entmap[entname];
    const pathdesc = spec.data.work.pathmap[pathStr];
    const methodName = mdesc.method;
    // Rewrite path parameters that are identifiers to follow the rules:
    // 0. Parameters named [a-z]?id are considered identifiers
    // 1. last identifier is always {id} as this is the primary entity
    // 2. internal identifiers are formatted as {name_id} where name is the parent entity name
    // Example: /api/bar/{id}/zed/{zid}/foo/{fid} ->
    //          /api/bar/{bar_id}/zed/{zed_id}/foo/{id}
    // id needs to be t/p/
    const multParamEndMatch = (0, utility_1.pathMatch)(mdesc.path, 'p/p/');
    if (multParamEndMatch) {
        return;
    }
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
    const cmpname = mdesc.cmp;
    const considerCmp = null != cmpname &&
        0 < metrics.count.uniqschema &&
        mdesc.method_rate < IS_ENTCMP_METHOD_RATE;
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
            const parentName = hasParent ? (0, utility_1.canonize)(parts[partI - 1]) : null;
            const not_exact_id = 'id' !== oldParam;
            const probably_an_id = oldParam.endsWith('id') || oldParam.endsWith('Id');
            (0, utility_1.debugpath)(pathStr, mdesc.method, 'RENAME-PARAMS', parts, partI, partStr, {
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
                    && ((parentName !== entdesc.name
                        && entdesc.name.startsWith(parentName + '_'))
                        // || parentName === cmp.name
                        || parentName === cmpname)) {
                    // let newParamName = 'id'
                    updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'action-parent:' + entdesc.name);
                    why.push('action');
                    updateAction(methodName, oldParam, parts[partI + 1], entdesc, pathDesc, 'action-not-parent');
                }
                else if (hasParent && parentName === cmpname) {
                    updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'id-parent-cmp');
                    why.push('id-parent-cmp');
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
            // At end, but not called id.
            // .../ent/{not-id}
            else if (lastPart
                && not_exact_id
                && (!hasParent
                    || (parentName === entdesc.name
                        || entdesc.name.endsWith('_' + parentName)))
                && (!considerCmp || cmpname === entdesc.name)) {
                updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'end-id;' + methodName + ';parent=' + hasParent + '/' + parentName +
                    ';cmp=' + considerCmp + (null == cmpname ? '' : '/' + cmpname));
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
                        && (0, utility_1.canonize)(partStr) === entdesc.name) {
                        updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'end-action');
                        why.push('end-action');
                        updateAction(methodName, oldParam, parts[partI + 1], entdesc, pathDesc, 'end-action');
                    }
                    else {
                        why.push('not-end-action');
                    }
                }
                // Primary ent id not at end!
                else if (hasParent
                    && parentName === cmpname) {
                    updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'id-not-last');
                    why.push('id-not-last');
                    // paramRenames[oldParam] = 'id'
                    // paramRenamesWhy[oldParam].push('id-not-last')
                }
                // Not primary ent.
                else {
                    why.push('default');
                    let newParamName = parentName + '_id';
                    if (newParamName != oldParam) {
                        updateParamRename(ctx, data, pathStr, methodName, paramRenameCapture, oldParam, newParamName, 'not-primary');
                        why.push('not-primary');
                        // paramRenames[oldParam] = newParamName
                        // paramRenamesWhy[oldParam].push('not-primary')
                    }
                }
            }
            why.push('done');
            if (paramRenameCapture.rename[oldParam] === oldParam) {
                why.push('delete-dup');
                delete paramRenameCapture.rename[oldParam];
                delete paramRenameCapture.why[oldParam];
            }
            // TODO: these need to done via an API
            (0, utility_1.debugpath)(pathStr, methodName, 'RENAME-PARAM', {
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
                considerCmp,
                cmp: mdesc.cmp,
                cmpname,
                paramRenameCapture,
                entdesc
            });
        }
    }
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
    // const pathdesc = spec.data.work.pathmap[pathStr]
    const pathdesc = entdesc.path[pathStr];
    const methodName = mdesc.method;
    pathdesc.action = (pathdesc.action ?? {});
    pathdesc.why_action = (pathdesc.why_action ?? {});
    const parts = spec.data.work.pathmap[pathStr].parts;
    const fourthLastPart = parts[parts.length - 4];
    const fourthLastPartCanon = (0, utility_1.canonize)(fourthLastPart);
    const thirdLastPart = parts[parts.length - 3];
    const thirdLastPartCanon = (0, utility_1.canonize)(thirdLastPart);
    const secondLastPart = parts[parts.length - 2];
    const secondLastPartCanon = (0, utility_1.canonize)(secondLastPart);
    const lastPart = parts[parts.length - 1];
    const lastPartCanon = (0, utility_1.canonize)(lastPart);
    const cmp = ment.cmp;
    // /api/foo/bar where foo is the entity and bar is the action, no id param
    if (secondLastPartCanon === cmp
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
    (0, utility_1.debugpath)(pathStr, methodName, 'FIND-ACTIONS', cmp, parts, pathdesc.action, pathdesc.why_action);
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
    // const pathdesc = spec.data.work.pathmap[pathStr]
    const methodName = mdesc.method;
    const why = ment.why_op = [];
    let opname = METHOD_IDOP[methodName];
    if (null == opname) {
        why.push('no-op:' + methodName);
        return;
    }
    // const has_id_param = ment.rename_orig.includes('id') ||
    //  Object.values(ment.rename).includes('id')
    // console.log(pathStr, ment.pm.expr)
    // Sometimes POST is used to update, not create. Attempt to identify this.
    const id_param_offset = ment.pm.expr.endsWith('/t/') ? 1 : 0;
    const has_end_id_param = entname == (0, utility_1.canonize)(parts[parts.length - 2 - id_param_offset])
        && parts[parts.length - 1 - id_param_offset].toLowerCase().endsWith('id}');
    // console.log('PM', work.pathmap)
    // console.log('ROa', pathStr, methodName, opname, entname,
    //   (entname == canonize(parts[parts.length - 2])),
    //   (parts[parts.length - 1]?.toLowerCase().endsWith('id}')),
    //   parts, has_end_id_param)
    if ('load' === opname) {
        const islist = isListResponse(mdesc, pathStr, why);
        opname = islist ? 'list' : opname;
    }
    // else if ('create' === opname && has_id_param && !hasMethod(spec.data.def, pathStr, 'PUT')) {
    else if ('create' === opname
        && has_end_id_param) {
        opname = 'update';
        why.push('id-present');
    }
    else {
        why.push('not-load');
    }
    // why.push('ent=' + entdesc.name)
    ment.opname = opname;
    ment.why_opname = why;
    const op = entdesc.path[pathStr].op;
    op[opname] = {
        method: methodName,
        why_op: why.join(';')
    };
}
function ResolveTransform(spec) {
    const mdesc = spec.node.val;
    const ment = mdesc.MethodEntity;
    const pathStr = mdesc.path;
    const work = spec.data.work;
    const entname = mdesc.MethodEntity.entname;
    const entdesc = work.entmap[entname];
    // const pathdesc = spec.data.work.pathmap[pathStr]
    const pathdesc = entdesc.path[pathStr];
    const methodName = mdesc.method;
    const opname = ment.opname;
    const op = pathdesc.op;
    const transform = {
        req: undefined,
        res: undefined,
    };
    const resokdef = mdesc.responses?.[200] || mdesc.responses?.[201];
    const resprops = getResponseSchema(resokdef)?.properties;
    (0, utility_1.debugpath)(pathStr, methodName, 'TRANSFORM-RES', (0, struct_1.keysof)(resprops));
    if (resprops) {
        if (resprops[entdesc.origname]) {
            transform.res = '`body.' + entdesc.origname + '`';
        }
        else if (resprops[entdesc.name]) {
            transform.res = '`body.' + entdesc.name + '`';
        }
    }
    const reqprops = getRequestBodySchema(mdesc.requestBody);
    (0, utility_1.debugpath)(pathStr, methodName, 'TRANSFORM-REQ', (0, struct_1.keysof)(reqprops));
    if (reqprops) {
        if (reqprops[entdesc.origname]) {
            transform.req = { [entdesc.origname]: '`reqdata`' };
        }
        else if (reqprops[entdesc.origname]) {
            transform.req = { [entdesc.origname]: '`reqdata`' };
        }
    }
    if (!(0, struct_1.isempty)(transform)) {
        op[opname].transform = transform;
    }
}
function BuildEntity(spec) {
    const entdesc = spec.node.val;
    // console.log('BUILD-ENTITY')
    // console.dir(entdesc, { depth: null })
    const guide = spec.data.guide;
    guide.metrics.count.entity++;
    const entityMap = guide.entity;
    const path = {};
    const rename_param = (pathdesc) => {
        // console.log('RENAME-PATHDESC', pathdesc)
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
    entityMap[entdesc.name] = {
        name: entdesc.name,
        orig: entdesc.origcmp,
        path,
    };
}
const METHOD_IDOP = {
    GET: 'load',
    POST: 'create',
    PUT: 'update',
    DELETE: 'remove',
    PATCH: 'patch',
    HEAD: 'head',
    OPTIONS: 'OPTIONS',
};
const METHOD_CONSIDER_ORDER = {
    'GET': 100,
    'POST': 200,
    'PUT': 300,
    'PATCH': 400,
    'DELETE': 500,
    'HEAD': 600,
    'OPTIONS': 700,
};
function entityPathMatch_tpte(data, pm, mdesc, why) {
    const ment = mdesc.MethodEntity;
    const pathNameIndex = 2;
    why.push('path=t/p/t/');
    const origPathName = pm[pathNameIndex];
    let entname = (0, utility_1.canonize)(origPathName);
    let ecm = undefined;
    if (null != ment.cmp) {
        ecm = entityCmpMatch(data, entname, mdesc, why);
        entname = ecm.name;
        why.push('has-cmp=' + ecm.orig);
    }
    else if (probableEntityMethod(data, ment, pm, why)) {
        ecm = entityCmpMatch(data, entname, mdesc, why);
        if (ecm.cmpish) {
            entname = ecm.name;
            why.push('prob-ent=' + ecm.orig);
        }
        else if (endsWithCmp(data, pm)) {
            entname = (0, utility_1.canonize)((0, struct_1.getelem)(pm, -1));
            why.push('prob-ent-last=' + ecm.orig);
        }
        else if (0 < (0, utility_1.findPathsWithPrefix)(data, pm.path, { strict: true })) {
            entname = (0, utility_1.canonize)((0, struct_1.getelem)(pm, -1));
            why.push('prob-ent-prefix=' + ecm.orig);
        }
        else {
            entname = (0, utility_1.canonize)((0, struct_1.getelem)(pm, -3)) + '_' + entname;
            why.push('prob-ent-part');
        }
    }
    else {
        // console.log('PART-ENT', why, pm, mdesc)
        why.push('part-ent');
        // Probably a special suffix operation,
        // so make the entity name sufficiently unique
        entname = (0, utility_1.canonize)((0, struct_1.getelem)(pm, -3)) + '_' + entname;
    }
    return entname;
}
function endsWithCmp(data, pm) {
    const last = (0, utility_1.canonize)((0, struct_1.getelem)(pm, -1));
    return isOrigCmp(data, last);
}
function isOrigCmp(data, name) {
    return null != data.metrics.count.origcmprefs[name];
}
function entityOccursInPath(parts, entname) {
    let partsLower = parts.map(p => p.toLowerCase());
    partsLower = partsLower.filter(p => '{' !== p[0]).map(p => (0, utility_1.canonize)(p));
    return !partsLower.reduce((a, p) => (a && p !== entname), true);
}
function entityPathMatch_tpe(data, pm, mdesc, why) {
    const ment = mdesc.MethodEntity;
    const pathNameIndex = 0;
    why.push('path=t/p/');
    const origPathName = pm[pathNameIndex];
    // let entname = fixEntName(origPathName)
    let entname = (0, utility_1.canonize)(origPathName);
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
    const pathNameIndex = 1;
    why.push('path=p/t/');
    const origPathName = pm[pathNameIndex];
    let entname = (0, utility_1.canonize)(origPathName);
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
    const pathNameIndex = 0;
    why.push('path=t/');
    const origPathName = pm[pathNameIndex];
    // let entname = fixEntName(origPathName)
    let entname = (0, utility_1.canonize)(origPathName);
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
    const pathNameIndex = 0;
    why.push('path=t/p/p');
    const origPathName = pm[pathNameIndex];
    // let entname = fixEntName(origPathName)
    let entname = (0, utility_1.canonize)(origPathName);
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
function getResponseSchema(response) {
    return response?.content?.['application/json']?.schema ??
        response?.schema;
}
// No entity component was found, but there still might be an entity.
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
            && (1 < Object.keys(data.def.paths).filter(path => path.includes('/' + pm[pm.length - 1] + '/')).length)) {
            prob_why = 'post';
            probent = true;
        }
        else if (('PUT' === mdesc.method || 'PATCH' === mdesc.method)
            && pm.expr.endsWith('/p/')) {
            prob_why = 'putish';
            probent = true;
        }
    }
    else if ('GET' === mdesc.method) {
        prob_why = 'get';
        probent = true;
    }
    const rescodes = Object.keys(mdesc.responses ?? {});
    (0, utility_1.debugpath)(mdesc.path, mdesc.method, 'PROBABLE-ENTITY-RESPONSE', { mdesc, responses: rescodes, probent, prob_why });
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
    // console.log('ECM-A', out, ment)
    const cmpInfrequent = (ment.method_rate < IS_ENTCMP_METHOD_RATE
        || ment.path_rate < IS_ENTCMP_PATH_RATE);
    if (null != ment.cmp
        && entname != ment.cmp
        && !ment.cmp.startsWith(entname)) {
        if (cmpInfrequent) {
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
    (0, utility_1.debugpath)(mdesc.path, mdesc.method, 'ENTITY-CMP-NAME', mdesc.path, mdesc.method, entname + '->', out, why, ment, IS_ENTCMP_METHOD_RATE, IS_ENTCMP_PATH_RATE);
    // console.log('ECM-Z', out, why, ment)
    return out;
}
function cmpOccursInPath(data, cmpname) {
    if (null == data.work.potentialCmpsFromPaths) {
        data.work.potentialCmpsFromPaths = {};
        (0, jostraca_1.each)(data.def.paths, (_pathdef, pathstr) => {
            const parts = data.work.pathmap[pathstr].parts;
            parts
                .filter(p => !p.startsWith('{'))
                .map(p => data.work.potentialCmpsFromPaths[(0, utility_1.canonize)(p)] = true);
        });
    }
    return null != data.work.potentialCmpsFromPaths[cmpname];
}
function isListResponse(mdesc, pathStr, why) {
    const ment = mdesc.MethodEntity;
    const pm = ment.pm;
    let islist = false;
    let schema;
    if (pm && pm.expr.endsWith('p/')) {
        why.push('end-param');
    }
    else {
        let caught = (0, utility_1.capture)(mdesc, {
            responses: 
            // '`$ANY`': { content: { 'application/json': { schema: '`$CAPTURE`' } } },
            ['`$SELECT`', { '$KEY': { '`$OR`': ['200', '201'] } },
                { content: { 'application/json': { schema: '`$CAPTURE`' } } }],
        });
        schema = caught.schema;
        if (null == schema) {
            caught = (0, utility_1.capture)(mdesc, {
                responses: 
                // '`$ANY`': { content: { 'application/json': { schema: '`$CAPTURE`' } } },
                ['`$SELECT`', { '$KEY': { '`$OR`': ['200', '201'] } },
                    { schema: '`$CAPTURE`' }],
            });
            schema = caught.schema;
        }
        if (null == schema) {
            why.push('no-schema');
        }
        else {
            if (schema.type === 'array') {
                why.push('array');
                islist = true;
            }
            if (!islist) {
                const properties = resolveSchemaProperties(schema);
                (0, jostraca_1.each)(properties, (prop) => {
                    if (prop.type === 'array') {
                        why.push('array-prop:' + prop.key$);
                        islist = true;
                    }
                });
            }
            if (!islist) {
                why.push('not-list');
            }
        }
    }
    (0, utility_1.debugpath)(pathStr, mdesc.method, 'IS-LIST', islist, why, schema);
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
    !entityDesc.name.endsWith((0, utility_1.canonize)(actionName))
        && null == pathdesc.action[actionName]) {
        pathdesc.action[actionName] = {
            // kind: '`$BOOLEAN`',
            why_action: ['ent', `${entityDesc.name}`, `${why}`, `${oldParam}`, `${methodName}`]
        };
    }
}
function updateParamRename(ctx, data, path, method, paramRenameCapture, oldParamName, newParamName, why) {
    const existingNewName = paramRenameCapture.rename[oldParamName];
    const existingWhy = paramRenameCapture.why[oldParamName];
    (0, utility_1.debugpath)(path, method, 'UPDATE-PARAM-RENAME', path, oldParamName, newParamName, existingNewName);
    if (null == existingNewName) {
        paramRenameCapture.rename[oldParamName] = newParamName;
        if (!existingWhy.includes(why)) {
            existingWhy.push(why);
        }
    }
    else if (newParamName == existingNewName) {
        // if (!existingWhy.includes(why)) {
        //   existingWhy.push(why)
        // }
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
/*
function fixEntName(origName: string) {
  if (null == origName) {
    return origName
  }
  return depluralize(snakify(origName))
}
*/
function findcmps(data, pathStr, underprops, opts) {
    const cmplist = [];
    const cmpset = new Set();
    // TODO: cache in ctx.work
    (0, jostraca_1.each)(data.def.paths[pathStr])
        .map((md) => {
        underprops.map((up) => {
            let found = (0, utility_1.find)(md[up], 'x-ref');
            found.map((xref) => {
                // console.log('FINDCMPS', pathStr, (md as any).key$, up, xref.val)
                let m = xref.val.match(/\/(components\/schemas|definitions)\/(.+)$/);
                if (m) {
                    cmplist.push(m[2]);
                    cmpset.add(m[2]);
                }
            });
        });
    });
    // console.log('FOUNDCMPS', cmps)
    return (opts?.uniq ? Array.from(cmpset) : cmplist).map(n => ({ cmp: (0, utility_1.canonize)(n), origcmp: n }));
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
function findPotentialSchemaRefs(pathStr, methodName, responses) {
    const xrefs = [];
    const rescodes = ['200', '201'];
    for (let rescode of rescodes) {
        const schema = getResponseSchema(responses[rescode]);
        if (null != schema) {
            if (null != schema['x-ref']) {
                xrefs.push(schema['x-ref']);
            }
            else if ('array' === schema.type && null != schema.items?.['x-ref']) {
                xrefs.push(schema.items?.['x-ref']);
            }
        }
    }
    (0, utility_1.debugpath)(pathStr, methodName, 'POTENTIAL-SCHEMA-REFS', xrefs);
    return xrefs;
}
function hasMethod(def, pathStr, methodName) {
    const pathDef = def?.paths?.[pathStr];
    const found = (null != pathDef
        && (null != pathDef[methodName.toLowerCase()]
            || null != pathDef[methodName.toUpperCase()]));
    console.log('hasMethod', pathStr, methodName, found);
    return found;
}
//# sourceMappingURL=heuristic01.js.map