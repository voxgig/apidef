"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldTransform = void 0;
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
// import { fixName } from '../transform'
const fieldTransform = async function (ctx) {
    const { apimodel, model, def, guide } = ctx;
    let msg = 'fields: ';
    (0, jostraca_1.each)(guide.entity, (guideEntity) => {
        const entityName = guideEntity.key$;
        const entityModel = apimodel.main.api.entity[entityName];
        let fieldCount = 0;
        (0, jostraca_1.each)(guideEntity.path, (guidePath) => {
            const path = guidePath.key$;
            const pathdef = def.paths[path];
            (0, jostraca_1.each)(guidePath.op, (op) => {
                const opname = op.key$;
                if ('load' === opname) {
                    fieldCount = fieldbuild(entityModel, pathdef, op, guidePath, guideEntity, model);
                }
            });
        });
        msg += guideEntity.name + '=' + fieldCount + ' ';
    });
    return { ok: true, msg };
};
exports.fieldTransform = fieldTransform;
function fieldbuild(entityModel, pathdef, op, path, entity, model) {
    let fieldCount = 0;
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
            const field = (entityModel.field[property.key$] = entityModel.field[property.key$] || {});
            field.name = canonize(property.key$);
            // fixName(field, field.name)
            // field.type = property.type
            resolveFieldType(entityModel, field, property);
            // fixName(field, field.type, 'type')
            field.short = property.description;
            fieldCount++;
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
    return fieldCount;
}
// Resovles a heuristic "primary" type which subsumes the more detailed type.
// The primary type is only: string, number, boolean, null, object, array
function resolveFieldType(entity, field, property) {
    const ptt = typeof property.type;
    if ('string' === ptt) {
        field.type = canonize(property.type);
    }
    else if (Array.isArray(property.type)) {
        field.type = canonize((property.type.filter((t) => 'null' != t).sort()[0]) ||
            property.type[0] ||
            'string');
        field.typelist = property.type;
    }
    else if ('undefined' === ptt && null != property.enum) {
        field.type = 'string';
        field.enum = property.enum;
    }
    else {
        throw new Error(`APIDEF: Unsupported property type: ${property.type} (${entity.name}.${field.name})`);
    }
}
function canonize(s) {
    return (0, utility_1.depluralize)((0, jostraca_1.snakify)(s));
}
//# sourceMappingURL=field.js.map