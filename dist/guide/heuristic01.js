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
    const entityDescs = resolveEntityDescs(ctx);
    // console.log('entityDescs')
    // console.dir(entityDescs, { depth: null })
    guide = {
        control: guide.control,
        entity: entityDescs,
    };
    // console.log('GUIDE')
    // console.dir(guide, { depth: null })
    return guide;
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
    // Analyze paths ending in .../foo/{foo}
    (0, jostraca_1.each)(paths, (pathDef, pathStr) => {
        // Look for rightmmost /entname/{entid}.
        let m = pathStr.match(/\/([a-zA-Z0-1_-]+)(\/\{([a-zA-Z0-1_-]+)\})?$/);
        // const m = pathStr.match(/\/([a-zA-Z0-1_-]+)\/\{([a-zA-Z0-1_-]+)\}$/)
        if (m) {
            // const entdesc = resolveEntity(entityDescs, pathStr, m[1], m[2])
            (0, jostraca_1.each)(pathDef, (methodDef, methodStr) => {
                methodStr = methodStr.toLowerCase();
                if (!METHOD_IDOP[methodStr]) {
                    return;
                }
                const entdesc = resolveEntity(entityDescs, pathDef, pathStr, methodDef, methodStr);
                if (null == entdesc) {
                    console.log('WARNING: unable to resolve entity for method ' + methodStr +
                        ' path ' + pathStr);
                    return;
                }
                // if (pathStr.includes('courses')) {
                //   console.log('ENTRES', pathStr, methodStr)
                //   console.dir(ent2, { depth: null })
                // }
                let opname = resolveOpName(methodStr, methodDef, pathStr, entdesc);
                if (null == opname) {
                    console.log('WARNING: unable to resolve operation for method ' + methodStr +
                        ' path ' + pathStr);
                    return;
                }
                const transform = {
                // reqform: '`reqdata`',
                // resform: '`body`',
                };
                const resokdef = methodDef.responses[200] || methodDef.responses[201];
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
                };
                if (0 < Object.entries(transform).length) {
                    op[opname].transform = transform;
                }
                if ('/v2/users/{user_id}/enrollment' === pathStr) {
                    console.log('ENT');
                    console.dir(entdesc, { depth: null });
                }
            });
        }
        /*
        // Look for rightmmost /entname.
        m = pathStr.match(/\/([a-zA-Z0-1_-]+)$/)
        if (m) {
          // const entdesc = resolveEntity(entityDescs, pathstr, m[1])
    
          each(pathDef, (methodDef: any, methodStr: string) => {
            methodStr = methodStr.toLowerCase()
            if (!METHOD_IDOP[methodStr]) {
              return
            }
    
            const entdesc = resolveEntity(entityDescs, pathDef, pathStr, methodDef, methodStr)
            if (null == entdesc) {
              console.log(
                'WARNING: unable to resolve entity for method ' + methodStr +
                ' path ' + pathStr)
              return
            }
    
    
            const op: Record<string, any> = { list: { method: 'get' } }
            entdesc.path[pathStr] = { op }
    
            const transform: Record<string, any> = {}
            // const mdef = pathDef.get
            const mdef = pathDef[methodStr]
            const resokdef = mdef.responses[200] || mdef.responses[201]
            const resbody = resokdef?.content?.['application/json']?.schema
            if (resbody) {
              if (resbody[entdesc.origname]) {
                transform.resform = '`body.' + entdesc.origname + '`'
              }
              else if (resbody[entdesc.name]) {
                transform.resform = '`body.' + entdesc.name + '`'
              }
            }
    
            if (0 < Object.entries(transform).length) {
              op.transform = transform
            }
          })
          }
          */
    });
    console.log('USER');
    console.dir(entityDescs.user, { depth: null });
    return entityDescs;
}
function resolveEntity(entityDescs, pathDef, pathStr, methodDef, methodStr) {
    let entdesc;
    let entname = '';
    let origentname = '';
    const m = pathStr.match(/\/([a-zA-Z0-1_-]+)(\/\{([a-zA-Z0-1_-]+)\})?$/);
    if (m) {
        let pathName = m[1];
        origentname = (0, jostraca_1.snakify)(pathName);
        // Check schema
        const compname = resolveComponentName(methodDef, methodStr);
        if (compname) {
            origentname = (0, jostraca_1.snakify)(compname);
        }
        entname = (0, utility_1.depluralize)(origentname);
        entdesc = (entityDescs[entname] = entityDescs[entname] || {
            name: entname,
            id: Math.random()
        });
        let pathParam = m[3];
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
    return entdesc;
}
const REQKIND = {
    get: 'res',
    post: 'req',
    put: 'req',
    patch: 'req',
};
function resolveComponentName(methodDef, methodStr) {
    const kind = REQKIND[methodStr];
    let compname = undefined;
    let content = undefined;
    if ('req' === kind) {
        content = methodDef.requestBody?.content;
    }
    else {
        const responses = methodDef.responses;
        const resdef = responses?.['201'] || responses?.['200'];
        content = resdef?.content;
    }
    // console.log('RCN', methodStr, content?.['application/json']?.schema)
    if (null != content) {
        const schema = content['application/json']?.schema;
        if (schema) {
            let xref = schema['x-ref'];
            // console.log('RCN-XREF', methodStr, 'xref-0', xref)
            if (null == xref) {
                const properties = schema.properties || {};
                (0, jostraca_1.each)(properties, (prop) => {
                    if (null == xref) {
                        if (prop.type === 'array') {
                            xref = prop.items?.['x-ref'];
                            // console.log('RCN', methodStr, 'xref-1', xref)
                        }
                    }
                });
            }
            if (null != xref && 'string' === typeof xref) {
                let xrefm = xref.match(/\/components\/schemas\/(.+)$/);
                if (xrefm) {
                    compname = xrefm[1];
                }
            }
        }
    }
    return compname;
}
function resolveOpName(methodStr, methodDef, pathStr, entdesc) {
    let opname = METHOD_IDOP[methodStr];
    if (null == opname)
        return;
    if ('load' === opname) {
        const islist = isListResponse(methodDef, pathStr, entdesc);
        console.log('ISLIST', pathStr, methodStr, islist);
        opname = islist ? 'list' : opname;
    }
    return opname;
}
function isListResponse(methodDef, pathStr, entdesc) {
    const responses = methodDef.responses;
    const resdef = responses?.['201'] || responses?.['200'];
    const content = resdef?.content;
    let islist = false;
    if (null != content) {
        const schema = content['application/json']?.schema;
        if (schema) {
            const properties = schema.properties || {};
            (0, jostraca_1.each)(properties, (prop) => {
                if (prop.type === 'array') {
                    if (1 === (0, struct_1.size)(properties) ||
                        prop.key$ === entdesc.name ||
                        prop.key$ === entdesc.origname ||
                        listedEntity(prop) === entdesc.name) {
                        islist = true;
                    }
                    if ('/v2/users' === pathStr) {
                        console.log('islistresponse', islist, pathStr, entdesc.name, listedEntity(prop), properties);
                    }
                }
            });
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
//# sourceMappingURL=heuristic01.js.map