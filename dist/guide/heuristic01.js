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
    (0, utility_1.warnOnError)('reviewEntityDescs', ctx.warn, () => reviewEntityDescs(ctx, entityDescs));
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
            (pathdef.head ? 1 : 0) +
            (pathdef.options ? 1 : 0));
    });
    metrics.count.origcmprefs = {};
    metrics.count.cmp = 0;
    metrics.count.entity = -1;
    let xrefs = (0, utility_1.find)(ctx.def, 'x-ref');
    let schemas = xrefs.filter(xref => xref.val.includes('schema'));
    schemas.map(schema => {
        let m = schema.val.match(/\/components\/schemas\/(.+)$/);
        if (m) {
            // const name = fixEntName(m[1])
            const name = (0, utility_1.canonize)(m[1]);
            if (null == metrics.count.origcmprefs[name]) {
                metrics.count.cmp++;
                metrics.count.origcmprefs[name] = 0;
            }
            metrics.count.origcmprefs[name]++;
            if (null == metrics.found.cmp[name]) {
                metrics.found.cmp[name] = {};
            }
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
        try {
            // QQQ
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
            (0, utility_1.debugpath)(pathStr, methodName, 'OPANME', opname, pathStr, methodName);
            if (null == opname) {
                console.log('WARNING: unable to resolve operation for method ' + methodName +
                    ' path ' + pathStr);
                return;
            }
            const pathDesc = entdesc.path[pathStr];
            const op = pathDesc.op;
            op[opname] = {
                // TODO: in actual guide, remove "standard" method ops since redundant
                method: methodName,
                why_op: why_op.join(';')
            };
            resolveTransform(ctx, methodDef, pathDesc, entdesc, opname);
            (0, utility_1.debugpath)(pathStr, methodName, 'OP-DEF', opname, pathStr, op[opname]);
            renameParams(ctx, pathStr, methodName, entres);
            (0, utility_1.debugpath)(pathStr, methodName, 'METHOD-DONE', (0, utility_1.formatJSONIC)(entres, { hsepd: 0, $: true, color: true }));
        }
        catch (err) {
            ctx.warn({
                err,
                pmdef,
                path: pmdef?.path,
                method: pmdef?.method,
                note: 'Unexpected error for path: ' + pmdef?.path + ', method: ' + pmdef?.method +
                    ': ' + err.message
            });
        }
    });
    return entityDescs;
}
function resolveEntity(ctx, entityDescs, pathStr, parts, methodDef, methodName) {
    const metrics = ctx.metrics;
    ctx.work.entity = (ctx.work.entity || {});
    const count = ctx.work.entity.count = (ctx.work.entity.count || {});
    count.seen = 1 + (null == count.seen ? 0 : count.seen);
    const out = {};
    const why = [];
    const cmpnamedesc = resolveCmpName(ctx, methodDef, methodName, pathStr, why);
    const cmpoccur = metrics.count.origcmprefs[cmpnamedesc?.origcmp ?? ''] ?? 0;
    const path_rate = 0 == metrics.count.path ? -1 : (cmpoccur / metrics.count.path);
    const method_rate = 0 == metrics.count.method ? -1 : (cmpoccur / metrics.count.method);
    const cmp = {
        namedesc: cmpnamedesc,
        path_rate: path_rate,
        method_rate: method_rate,
    };
    const mdesc = {
        name: methodName,
        def: methodDef,
        path: pathStr
    };
    if (null == cmpnamedesc) {
        why.push('no-cmp');
    }
    let entname;
    let pm = undefined;
    if (pm = (0, utility_1.pathMatch)(parts, 't/p/t/')) {
        entname = entityPathMatch_tpte(ctx, pm, cmp, mdesc, why);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 't/p/')) {
        entname = entityPathMatch_tpe(ctx, pm, cmp, mdesc, why);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 'p/t/')) {
        entname = entityPathMatch_pte(ctx, pm, cmp, mdesc, why);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 't/')) {
        entname = entityPathMatch_te(ctx, pm, cmp, mdesc, why);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 't/p/p')) {
        entname = entityPathMatch_tpp(ctx, pm, cmp, mdesc, why);
    }
    // else if (pm = pathMatch(parts, 'p/p/p')) {
    //   entname = entityPathMatch_ppp(ctx, pm, cmp, mdesc, why)
    // }
    // else if (pm = pathMatch(parts, 'p/')) {
    //   throw new Error('UNSUPPORTED PATH:' + pathStr)
    // }
    // if (null == entname || '' === entname || 'undefined' === entname) {
    //   throw new Error('ENTITY NAME UNRESOLVED:' + why + ' ' + pathStr)
    // }
    else {
        count.unresolved = 1 + (null == count.unresolved ? -1 : count.unresolved);
        entname = 'entity' + count.unresolved;
    }
    out.pm = pm;
    out.cmp = cmp;
    out.why = why;
    out.entdesc = (entityDescs[entname] = entityDescs[entname] || {
        name: entname,
        id: 'N' + ('' + Math.random()).substring(2, 10),
        cmp,
    });
    out.entdesc.path = (out.entdesc.path || {});
    out.entdesc.path[pathStr] = out.entdesc.path[pathStr] || {
        pm
    };
    out.entdesc.path[pathStr].op = out.entdesc.path[pathStr].op || {};
    out.entdesc.path[pathStr].why_path = why;
    (0, utility_1.debugpath)(pathStr, methodName, 'RESOLVE-ENTITY', (0, utility_1.formatJSONIC)(out, { hsepd: 0, $: true, color: true }));
    return out;
}
function entityPathMatch_tpte(ctx, pm, cmpdesc, mdesc, why) {
    const pathNameIndex = 2;
    why.push('path=t/p/t/');
    const origPathName = pm[pathNameIndex];
    // let entname = fixEntName(origPathName)
    let entname = (0, utility_1.canonize)(origPathName);
    let ecm = undefined;
    if (null != cmpdesc.namedesc) {
        ecm = entityCmpMatch(ctx, entname, cmpdesc, mdesc, why);
        entname = ecm.name;
        why.push('has-cmp');
    }
    else if (probableEntityMethod(ctx, mdesc, pm, why)) {
        ecm = entityCmpMatch(ctx, entname, cmpdesc, mdesc, why);
        if (ecm.cmpish) {
            entname = ecm.name;
            why.push('prob-ent');
        }
        else if (endsWithCmp(ctx, pm)) {
            entname = (0, utility_1.canonize)((0, struct_1.getelem)(pm, -1));
            why.push('prob-ent-last');
        }
        else if (0 < (0, utility_1.findPathsWithPrefix)(ctx, pm.path, { strict: true })) {
            entname = (0, utility_1.canonize)((0, struct_1.getelem)(pm, -1));
            why.push('prob-ent-prefix');
        }
        else {
            // entname = fixEntName(getelem(pm, -3)) + '_' + entname
            entname = (0, utility_1.canonize)((0, struct_1.getelem)(pm, -3)) + '_' + entname;
            why.push('prob-ent-part');
        }
    }
    else {
        why.push('part-ent');
        // Probably a special suffix operation,
        // so make the entity name sufficiently unique
        // entname = fixEntName(getelem(pm, -3)) + '_' + entname
        entname = (0, utility_1.canonize)((0, struct_1.getelem)(pm, -3)) + '_' + entname;
    }
    return entname;
}
function endsWithCmp(ctx, pm) {
    const last = (0, utility_1.canonize)((0, struct_1.getelem)(pm, -1));
    return isOrigCmp(ctx, last);
}
function isOrigCmp(ctx, name) {
    return null != ctx.metrics.count.origcmprefs[name];
}
function entityOccursInPath(path, entname) {
    let parts = 'string' === typeof path ? path.split('/') : path;
    parts = parts.filter(p => '{' !== p[0]).map(p => (0, utility_1.canonize)(p));
    return !parts.reduce((a, p) => (a && p !== entname), true);
}
function entityPathMatch_tpe(ctx, pm, cmpdesc, mdesc, why) {
    const pathNameIndex = 0;
    why.push('path=t/p/');
    const origPathName = pm[pathNameIndex];
    // let entname = fixEntName(origPathName)
    let entname = (0, utility_1.canonize)(origPathName);
    if (null != cmpdesc.namedesc || probableEntityMethod(ctx, mdesc, pm, why)) {
        let ecm = entityCmpMatch(ctx, entname, cmpdesc, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
function entityPathMatch_pte(ctx, pm, cmpdesc, mdesc, why) {
    const pathNameIndex = 1;
    why.push('path=p/t/');
    const origPathName = pm[pathNameIndex];
    // let entname = fixEntName(origPathName)
    let entname = (0, utility_1.canonize)(origPathName);
    if (null != cmpdesc.namedesc || probableEntityMethod(ctx, mdesc, pm, why)) {
        let ecm = entityCmpMatch(ctx, entname, cmpdesc, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
function entityPathMatch_te(ctx, pm, cmpdesc, mdesc, why) {
    const pathNameIndex = 0;
    why.push('path=t/');
    const origPathName = pm[pathNameIndex];
    // let entname = fixEntName(origPathName)
    let entname = (0, utility_1.canonize)(origPathName);
    if (null != cmpdesc.namedesc || probableEntityMethod(ctx, mdesc, pm, why)) {
        let ecm = entityCmpMatch(ctx, entname, cmpdesc, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
function entityPathMatch_tpp(ctx, pm, cmpdesc, mdesc, why) {
    const pathNameIndex = 0;
    why.push('path=t/p/p');
    const origPathName = pm[pathNameIndex];
    // let entname = fixEntName(origPathName)
    let entname = (0, utility_1.canonize)(origPathName);
    if (null != cmpdesc.namedesc || probableEntityMethod(ctx, mdesc, pm, why)) {
        let ecm = entityCmpMatch(ctx, entname, cmpdesc, mdesc, why);
        entname = ecm.name;
    }
    else {
        why.push('ent-act');
    }
    return entname;
}
/*
// TODO: rightmost t
function entityPathMatch_ppp(
  ctx: ApiDefContext, pm: PathMatch, cmpdesc: CmpDesc, mdesc: MethodDesc, why: string[]) {
  const pathNameIndex = 0

  why.push('path=t/p/p')
  const origPathName = pm[pathNameIndex]
  let entname = fixEntName(origPathName)

  if (null != cmpdesc.namedesc || probableEntityMethod(ctx, mdesc, pm, why)) {
    let ecm = entityCmpMatch(ctx, entname, cmpdesc, mdesc, why)
    entname = ecm.name
  }
  else {
    why.push('ent-act')
  }

  return entname
}
*/
// No entity component was found, but there still might be an entity.
function probableEntityMethod(ctx, mdesc, pm, why) {
    const request = mdesc.def.requestBody;
    const reqSchema = request?.content?.['application/json']?.schema;
    const response = mdesc.def.responses?.['201'] || mdesc.def.responses?.['200'];
    const resSchema = response?.content?.['application/json']?.schema;
    const noResponse = null == resSchema && null != mdesc.def.responses?.['204'];
    let prob_why = '';
    let probent = false;
    if (noResponse) {
        // No response at all means not an action, thus probably an entity.
        prob_why = 'nores';
        probent = true;
    }
    else if (null != reqSchema) {
        if ('POST' === mdesc.name
            && !pm.expr.endsWith('/p/')
            // A real entity would probably occur in at least one other t/p path
            // otherwise this is probably an action
            && (1 < Object.keys(ctx.def.paths).filter(path => path.includes('/' + pm[pm.length - 1] + '/')).length)) {
            prob_why = 'post';
            probent = true;
        }
        else if (('PUT' === mdesc.name || 'PATCH' === mdesc.name)
            && pm.expr.endsWith('/p/')) {
            prob_why = 'putish';
            probent = true;
        }
    }
    else if ('GET' === mdesc.name) {
        prob_why = 'get';
        probent = true;
    }
    const rescodes = Object.keys(mdesc.def.responses ?? {});
    (0, utility_1.debugpath)(mdesc.path, mdesc.name, 'PROBABLE-ENTITY-RESPONSE', { mdesc, responses: rescodes, probent, prob_why });
    why.push('entres=' + probent + '/' + rescodes + ('' === prob_why ? '' : '/' + prob_why));
    return probent;
}
function entityCmpMatch(ctx, entname, cmpdesc, mdesc, why) {
    let out = {
        name: entname,
        orig: entname,
        cmpish: false,
        pathish: true,
    };
    const cmpInfrequent = (cmpdesc.method_rate < IS_ENTCMP_METHOD_RATE
        || cmpdesc.path_rate < IS_ENTCMP_PATH_RATE);
    if (null != cmpdesc.namedesc
        && entname != cmpdesc.namedesc.cmp
        && !cmpdesc.namedesc.cmp.startsWith(entname)) {
        if (cmpInfrequent) {
            why.push('cmp-primary');
            out.name = cmpdesc.namedesc.cmp;
            out.cmpish = true;
            out.pathish = false;
        }
        else if (cmpOccursInPath(ctx, cmpdesc.namedesc.cmp)) {
            why.push('cmp-path');
            out.name = cmpdesc.namedesc.cmp;
            out.cmpish = true;
            out.pathish = false;
        }
        else {
            why.push('path-over-cmp');
        }
    }
    else if ('DELETE' === mdesc.name
        && null == cmpdesc.namedesc) {
        let cmps = findcmps(ctx, mdesc.path, ['responses'], { uniq: true });
        if (1 === cmps.length) {
            out.name = cmps[0];
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
    (0, utility_1.debugpath)(mdesc.path, mdesc.name, 'ENTITY-CMP-NAME', mdesc.path, mdesc.name, entname + '->' + out, why, cmpdesc, IS_ENTCMP_METHOD_RATE, IS_ENTCMP_PATH_RATE);
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
function resolveCmpName(ctx, methodDef, methodName, pathStr, why_name) {
    let responses = methodDef.responses;
    // let xrefs = find(methodDef, 'x-ref')
    let origxrefs = [
        ...(0, utility_1.find)(responses['200'], 'x-ref'),
        ...(0, utility_1.find)(responses['201'], 'x-ref'),
    ];
    let cmpxrefs = origxrefs
        .filter(xref => xref.val.includes('schema') || xref.val.includes('definitions'))
        .map(xref => {
        let m = xref.val.match(/\/components\/schemas\/(.+)$/);
        if (!m) {
            m = xref.val.match(/\/definitions\/(.+)$/);
        }
        if (m) {
            xref.cmp = (0, utility_1.canonize)(m[1]);
        }
        return xref;
    })
        .filter(xref => null != xref.cmp);
    // TODO: identify non-ent schemas
    // .filter(xref => !xref.val.includes('Meta'))
    let cleanxrefs = cmpxrefs
        .map(xref => {
        xref.origcmp = xref.cmp;
        // Redundancy in cmp name
        const lastpart = (0, utility_1.canonize)((0, struct_1.getelem)(pathStr.toLowerCase().split('/'), -1));
        if ('' !== lastpart
            && (xref.cmp === lastpart + '_response'
                || xref.cmp === lastpart + '_request')) {
            let cparts = xref.cmp.split('_');
            xref.cmp = cparts.slice(0, cparts.length - 1).join('_');
        }
        return xref;
    });
    let goodxrefs = cleanxrefs
        .filter(xref => {
        if (cleanxrefs.length <= 1
            // || pathStr.toLowerCase().includes('/' + xref.cmp + '/')
            || entityOccursInPath(pathStr.toLowerCase(), xref.cmp)) {
            return true;
        }
        // Exclude high frequency suspicious cmps as probably meta data
        const cmprefs = ctx.metrics.count.origcmprefs[xref.origcmp] ?? 0;
        const mcount = ctx.metrics.count.method;
        const pcount = ctx.metrics.count.path;
        const method_rate = (0 < mcount ? (cmprefs / mcount) : -1);
        const path_rate = (0 < pcount ? (cmprefs / pcount) : -1);
        // console.log('RCN', xref.cmp, cmprefs, mcount, method_rate, IS_ENTCMP_METHOD_RATE, method_rate < IS_ENTCMP_METHOD_RATE)
        const infrequent = method_rate < IS_ENTCMP_METHOD_RATE
            || path_rate < IS_ENTCMP_PATH_RATE;
        if (!infrequent) {
            (0, utility_1.debugpath)(pathStr, methodName, 'CMP-INFREQ', method_rate, IS_ENTCMP_METHOD_RATE, path_rate, IS_ENTCMP_PATH_RATE);
        }
        return infrequent;
    })
        .sort((a, b) => a.path.length - b.path.length);
    const out = goodxrefs[0];
    if (null != out) {
        why_name.push('cmp=' + out.cmp);
    }
    (0, utility_1.debugpath)(pathStr, methodName, 'CMP-NAME', out, origxrefs, cleanxrefs, goodxrefs);
    return out;
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
    why.push('ent=' + entres.entdesc.name);
    return opname;
}
function isListResponse(methodDef, _pathStr, entres, why) {
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
function resolveTransform(ctx, methodDef, pathDesc, entdesc, opname) {
    const op = pathDesc.op;
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
    if (!(0, struct_1.isempty)(transform)) {
        op[opname].transform = transform;
    }
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
    // id needs to be t/p/
    const multParamEndMatch = (0, utility_1.pathMatch)(entres.pm?.path, 'p/p/');
    if (multParamEndMatch) {
        return;
    }
    const pathDef = entdesc.path[pathStr];
    pathDef.rename = (pathDef.rename ?? {});
    pathDef.rename_why = (pathDef.rename_why ?? {});
    pathDef.action = (pathDef.action ?? {});
    pathDef.action_why = (pathDef.action_why ?? {});
    const paramRenameCapture = {
        rename: pathDef.rename.param = (pathDef.rename.param ?? {}),
        why: pathDef.rename_why.param_why = (pathDef.rename_why.param_why ?? {}),
    };
    const parts = pathStr.split(/\//).filter(p => '' != p);
    const cmpname = cmp.namedesc?.cmp;
    const considerCmp = null != cmpname &&
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
            // const parentName = hasParent ? fixEntName(parts[partI - 1]) :
            const parentName = hasParent ? (0, utility_1.canonize)(parts[partI - 1]) : null;
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
                    updateAction(ctx, pathStr, methodName, oldParam, parts[partI + 1], entdesc, pathDef, 'action-not-parent');
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
                && (!hasParent
                    || (parentName === entdesc.name
                        || entdesc.name.endsWith('_' + parentName)))
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
                    if ('id' !== oldParam
                        // && fixEntName(partStr) === entdesc.name
                        && (0, utility_1.canonize)(partStr) === entdesc.name) {
                        updateParamRename(ctx, pathStr, methodName, paramRenameCapture, oldParam, 'id', 'end-action');
                        why.push('end-action');
                        updateAction(ctx, pathStr, methodName, oldParam, parts[partI + 1], entdesc, pathDef, 'end-action');
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
                cmp,
                paramRenameCapture,
                entdesc
            });
        }
    }
}
function updateAction(_ctx, _pathStr, methodName, oldParam, actionName, entityDesc, pathDesc, why) {
    if (
    // Entity not already encoding action.
    !entityDesc.name.endsWith((0, utility_1.canonize)(actionName))
        && null == pathDesc.action[actionName]) {
        pathDesc.action[actionName] = { kind: '`$BOOLEAN`' };
        pathDesc.action_why[actionName] =
            [`ent:${entityDesc.name}:${why}:${oldParam}:${methodName}`];
    }
}
function updateParamRename(ctx, path, method, paramRenameCapture, oldParamName, newParamName, why) {
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
function findcmps(ctx, pathStr, underprops, opts) {
    const cmplist = [];
    const cmpset = new Set();
    // TODO: cache in ctx.work
    (0, jostraca_1.each)(ctx.def.paths[pathStr])
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
    return (opts?.uniq ? Array.from(cmpset) : cmplist).map(n => (0, utility_1.canonize)(n));
}
// Some decisions require the full list of potential entities.
function reviewEntityDescs(ctx, entityDescs) {
    const metrics = ctx.metrics;
    if (0 < metrics.count.cmp) {
        (0, struct_1.items)(entityDescs).map(([entname, entdesc]) => {
            // Entities with a single path and single op and no cmp are suspicious
            const pathmap = entdesc.path;
            const pathcount = (0, struct_1.size)(pathmap);
            const hascmp = null != entdesc.cmp?.namedesc;
            if (1 === pathcount
                && !hascmp) {
                let pathdesc = (0, jostraca_1.each)(pathmap)[0];
                const pathStr = pathdesc.key$;
                if (1 === (0, struct_1.size)(pathdesc.op)) {
                    let op = pathdesc.op;
                    // console.log('REVIEW', entdesc.name, pathcount, hascmp, op)
                    if (op.create) {
                        // Entities without "good" components
                        if (entname.includes('_')
                            && pathdesc.pm.expr.endsWith('p/t/')) {
                            const lastpart = (0, utility_1.canonize)((0, struct_1.getelem)(pathdesc.pm, -1));
                            const realent = entityDescs[lastpart];
                            // console.log('REVIEW', entname, entdesc.cmp, size(pathmap), lastpart, realent)
                            if (null != realent
                                && realent.name !== entname
                                && (null == realent.cmp.namedesc
                                    || lastpart == realent.cmp.namedesc.cmp)) {
                                // Actually a known component
                                // console.dir(entdesc, { depth: null })
                                const realpathmap = realent.path;
                                let realpath = realpathmap[pathStr];
                                if (null == realpath) {
                                    realpath = realpathmap[pathStr] = pathdesc;
                                }
                                else if (null == realpath.op?.create) {
                                    realpath.op = (realpath.op ?? {});
                                    realpath.op.create = pathdesc.op.create;
                                }
                                realpath.op.create.why_op =
                                    'was/create/A:' + entname + ':' + realpath.op.create.why_op;
                                delete entityDescs[entname];
                                // console.log('REPLACE', entname, realent.name, realpath)
                            }
                        }
                    }
                    else if (op.remove) {
                        const otherents = (0, jostraca_1.each)(entityDescs)
                            .filter((ed) => ed !== entdesc && (0, jostraca_1.each)(ed.path)
                            .filter(epd => epd.key$ === pathStr).length);
                        const otherent = 1 === otherents.length ? otherents[0] : null;
                        // console.log('OTHERENT', pathStr, otherents.length, otherent)
                        if (null != otherent && null != otherent.cmp) {
                            const otherpath = otherent.path[pathStr];
                            if (null == otherpath.op.remove) {
                                otherpath.op.remove = op.remove;
                                otherpath.op.remove.why_op =
                                    'was/delete/A:' + entname + ':' + op.remove.why_op;
                                delete entityDescs[entname];
                            }
                        }
                    }
                    (0, utility_1.debugpath)(pathdesc.pm.path, null, 'REVIEW-ENTITY', (0, utility_1.formatJSONIC)(entdesc, { hsepd: 0, $: true, color: true }));
                }
            }
        });
    }
}
//# sourceMappingURL=heuristic01.js.map