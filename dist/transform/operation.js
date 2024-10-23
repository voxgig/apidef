"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationTransform = operationTransform;
const jostraca_1 = require("jostraca");
const transform_1 = require("../transform");
async function operationTransform(ctx, tspec, model, def) {
    const { guide: { guide } } = ctx;
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
    const opBuilder = {
        any: (entityModel, pathdef, op, path, entity, model) => {
            const em = entityModel.op[op.key$] = {
                path: path.key$,
                method: op.val$,
                param: {},
                query: {},
            };
            (0, transform_1.fixName)(em, op.key$);
            // Params are in the path
            if (0 < path.params$.length) {
                let params = (0, jostraca_1.getx)(pathdef[op.val$], 'parameters?in=path') || [];
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
        save: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
        remove: (entityModel, pathdef, op, path, entity, model) => {
            return opBuilder.any(entityModel, pathdef, op, path, entity, model);
        },
    };
    (0, jostraca_1.each)(guide.entity, (guideEntity) => {
        const entityModel = model.main.api.entity[guideEntity.key$];
        (0, jostraca_1.each)(guideEntity.path, (guidePath) => {
            const pathdef = def.paths[guidePath.key$];
            (0, jostraca_1.each)(guidePath.op, (op) => {
                const opbuild = opBuilder[op.key$];
                if (opbuild) {
                    opbuild(entityModel, pathdef, op, guidePath, guideEntity, model);
                }
            });
        });
    });
    return { ok: true };
}
//# sourceMappingURL=operation.js.map