"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationTransform = void 0;
const jostraca_1 = require("jostraca");
const transform_1 = require("../transform");
const operationTransform = async function (ctx, guide, tspec, model, def) {
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
    // Resolve the JSON path to the data (the "place").
    const resolvePlace = (op, kind, pathdef) => {
        const opname = op.key$;
        // console.log('RP', kind, op)
        let place = null == op.place ? '' : op.place;
        if (null != place && '' !== place) {
            return place;
        }
        const method = op.method;
        const mdef = pathdef[method];
        // TODO: fix getx
        const content = 'res' === kind ?
            ((0, jostraca_1.getx)(mdef, 'responses.200.content') ||
                (0, jostraca_1.getx)(mdef, 'responses.201.content')) :
            (0, jostraca_1.getx)(mdef, 'requestBody.content');
        // console.log('RP', kind, op, 'content', null == content)
        if (null == content) {
            return place;
        }
        const schema = content['application/json']?.schema;
        // console.log('RP', kind, op, 'schema', null == schema)
        if (null == schema) {
            return place;
        }
        const propkeys = null == schema.properties ? [] : Object.keys(schema.properties);
        // HEURISTIC: guess place
        if ('list' === opname) {
            if ('array' === schema.type) {
                place = '';
            }
            else {
                if (1 === propkeys.length) {
                    place = propkeys[0];
                }
                else {
                    // Use sub property that is an array
                    for (let pk of propkeys) {
                        if ('array' === schema.properties[pk]?.type) {
                            place = pk;
                            break;
                        }
                    }
                }
            }
        }
        else {
            if ('object' === schema.type) {
                if (schema.properties.id) {
                    place = ''; // top level
                }
                else {
                    if (1 === propkeys.length) {
                        place = propkeys[0];
                    }
                    else {
                        // Use sub property with an id
                        for (let pk of propkeys) {
                            if (schema.properties[pk].properties?.id) {
                                place = pk;
                                break;
                            }
                        }
                    }
                }
            }
        }
        // console.log('PLACE', op, kind, schema.type, 'P=', place)
        return place;
    };
    const opBuilder = {
        any: (entityModel, pathdef, op, path, entity, model) => {
            // console.log('OP', op, pathdef, path, entity)
            const opname = op.key$;
            const method = op.val$;
            const kind = transform_1.OPKIND[opname];
            // console.log('EM', entityModel.name)
            const em = entityModel.op[opname] = {
                path: path.key$,
                method: op.val$,
                kind,
                param: {},
                query: {},
                place: resolvePlace(op, kind, pathdef)
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
        const entityModel = model.main.api.entity[guideEntity.key$];
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