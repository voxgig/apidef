"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldTransform = void 0;
exports.inferFieldsFromExamples = inferFieldsFromExamples;
exports.inferTypeFromValue = inferTypeFromValue;
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
const types_1 = require("../types");
const fieldTransform = async function (ctx) {
    const { apimodel, def, guide } = ctx;
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
            ment.id = { name: 'id', field: 'id', ...compositeId(ment, guide?.entity?.[ment.name], def) };
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
            ment.id = { name: 'id', field: 'id', ...compositeId(ment, guide?.entity?.[ment.name], def) };
        }
        msg += ment.name + ' ';
    });
    return { ok: true, msg };
};
exports.fieldTransform = fieldTransform;
// The separator that joins a composite id into one string.
//
// A forward slash cannot occur inside a single path segment — a raw `/`
// would end the segment, and a value that legitimately contains one arrives
// percent-encoded as `%2F` — so joining on it can never be ambiguous, and
// splitting on it can never over-split. That is what makes the composite id
// safe to carry as a single opaque string, which is the property the SDK and
// Seneca entities are built on.
const ID_SEP = '/';
// The parameters that TOGETHER name one record: the trailing run of
// ADJACENT variable segments on the addressing route.
//
// ADJACENCY IS THE WHOLE TEST, and it is what separates a compound key from
// ordinary parent/child nesting:
//
//   /repos/{owner}/{repo}                     -> owner, repo   COMPOSITE
//   /api/planet/{planet_id}/moon/{moon_id}    -> moon_id       single
//   /repos/{owner}/{repo}/pulls/{pull_number} -> pull_number   single
//
// A literal segment between two variables names a SUB-COLLECTION, so the
// earlier variable scopes the later one — `planet_id` says which planet's
// moons, and `moon_id` alone identifies the moon. Two variables with nothing
// between them address no sub-collection: neither value names anything on
// its own, and only the pair identifies a repository.
//
// Taking every variable on the path instead was tried first and is wrong on
// most real specs — it made `moon` (planet_id + moon_id), petstore's `order`,
// `pet` and `user`, and taxonomy's `domain` and `kingdom` all falsely
// composite, which the apidef-validate goldens caught immediately. Nested
// resources are the common shape; compound keys are the exception, and
// adjacency is the thing that actually distinguishes them.
//
// Read from the op that names a single record, never from `list`: a
// collection route's path params are the entity's parents. A point ending in
// a literal is a verb ON the record (`.../{number}/merge`) and carries the
// same variables, so it is a fallback rather than a different answer.
function identityParams(ment) {
    for (const opname of ['load', 'update', 'patch', 'remove']) {
        const mop = ment.op?.[opname];
        if (null == mop) {
            continue;
        }
        const points = (mop.points || []).filter((pt) => null == (pt && pt.select && pt.select['$action']));
        const items = points.filter((pt) => {
            const segs = (pt && pt.segments) || [];
            return null != segs[segs.length - 1]?.var;
        });
        const point = items[0] || points[0];
        if (null == point) {
            continue;
        }
        // Walk back from the end, collecting variables until a literal stops
        // the run. That literal is the sub-collection boundary; anything before
        // it scopes this record rather than naming it.
        const segs = (point.segments || []).filter((s) => null != s);
        const run = [];
        for (let i = segs.length - 1; 0 <= i; i--) {
            const seg = segs[i];
            if (null == seg.var) {
                break;
            }
            run.unshift(String(seg.var));
        }
        if (0 < run.length) {
            return run;
        }
    }
    return [];
}
// Subfields that conventionally carry the identifying value of a nested
// object, in preference order. github's repo `owner` is a user object whose
// identifier is `login`; other specs use `name`, `slug` or `key`. `id` is
// last: it is the most common name and the least likely to be the value a
// PATH parameter takes (a path that wanted an id would say so).
const NESTED_ID_KEYS = ['login', 'slug', 'name', 'key', 'id'];
// Is this model field a scalar, i.e. can its value be a path segment?
function scalarField(f) {
    const t = String(f?.type || '').toUpperCase();
    return !t.includes('OBJECT') && !t.includes('ARRAY') &&
        !t.includes('MAP') && !t.includes('LIST');
}
// WHERE EACH COMPOSITE PART'S VALUE LIVES IN A RESPONSE.
//
// The parts are PATH PARAMETER names; a response names its fields whatever it
// likes. Resolving one to the other is what lets an SDK put an id on a record
// the API returned, rather than only address a record whose id it was given.
//
// The rules, in order, and each of them is a fact about the spec rather than
// a guess:
//
//   1. a scalar field of exactly that name             -> itself
//   2. the part names this entity, and there is a `name` -> `name`
//      (`/repos/{owner}/{repo}` on entity `repo`, whose response calls the
//      repository `name`)
//   3. a scalar `<part>_name` / `<part>_login` / `<part>_slug`
//   4. an OBJECT field of that name         -> `<part>.<conventional key>`
//      (`owner` is a user object; the value is `owner.login`)
//
// A part none of these resolve is left OUT. Downstream then knows the id
// cannot be rebuilt for that entity and can say so, which is better than a
// confidently wrong id on a real record. guide.aon can state it instead.
function identityFrom(ment, parts, def) {
    const fields = (ment.fields || []);
    const byName = new Map(fields.map((f) => [f.name, f]));
    const out = {};
    for (const part of parts) {
        const own = byName.get(part);
        if (null != own && scalarField(own)) {
            out[part] = part;
            continue;
        }
        if (part === ment.name) {
            const named = byName.get('name');
            if (null != named && scalarField(named)) {
                out[part] = 'name';
                continue;
            }
        }
        const suffixed = ['_name', '_login', '_slug']
            .map((s) => part + s)
            .find((n) => {
            const f = byName.get(n);
            return null != f && scalarField(f);
        });
        if (null != suffixed) {
            out[part] = suffixed;
            continue;
        }
        if (null != own && !scalarField(own)) {
            const sub = nestedIdKey(ment, part, def);
            if (null != sub) {
                out[part] = part + '.' + sub;
            }
        }
    }
    return out;
}
// The conventional identifying subfield of a nested object field, read from
// the spec's own schema for it rather than assumed. Returns null when the
// schema is not reachable or names none of them — the part is then simply
// unresolved, which is the honest answer.
function nestedIdKey(ment, part, def) {
    const props = nestedProps(ment, part, def);
    if (null == props) {
        return null;
    }
    for (const key of NESTED_ID_KEYS) {
        const p = props[key];
        if (null == p) {
            continue;
        }
        const t = String(p.type || '');
        // Only a scalar can be a path segment.
        if ('object' !== t && 'array' !== t) {
            return key;
        }
    }
    return null;
}
// The property map of a nested object field, from the response schema of the
// entity's load (else list) op. Best-effort: a spec that composes the shape
// out of allOf/oneOf may not answer, and that is handled by returning null.
function nestedProps(ment, part, def) {
    for (const opname of ['load', 'list', 'update', 'create']) {
        const mop = ment.op?.[opname];
        for (const mpoint of (mop?.points || [])) {
            const schema = findResponseSchema(mpoint, def);
            const prop = schema?.properties?.[part];
            const resolved = resolveRef(prop, def);
            if (null != resolved?.properties) {
                return resolved.properties;
            }
        }
    }
    return null;
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
// The 2xx response schema of a point, as the spec states it.
function findResponseSchema(mpoint, def) {
    const path = (def?.paths || {})[mpoint?.orig];
    const method = String(mpoint?.method || '').toLowerCase();
    const responses = path?.[method]?.responses || {};
    for (const code of Object.keys(responses)) {
        if (!/^2/.test(code)) {
            continue;
        }
        const content = responses[code]?.content || {};
        for (const ctype of Object.keys(content)) {
            const resolved = resolveRef(content[ctype]?.schema, def);
            if (null != resolved?.properties) {
                return resolved;
            }
            // A collection response: the record shape is the item schema.
            const items = resolveRef(resolved?.items, def);
            if (null != items?.properties) {
                return items;
            }
        }
    }
    return null;
}
// The composite half of the id descriptor, or `{}` for the ordinary case.
//
// Emitted ONLY for a genuinely composite id (two or more addressing
// parameters). A single-parameter entity already round-trips through one
// `id` and gains nothing from carrying a one-element `parts`, so its
// descriptor is left exactly as it was — no existing model output moves.
function compositeId(ment, gent, def) {
    // AN EXPLICIT `id: parts` IN guide.aon WINS, and an empty list turns the
    // inference off. Adjacency cannot tell a compound key from a trailing
    // MODIFIER — github's `{artifact_id}/{archive_format}` reads as composite
    // and is not — so the guide has to be able to say so. ADR-002: guide.aon
    // is the correction surface.
    const gid = gent?.id;
    const sep = null != gid?.sep && '' !== String(gid.sep) ? String(gid.sep) : ID_SEP;
    // `composite: false` turns the inference off. A boolean rather than an
    // empty `parts`, because aontu resolves an empty list to nothing and the
    // key would arrive absent — see model/guide.aon.
    if (null != gid && false === gid.composite) {
        return {};
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
    return 1 < parts.length ? withFrom(parts, ID_SEP) : {};
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
        // SPEC FACTS ABOUT THE FIELD, carried through verbatim.
        //
        // These four are declared by OpenAPI on the property and were being
        // dropped on the floor. `readOnly` is the one that matters most: it is
        // the difference between a field a client MAY send and one it may not,
        // and nothing else in the model says which — so every generator has been
        // putting server-assigned fields into the type a caller fills in.
        //
        // ONLY WHEN THE SPEC SAYS SO, and for the booleans only when TRUE. Each
        // defaults to false in OpenAPI, so an absent key and an explicit `false`
        // carry the same information; emitting the false ones would add a key to
        // every field of every model and say nothing. Same discipline as
        // `short`: absent means "the spec did not say", never "apidef dropped
        // it".
        for (const flag of ['readOnly', 'writeOnly', 'deprecated']) {
            if (true === fielddef[flag]) {
                mfield[flag] = true;
            }
        }
        // `format` is an open vocabulary — OpenAPI defines a handful and lets a
        // spec coin its own — so it is carried as the string it is rather than
        // interpreted here. `password` is the one a generator acts on today.
        const ffmt = fielddef.format;
        if ('string' === typeof ffmt && '' !== ffmt.trim()) {
            mfield.format = ffmt.trim();
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
    // The spec facts merge the same way, and for the same reason: one schema
    // annotates the field and another references it bare, so taking the first
    // declaration in opFieldPrecedence order is what finds the annotation.
    //
    // THE PRECEDENCE ORDER PUTS `load` FIRST, WHICH IS THE SAFE DIRECTION HERE.
    // A field the response schema marks readOnly and a request body also lists
    // is a self-contradictory spec — OpenAPI says a client must not send a
    // readOnly property at all — and this resolves it by believing the
    // restriction rather than the omission. Marking a writable field readOnly
    // costs a caller one field; the other way round sends a value the server
    // rejects.
    for (const flag of ['readOnly', 'writeOnly', 'deprecated', 'format']) {
        if (null == existingField[flag] && null != newField[flag]) {
            existingField[flag] = newField[flag];
        }
    }
    return existingField;
}
//# sourceMappingURL=field.js.map