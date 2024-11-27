"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entityTransform = entityTransform;
const jostraca_1 = require("jostraca");
const transform_1 = require("../transform");
async function entityTransform(ctx, tspec, model, def) {
    const { model: { main: { guide } } } = ctx;
    let msg = '';
    // console.log('DEF', def)
    (0, jostraca_1.each)(guide.entity, (guideEntity) => {
        const entityModel = model.main.api.entity[guideEntity.key$] = {
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
            const pathdef = def.paths[guidePath.key$];
            if (null == pathdef) {
                throw new Error('APIDEF: path not found in OpenAPI: ' + guidePath.key$ +
                    ' (entity: ' + guideEntity.name + ')');
            }
            guidePath.parts$ = guidePath.key$.split('/');
            guidePath.params$ = guidePath.parts$
                .filter((p) => p.startsWith('{'))
                .map((p) => p.substring(1, p.length - 1));
        });
        msg += guideEntity.name + ' ';
    });
    return { ok: true, msg };
}
//# sourceMappingURL=entity.js.map