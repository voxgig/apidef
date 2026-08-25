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
                const mpoints = mop.points;
                for (let mpoint of mpoints) {
                    const opfields = resolveOpFields(ment, mop, mpoint, def);
                    for (let opfield of opfields) {
                        if (!seen[opfield.name]) {
                            fields.push(opfield);
                            seen[opfield.name] = opfield;
                        }
                        else {
                            mergeField(mop, seen[opfield.name], opfield);
                        }
                    }
                }
            }
        }
        fields.sort((a, b) => {
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        });
        // Mark the entity as having an id only when the spec actually declares one.
        // Downstream (test generators, fixture builders) gate id-specific code on
        // this presence so that public read-only APIs without ids don't get
        // bogus id assertions.
        const idField = fields.find((f) => 'id' === f.name);
        if (idField) {
            ment.id = { name: 'id', field: 'id' };
        }
        else if (addressedById(ment)) {
            // The FIELD as well as the descriptor. An entity addressed by id has an
            // id at runtime — the test fixture seeds one, and the SDK sends it — so
            // a model that declares the descriptor without the field makes the
            // generated TYPE disagree with the generated TEST: trello's Option,
            // Reaction and Sticker compiled to `TS2339: Property 'id' does not
            // exist` the moment the test started assigning data.id.
            fields.push({
                name: 'id',
                type: '`$STRING`',
                req: false,
            });
            fields.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
            // ADDRESSABLE BY ID WITHOUT DECLARING ONE AS A FIELD.
            //
            // The rule above reads the RESPONSE schema, and plenty of real entities
            // are addressed by an id their response never repeats. github's
            // private_registry is one: PATCH /orgs/{org}/private-registries/{secret_name}
            // renames secret_name to id, so the entity is addressed by id on every
            // one of its own routes, while its schema declares only created_at, key,
            // name, url and friends.
            //
            // Downstream that absence is not cosmetic. TestEntity gates
            // `data.id = <created>.id` on THIS descriptor, so the generated update
            // carried no id at all, the test mock's selector fell back to whatever
            // else was in reqdata (org_id), matched no single record, and the flow
            // failed with a 404 that named nothing to do with ids.
            //
            // An entity whose own points take an `id` param IS addressable by id;
            // that is the property the downstream generators actually want. Entities
            // with neither a field nor an id param — the read-only public APIs the
            // rule above was written for — still get no descriptor, so they still
            // get no id assertions.
            ment.id = { name: 'id', field: 'id' };
        }
        msg += ment.name + ' ';
    });
    return { ok: true, msg };
};
exports.fieldTransform = fieldTransform;
// True when any of the entity's own operation points declares an `id`
// parameter — i.e. the API addresses this entity by id, whether or not its
// response schema declares an id field.
function addressedById(ment) {
    let found = false;
    (0, jostraca_1.each)(ment.op, (mop) => {
        (0, jostraca_1.each)(mop?.points, (mpoint) => {
            (0, jostraca_1.each)(mpoint?.args?.params, (param) => {
                if (param && 'id' === param.name) {
                    found = true;
                }
            });
        });
    });
    return found;
}
function resolveOpFields(ment, mop, mpoint, def) {
    const mfields = [];
    const fielddefs = findFieldDefs(ment, mop, mpoint, def);
    for (let fielddef of fielddefs) {
        const fieldname = fielddef.key$;
        // Field names are WIRE identifiers — see canonizeField. Using the
        // entity-name canonizer here renamed modelType -> model_type and
        // items -> item, so the SDK read keys the server never sends.
        const name = (0, utility_1.canonizeField)((0, utility_1.normalizeFieldName)(fieldname));
        const mfield = {
            name,
            type: (0, utility_1.inferFieldType)(name, (0, utility_1.validator)(fielddef.type)),
            req: !!fielddef.required,
            op: {},
        };
        // Carry the spec's own words for the field, when it has any.
        //
        // Every generated per-entity table has a Description column and every cell
        // was blank, because nothing ever read the property `description` the spec
        // supplies. Trimmed, and only when it is a non-empty string: a whitespace
        // or non-string value would put a meaningless cell where an empty one is
        // honest.
        // ONE LINE, not the whole description. Every generated Readme drops this
        // straight into a markdown table cell, where a raw newline ends the row
        // and orphans the rest of the table — and specs put bullet lists, fenced
        // examples and multi-paragraph notes in `description`. firstSentence is
        // the same reduction the API summary uses, so `short` means the same
        // thing wherever it appears.
        const fdesc = fielddef.description;
        if ('string' === typeof fdesc && '' !== fdesc.trim()) {
            const short = (0, utility_1.firstSentence)(fdesc);
            if ('' !== short) {
                mfield.short = short;
            }
        }
        // Record an untagged union under this field. The field is already typed
        // openly ($ANY/$ARRAY/$OBJECT) because there is nothing to narrow it to;
        // this says WHY, so the generated docs can explain the open type instead
        // of leaving it looking like a modelling failure.
        const union = (0, utility_1.scanUntaggedUnion)(fielddef);
        if (null != union) {
            mfield.union = union;
        }
        mfields.push(mfield);
    }
    return mfields;
}
// GraphQL entity fields come straight from the object type: every
// non-deprecated scalar field, minus any that require arguments (selecting
// `download(format: Format!)` without binding its argument makes every
// operation using the fragment fail GraphQL validation), plus one id-stub
// reference per to-one relation.
function findGraphqlFieldDefs(ment, mpoint, def) {
    const typeName = mpoint.graphql?.entityType$ ??
        ment.orig$ ?? '';
    const gtype = def.types?.[typeName];
    if (null == gtype) {
        return [];
    }
    const out = [];
    // Sorted by construction in parse/graphql.ts, so output stays byte-stable.
    for (const fname of Object.keys(gtype.fields)) {
        const f = gtype.fields[fname];
        if (f.deprecated) {
            continue;
        }
        // A field taking required arguments cannot appear in a fixed fragment.
        if (f.args.some((a) => a.reqd)) {
            continue;
        }
        const ftype = def.types?.[f.type];
        const kind = ftype?.kind;
        if ('SCALAR' === kind || 'ENUM' === kind) {
            out.push({
                key$: fname,
                // Enum values are always strings; scalars map by name, with unknown
                // custom scalars left unconstrained.
                type: 'ENUM' === kind ? 'string' : gqlFieldType(f.type),
                required: f.reqd,
                // GraphQL puts the field's own words on GqlField.desc (see
                // parse/graphql.ts). resolveOpFields reads `description`, the OpenAPI
                // spelling, so name it that here rather than teaching the reader two.
                description: f.desc,
            });
        }
        else if (('OBJECT' === kind || 'INTERFACE' === kind) && !f.list) {
            // To-one relation. The default fragment selects `team { id }`, so the
            // response carries a nested stub object — declare it as such. Naming a
            // flat `team_id` here would advertise a field the wire never returns,
            // since nothing flattens the response.
            const idField = ftype.fields?.id;
            if (null != idField) {
                out.push({
                    key$: fname,
                    type: 'object',
                    required: false,
                    description: f.desc,
                });
            }
        }
    }
    return out;
}
// GraphQL named type -> the type names the field typing understands.
//
// Built-ins only: a custom scalar (JSON, JSONObject, Upload, ...) can hold
// any JSON value, so advertising it as a string would misdescribe the data
// and make generated validation reject values the schema accepts. Enums are
// mapped by the caller, which knows they are strings.
function gqlFieldType(typeName) {
    return 'Int' === typeName ? 'integer' :
        'Float' === typeName ? 'number' :
            'Boolean' === typeName ? 'boolean' :
                ('String' === typeName || 'ID' === typeName) ? 'string' :
                    undefined;
}
function findFieldDefs(_ment, mop, mpoint, def) {
    if ('graphql' === mpoint.kind) {
        return findGraphqlFieldDefs(_ment, mpoint, def);
    }
    const fielddefs = [];
    const pathdef = def.paths[mpoint.orig];
    const method = mpoint.method.toLowerCase();
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
            // Single-entity responses get the same treatment the list branch above
            // already gives collections: a body that is only an envelope around the
            // entity — `{item: {...}}` — describes the WRAPPER, not the entity, so
            // its sole property would otherwise be harvested as a field. That is
            // how an entity `todoitem` ended up with a required `item` field of
            // type object, which then appeared in the generated create/update data
            // types. envelopeProp applies the same two rules used to pick the
            // response transform, so the field list and the transform agree.
            if ('list' != mop.name) {
                const envelope = (0, utility_1.envelopeProp)(fieldSets?.properties, mop.name);
                if (null != envelope) {
                    fieldSets = fieldSets.properties[envelope];
                }
            }
        }
        // A QUERY (RFC 10008) request body is a filter/query schema, not the
        // entity shape, so it must not contribute entity fields. Fields for a
        // QUERY op come from its response only. Other methods (POST/PUT/PATCH)
        // carry the entity in the body, so merge as usual.
        if (requestBody && 'query' !== method) {
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
                // Don't mutate the parsed schema: a $ref-resolved schema is shared
                // across every operation that references it, so flipping
                // `property.required = true` here would leak this operation's
                // required[] onto all the others. Derive `required` onto a shallow
                // copy instead (matches the Go port, which builds fresh field defs).
                if (!property.required && requiredNames.includes(property.key$)) {
                    fielddefs.push({ ...property, required: true });
                }
                else {
                    fielddefs.push(property);
                }
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
    const resdef = responses['200'] ?? responses['201'];
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
function mergeField(mop, existingField, newField) {
    if (newField.req !== existingField.req) {
        existingField.op[mop.name] = {
            req: newField.req,
            type: newField.type,
        };
    }
    // Field identity is first-writer-wins, but a DESCRIPTION is not part of
    // identity: the op that first names a field is often not the one that
    // documents it (a load response referencing a bare component, a create body
    // referencing the annotated one). Take the first non-empty description in
    // opFieldPrecedence order and keep it — dropping it left a blank cell in
    // every generated table while the spec had the words all along.
    if (null == existingField.short && null != newField.short) {
        existingField.short = newField.short;
    }
    return existingField;
}
//# sourceMappingURL=field.js.map