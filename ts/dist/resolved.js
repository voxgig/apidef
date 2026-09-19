"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.METHODS = void 0;
exports.operationFacts = operationFacts;
exports.operationIndex = operationIndex;
exports.makeResolved = makeResolved;
exports.publishResolved = publishResolved;
exports.resolvedSpec = resolvedSpec;
// See docs/design/resolved-spec-capability.md
// An operation needs its argument types, including recursive input objects.
// Output types are represented by the field and generated invocation selection;
// copying the entire connected output graph per operation is quadratic in API size.
function graphqlInputTypes(field, types) {
    const out = {};
    function visit(name) {
        if (!types[name] || Object.prototype.hasOwnProperty.call(out, name))
            return;
        const type = types[name];
        out[name] = type;
        if (type.kind === 'INPUT_OBJECT') {
            for (const child of Object.values(type.fields || {}))
                visit(child.type);
        }
    }
    for (const arg of field.args || [])
        visit(arg.type);
    return out;
}
const METHODS = [
    'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'
];
exports.METHODS = METHODS;
function operationFacts(def, point) {
    const path = def?.paths?.[point.orig];
    const method = path?.[String(point.method).toLowerCase()];
    const graphql = def?.query?.[point.orig] || def?.mutation?.[point.orig];
    if (!method && !graphql)
        return undefined;
    const facts = { protocol: graphql ? 'graphql' : 'http' };
    if (graphql) {
        facts.field = graphql;
        facts.types = graphqlInputTypes(graphql, def.types || {});
        facts.typesScope = 'inputs';
        return facts;
    }
    for (const key of ['operationId', 'requestBody', 'responses', 'consumes', 'produces']) {
        if (undefined !== method[key])
            facts[key] = method[key];
    }
    // A path item may declare parameters shared by every operation under it.
    facts.parameters = [...(path.parameters || []), ...(method.parameters || [])];
    facts.security = method.security ?? def.security;
    facts.securitySource = method.security !== undefined ? 'operation' :
        def.security !== undefined ? 'definition' : 'unspecified';
    // swagger2 names this `securityDefinitions`.
    facts.securitySchemes = def.components?.securitySchemes ?? def.securityDefinitions;
    facts.consumes ??= def.consumes;
    facts.produces ??= def.produces;
    return facts;
}
// Every described operation, keyed 'METHOD path' as `point.contract.id` is.
function operationIndex(def) {
    const out = {};
    for (const path of Object.keys(def?.paths || {})) {
        for (const method of METHODS) {
            if (null == def.paths[path]?.[method])
                continue;
            const facts = operationFacts(def, { method, orig: path });
            if (facts)
                out[method.toUpperCase() + ' ' + path] = facts;
        }
    }
    for (const kind of ['query', 'mutation']) {
        for (const field of Object.keys(def?.[kind] || {})) {
            const facts = operationFacts(def, { method: 'POST', orig: field });
            if (facts)
                out['POST ' + field] = facts;
        }
    }
    return out;
}
function operationGuide(guide, method, path, graphql, selector) {
    const matches = [];
    for (const [entityName, entity] of Object.entries(guide?.entity || {})) {
        if (selector && selector.entity !== entityName)
            continue;
        const ops = entity[graphql ? 'field' : 'path']?.[path]?.op || {};
        for (const [opName, op] of Object.entries(ops)) {
            if (selector && selector.op !== opName)
                continue;
            if (op.method && op.method.toUpperCase() !== method.toUpperCase())
                continue;
            if (op.contract !== undefined || op.live !== undefined)
                matches.push(op);
        }
    }
    if (matches.length > 1) {
        throw new Error('Ambiguous operation guide for ' + method + ' ' + path + '; select entity and op');
    }
    return matches[0];
}
function makeResolved(kind, def, guide = () => undefined) {
    return {
        version: 1,
        kind,
        def,
        operation: (method, path, selector) => {
            const facts = operationFacts(def, { method, orig: path });
            if (!facts)
                return undefined;
            const op = operationGuide(guide(), method, path, facts.protocol === 'graphql', selector);
            for (const key of ['requestBody', 'responses', 'parameters', 'security']) {
                if (op?.contract?.[key] !== undefined) {
                    facts[key] = op.contract[key];
                    (facts.factSources ??= {})[key] = 'guide';
                }
            }
            if (op?.live !== undefined)
                facts.live = op.live;
            return facts;
        },
    };
}
// Tolerates a missing context: apidef also runs outside a model build.
function publishResolved(ctx, kind, def, guide) {
    const resolved = makeResolved(kind, def, guide);
    if (null != ctx && 'object' === typeof ctx) {
        ctx.state = ctx.state || {};
        ctx.state.apidef = { ...(ctx.state.apidef || {}), resolved };
    }
    return resolved;
}
function resolvedSpec(carrier) {
    if (null == carrier || 'object' !== typeof carrier)
        return undefined;
    return carrier.resolved ?? carrier.ctx?.resolved ?? carrier.state?.apidef?.resolved ??
        carrier.ctx?.state?.apidef?.resolved ??
        carrier.apidef?.resolved ??
        undefined;
}
//# sourceMappingURL=resolved.js.map