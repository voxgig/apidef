"use strict";
/* Copyright (c) 2024-2026 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphql01 = graphql01;
exports.classifyGraphQLField = classifyGraphQLField;
exports.deriveRetShape = deriveRetShape;
exports.fieldSig = fieldSig;
exports.entityName = entityName;
const utility_1 = require("../utility");
const CREATE_RE = /^(create|insert|add|new)$/i;
const UPDATE_RE = /^(update|edit|modify|patch|set)$/i;
const REMOVE_RE = /^(delete|remove|destroy|drop)$/i;
// Type-name suffixes that mark schema machinery rather than API entities.
const MACHINERY_RE = /(Connection|Edge|PageInfo|Payload|Input|Filter|Comparator|Sort|OrderBy)$/;
// Strip a leading entity name off a mutation field name, returning the
// residual verb. `issueCreate` -> `Create`; `createIssue` -> `create`.
function splitEntityVerb(fieldName, entity) {
    const lowerField = fieldName.toLowerCase();
    const lowerEnt = entity.toLowerCase();
    if (lowerField.startsWith(lowerEnt)) {
        return fieldName.slice(entity.length);
    }
    if (lowerField.endsWith(lowerEnt)) {
        return fieldName.slice(0, fieldName.length - entity.length);
    }
    return fieldName;
}
// Does this field take exactly one required id-ish argument?
function idArg(args) {
    const reqd = args.filter((a) => a.reqd);
    if (1 !== reqd.length) {
        return undefined;
    }
    const only = reqd[0];
    return /^(id|.*Id)$/i.test(only.name) ? only : undefined;
}
// Classify one root field. PURE: plain-JSON in, plain-JSON out, no schema
// objects, no closures, no I/O — so a shared TSV fixture can drive this in
// both TypeScript and Go.
function classifyGraphQLField(sig, profile) {
    const why = [];
    const ret = sig.ret;
    if (null == ret.entity || 'scalar' === ret.kind || 'other' === ret.kind) {
        why.push('ret:' + ret.kind);
        return { exclude: true, why };
    }
    const entity = ret.entity;
    const id = idArg(sig.args);
    if ('query' === sig.optype) {
        // Connection or list of the entity -> list.
        if ('connection' === ret.kind || 'list' === ret.kind) {
            why.push('query:' + ret.kind);
            return { entity, op: 'list', optype: 'query', why };
        }
        // Single entity behind one required id -> load.
        if ('entity' === ret.kind) {
            if (null != id) {
                why.push('query:entity:id=' + id.name);
                return { entity, op: 'load', optype: 'query', why };
            }
            // No id argument: a singleton accessor (viewer, organization). Still a
            // load — the op simply takes no id.
            if (0 === sig.args.filter((a) => a.reqd).length) {
                why.push('query:entity:singleton');
                return { entity, op: 'load', optype: 'query', why };
            }
            why.push('query:entity:args');
            return { entity, op: 'load', optype: 'query', why };
        }
        why.push('query:unmatched:' + ret.kind);
        return { exclude: true, why };
    }
    // --- mutation ---
    const verb = splitEntityVerb(sig.name, entity).replace(/^[_-]+/, '');
    const input = sig.inputTypeName ?? '';
    // create: <Entity>CreateInput, or a create-ish verb, and no id argument.
    const createByInput = new RegExp('^' + entity + '(Create|Insert|New)Input$', 'i').test(input);
    if (createByInput || (CREATE_RE.test(verb) && null == id)) {
        why.push(createByInput ? 'mutation:input:' + input : 'mutation:verb:' + verb);
        return { entity, op: 'create', optype: 'mutation', why };
    }
    // update: <Entity>UpdateInput, or an update-ish verb.
    const updateByInput = new RegExp('^' + entity + '(Update|Edit|Patch|Set)Input$', 'i').test(input);
    if (updateByInput || UPDATE_RE.test(verb)) {
        why.push(updateByInput ? 'mutation:input:' + input : 'mutation:verb:' + verb);
        return { entity, op: 'update', optype: 'mutation', why };
    }
    // remove: a delete-ish verb.
    if (REMOVE_RE.test(verb)) {
        why.push('mutation:verb:' + verb);
        return { entity, op: 'remove', optype: 'mutation', why };
    }
    // Everything else on Mutation is a command: fold it onto a canonical op as
    // an action, exactly as REST action paths are folded. Id-bearing commands
    // ride update (they address an existing record); id-less ones ride create.
    const action = (0, utility_1.canonize)((0, utility_1.normalizeFieldName)(verb || sig.name));
    const host = null != id ? 'update' : 'create';
    why.push('mutation:action:' + action + ':host=' + host +
        (profile === 'none' ? '' : ':profile=' + profile));
    return { entity, op: host, action, optype: 'mutation', why };
}
// Derive the return shape of a root field from the normalised type map.
// Separated from classification so the classifier stays plain-JSON pure.
function deriveRetShape(field, types) {
    const named = types[field.type];
    if (null == named) {
        return { kind: 'scalar' };
    }
    if ('SCALAR' === named.kind || 'ENUM' === named.kind) {
        return { kind: 'scalar' };
    }
    if ('OBJECT' !== named.kind && 'INTERFACE' !== named.kind) {
        return { kind: 'other' };
    }
    // Relay connection: has pageInfo plus nodes and/or edges.
    const fnames = Object.keys(named.fields);
    if (fnames.includes('pageInfo') &&
        (fnames.includes('nodes') || fnames.includes('edges'))) {
        const nodesField = fnames.includes('nodes') ? 'nodes' : 'edges';
        const nodeType = named.fields[nodesField]?.type;
        return { kind: 'connection', entity: nodeType, nodes: nodesField };
    }
    // Mutation payload wrapper: <X>Payload holding the entity (plus success /
    // lastSyncId style metadata).
    if (/Payload$/.test(named.name)) {
        // The wrapped entity is the first object-typed field that is not itself
        // machinery. Sorted field order keeps this deterministic.
        for (const fname of fnames) {
            const f = named.fields[fname];
            const ftype = types[f.type];
            if (null != ftype && 'OBJECT' === ftype.kind && !MACHINERY_RE.test(ftype.name)) {
                return { kind: 'payload', entity: ftype.name, unwrap: fname };
            }
        }
        return { kind: 'payload', deleteish: true };
    }
    if (MACHINERY_RE.test(named.name)) {
        return { kind: 'other' };
    }
    // A list of the entity is a list op even without connection machinery.
    if (field.list) {
        return { kind: 'list', entity: named.name };
    }
    return { kind: 'entity', entity: named.name };
}
// Build the classifier signature for a root field.
function fieldSig(optype, field, types) {
    // The input-object argument, if any, drives create/update detection.
    let inputTypeName = undefined;
    for (const arg of field.args) {
        const at = types[arg.type];
        if (null != at && 'INPUT_OBJECT' === at.kind) {
            inputTypeName = at.name;
            break;
        }
    }
    return {
        optype,
        name: field.name,
        args: field.args.map((a) => ({
            name: a.name, gqltype: a.gqltype, reqd: a.reqd,
        })),
        ret: deriveRetShape(field, types),
        inputTypeName,
    };
}
// Entity model name from a GraphQL type name: Issue -> issue,
// WorkflowState -> workflow_state (canonize handles the casing rules that
// the REST path classifier already uses).
function entityName(typeName) {
    return (0, utility_1.depluralize)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)(typeName)));
}
function newGuidePath() {
    return {
        why_path: [],
        action: {},
        rename: { param: {} },
        op: {},
    };
}
// The GraphQL guide strategy.
async function graphql01(ctx) {
    const def = ctx.def;
    const profile = (ctx.opts.profile ?? 'none');
    const guide = {
        control: {},
        entity: {},
        metrics: {
            count: {
                path: 0,
                field: 0,
                method: 0,
                tag: 0,
                cmp: 0,
                entity: 0,
                origcmprefs: {},
            },
            found: {
                tag: {},
                cmp: {},
            },
        },
    };
    const types = def.types ?? {};
    const roots = [
        { optype: 'query', fields: def.query ?? {} },
        { optype: 'mutation', fields: def.mutation ?? {} },
    ];
    for (const root of roots) {
        // Sorted iteration: byte-stable guide output.
        for (const fname of Object.keys(root.fields).sort()) {
            guide.metrics.count.field++;
            const field = root.fields[fname];
            const sig = fieldSig(root.optype, field, types);
            const cls = classifyGraphQLField(sig, profile);
            if (cls.exclude || null == cls.entity || null == cls.op) {
                ctx.log.debug({
                    point: 'graphql-exclude',
                    field: fname,
                    note: cls.why.join(';'),
                });
                continue;
            }
            const entname = entityName(cls.entity);
            const gent = guide.entity[entname] ?? {
                name: entname,
                orig: cls.entity,
                field: {},
                path: {},
            };
            guide.entity[entname] = gent;
            const gfields = (gent.field = gent.field ?? {});
            const gpath = gfields[fname] ?? newGuidePath();
            gfields[fname] = gpath;
            gpath.why_path.push(cls.why.join(';'));
            if (null != cls.action) {
                gpath.action[cls.action] = {
                    kind: 'graphql',
                    why_action: ['mutation:' + fname],
                };
            }
            gpath.op[cls.op] = {
                // GraphQL points synthesize POST; optype carries the real distinction.
                method: 'POST',
                optype: cls.optype,
                why_op: cls.why.join(';'),
                transform: { req: undefined, res: undefined },
            };
        }
    }
    guide.metrics.count.entity = Object.keys(guide.entity).length;
    ctx.log.info({
        point: 'graphql-guide',
        note: `entities=${guide.metrics.count.entity} ` +
            `fields=${guide.metrics.count.field}`,
    });
    return guide;
}
//# sourceMappingURL=graphql01.js.map