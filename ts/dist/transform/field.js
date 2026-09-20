"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldTransform = void 0;
exports.inferFieldsFromExamples = inferFieldsFromExamples;
exports.inferTypeFromValue = inferTypeFromValue;
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
const types_1 = require("../types");
const fieldTransform = async function (ctx) {
    const { apimodel, def, guide, model } = ctx;
    const kit = apimodel.main[types_1.KIT];
    let msg = 'field ';
    const opFieldPrecedence = ['load', 'create', 'update', 'patch', 'list'];
    (0, jostraca_1.each)(kit.entity, (ment, _entname) => {
        const fields = ment.fields;
        for (let opname of opFieldPrecedence) {
            const mop = ment.op[opname];
            if (mop) {
                const mpoints = mop.points;
                for (let mpoint of mpoints) {
                    const opfields = resolveOpFields(ment, mop, mpoint, def);
                    for (let opfield of opfields) {
                        if (!Object.prototype.hasOwnProperty.call(fields, opfield.n)) {
                            fields[opfield.n] = opfield;
                        }
                        else {
                            mergeField(mop, fields[opfield.n], opfield);
                        }
                    }
                }
            }
        }
        const gent = guide?.entity?.[ment.name];
        const composite = compositeId(ment, gent, def);
        const idField = fields.id;
        if (null != composite.parts && null != idField && !scalarStringField(idField)) {
            const idf = idField;
            const apiname = String(model?.name || 'api');
            const keep = apiname + '_id';
            if (!Object.prototype.hasOwnProperty.call(fields, keep)) {
                // A DEEP COPY, because the move is followed by deletions on the
                // original. A spread shares the `op` object, so clearing the stale
                // per-op `type` off `id` cleared it off the preserved field too —
                // the preservation preserved nothing for exactly the key it was
                // added to keep.
                fields[keep] = JSON.parse(JSON.stringify({ ...idf, n: keep }));
                const alias = (ment.alias = ment.alias || {});
                alias.field = alias.field || {};
                alias.field[keep] = 'id';
            }
            idf.t = '`$STRING`';
            // The facts that described the moved type go with it: `fo: int64`
            // beside a string, or a per-op `type` override still saying integer,
            // is a model contradicting itself — and the op override is what a
            // generator reads for that op.
            delete idf.fo;
            for (const opname of Object.keys(idf.op || {})) {
                delete idf.op[opname].type;
            }
        }
        if (null != composite.parts && null == idField) {
            // The FIELD as well as the descriptor, for the reason the branch below
            // documents: a model that declares the descriptor without the field
            // makes the generated type disagree with the generated test.
            fields.id = {
                n: 'id',
                h: (0, utility_1.humanTitle)('id'),
                t: '`$STRING`',
                r: false,
            };
        }
        const singleKey = composite.single;
        delete composite.single;
        if (null == idField && null != singleKey && null == composite.parts) {
            // The guide disabled composite; the terminal parameter is the key, and
            // the entity needs the field to carry it for the same reason the
            // composite branch above does.
            fields.id = {
                n: 'id',
                h: (0, utility_1.humanTitle)('id'),
                t: '`$STRING`',
                r: false,
            };
        }
        if (idField || null != composite.parts || null != singleKey) {
            ment.id = { name: 'id', field: 'id', ...composite };
        }
        else if (addressedById(ment)) {
            fields.id = {
                n: 'id',
                h: (0, utility_1.humanTitle)('id'),
                t: '`$STRING`',
                r: false,
            };
            ment.id = { name: 'id', field: 'id', ...composite };
        }
        ment.fields = Object.fromEntries(Object.keys(fields).sort().map(n => {
            const field = fields[n];
            field.h = (0, utility_1.humanTitle)(field.n);
            return [n, field];
        }));
        msg += ment.name + ' ';
    });
    return { ok: true, msg };
};
exports.fieldTransform = fieldTransform;
const ID_SEP = '/';
// Subfields that conventionally carry the identifying value of a nested
// object, in preference order. github's repo `owner` is a user object whose
// identifier is `login`; other specs use `name`, `slug` or `key`. `id` is
// last: it is the most common name and the least likely to be the value a
// PATH parameter takes (a path that wanted an id would say so).
const NESTED_ID_KEYS = ['login', 'slug', 'name', 'key', 'id'];
// The ops that address ONE record, most authoritative first. Only a
// tie-break: identityParams compares candidates from all of them.
const ID_OPS = ['load', 'update', 'patch', 'remove'];
function trailingVars(point) {
    const segs = (point?.segments || []).filter((s) => null != s);
    const run = [];
    for (let i = segs.length - 1; 0 <= i; i--) {
        if (null == segs[i].var) {
            break;
        }
        run.unshift(String(segs[i].var));
    }
    return run;
}
function identityParams(ment) {
    const cands = [];
    for (let o = 0; o < ID_OPS.length; o++) {
        const mop = ment.op?.[ID_OPS[o]];
        if (null == mop) {
            continue;
        }
        // Action points are verbs dispatched by `$action`, not addresses.
        for (const pt of (mop.points || [])) {
            if (null != pt?.select?.['$action']) {
                continue;
            }
            const run = trailingVars(pt);
            if (0 === run.length) {
                continue;
            }
            cands.push({
                run,
                // Segments BEFORE the run: how much parent scope the route needs.
                scope: ((pt.segments || []).length - run.length),
                own: 'id' === run[run.length - 1] ||
                    ment.name + '_id' === run[run.length - 1],
                order: o,
            });
        }
    }
    const best = cands.reduce((b, c) => {
        if (null == b) {
            return c;
        }
        if (c.scope !== b.scope) {
            return c.scope < b.scope ? c : b;
        }
        if (c.own !== b.own) {
            return c.own ? c : b;
        }
        if (c.run.length !== b.run.length) {
            return b.run.length < c.run.length ? c : b;
        }
        return c.order < b.order ? c : b;
    }, null);
    return null == best ? [] : best.run;
}
function responseCandidates(ment, def) {
    const out = [];
    const seen = new Set();
    // Every property map this schema describes, expanding allOf.
    const propsOf = (schema) => {
        const node = resolveRef(schema, def);
        if (null == node || seen.has(node)) {
            return [];
        }
        seen.add(node);
        if (Array.isArray(node.allOf)) {
            return node.allOf.flatMap((member) => propsOf(member));
        }
        if (null != node.properties) {
            return [node.properties];
        }
        // A bare array response: the record is the item.
        const items = resolveRef(node.items, def);
        if (null != items) {
            return propsOf(items);
        }
        return [];
    };
    const add = (schema, opname) => {
        for (const props of propsOf(schema)) {
            out.push(props);
            // One level in, but ONLY through the envelope property.
            const envelope = (0, utility_1.envelopeProp)(props, opname);
            if (null == envelope) {
                continue;
            }
            const inner = resolveRef(props[envelope], def);
            if (null == inner) {
                continue;
            }
            for (const innerProps of propsOf(inner)) {
                out.push(innerProps);
            }
        }
    };
    for (const opname of ['load', 'list', 'update', 'create']) {
        const mop = ment.op?.[opname];
        for (const mpoint of (mop?.points || [])) {
            // An action point's response is not the entity.
            if (null != mpoint?.select?.['$action']) {
                continue;
            }
            const path = (def?.paths || {})[mpoint?.orig];
            const method = String(mpoint?.method || '').toLowerCase();
            const responses = path?.[method]?.responses || {};
            for (const code of Object.keys(responses)) {
                if (!/^2/.test(code)) {
                    continue;
                }
                const resdef = responses[code] || {};
                const content = resdef.content || {};
                const ctypes = Object.keys(content);
                // Prefer JSON; fall back to whatever single type is offered.
                const json = ctypes.find((c) => c.includes('json'));
                if (null != json) {
                    add(content[json]?.schema, opname);
                }
                else {
                    for (const ctype of ctypes) {
                        add(content[ctype]?.schema, opname);
                    }
                }
                add(resdef.schema, opname);
            }
        }
    }
    return out;
}
function namesEntity(schema, ment) {
    const xref = schema?.['x-ref'];
    if ('string' !== typeof xref) {
        return false;
    }
    const cmp = xref.slice(xref.lastIndexOf('/') + 1);
    return (0, utility_1.canonizeCmpName)(cmp) === ment.name;
}
// A `$ref` followed one hop, or the schema itself. apidef resolves most refs
// before this stage; this covers the ones that survive on a nested property.
function resolveRef(schema, def) {
    if (null == schema) {
        return null;
    }
    const ref = schema.$ref;
    if ('string' !== typeof ref || !ref.startsWith('#/')) {
        return schema;
    }
    let node = def;
    for (const seg of ref.slice(2).split('/')) {
        node = node?.[seg];
        if (null == node) {
            return null;
        }
    }
    return node;
}
// The conventional identifying subfield of a property map, or null.
function conventionalIdKey(props) {
    for (const key of NESTED_ID_KEYS) {
        const p = props[key];
        if (null == p) {
            continue;
        }
        const t = String(p.type || '');
        if ('object' !== t && 'array' !== t) {
            return key;
        }
    }
    return null;
}
// Every name a part might be carried under: the model's name for it, plus the
// original wire names of any path parameter that was renamed to it.
function partAliases(ment, part) {
    const names = new Set([part]);
    (0, jostraca_1.each)(ment.op, (mop) => {
        (0, jostraca_1.each)(mop?.points, (mpoint) => {
            const rename = mpoint?.rename?.param || {};
            for (const orig of Object.keys(rename)) {
                if (String(rename[orig]) === part) {
                    names.add(orig);
                }
            }
            for (const arg of (mpoint?.args?.params || [])) {
                if (null != arg && arg.name === part && null != arg.orig) {
                    names.add(String(arg.orig));
                }
            }
        });
    });
    return [...names];
}
function resolvePart(ment, part, aliases, props, def) {
    if (null == props) {
        return null;
    }
    const prop = (name) => resolveRef(props[name], def);
    const scalar = (p) => null != p && 'object' !== String(p.type) && 'array' !== String(p.type) &&
        null == p.properties && null == p.items;
    for (const name of aliases) {
        if (scalar(prop(name))) {
            return name;
        }
    }
    if (part === ment.name && scalar(prop('name'))) {
        return 'name';
    }
    for (const name of aliases) {
        for (const suffix of ['_name', '_login', '_slug']) {
            if (scalar(prop(name + suffix))) {
                return name + suffix;
            }
        }
    }
    for (const name of aliases) {
        const nested = prop(name);
        if (null != nested?.properties) {
            const sub = conventionalIdKey(nested.properties);
            if (null != sub) {
                return name + '.' + sub;
            }
        }
    }
    return null;
}
function identityFrom(ment, parts, def) {
    const candidates = responseCandidates(ment, def);
    const out = {};
    for (const part of parts) {
        const aliases = partAliases(ment, part);
        let found = null;
        for (const props of candidates) {
            found = resolvePart(ment, part, aliases, props, def);
            if (null != found) {
                break;
            }
        }
        if (null != found) {
            out[part] = found;
        }
    }
    return out;
}
// Is this model field declared as a string? A composite id is the parts
// joined, so the field that holds it has to be one.
function scalarStringField(f) {
    return String(f?.t || '').toUpperCase().includes('STRING');
}
function singleKeyOf(ment, parts) {
    if (0 === parts.length) {
        return undefined;
    }
    return parts.find((p) => 'id' === p)
        ?? parts.find((p) => p === ment.name + '_id')
        ?? parts.find((p) => p.endsWith('_id'))
        ?? parts[parts.length - 1];
}
function compositeId(ment, gent, def) {
    const gid = gent?.id;
    const sep = null != gid?.sep && '' !== String(gid.sep) ? String(gid.sep) : ID_SEP;
    // `composite: false` turns the inference off. A boolean rather than an
    // empty `parts`, because aontu resolves an empty list to nothing and the
    // key would arrive absent — indistinguishable from never having been set.
    if (null != gid && false === gid.composite) {
        return { single: singleKeyOf(ment, identityParams(ment)) };
    }
    // `from` STATED IN guide.aon WINS PER PART, so a spec can correct one
    // mapping without restating the others — which matters because the
    // heuristic gets most of them right and the odd one wrong.
    const withFrom = (parts, usesep) => {
        const derived = identityFrom(ment, parts, def);
        const stated = null != gid?.from && 'object' === typeof gid.from ? gid.from : {};
        const from = {};
        for (const part of parts) {
            const say = stated[part];
            const use = null != say && '' !== String(say) ? String(say) : derived[part];
            if (null != use) {
                from[part] = use;
            }
        }
        return 0 === Object.keys(from).length ?
            { parts, sep: usesep } : { parts, sep: usesep, from };
    };
    if (null != gid && null != gid.parts) {
        const given = gid.parts
            .filter((p) => null != p && '' !== String(p))
            .map((p) => String(p));
        return 1 < given.length ? withFrom(given, sep) : {};
    }
    const parts = identityParams(ment);
    return 1 < parts.length ? withFrom(parts, sep) : {};
}
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
            n: name,
            h: (0, utility_1.humanTitle)(name),
            t: (0, utility_1.inferFieldType)(name, (0, utility_1.validator)(fielddef.type)),
            r: !!fielddef.required,
            op: {},
        };
        const fdesc = fielddef.description;
        if ('string' === typeof fdesc && '' !== fdesc.trim()) {
            const short = (0, utility_1.firstSentence)(fdesc);
            if ('' !== short) {
                mfield.sh = short;
            }
        }
        for (const [flag, attr] of [['readOnly', 'ro'], ['writeOnly', 'wo'], ['deprecated', 'de']]) {
            if (true === fielddef[flag]) {
                mfield[attr] = true;
            }
        }
        // `format` is an open vocabulary — OpenAPI defines a handful and lets a
        // spec coin its own — so it is carried as the string it is rather than
        // interpreted here. `password` is the one a generator acts on today.
        const ffmt = fielddef.format;
        if ('string' === typeof ffmt && '' !== ffmt.trim()) {
            mfield.fo = ffmt.trim();
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
                description: f.desc,
            });
        }
        else if (('OBJECT' === kind || 'INTERFACE' === kind) && !f.list) {
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
function gqlFieldType(typeName) {
    return 'Int' === typeName ? 'integer' :
        'Float' === typeName ? 'number' :
            'Boolean' === typeName ? 'boolean' :
                ('String' === typeName || 'ID' === typeName) ? 'string' :
                    undefined;
}
function findFieldDefs(ment, mop, mpoint, def) {
    if ('graphql' === mpoint.kind) {
        return findGraphqlFieldDefs(ment, mpoint, def);
    }
    // A verb, rather than an address: see the call site in the transform.
    const isAction = null != mpoint?.select?.['$action'];
    const fielddefs = [];
    const pathdef = def.paths[mpoint.orig];
    const method = mpoint.method.toLowerCase();
    const opdef = pathdef?.[method];
    if (opdef) {
        const responses = opdef.responses;
        const requestBody = opdef.requestBody;
        let fieldSets;
        if (responses) {
            fieldSets = (0, jostraca_1.getx)(responses, '200 content "application/json" schema') ??
                (0, jostraca_1.getx)(responses, '200 schema');
            if ('list' == mop.name) {
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
            if ('list' != mop.name) {
                const envelope = (0, utility_1.envelopeProp)(fieldSets?.properties, mop.name);
                if (null != envelope) {
                    fieldSets = fieldSets.properties[envelope];
                }
            }
        }
        if (isAction && !namesEntity(fieldSets, ment)) {
            return fielddefs;
        }
        // A QUERY (RFC 10008) request body is a filter/query schema, not the
        // entity shape, so it must not contribute entity fields. Fields for a
        // QUERY op come from its response only. Other methods (POST/PUT/PATCH)
        // carry the entity in the body, so merge as usual -- except for an
        // action, whose body is the verb's arguments and never the record.
        if (requestBody && 'query' !== method && !isAction) {
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
    if (newField.r !== existingField.r) {
        existingField.op[mop.name] = {
            req: newField.r,
            type: newField.t,
        };
    }
    if (null == existingField.sh && null != newField.sh) {
        existingField.sh = newField.sh;
    }
    for (const flag of ['ro', 'wo', 'de', 'fo']) {
        if (null == existingField[flag] && null != newField[flag]) {
            existingField[flag] = newField[flag];
        }
    }
    return existingField;
}
//# sourceMappingURL=field.js.map