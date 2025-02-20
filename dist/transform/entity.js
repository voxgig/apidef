"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entityTransform = void 0;
const jostraca_1 = require("jostraca");
const transform_1 = require("../transform");
const entityTransform = async function (ctx, guide, tspec, model, def) {
    let msg = '';
    (0, jostraca_1.each)(guide.entity, (guideEntity) => {
        const entityName = guideEntity.key$;
        ctx.log.debug({ point: 'guide-entity', note: entityName });
        const entityModel = model.main.api.entity[entityName] = {
            op: {},
            field: {},
            cmd: {},
            id: {
                name: 'id',
                field: 'id',
            }
        };
        (0, transform_1.fixName)(entityModel, guideEntity.key$);
        (0, jostraca_1.each)(guideEntity.path, (guidePath) => {
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
        });
        msg += guideEntity.name + ' ';
    });
    return { ok: true, msg };
};
exports.entityTransform = entityTransform;
//# sourceMappingURL=entity.js.map