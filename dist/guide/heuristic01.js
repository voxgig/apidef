"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.heuristic01 = heuristic01;
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
// Log non-fatal wierdness.
const dlog = (0, utility_1.getdlog)('apidef', __filename);
async function heuristic01(ctx) {
    let guide = ctx.model.main.api.guide;
    const metrics = measure(ctx);
    // console.dir(metrics, { depth: null })
    const entityDescs = resolveEntityDescs(ctx, metrics);
    // console.log('ED', Object.keys(entityDescs))
    guide = {
        control: guide.control,
        entity: entityDescs,
    };
    return guide;
}
function measure(ctx) {
    const metrics = {
        count: {
            path: Object.keys(ctx.def.paths ?? {}).length,
            schema: {}
        }
    };
    let xrefs = (0, utility_1.find)(ctx.def, 'x-ref');
    let schemas = xrefs.filter(xref => xref.val.includes('schema'));
    schemas.map(schema => {
        let m = schema.val.match(/\/components\/schemas\/(.+)$/);
        if (m) {
            const name = fixEntName(m[1]);
            metrics.count.schema[name] = 1 + (metrics.count.schema[name] || 0);
        }
    });
    return metrics;
}
const METHOD_IDOP = {
    GET: 'load',
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'remove',
};
function resolveEntityDescs(ctx, metrics) {
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
    (0, jostraca_1.each)(caught.methods, (pmdef) => {
        // console.dir(pmdef, { depth: null })
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
        const why_ent = [];
        const entres = resolveEntity(metrics, entityDescs, pathStr, parts, methodDef, methodName, why_ent);
        const entdesc = entres.entdesc;
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
        entdesc.path[pathStr].why_ent = why_ent;
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
        renameParams(ctx, pathStr, methodName, entdesc);
    });
    return entityDescs;
}
function resolveEntity(metrics, entityDescs, pathStr, parts, methodDef, methodName, why_ent) {
    const out = {
        entdesc: undefined,
        why_name: [],
        pm: undefined
    };
    const cmpname = resolveComponentName(methodDef, methodName, pathStr, out.why_name);
    const cmprate = (metrics.count.schema[cmpname ?? ''] ?? 0) / metrics.count.path;
    // console.log('CMPRATE', cmpname, cmprate, metrics.count.schema[cmpname ?? ''], metrics.count.path)
    const cmp = {
        name: cmpname,
        rate: cmprate,
    };
    let entname;
    let pm = undefined;
    if (pm = (0, utility_1.pathMatch)(parts, 't/p/t/')) {
        entname = entityPathMatch_tpte(pm, cmp, out.why_name);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 't/p/')) {
        entname = entityPathMatch_tpe(pm, cmp, out.why_name);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 'p/t/')) {
        entname = entityPathMatch_pte(pm, cmp, out.why_name);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 't/')) {
        entname = entityPathMatch_te(pm, cmp, out.why_name);
    }
    else if (pm = (0, utility_1.pathMatch)(parts, 'p/')) {
        throw new Error('UNSUPPORTED PATH:' + pathStr);
    }
    if (null == entname || '' === entname || 'undefined' === entname) {
        throw new Error('ENTITY NAME UNRESOLVED:' + out.why_name + ' ' + pathStr);
    }
    out.pm = pm;
    out.entdesc = (entityDescs[entname] = entityDescs[entname] || {
        name: entname,
        id: 'N' + ('' + Math.random()).substring(2, 10),
    });
    out.entdesc.path = (out.entdesc.path || {});
    out.entdesc.path[pathStr] = out.entdesc.path[pathStr] || {};
    out.entdesc.path[pathStr].op = out.entdesc.path[pathStr].op || {};
    return out;
}
function entityPathMatch_tpte(pm, cmp, why) {
    const pathNameIndex = 2;
    why.push('path=t/p/t/');
    const origPathName = pm[pathNameIndex];
    let entname = fixEntName(origPathName);
    if (null == cmp.name) {
        // Probably a special suffix operation on the entity,
        // so make the entity name sufficiently unique
        entname = fixEntName(pm[0]) + '_' + entname;
    }
    else {
        why.push('cr=' + cmp.rate.toFixed(3));
        if (entname != cmp.name && cmp.rate < 0.5) {
            entname = cmp.name;
        }
    }
    return entname;
}
function entityPathMatch_tpe(pm, cmp, why) {
    const pathNameIndex = 0;
    why.push('path=t/p/');
    const origPathName = pm[pathNameIndex];
    let entname = fixEntName(origPathName);
    if (null == cmp.name) {
        why.push('no-cmp');
    }
    else {
        why.push('cr=' + cmp.rate.toFixed(3));
        if (entname != cmp.name && cmp.rate < 0.5) {
            entname = cmp.name;
        }
    }
    return entname;
}
function entityPathMatch_pte(pm, cmp, why) {
    const pathNameIndex = 1;
    why.push('path=p/t/');
    const origPathName = pm[pathNameIndex];
    let entname = fixEntName(origPathName);
    if (null == cmp.name) {
        why.push('no-cmp');
    }
    else {
        why.push('cr=' + cmp.rate.toFixed(3));
        if (entname != cmp.name && cmp.rate < 0.5) {
            entname = cmp.name;
        }
    }
    return entname;
}
function entityPathMatch_te(pm, cmp, why) {
    const pathNameIndex = 0;
    why.push('path=t/');
    const origPathName = pm[pathNameIndex];
    let entname = fixEntName(origPathName);
    if (null == cmp.name) {
        why.push('no-cmp');
    }
    else {
        why.push('cr=' + cmp.rate.toFixed(3));
        if (entname != cmp.name && cmp.rate < 0.5) {
            entname = cmp.name;
        }
    }
    return entname;
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
        .filter(xref => xref.val.includes('schema'))
        // TODO: identify non-ent schemas
        .filter(xref => !xref.val.includes('Meta'))
        .sort((a, b) => a.path.length - b.path.length);
    let first = xrefs[0]?.val;
    if (null != first) {
        let xrefm = first.match(/\/components\/schemas\/(.+)$/);
        if (xrefm) {
            cmpname = xrefm[1];
        }
    }
    if (null != cmpname) {
        cmpname = (0, utility_1.depluralize)((0, jostraca_1.snakify)(cmpname));
        why_name.push('cmp=' + cmpname);
        // Assume sub schemas suffixes are not real entities
        // if (compname.includes(entname)) {
        //   compname = compname.slice(0, compname.indexOf(entname) + entname.length)
        // }
    }
    return cmpname;
}
function resolveOpName(methodName, methodDef, pathStr, entres, why) {
    // console.log('ROP', pathStr, methodDef)
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
                const properties = schema.properties || {};
                (0, jostraca_1.each)(properties, (prop) => {
                    // console.log('ISLIST', pathStr, prop.key$, prop.type)
                    if (prop.type === 'array') {
                        why.push('array-prop:' + prop.key$);
                        islist = true;
                        /*
                        if (1 === size(properties)) {
                          why.push('one-prop:' + prop.key$)
                          islist = true
                        }
               
                        if (2 === size(properties) &&
                          ('data' === prop.key$ ||
                            'list' === prop.key$)
                        ) {
                          why.push('two-prop:' + prop.key$)
                          islist = true
                        }
               
                        if (prop.key$ === entdesc.name) {
                          why.push('name:' + entdesc.origname)
                          islist = true
                        }
               
                        if (prop.key$ === entdesc.origname) {
                          why.push('origname:' + entdesc.origname)
                          islist = true
                        }
               
                        const listent = listedEntity(prop)
                        if (listent === entdesc.name) {
                          why.push('listent:' + listent)
                          islist = true
                        }
                        */
                        // if ('/v2/users' === pathStr) {
                        //   console.log('islistresponse', islist, pathStr, entdesc.name, listedEntity(prop), properties)
                        // }
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
function listedEntity(prop) {
    const xref = prop?.items?.['x-ref'];
    const m = 'string' === typeof xref && xref.match(/^#\/components\/schemas\/(.+)$/);
    if (m) {
        return (0, utility_1.depluralize)((0, jostraca_1.snakify)(m[1]));
    }
}
// Make consistent changes to support semantic entities.
function renameParams(ctx, pathStr, methodName, entdesc) {
    // Rewrite path parameters that are identifiers to follow the rules:
    // 0. Parameters named [a-z]?id are considered identifiers
    // 1. last identifier is always {id} as this is the primary entity
    // 2. internal identifiers are formatted as {name_id} where name is the parent entity name
    // Example: /api/bar/{id}/zed/{zid}/foo/{fid} ->
    //          /api/bar/{bar_id}/zed/{zed_id}/foo/{id}
    const pathDef = entdesc.path[pathStr];
    pathDef.rename = (pathDef.rename ?? {});
    const paramRenames = pathDef.rename.param = (pathDef.rename.param ?? {});
    const parts = pathStr.split(/\//).filter(p => '' != p);
    for (let partI = 0; partI < parts.length; partI++) {
        let partStr = parts[partI];
        if (isParam(partStr)) {
            let oldParam = partStr.substring(1, partStr.length - 1);
            let hasParent = 1 < partI && !isParam(parts[partI - 1]);
            let parentName = hasParent ? fixEntName(parts[partI - 1]) : null;
            // console.log(
            //   'PARAM', partI + '/' + parts.length, oldParam, 'p=' + parentName, 'e=' + entdesc.name)
            // Id not at end, and after a possible entname.
            // .../parentent/{id}/...
            if ('id' === oldParam &&
                hasParent &&
                parentName !== entdesc.name &&
                partI < parts.length - 2) {
                let newParamName = parentName + '_id';
                paramRenames[oldParam] = newParamName;
            }
            // At end, but not called id.
            // .../ent/{not-id}
            else if (partI === parts.length - 1 &&
                'id' !== oldParam) {
                paramRenames[oldParam] = 'id';
            }
            // Mot at end, has preceding non-param part.
            // .../parentent/{paramname}/...
            else if (partI < parts.length - 1 &&
                1 < partI &&
                hasParent) {
                // Actually primary ent with a filter$ suffix
                if (partI === parts.length - 2) {
                    if ('id' !== oldParam && fixEntName(partStr) === entdesc.name) {
                        paramRenames[oldParam] = 'id';
                    }
                }
                // Not primary ent.
                else {
                    let newParamName = parentName + '_id';
                    if (newParamName != oldParam) {
                        paramRenames[oldParam] = newParamName;
                    }
                }
            }
        }
    }
    // console.log('REWRITE', pathStr, '|', parts.join('\\'))
    /*
      const pathdef = ctx.def.paths[pathStr]
      const param_keys = Object.keys(pathdef?.parameters || {})
    
      // Prevent duplicate names during rewrite
      param_keys.sort(((a: string, b: string, _: any) => {
        _ = a.length - b.length
        if (0 === _) {
          return a < b ? -1 : a > b ? 1 : 0
        }
        return _
      }) as any)
    
    
      param_keys.map((param_key: string) => {
        let param = pathdef.parameters[param_key]
        let old_path = pathdef.key$
        let old_param = param.name
    
    
        let new_param = param.name
        let new_path = pathdef.key$
    
        let pathend_match = undefined
    
        if (null != new_path && '' !== new_path) {
    
          const pathend_re = new RegExp(
            '\\/([^\\/]+)\\/\\{' +
            escre(param.name) +
            '\\}(\\/[^\\/{]+)?$')
          pathend_match = old_path.match(pathend_re)
    
          if (pathend_match && 'id' != param.name) {
            new_param = 'id'
            new_path = pathdef.key$
              .replace('{' + param.name + '}', '{' + new_param + '}')
          }
    
          // Rename param if nane is "id" (or "Xid"), and not the final param.
          // Rewrite /foo/{id}/bar as /foo/{foo_id}/bar.
          // Avoids ambiguity with bar id.
          else if (!pathend_match && old_param.match(/^([a-z]?id)$/i)) {
            const pre = new RegExp('\\/([^\\/]+)\\/\\{' + escre(param.name) + '\\}\\/[^\\/]')
            let m = old_path.match(pre)
    
            if (m) {
              const parent = depluralize(snakify(m[1]))
              new_param = `${parent}_id`
              new_path = old_path
                .replace('{' + param.name + '}', '{' + new_param + '}')
            }
          }
          else {
            new_param = depluralize(snakify(param.name))
            new_path = pathdef.key$.replace('{' + param.name + '}', '{' + new_param + '}')
          }
    
        }
      })
    
    */
}
function isParam(partStr) {
    return '{' === partStr[0] && '}' === partStr[partStr.length - 1];
}
/*
function modifyParam(
  def: any,
  pathStr: string,
  methodStr: string,
  origParamName: string,
  newParamName: string
) {
  const pathdef = def.paths[pathStr]
  let canonPath = pathdef.canonPath$

  canonPath = canonPath.replace('{' + origParamName + '}', '{' + newParamName + '}')

  let params = [].concat((pathdef.parameters || [])).concat(pathdef[methodStr].parameters || [])
    .filter((p: any) => p.name === origParamName)

  params.map((p: any) => {
    p.name = newParamName
    return p
  })

  // console.log('MODIFYPARAM', canonPath, params)

  pathdef.canonPath$ = canonPath
}
*/
function fixEntName(origName) {
    if (null == origName) {
        return origName;
    }
    return (0, utility_1.depluralize)((0, jostraca_1.snakify)(origName));
}
//# sourceMappingURL=heuristic01.js.map