"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationTransform = void 0;
const jostraca_1 = require("jostraca");
const transform_1 = require("../transform");
const operationTransform = async function (ctx) {
    const { apimodel, model, def } = ctx;
    const guide = model.main.api.guide;
    let msg = 'operations: ';
    const paramBuilder = (paramMap, paramDef, entityModel, pathdef, op, path, entity, model) => {
        paramMap[paramDef.name] = {
            required: paramDef.required
        };
        (0, transform_1.fixName)(paramMap[paramDef.name], paramDef.name);
        const type = paramDef.schema ? paramDef.schema.type : paramDef.type;
        (0, transform_1.fixName)(paramMap[paramDef.name], type, 'type');
    };
    const queryBuilder = (queryMap, queryDef, entityModel, pathdef, op, path, entity, model) => {
        queryMap[queryDef.name] = {
            required: queryDef.required
        };
        (0, transform_1.fixName)(queryMap[queryDef.name], queryDef.name);
        const type = queryDef.schema ? queryDef.schema.type : queryDef.type;
        (0, transform_1.fixName)(queryMap[queryDef.name], type, 'type');
    };
    // Resolve the JSON structure of the request or response.
    // NOTE: uses heuristics.
    const resolveTransform = (entityModel, op, kind, direction, pathdef) => {
        let out;
        if (null != op.transform?.[direction]) {
            out = op.transform[direction];
        }
        else {
            const method = op.method;
            const mdef = pathdef[method];
            // TODO: fix getx
            const content = 'res' === kind ?
                ((0, jostraca_1.getx)(mdef, 'responses.200.content') ||
                    (0, jostraca_1.getx)(mdef, 'responses.201.content')) :
                (0, jostraca_1.getx)(mdef, 'requestBody.content');
            // console.log(entityModel)
            // console.log(mdef)
            // console.log(getx(mdef, 'responses.200.content'))
            // console.log(kind, method, pathdef, content)
            if (content) {
                const schema = content['application/json']?.schema;
                const propkeys = null == schema?.properties ? [] : Object.keys(schema.properties);
                const resolveDirectionTransform = 'resform' === direction ? resolveResponseTransform : resolveRequestTransform;
                const transform = resolveDirectionTransform(op, kind, method, mdef, content, schema, propkeys);
                // out = JSON.stringify(transform)
                out = transform;
            }
            else {
                out = 'res' === kind ? '`body`' : '`reqdata`';
            }
        }
        return out;
    };
    const resolveResponseTransform = (op, kind, method, mdef, content, schema, propkeys) => {
        let transform = '`body`';
        if (null == content || null == schema || null == propkeys) {
            return transform;
        }
        const opname = op.key$;
        if ('list' === opname) {
            if ('array' !== schema.type) {
                if (1 === propkeys.length) {
                    transform = '`body.' + propkeys[0] + '`';
                }
                else {
                    // Use sub property that is an array
                    for (let pk of propkeys) {
                        if ('array' === schema.properties[pk]?.type) {
                            transform = '`body.' + pk + '`';
                            break;
                        }
                    }
                }
            }
        }
        else {
            if ('object' === schema.type) {
                if (null == schema.properties.id) {
                    if (1 === propkeys.length) {
                        transform = '`body.' + propkeys[0] + '`';
                    }
                    else {
                        for (let pk of propkeys) {
                            if (schema.properties[pk].properties?.id) {
                                transform = '`body.' + pk + '`';
                                break;
                            }
                        }
                    }
                }
            }
        }
        return transform;
    };
    const resolveRequestTransform = (op, kind, method, mdef, content, schema, propkeys) => {
        let transform = '`data`';
        if (null == content || null == schema || null == propkeys) {
            return transform;
        }
        const opname = op.key$;
        if ('list' === opname) {
            if ('array' !== schema.type) {
                if (1 === propkeys.length) {
                    transform = { [propkeys[0]]: '`data`' };
                }
                else {
                    // Use sub property that is an array
                    for (let pk of propkeys) {
                        if ('array' === schema.properties[pk]?.type) {
                            transform = { [pk]: '`data`' };
                            break;
                        }
                    }
                }
            }
        }
        else {
            if ('object' === schema.type) {
                if (null == schema.properties.id) {
                    if (1 === propkeys.length) {
                        transform = { [propkeys[0]]: '`data`' };
                    }
                    else {
                        for (let pk of propkeys) {
                            if (schema.properties[pk].properties?.id) {
                                transform = { [pk]: '`data`' };
                                break;
                            }
                        }
                    }
                }
            }
        }
        return transform;
    };
    const opBuilder = {
        any: (entityModel, pathdef, op, path, entity, model) => {
            const opname = op.key$;
            const method = op.method;
            const kind = transform_1.OPKIND[opname];
            const em = entityModel.op[opname] = {
                path: path.key$,
                method,
                kind,
                param: {},
                query: {},
                // transform: {
                resform: resolveTransform(entityModel, op, kind, 'resform', pathdef),
                reqform: resolveTransform(entityModel, op, kind, 'reqform', pathdef),
                // }
            };
            (0, transform_1.fixName)(em, op.key$);
            // Params are in the path
            if (0 < path.params$.length) {
                let params = (0, jostraca_1.getx)(pathdef[method], 'parameters?in=path') || [];
                if (Array.isArray(params)) {
                    params.reduce((a, p) => (paramBuilder(a, p, entityModel, pathdef, op, path, entity, model), a), em.param);
                }
            }
            // Queries are after the ?
            let queries = (0, jostraca_1.getx)(pathdef[op.val$], 'parameters?in!=path') || [];
            if (Array.isArray(queries)) {
                queries.reduce((a, p) => (queryBuilder(a, p, entityModel, pathdef, op, path, entity, model), a), em.query);
            }
            return em;
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
//# sourceMappingURL=operation.js.map