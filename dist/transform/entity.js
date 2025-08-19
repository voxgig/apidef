"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entityTransform = void 0;
const jostraca_1 = require("jostraca");
const transform_1 = require("../transform");
const utility_1 = require("../utility");
const entityTransform = async function (ctx) {
    const { apimodel, model, def, guide } = ctx;
    let msg = '';
    (0, jostraca_1.each)(guide.entity, (guideEntity) => {
        const entityName = guideEntity.key$;
        ctx.log.debug({ point: 'guide-entity', note: entityName });
        const entityModel = apimodel.main.api.entity[entityName] = {
            op: {},
            field: {},
            cmd: {},
            id: {
                name: 'id',
                field: 'id',
            },
            ancestors: []
        };
        (0, transform_1.fixName)(entityModel, guideEntity.key$);
        let ancestors = [];
        let ancestorsDone = false;
        (0, jostraca_1.each)(guideEntity.path, (guidePath, pathStr) => {
            const path = guidePath.key$;
            const pathdef = def.paths[path];
            if (null == pathdef) {
                throw new Error('path not found in OpenAPI: ' + path +
                    ' (entity: ' + guideEntity.name + ')');
            }
            // TODO: is this needed?
            guidePath.parts$ = path.split('/');
            guidePath.params$ = guidePath.parts$
                .filter((p) => p.startsWith('{'))
                .map((p) => p.substring(1, p.length - 1));
            if (!ancestorsDone) {
                // Find all path sections matching /foo/{..param..} and build ancestors array
                const paramRegex = /\/([a-zA-Z0-9_-]+)\/\{[a-zA-Z0-9_-]+\}/g;
                let m;
                while ((m = paramRegex.exec(pathStr)) !== null) {
                    // Skip if this is the last section (the entity itself)
                    const remainingPath = pathStr.substring(m.index + m[0].length);
                    if (remainingPath.length > 0) {
                        const ancestorName = (0, utility_1.depluralize)((0, jostraca_1.snakify)(m[1]));
                        ancestors.push(ancestorName);
                    }
                }
                ancestorsDone = true;
            }
        });
        entityModel.ancestors = ancestors;
        msg += guideEntity.name + ' ';
    });
    return { ok: true, msg };
};
exports.entityTransform = entityTransform;
//# sourceMappingURL=entity.js.map