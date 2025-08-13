"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.heuristic01 = heuristic01;
const jostraca_1 = require("jostraca");
const struct_1 = require("@voxgig/struct");
const utility_1 = require("../utility");
// Log non-fatal wierdness.
const dlog = (0, utility_1.getdlog)('apidef', __filename);
async function heuristic01(ctx) {
    let guide = ctx.model.main.api.guide;
    const metrics = measure(ctx);
    // console.dir(metrics, { depth: null })
    const entityDescs = resolveEntityDescs(ctx);
    guide = {
        control: guide.control,
        entity: entityDescs,
    };
    return guide;
}
function measure(ctx) {
    const metrics = {
        count: {
            schema: {}
        }
    };
    let xrefs = (0, utility_1.find)(ctx.def, 'x-ref');
    // console.log('XREFS', xrefs)
    let schemas = xrefs.filter(xref => xref.val.includes('schema'));
    schemas.map(schema => {
        let m = schema.val.match(/\/components\/schemas\/(.+)$/);
        if (m) {
            const name = m[1];
            metrics.count.schema[name] = 1 + (metrics.count.schema[name] || 0);
        }
    });
    return metrics;
}
const METHOD_IDOP = {
    get: 'load',
    post: 'create',
    put: 'update',
    patch: 'update',
    delete: 'remove',
};
function resolveEntityDescs(ctx) {
    const entityDescs = {};
    const paths = ctx.def.paths;
    const caught = (0, utility_1.capture)(ctx.def, {
        paths: ['`$SELECT`', /\/([a-zA-Z0-1_-]+)(\/\{([a-zA-Z0-1_-]+)\})?$/,
            ['`$SELECT`', /get|post|put|patch|delete/i,
                ['`$APPEND`', 'methods', {
                        path: '`select$=key.paths`',
                        method: { '`$LOWER`': '`$KEY`' },
                        summary: '`.summary`',
                        parameters: '`.parameters`',
                        responses: '`.responses`',
                        requestBody: '`.requestBody`'
                    }]
            ]
        ]
    });
    (0, jostraca_1.each)(caught.methods, (pmdef) => {
        let methodDef = pmdef;
        let pathStr = pmdef.path;
        let methodStr = pmdef.method;
        // methodStr = methodStr.toLowerCase()
        let why_op = [];
        if (!METHOD_IDOP[methodStr]) {
            return;
        }
        const why_ent = [];
        const entdesc = resolveEntity(entityDescs, pathStr, methodDef, methodStr, why_ent);
        if (null == entdesc) {
            console.log('WARNING: unable to resolve entity for method ' + methodStr +
                ' path ' + pathStr);
            return;
        }
        entdesc.path[pathStr].why_ent = why_ent;
        // if (pathStr.includes('courses')) {
        //   console.log('ENTRES', pathStr, methodStr)
        //   console.dir(ent2, { depth: null })
        // }
        let opname = resolveOpName(methodStr, methodDef, pathStr, entdesc, why_op);
        if (null == opname) {
            console.log('WARNING: unable to resolve operation for method ' + methodStr +
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
        const op = entdesc.path[pathStr].op;
        op[opname] = {
            // TODO: in actual guide, remove "standard" method ops since redundant
            method: methodStr,
            why_op: why_op.join(';')
        };
        if (0 < Object.entries(transform).length) {
            op[opname].transform = transform;
        }
        // if ('/v2/users/{user_id}/enrollment' === pathStr) {
        //   console.log('ENT')
        //   console.dir(entdesc, { depth: null })
        // }
        // })
        // }
    });
    // console.log('USER')
    // console.dir(entityDescs.user, { depth: null })
    return entityDescs;
}
function resolveEntity(entityDescs, 
// pathDef: Record<string, any>,
pathStr, methodDef, methodStr, why_ent) {
    let entdesc;
    let entname = '';
    let origentname = '';
    const why_name = [];
    const m = pathStr.match(/\/([a-zA-Z0-1_-]+)(\/\{([a-zA-Z0-1_-]+)\})?$/);
    if (m) {
        let pathName = m[1];
        let pathParam = m[3];
        origentname = (0, jostraca_1.snakify)(pathName);
        entname = (0, utility_1.depluralize)(origentname);
        // Check schema
        const compname = resolveComponentName(entname, methodDef, methodStr, pathStr, why_name);
        if (compname) {
            origentname = (0, jostraca_1.snakify)(compname);
            entname = (0, utility_1.depluralize)(origentname);
            why_ent.push('cmp:' + entname);
        }
        else {
            why_ent.push('path:' + m[1]);
            why_name.push('path:' + m[1]);
        }
        entdesc = (entityDescs[entname] = entityDescs[entname] || {
            name: entname,
            id: Math.random(),
            alias: {}
        });
        if (null != pathParam) {
            const pathParamCanon = (0, jostraca_1.snakify)(pathParam);
            if ('id' != pathParamCanon) {
                entdesc.alias.id = pathParamCanon;
                entdesc.alias[pathParamCanon] = 'id';
            }
        }
    }
    // Can't figure out the entity
    else {
        console.log('NO ENTTIY', pathStr);
        return;
    }
    // entdesc.plural = origentname
    entdesc.origname = origentname;
    (0, jostraca_1.names)(entdesc, entname);
    entdesc.alias = entdesc.alias || {};
    entdesc.path = (entdesc.path || {});
    entdesc.path[pathStr] = entdesc.path[pathStr] || {};
    entdesc.path[pathStr].op = entdesc.path[pathStr].op || {};
    if (null == entdesc.why_name) {
        entdesc.why_name = why_name;
    }
    return entdesc;
}
const REQKIND = {
    get: 'res',
    post: 'req',
    put: 'req',
    patch: 'req',
};
function resolveComponentName(entname, methodDef, methodStr, pathStr, why_name) {
    let compname = undefined;
    let xrefs = (0, utility_1.find)(methodDef, 'x-ref')
        .filter(xref => xref.val.includes('schema'))
        // TODO: identify non-ent schemas
        .filter(xref => !xref.val.includes('Meta'))
        .sort((a, b) => a.path.length - b.path.length);
    // console.log('RCN', pathStr, methodStr, xrefs.map(x => [x.val, x.path.length]))
    let first = xrefs[0]?.val;
    if (null != first) {
        let xrefm = first.match(/\/components\/schemas\/(.+)$/);
        if (xrefm) {
            why_name.push('cmp');
            compname = xrefm[1];
        }
    }
    if (null != compname) {
        compname = (0, utility_1.depluralize)((0, jostraca_1.snakify)(compname));
        // Assume sub schemas suffixes are not real entities
        if (compname.includes(entname)) {
            compname = compname.slice(0, compname.indexOf(entname) + entname.length);
        }
    }
    return compname;
}
function resolveOpName(methodStr, methodDef, pathStr, entdesc, why) {
    // console.log('ROP', pathStr, methodDef)
    let opname = METHOD_IDOP[methodStr];
    if (null == opname) {
        why.push('no-op:' + methodStr);
        return;
    }
    if ('load' === opname) {
        const islist = isListResponse(methodDef, pathStr, entdesc, why);
        opname = islist ? 'list' : opname;
        // console.log('ISLIST', entdesc.name, methodStr, opname, pathStr)
    }
    else {
        why.push('not-load');
    }
    return opname;
}
function isListResponse(methodDef, pathStr, entdesc, why) {
    const caught = (0, utility_1.capture)(methodDef, {
        responses: {
            '`$ANY`': { content: { 'application/json': { schema: '`$CAPTURE`' } } },
        }
    });
    const schema = caught.schema;
    let islist = false;
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
                if (prop.type === 'array') {
                    if (1 === (0, struct_1.size)(properties)) {
                        why.push('one-prop:' + prop.key$);
                        islist = true;
                    }
                    if (2 === (0, struct_1.size)(properties) &&
                        ('data' === prop.key$ ||
                            'list' === prop.key$)) {
                        why.push('two-prop:' + prop.key$);
                        islist = true;
                    }
                    if (prop.key$ === entdesc.name) {
                        why.push('name:' + entdesc.origname);
                        islist = true;
                    }
                    if (prop.key$ === entdesc.origname) {
                        why.push('origname:' + entdesc.origname);
                        islist = true;
                    }
                    const listent = listedEntity(prop);
                    if (listent === entdesc.name) {
                        why.push('listent:' + listent);
                        islist = true;
                    }
                    // if ('/v2/users' === pathStr) {
                    //   console.log('islistresponse', islist, pathStr, entdesc.name, listedEntity(prop), properties)
                    // }
                }
            });
        }
        if (!islist) {
            why.push('not-list');
        }
        // }
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
//# sourceMappingURL=heuristic01.js.map