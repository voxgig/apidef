"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldTransform = fieldTransform;
const jostraca_1 = require("jostraca");
const transform_1 = require("../transform");
async function fieldTransform(ctx, tspec, model, def) {
    const { guide: { guide } } = ctx;
    (0, jostraca_1.each)(guide.entity, (guideEntity) => {
        const entityModel = model.main.api.entity[guideEntity.key$];
        (0, jostraca_1.each)(guideEntity.path, (guidePath) => {
            const pathdef = def.paths[guidePath.key$];
            (0, jostraca_1.each)(guidePath.op, (op) => {
                if ('load' === op.key$) {
                    fieldbuild(entityModel, pathdef, op, guidePath, guideEntity, model);
                }
            });
        });
    });
    return { ok: true };
}
function fieldbuild(entityModel, pathdef, op, path, entity, model) {
    // console.log('FB-A', op, pathdef)
    let fieldSets = (0, jostraca_1.getx)(pathdef.get, 'responses 200 content "application/json" schema');
    if (fieldSets) {
        if (Array.isArray(fieldSets.allOf)) {
            fieldSets = fieldSets.allOf;
        }
        else if (fieldSets.properties) {
            fieldSets = [fieldSets];
        }
    }
    (0, jostraca_1.each)(fieldSets, (fieldSet) => {
        (0, jostraca_1.each)(fieldSet.properties, (property) => {
            // console.log(property)
            const field = (entityModel.field[property.key$] = entityModel.field[property.key$] || {});
            field.name = property.key$;
            (0, transform_1.fixName)(field, field.name);
            field.type = property.type;
            (0, transform_1.fixName)(field, field.type, 'type');
            field.short = property.description;
            // console.log('FB-ID', field.name, entityModel.param)
        });
    });
    // Guess id field name using GET path param
    if ('load' === op.key$) {
        const getdef = pathdef.get;
        const getparams = getdef.parameters || [];
        if (1 === getparams.length) {
            if (entityModel.op.load.path.match(RegExp('\\{' + getdef.parameters[0].name + '\\}$'))) {
                entityModel.id.field = getdef.parameters[0].name;
            }
        }
    }
}
//# sourceMappingURL=fieldTransform.js.map