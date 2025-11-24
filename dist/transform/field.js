"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldTransform = void 0;
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
const fieldTransform = async function (ctx) {
    const { apimodel, def } = ctx;
    let msg = 'field ';
    const opFieldPrecedence = ['load', 'create', 'update', 'patch', 'list'];
    (0, jostraca_1.each)(apimodel.main.sdk.entity, (ment, entname) => {
        const fielddefs = [];
        const fields = ment.fields;
        const seen = {};
        for (let opname of opFieldPrecedence) {
            const mop = ment.op[opname];
            if (mop) {
                const malts = mop.alts;
                for (let malt of malts) {
                    const opfields = resolveOpFields(ment, mop, malt, def);
                    for (let opfield of opfields) {
                        if (!seen[opfield.name]) {
                            fields.push(opfield);
                            seen[opfield.name] = opfield;
                        }
                        else {
                            mergeField(ment, mop, malt, def, seen[opfield.name], opfield);
                        }
                    }
                }
            }
        }
        fields.sort((a, b) => {
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        });
        msg += ment.name + ' ';
    });
    return { ok: true, msg };
};
exports.fieldTransform = fieldTransform;
function resolveOpFields(ment, mop, malt, def) {
    const mfields = [];
    const fielddefs = findFieldDefs(ment, mop, malt, def);
    for (let fielddef of fielddefs) {
        const fieldname = fielddef.key$;
        const mfield = {
            name: (0, utility_1.canonize)(fieldname),
            type: (0, utility_1.validator)(fielddef.type),
            req: !!fielddef.required,
            op: {},
        };
        mfields.push(mfield);
    }
    return mfields;
}
function findFieldDefs(ment, mop, malt, def) {
    const fielddefs = [];
    const pathdef = def.paths[malt.orig];
    const method = malt.method.toLowerCase();
    const opdef = pathdef[method];
    if (opdef) {
        const responses = opdef.responses;
        const requestBody = opdef.requestBody;
        let fieldSets;
        if (responses) {
            fieldSets = (0, jostraca_1.getx)(responses, '200 content "application/json" schema') ??
                (0, jostraca_1.getx)(responses, '200 schema');
            if ('get' === method && 'list' == mop.name) {
                fieldSets = (0, jostraca_1.getx)(responses, '201 content "application/json" schema items') ??
                    (0, jostraca_1.getx)(responses, '201 schema items');
            }
            else if ('put' === method && null == fieldSets) {
                fieldSets = (0, jostraca_1.getx)(responses, '201 content "application/json" schema') ??
                    (0, jostraca_1.getx)(responses, '201 schema');
            }
        }
        if (requestBody) {
            fieldSets = [
                fieldSets,
                (0, jostraca_1.getx)(requestBody, 'content "application/json" schema') ??
                    (0, jostraca_1.getx)(requestBody, 'schema')
            ];
        }
        if (fieldSets) {
            if (Array.isArray(fieldSets.allOf)) {
                fieldSets = fieldSets.allOf;
            }
            else if (fieldSets.properties) {
                fieldSets = [fieldSets];
            }
        }
        (0, jostraca_1.each)(fieldSets, (fieldSet) => {
            (0, jostraca_1.each)(fieldSet?.properties, (property) => {
                fielddefs.push(property);
            });
        });
    }
    return fielddefs;
}
function mergeField(ment, mop, malt, def, exisingField, newField) {
    if (newField.req !== exisingField.req) {
        exisingField.op[mop.name] = {
            req: newField.req,
            type: newField.type,
        };
    }
    return exisingField;
}
//# sourceMappingURL=field.js.map