"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationTransform = void 0;
const jostraca_1 = require("jostraca");
const transform_1 = require("../transform");
const utility_1 = require("../utility");
const operationTransform = async function (ctx) {
    const { apimodel, model, def } = ctx;
    const guide = model.main.api.guide;
    let msg = 'operations: ';
    const paramBuilder = (paramMap, paramDef, opModel, entityModel, pathdef, op, path, entity, model) => {
        const paramSpec = paramMap[paramDef.name] = {
            required: paramDef.required
        };
        (0, transform_1.fixName)(paramSpec, paramDef.name);
        const type = paramDef.schema ? paramDef.schema.type : paramDef.type;
        (0, transform_1.fixName)(paramSpec, type, 'type');
        // Path params are always required.
        opModel.validate.params[paramDef.name] = `\`$${paramSpec.TYPE}\``;
    };
    const queryBuilder = (queryMap, queryDef, opModel, entityModel, pathdef, op, path, entity, model) => {
        // console.log('queryDef', queryDef)
        const querySpec = queryMap[queryDef.name] = {
            required: queryDef.required
        };
        (0, transform_1.fixName)(queryMap[queryDef.name], queryDef.name);
        const type = queryDef.schema ? queryDef.schema.type : queryDef.type;
        (0, transform_1.fixName)(queryMap[queryDef.name], type, 'type');
        if (queryDef.required) {
            opModel.validate.params[queryDef.name] = `\`$${querySpec.TYPE}\``;
        }
    };
    // Resolve the JSON structure of the request or response.
    // NOTE: uses heuristics.
    const resolveTransform = (entityModel, op, kind, direction, pathdef) => {
        let out;
        let why = 'none';
        if (null != op.transform?.[direction]) {
            out = op.transform[direction];
        }
        else {
            const method = op.method;
            const mdef = pathdef[method];
            // TODO: fix getx
            // const content = 'res' === kind ?
            const content = 'resform' === direction ?
                ((0, jostraca_1.getx)(mdef, 'responses.200.content') ||
                    (0, jostraca_1.getx)(mdef, 'responses.201.content')) :
                (0, jostraca_1.getx)(mdef, 'requestBody.content');
            if (content) {
                const schema = content['application/json']?.schema;
                const propkeys = null == schema?.properties ? [] : Object.keys(schema.properties);
                const resolveDirectionTransform = 'resform' === direction ? resolveResponseTransform : resolveRequestTransform;
                [out, why]
                    = resolveDirectionTransform(entityModel, op, kind, direction, method, mdef, content, schema, propkeys);
                // out = JSON.stringify(transform)
                // out = transform
            }
            else {
                out = 'res' === kind ? '`body`' : '`reqdata`';
            }
        }
        return [out, why];
    };
    const resolveResponseTransform = (entityModel, op, kind, direction, method, mdef, content, schema, propkeys) => {
        let why = 'default';
        let transform = '`body`';
        const properties = schema?.properties;
        if (null == content || null == schema || null == propkeys || null == properties) {
            return transform;
        }
        const opname = op.key$;
        if ('list' === opname) {
            if ('array' !== schema.type) {
                if (1 === propkeys.length) {
                    why = 'list-single-prop:' + propkeys[0];
                    transform = '`body.' + propkeys[0] + '`';
                }
                else {
                    // Use sub property that is an array
                    for (let pk of propkeys) {
                        if ('array' === properties[pk]?.type) {
                            why = 'list-single-array:' + pk;
                            transform = '`body.' + pk + '`';
                            // TODO: if each item has prop === name of entity, use that, get with $EACH
                            break;
                        }
                    }
                }
            }
        }
        else {
            if ('object' === schema.type) {
                if (null == properties.id) {
                    if (1 === propkeys.length) {
                        why = 'map-single-prop:' + propkeys[0];
                        transform = '`body.' + propkeys[0] + '`';
                    }
                    else {
                        for (let pk of propkeys) {
                            if (properties[pk]?.properties?.id) {
                                why = 'map-sub-prop:' + pk;
                                transform = '`body.' + pk + '`';
                                break;
                            }
                        }
                    }
                }
            }
        }
        return [transform, why];
    };
    const resolveRequestTransform = (entityModel, op, kind, direction, method, mdef, content, schema, propkeys) => {
        let transform = '`data`';
        let why = 'default';
        const properties = schema?.properties;
        if (null == content || null == schema || null == propkeys || null == properties) {
            return transform;
        }
        const opname = op.key$;
        if ('list' === opname) {
            if ('array' !== schema.type) {
                if (1 === propkeys.length) {
                    why = 'list-single-prop:' + propkeys[0];
                    transform = { [propkeys[0]]: '`data`' };
                }
                else {
                    // Use sub property that is an array
                    for (let pk of propkeys) {
                        if ('array' === properties[pk]?.type) {
                            why = 'list-single-array:' + pk;
                            transform = { [pk]: '`data`' };
                            break;
                        }
                    }
                }
            }
        }
        else {
            if ('object' === schema.type) {
                if (null == properties.id) {
                    if (1 === propkeys.length) {
                        why = 'map-single-prop:' + propkeys[0];
                        transform = { [propkeys[0]]: '`data`' };
                    }
                    else {
                        for (let pk of propkeys) {
                            if (properties[pk]?.properties?.id) {
                                why = 'map-sub-prop:' + pk;
                                transform = { [pk]: '`data`' };
                                break;
                            }
                        }
                    }
                }
            }
        }
        return [transform, why];
    };
    const opBuilder = {
        any: (entityModel, pathdef, op, path, entity, model) => {
            const opname = op.key$;
            const method = op.method;
            const kind = transform_1.OPKIND[opname];
            const [resform, resform_COMMENT] = resolveTransform(entityModel, op, kind, 'resform', pathdef);
            const [reqform, reqform_COMMENT] = resolveTransform(entityModel, op, kind, 'reqform', pathdef);
            const opModel = {
                path: path.key$,
                pathalt: [],
                method,
                kind,
                param: {},
                query: {},
                resform_COMMENT: 'derivation: ' + resform_COMMENT,
                resform,
                reqform_COMMENT: 'derivation: ' + reqform_COMMENT,
                reqform,
                validate: {
                    params: { '`$OPEN`': true }
                }
            };
            (0, transform_1.fixName)(opModel, op.key$);
            let params = [];
            // Params are in the path
            if (0 < path.params$.length) {
                let sharedparams = (0, jostraca_1.getx)(pathdef, 'parameters?in=path') || [];
                params = sharedparams.concat((0, jostraca_1.getx)(pathdef[method], 'parameters?in=path') || []);
                // if (Array.isArray(params)) {
                params.reduce((a, p) => (paramBuilder(a, p, opModel, entityModel, pathdef, op, path, entity, model), a), opModel.param);
                //}
            }
            // Queries are after the ?
            let sharedqueries = (0, jostraca_1.getx)(pathdef, 'parameters?in!=path') || [];
            let queries = sharedqueries.concat((0, jostraca_1.getx)(pathdef[method], 'parameters?in!=path') || []);
            queries.reduce((a, p) => (queryBuilder(a, p, opModel, entityModel, pathdef, op, path, entity, model), a), opModel.query);
            let pathalt = [];
            const pathselector = makePathSelector(path.key$); // , params)
            let before = false;
            if (null != entityModel.op[opname]) {
                pathalt = entityModel.op[opname].pathalt;
                // Ordering for pathalts: most to least paramrs, then alphanumberic
                for (let i = 0; i < pathalt.length; i++) {
                    let current = pathalt[i];
                    before =
                        pathselector.pn$ > current.pn$ ||
                            (pathselector.pn$ === current.pn$ &&
                                pathselector.path <= current.path);
                    if (before) {
                        pathalt = [
                            ...pathalt.slice(0, i),
                            pathselector,
                            ...pathalt.slice(i),
                        ];
                        break;
                    }
                }
            }
            if (!before) {
                pathalt.push(pathselector);
            }
            opModel.path = pathalt[pathalt.length - 1].path;
            opModel.pathalt = pathalt;
            // console.log(opModel.pathalt)
            entityModel.op[opname] = opModel;
            return opModel;
        },
        list: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
        load: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
        create: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
        update: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
        remove: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
    };
    /*
      console.dir(
        transform({ guide }, {
          entity: {
            '`$PACK`': ['guide.entity', {
              '`$KEY`': 'name',
              op: {
                // load: ['`$IF`', ['`$SELECT`',{path:{'`$ANY`':{op:{load:'`$EXISTS`'}}}}], {
                load: ['`$IF`', 'path.*.op.load', {
                  path: () => 'foo'
                }]
              }
            }]
          }
        }), { depth: null })
    */
    (0, jostraca_1.each)(guide.entity, (guideEntity) => {
        let opcount = 0;
        const entityModel = apimodel.main.api.entity[guideEntity.key$];
        (0, jostraca_1.each)(guideEntity.path, (guidePath) => {
            const pathdef = def.paths[guidePath.key$];
            (0, jostraca_1.each)(guidePath.op, (op) => {
                const opbuild = opBuilder[op.key$];
                if (opbuild) {
                    opbuild(entityModel, pathdef, op, guidePath, guideEntity, model);
                    opcount++;
                }
            });
        });
        msg += guideEntity.name + '=' + opcount + ' ';
    });
    return { ok: true, msg };
};
exports.operationTransform = operationTransform;
function makePathSelector(path) {
    // console.log('MPS', path, params)
    let out = { path };
    let pn$ = 0;
    for (const m of path.matchAll(/\/[^\/]+\/{([^}]+)\}/g)) {
        const paramName = (0, utility_1.depluralize)((0, jostraca_1.snakify)(m[1]));
        out[m[1]] = true;
        pn$++;
    }
    out.pn$ = pn$;
    // for (let p of params) {
    //   setprop(out, p.name, getprop(out, p.name, false))
    //   console.log('SP', p.name, out[p.name])
    // }
    return out;
}
//# sourceMappingURL=operation.js.map