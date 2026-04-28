"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldTransform = void 0;
exports.inferFieldsFromExamples = inferFieldsFromExamples;
exports.inferTypeFromValue = inferTypeFromValue;
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
const types_1 = require("../types");
const fieldTransform = async function (ctx) {
    const { apimodel, def } = ctx;
    const kit = apimodel.main[types_1.KIT];
    let msg = 'field ';
    const opFieldPrecedence = ['load', 'create', 'update', 'patch', 'list'];
    (0, jostraca_1.each)(kit.entity, (ment, _entname) => {
        const fields = ment.fields;
        const seen = {};
        for (let opname of opFieldPrecedence) {
            const mop = ment.op[opname];
            if (mop) {
                const mtargets = mop.points;
                for (let mtarget of mtargets) {
                    const opfields = resolveOpFields(ment, mop, mtarget, def);
                    for (let opfield of opfields) {
                        if (!seen[opfield.name]) {
                            fields.push(opfield);
                            seen[opfield.name] = opfield;
                        }
                        else {
                            mergeField(ment, mop, mtarget, def, seen[opfield.name], opfield);
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
function resolveOpFields(ment, mop, mtarget, def) {
    const mfields = [];
    const fielddefs = findFieldDefs(ment, mop, mtarget, def);
    for (let fielddef of fielddefs) {
        const fieldname = fielddef.key$;
        const name = (0, utility_1.canonize)((0, utility_1.normalizeFieldName)(fieldname));
        const mfield = {
            name,
            type: (0, utility_1.inferFieldType)(name, (0, utility_1.validator)(fielddef.type)),
            req: !!fielddef.required,
            op: {},
        };
        mfields.push(mfield);
    }
    return mfields;
}
function findFieldDefs(_ment, mop, mtarget, def) {
    const fielddefs = [];
    const pathdef = def.paths[mtarget.orig];
    const method = mtarget.method.toLowerCase();
    const opdef = pathdef[method];
    if (opdef) {
        const responses = opdef.responses;
        const requestBody = opdef.requestBody;
        let fieldSets;
        if (responses) {
            fieldSets = (0, jostraca_1.getx)(responses, '200 content "application/json" schema') ??
                (0, jostraca_1.getx)(responses, '200 schema');
            if ('list' == mop.name) {
                // List responses commonly come in three shapes:
                //   1. direct array — { type: array, items: { ...item } }
                //   2. wrapper object — { properties: { items: [Item], page, ... } }
                //      (a single array-of-object property inside an object schema)
                //   3. legacy "list of created items" under 201
                // Resolve to the inner item schema when we can identify one
                // unambiguously; otherwise fall through to the 200 schema as-is.
                const unwrapped = unwrapArrayWrapper(fieldSets);
                if (unwrapped) {
                    fieldSets = unwrapped;
                }
                else {
                    const fromCreated = (0, jostraca_1.getx)(responses, '201 content "application/json" schema items') ??
                        (0, jostraca_1.getx)(responses, '201 schema items');
                    if (fromCreated)
                        fieldSets = fromCreated;
                }
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
            const requiredNames = Array.isArray(fieldSet?.required)
                ? fieldSet.required : [];
            (0, jostraca_1.each)(fieldSet?.properties, (property) => {
                if (requiredNames.includes(property.key$)) {
                    property.required = true;
                }
                fielddefs.push(property);
            });
        });
    }
    // Fallback: infer fields from example response data when no schema properties found
    if (0 === fielddefs.length && opdef) {
        const exampleFields = inferFieldsFromExamples(opdef);
        for (const ef of exampleFields) {
            fielddefs.push(ef);
        }
    }
    return fielddefs;
}
function inferFieldsFromExamples(opdef) {
    const example = findExampleObject(opdef);
    if (null == example || 'object' !== typeof example || Array.isArray(example)) {
        return [];
    }
    const fielddefs = [];
    for (const [key, value] of Object.entries(example).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
        const fielddef = {
            key$: key,
            type: inferTypeFromValue(value),
        };
        fielddefs.push(fielddef);
    }
    return fielddefs;
}
function findExampleObject(opdef) {
    const responses = opdef.responses;
    if (null == responses)
        return null;
    const resdef = responses[200] ?? responses[201] ?? responses['200'] ?? responses['201'];
    if (null == resdef)
        return null;
    // OpenAPI 3.x: content.application/json.example
    let example = (0, jostraca_1.getx)(resdef, 'content "application/json" example');
    if (null != example && 'object' === typeof example)
        return unwrapExample(example);
    // OpenAPI 3.x: content.application/json.examples (named examples — take first)
    const examples = (0, jostraca_1.getx)(resdef, 'content "application/json" examples');
    if (null != examples && 'object' === typeof examples) {
        for (const val of Object.values(examples)) {
            const ex = val?.value;
            if (null != ex && 'object' === typeof ex)
                return unwrapExample(ex);
        }
    }
    // OpenAPI 3.x: content.application/json.schema.example
    example = (0, jostraca_1.getx)(resdef, 'content "application/json" schema example');
    if (null != example && 'object' === typeof example)
        return unwrapExample(example);
    // Swagger 2.0: response.example / response.examples.application/json
    example = resdef.example;
    if (null != example && 'object' === typeof example)
        return unwrapExample(example);
    example = (0, jostraca_1.getx)(resdef, 'examples "application/json"');
    if (null != example && 'object' === typeof example)
        return unwrapExample(example);
    // Swagger 2.0: schema.example
    example = (0, jostraca_1.getx)(resdef, 'schema example');
    if (null != example && 'object' === typeof example)
        return unwrapExample(example);
    return null;
}
// If the example is a wrapper with a single array property, unwrap to the first item
function unwrapExample(example) {
    if (Array.isArray(example)) {
        return example.length > 0 ? example[0] : null;
    }
    return example;
}
// unwrapArrayWrapper inspects a list-response schema and, when it is an
// object with a single array-of-object-schema property (e.g.
// { boards: [Board] }, { items: [Foo], page, total, ... }), returns the
// inner item schema so that field resolution sees the actual entity
// properties rather than the wrapper's bookkeeping.
//
// Returns null if the input is not unambiguously such a wrapper:
//   - schema is already an array → return null (let caller use it directly)
//   - no array-of-object-schema property → return null
//   - more than one array-of-object-schema property → ambiguous, return null
function unwrapArrayWrapper(schema) {
    if (null == schema || 'object' !== typeof schema)
        return null;
    // Direct list shape — caller can resolve from items directly.
    if (schema.type === 'array' && schema.items) {
        const items = schema.items;
        if (items && (items.properties || Array.isArray(items.allOf))) {
            return items;
        }
        return null;
    }
    if (null == schema.properties || 'object' !== typeof schema.properties)
        return null;
    let resolved = null;
    for (const key of Object.keys(schema.properties)) {
        const prop = schema.properties[key];
        if (null == prop || 'object' !== typeof prop)
            continue;
        if (prop.type !== 'array' || null == prop.items)
            continue;
        const items = prop.items;
        if (null == items || 'object' !== typeof items)
            continue;
        if (!items.properties && !Array.isArray(items.allOf))
            continue;
        if (resolved != null)
            return null; // ambiguous: multiple array-of-object props
        resolved = items;
    }
    return resolved;
}
function inferTypeFromValue(value) {
    if (null == value)
        return 'string';
    if ('boolean' === typeof value)
        return 'boolean';
    if ('number' === typeof value) {
        return Number.isInteger(value) ? 'integer' : 'number';
    }
    if ('string' === typeof value)
        return 'string';
    if (Array.isArray(value))
        return 'array';
    if ('object' === typeof value)
        return 'object';
    return 'string';
}
function mergeField(ment, mop, mtarget, def, exisingField, newField) {
    if (newField.req !== exisingField.req) {
        exisingField.op[mop.name] = {
            req: newField.req,
            type: newField.type,
        };
    }
    return exisingField;
}
//# sourceMappingURL=field.js.map