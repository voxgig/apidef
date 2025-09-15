"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.heuristic01 = heuristic01;
const jostraca_1 = require("jostraca");
const struct_1 = require("@voxgig/struct");
const utility_1 = require("../utility");
// Log non-fatal wierdness.
const dlog = (0, utility_1.getdlog)('apidef', __filename);
// Schema components that occur less than this rate (over total method count) qualify
// as unique entities, not shared schemas
const IS_ENTCMP_METHOD_RATE = 0.21;
const IS_ENTCMP_PATH_RATE = 0.41;
async function heuristic01(ctx) {
    let guide = ctx.guide;
    measure(ctx);
    const entityDescs = resolveEntityDescs(ctx);
    ctx.metrics.count.entity = (0, struct_1.size)(entityDescs);
    guide = {
        control: guide.control,
        entity: entityDescs,
        metrics: ctx.metrics,
    };
    return guide;
}
function measure(ctx) {
    const metrics = ctx.metrics;
    metrics.count.path = Object.keys(ctx.def.paths ?? {}).length;
    (0, jostraca_1.each)(ctx.def.paths, (pathdef) => {
        metrics.count.method += ((pathdef.get ? 1 : 0) +
            (pathdef.post ? 1 : 0) +
            (pathdef.put ? 1 : 0) +
            (pathdef.patch ? 1 : 0) +
            (pathdef.delete ? 1 : 0) +
            (pathdef.options ? 1 : 0));
    });
    metrics.count.schema = {};
    metrics.count.uniqschema = 0;
    metrics.count.entity = -1;
    let xrefs = (0, utility_1.find)(ctx.def, 'x-ref');
    let schemas = xrefs.filter(xref => xref.val.includes('schema'));
    schemas.map(schema => {
        let m = schema.val.match(/\/components\/schemas\/(.+)$/);
        if (m) {
            const name = fixEntName(m[1]);
            if (null == metrics.count.schema[name]) {
                metrics.count.uniqschema++;
                metrics.count.schema[name] = 0;
            }
            metrics.count.schema[name]++;
        }
    });
    return metrics;
}
const METHOD_IDOP = {
    GET: 'load',
    POST: 'create',
    PUT: 'update',
    DELETE: 'remove',
    PATCH: 'patch',
};
const METHOD_CONSIDER_ORDER = {
    'GET': 100,
    'POST': 200,
    'PUT': 300,
    'PATCH': 400,
    'DELETE': 500,
};
function resolveEntityDescs(ctx) {
    const entityDescs = {};
    const paths = ctx.def.paths;
    const caught = (0, utility_1.capture)(ctx.def, {
        paths: 
        //['`$SELECT`', /\/([a-zA-Z0-1_-]+)(\/\{([a-zA-Z0-1_-]+)\})?$/,
        ['`$SELECT`', /.*/,
            ['`$SELECT`', /^get|post|put|patch|delete$/i,
                ['`$APPEND`', 'methods', {
                        path: '`select$=key.paths`',
                        method: { '`$UPPER`': '`$KEY`' },
                        summary: '`.summary`',
                        parameters: '`.parameters`',
                        responses: '`.responses`',
                        requestBody: '`.requestBody`'
                    }]
            ]
        ]
    });
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
    (0, jostraca_1.each)(caught.methods, (pmdef) => {
        let methodDef = pmdef;
        let pathStr = pmdef.path;
        let methodName = pmdef.method;
        let pathDef = paths[pathStr];
        pathDef.canonPath$ = pathDef.canonPath$ ?? pathStr;
        let why_op = [];
        if (!METHOD_IDOP[methodName]) {
            console.log('ERROR UNKNOWN METHOD: ' + methodName);
            return;
        }
        const parts = pathStr.split(/\//).filter((p) => '' != p);
        const entres = resolveEntity(ctx, entityDescs, pathStr, parts, methodDef, methodName);
        const entdesc = entres.entdesc;
        // TODO: use ctx.warn
        if (null == entdesc) {
            console.log('WARNING: unable to resolve entity for method ' + methodName +
                ' path ' + pathStr);
            return;
        }
        if (null == entdesc.name) {
            console.log('WARNING: unable to resolve entity name for method ' + methodName +
                ' path ' + pathStr + ' desc:', entdesc);
            return;
        }
        let opname = resolveOpName(methodName, methodDef, pathStr, entres, why_op);
        if (null == opname) {
            console.log('WARNING: unable to resolve operation for method ' + methodName +
                ' path ' + pathStr);
            return;
        }
        const transform = {
        // reqform: '`reqdata`',
        // resform: '`body`',
        };
        const resokdef = methodDef.responses?.[200] || methodDef.responses?.[201];
        const resbody = resokdef?.content?.['application/json']?.schema;
        if (resbody) {
            if (resbody[entdesc.origname]) {
                transform.resform = '`body.' + entdesc.origname + '`';
            }
            else if (resbody[entdesc.name]) {
                transform.resform = '`body.' + entdesc.name + '`';
            }
        }
        const reqdef = methodDef.requestBody?.content?.['application/json']?.schema?.properties;
        if (reqdef) {
            if (reqdef[entdesc.origname]) {
                transform.reqform = { [entdesc.origname]: '`reqdata`' };
            }
            else if (reqdef[entdesc.origname]) {
                transform.reqform = { [entdesc.origname]: '`reqdata`' };
            }
        }
        const pathDesc = entdesc.path[pathStr];
        const op = pathDesc.op;
        op[opname] = {
            // TODO: in actual guide, remove "standard" method ops since redundant
            method: methodName,
            why_op: why_op.join(';')
        };
        if (0 < Object.entries(transform).length) {
            op[opname].transform = transform;
        }
        renameParams(ctx, pathStr, methodName, entres);
    });
    return entityDescs;
}
function resolveEntity(ctx, entityDescs, pathStr, parts, methodDef, methodName) {
    const metrics = ctx.metrics;
    const out = {
        entdesc: undefined,
        pm: undefined
    };
    const why_path = [];
    const cmpname = resolveComponentName(methodDef, methodName, pathStr, why_path);
    const cmpoccur = metrics.count.schema[cmpname ?? ''] ?? 0;
    const path_rate = 0 == metrics.count.path ? -1 : (cmpoccur / metrics.count.path);
    const method_rate = 0 == metrics.count.method ? -1 : (cmpoccur / metrics.count.method);
    const cmp = {
        name: cmpname,
        path_rate: path_rate,
        method_rate: method_rate,
    };
    if (null == cmpname) {
        why_path.push('no-cmp');
    }
    let entname;
    let pm = undefined;
    if (pm = (0, utility_1.pathMatch)(parts, 't/p/t/')) {
        entname = entityPathMatch_tpte(ctx, pm, cmp, pathStr, why_path);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 't/p/')) {
        entname = entityPathMatch_tpe(ctx, pm, cmp, pathStr, why_path);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 'p/t/')) {
        entname = entityPathMatch_pte(ctx, pm, cmp, pathStr, why_path);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 't/')) {
        entname = entityPathMatch_te(ctx, pm, cmp, pathStr, why_path);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 't/p/p')) {
        entname = entityPathMatch_tpp(ctx, pm, cmp, pathStr, why_path);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 'p/')) {
        throw new Error('UNSUPPORTED PATH:' + pathStr);
    }
    if (null == entname || '' === entname || 'undefined' === entname) {
        throw new Error('ENTITY NAME UNRESOLVED:' + why_path + ' ' + pathStr);
    }
    out.pm = pm;
    out.cmp = cmp;
    out.entdesc = (entityDescs[entname] = entityDescs[entname] || {
        name: entname,
        id: 'N' + ('' + Math.random()).substring(2, 10),
    });
    out.entdesc.path = (out.entdesc.path || {});
    out.entdesc.path[pathStr] = out.entdesc.path[pathStr] || {};
    out.entdesc.path[pathStr].op = out.entdesc.path[pathStr].op || {};
    out.entdesc.path[pathStr].why_path = why_path;
    return out;
}
function entityPathMatch_tpte(ctx, pm, cmp, pathStr, why_path) {
    const pathNameIndex = 2;
    why_path.push('path=t/p/t/');
    const origPathName = pm[pathNameIndex];
    let entname = fixEntName(origPathName);
    if (null == cmp.name) {
        // Probably a special suffix operation on the entity,
        // so make the entity name sufficiently unique
        entname = fixEntName(pm[0]) + '_' + entname;
    }
    else {
        entname = entityCmpMatch(ctx, entname, cmp, pathStr, why_path);
    }
    return entname;
}
function entityPathMatch_tpe(ctx, pm, cmp, pathStr, why_path) {
    const pathNameIndex = 0;
    why_path.push('path=t/p/');
    const origPathName = pm[pathNameIndex];
    let entname = fixEntName(origPathName);
    if (null == cmp.name) {
        why_path.push('no-cmp');
    }
    else {
        entname = entityCmpMatch(ctx, entname, cmp, pathStr, why_path);
    }
    return entname;
}
function entityPathMatch_pte(ctx, pm, cmp, pathStr, why_path) {
    const pathNameIndex = 1;
    why_path.push('path=p/t/');
    const origPathName = pm[pathNameIndex];
    let entname = fixEntName(origPathName);
    if (null == cmp.name) {
        why_path.push('no-cmp');
    }
    else {
        entname = entityCmpMatch(ctx, entname, cmp, pathStr, why_path);
    }
    return entname;
}
function entityPathMatch_te(ctx, pm, cmp, pathStr, why_path) {
    const pathNameIndex = 0;
    why_path.push('path=t/');
    const origPathName = pm[pathNameIndex];
    let entname = fixEntName(origPathName);
    if (null == cmp.name) {
        why_path.push('no-cmp');
    }
    else {
        entname = entityCmpMatch(ctx, entname, cmp, pathStr, why_path);
    }
    return entname;
}
function entityPathMatch_tpp(ctx, pm, cmp, pathStr, why_path) {
    const pathNameIndex = 0;
    why_path.push('path=t/p/p');
    const origPathName = pm[pathNameIndex];
    let entname = fixEntName(origPathName);
    if (null == cmp.name) {
        why_path.push('no-cmp');
    }
    else {
        entname = entityCmpMatch(ctx, entname, cmp, pathStr, why_path);
    }
    return entname;
}
function entityCmpMatch(ctx, entname, cmp, pathStr, why_path) {
    let out = entname;
    const cmpInfrequent = (cmp.method_rate < IS_ENTCMP_METHOD_RATE
        || cmp.path_rate < IS_ENTCMP_PATH_RATE);
    if (null != cmp.name
        && entname != cmp.name
        && !cmp.name.startsWith(entname)) {
        if (cmpInfrequent) {
            why_path.push('cmp-primary');
            out = cmp.name;
        }
        else if (cmpOccursInPath(ctx, cmp.name)) {
            why_path.push('cmp-path');
            out = cmp.name;
        }
        else {
            why_path.push('path-primary');
        }
    }
    else {
        why_path.push('path-primary');
    }
    if (pathStr === process.env.npm_config_apipath) {
        console.log('ENTITY-CMP-NAME', pathStr, entname + '->' + out, why_path, cmp, IS_ENTCMP_METHOD_RATE, IS_ENTCMP_PATH_RATE);
    }
    return out;
}
function cmpOccursInPath(ctx, cmpname) {
    if (null == ctx.work.potentialCmpsFromPaths) {
        ctx.work.potentialCmpsFromPaths = {};
        (0, jostraca_1.each)(ctx.def.paths, (_pathdef, pathstr) => {
            pathstr
                .split('/')
                .filter(p => !p.startsWith('{'))
                .map(p => ctx.work.potentialCmpsFromPaths[(0, utility_1.canonize)(p)] = true);
        });
    }
    return null != ctx.work.potentialCmpsFromPaths[cmpname];
}
const REQKIND = {
    get: 'res',
    post: 'req',
    put: 'req',
    patch: 'req',
};
function resolveComponentName(
// entname: string,
methodDef, methodName, pathStr, why_name) {
    let cmpname = undefined;
    let responses = methodDef.responses;
    // let xrefs = find(methodDef, 'x-ref')
    let xrefs = [
        ...(0, utility_1.find)(responses['200'], 'x-ref'),
        ...(0, utility_1.find)(responses['201'], 'x-ref'),
    ]
        .filter(xref => xref.val.includes('schema') || xref.val.includes('definitions'))
        // TODO: identify non-ent schemas
        .filter(xref => !xref.val.includes('Meta'))
        .sort((a, b) => a.path.length - b.path.length);
    let first = xrefs[0]?.val;
    if (null != first) {
        let xrefm = first.match(/\/components\/schemas\/(.+)$/);
        if (!xrefm) {
            xrefm = first.match(/\/definitions\/(.+)$/);
        }
        if (xrefm) {
            cmpname = xrefm[1];
        }
    }
    if (null != cmpname) {
        cmpname = (0, utility_1.depluralize)((0, jostraca_1.snakify)(cmpname));
        why_name.push('cmp=' + cmpname);
    }
    return cmpname;
}
function resolveOpName(methodName, methodDef, pathStr, entres, why) {
    let opname = METHOD_IDOP[methodName];
    if (null == opname) {
        why.push('no-op:' + methodName);
        return;
    }
    if ('load' === opname) {
        const islist = isListResponse(methodDef, pathStr, entres, why);
        opname = islist ? 'list' : opname;
    }
    else {
        why.push('not-load');
    }
    return opname;
}
function isListResponse(methodDef, pathStr, entres, why) {
    let islist = false;
    if (entres.pm && entres.pm.expr.endsWith('p/')) {
        why.push('end-param');
    }
    else {
        const caught = (0, utility_1.capture)(methodDef, {
            responses: 
            // '`$ANY`': { content: { 'application/json': { schema: '`$CAPTURE`' } } },
            ['`$SELECT`', { '$KEY': { '`$OR`': ['200', '201'] } },
                { content: { 'application/json': { schema: '`$CAPTURE`' } } }],
        });
        const schema = caught.schema;
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
// Make consistent changes to support semantic entities.
function renameParams(ctx, pathStr, methodName, entres) {
    const entdesc = entres.entdesc;
    const cmp = entres.cmp;
    // Rewrite path parameters that are identifiers to follow the rules:
    // 0. Parameters named [a-z]?id are considered identifiers
    // 1. last identifier is always {id} as this is the primary entity
    // 2. internal identifiers are formatted as {name_id} where name is the parent entity name
    // Example: /api/bar/{id}/zed/{zid}/foo/{fid} ->
    //          /api/bar/{bar_id}/zed/{zed_id}/foo/{id}
    const pathDef = entdesc.path[pathStr];
    pathDef.rename = (pathDef.rename ?? {});
    pathDef.rename_why = (pathDef.rename_why ?? {});
    const paramRenameCapture = {
        rename: pathDef.rename.param = (pathDef.rename.param ?? {}),
        why: pathDef.rename_why.param_why = (pathDef.rename_why.param_why ?? {}),
    };
    const parts = pathStr.split(/\//).filter(p => '' != p);
    const cmpname = cmp.name;
    const considerCmp = null != cmp.name &&
        0 < ctx.metrics.count.uniqschema &&
        cmp.method_rate < IS_ENTCMP_METHOD_RATE;
    for (let partI = 0; partI < parts.length; partI++) {
        let partStr = parts[partI];
        if (isParam(partStr)) {
            const why = [];
            const oldParam = partStr.substring(1, partStr.length - 1);
            paramRenameCapture.why[oldParam] = (paramRenameCapture.why[oldParam] ?? []);
            const lastPart = partI === parts.length - 1;
            const secondLastPart = partI === parts.length - 2;
            const notLastPart = partI < parts.length - 1;
            const hasParent = 1 < partI && !isParam(parts[partI - 1]);
            const parentName = hasParent ? fixEntName(parts[partI - 1]) : null;
            const not_exact_id = 'id' !== oldParam;
            const probably_an_id = oldParam.endsWith('id');
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
                    updateParamRename(ctx, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'action-not-parent:' + entdesc.name);
                    why.push('action');
                }
                else if (hasParent
                    && parentName === cmpname) {
                    updateParamRename(ctx, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'id-not-parent');
                    why.push('id-not-parent');
                }
                else {
                    updateParamRename(ctx, pathStr, methodName, paramRenameCapture, oldParam, parentName + '_id', 'parent:' + parentName);
                    why.push('parent');
                }
            }
            // At end, but not called id.
            // .../ent/{not-id}
            else if (lastPart
                && not_exact_id
                && (!hasParent || parentName === entdesc.name)
                && (!considerCmp || cmpname === entdesc.name)) {
                updateParamRename(ctx, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'end-id:' + methodName + ':parent=' + hasParent + '/' + parentName +
                    ':cmp=' + considerCmp + '/' + cmpname);
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
                    if ('id' !== oldParam && fixEntName(partStr) === entdesc.name) {
                        updateParamRename(ctx, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'end-action');
                        why.push('end-action');
                    }
                    else {
                        why.push('not-end-action');
                    }
                }
                // Primary ent id not at end!
                else if (hasParent
                    && parentName === cmpname) {
                    updateParamRename(ctx, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'id-not-last');
                    why.push('id-not-last');
                    // paramRenames[oldParam] = 'id'
                    // paramRenamesWhy[oldParam].push('id-not-last')
                }
                // Not primary ent.
                else {
                    why.push('default');
                    let newParamName = parentName + '_id';
                    if (newParamName != oldParam) {
                        updateParamRename(ctx, pathStr, methodName, paramRenameCapture, oldParam, newParamName, 'not-primary');
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
            if (process.env.npm_config_apipath === pathStr) {
                console.log('RENAME-PARAM', {
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
                    cmp,
                    paramRenameCapture,
                    entdesc
                });
            }
        }
    }
}
function updateParamRename(ctx, path, method, paramRenameCapture, oldParamName, newParamName, why) {
    const existingNewName = paramRenameCapture.rename[oldParamName];
    const existingWhy = paramRenameCapture.why[oldParamName];
    if (path === process.env.npm_config_apipath) {
        console.log('UPDATE-PARAM-RENAME', path, oldParamName, newParamName, existingNewName);
    }
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
function fixEntName(origName) {
    if (null == origName) {
        return origName;
    }
    return (0, utility_1.depluralize)((0, jostraca_1.snakify)(origName));
}
//# sourceMappingURL=heuristic01.js.map