"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contractTransform = void 0;
exports.contractJSON = contractJSON;
exports.graphqlInputTypes = graphqlInputTypes;
const resolved_1 = require("../resolved");
// MEMOISED WITHIN A FACT, FRESH BETWEEN FACTS.
//
// Each top-level key of a contract is self-contained: a reader of
// `facts.parameters` never has to resolve a `$ref` into `facts.requestBody`.
// That is deliberate and `recursive resolved schemas retain local references
// without changing shared nodes` pins it, so the memo RESETS at each
// top-level key.
//
// Inside one fact it does not reset, and that is the fix. The previous code
// forgot a node on the way out (`ancestors.delete`), so only an ANCESTOR
// became a `$ref` - a node reachable by two routes within the same fact was
// copied whole at each, and a schema graph where that compounds expands
// exponentially.
//
// Stripe's published definition is where that stops being theoretical:
// 1,454 cross-referenced schemas produced a string past V8's maximum length
// and the build died with `RangeError: Invalid string length`, 22 seconds
// into the guide. Not a big contract - an impossible one.
function contractJSON(value) {
    function walk(root, base) {
        // One memo per fact, so refs stay local to it.
        const seen = new Map();
        function copy(v, path) {
            if (v === null || typeof v !== 'object')
                return v;
            if (seen.has(v))
                return { $ref: seen.get(v) };
            seen.set(v, path);
            const out = Array.isArray(v) ? v.map((item, i) => copy(item, path + '/' + i)) : {};
            if (!Array.isArray(v))
                for (const k of Object.keys(v).sort()) {
                    if (!k.endsWith('$') && !k.startsWith('x-') && undefined !== v[k])
                        out[k] = copy(v[k], path + '/' + k.replace(/~/g, '~0').replace(/\//g, '~1'));
                }
            return out;
        }
        return copy(root, base);
    }
    if (null === value || 'object' !== typeof value || Array.isArray(value)) {
        return JSON.stringify(walk(value, '#'));
    }
    const out = {};
    for (const k of Object.keys(value).sort()) {
        if (k.endsWith('$') || k.startsWith('x-') || undefined === value[k])
            continue;
        out[k] = walk(value[k], '#/' + k.replace(/~/g, '~0').replace(/\//g, '~1'));
    }
    return JSON.stringify(out);
}
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
const contractTransform = async (ctx) => {
    const def = ctx.def || {};
    for (const entity of Object.values(ctx.apimodel.main.kit.entity || {})) {
        for (const op of Object.values(entity.op || {})) {
            for (const point of op?.points || []) {
                const path = def.paths?.[point.orig];
                const method = path?.[point.method.toLowerCase()];
                const graphql = def.query?.[point.orig] || def.mutation?.[point.orig];
                if (!method && !graphql)
                    continue;
                const facts = (0, resolved_1.operationFacts)(def, point);
                if (null == facts)
                    continue;
                // A property of the point, not of the definition.
                if (graphql)
                    facts.invocation = point.graphql;
                const guideOp = ctx.guide?.entity?.[entity.name]?.[graphql ? 'field' : 'path']?.[point.orig]?.op?.[op.name];
                const hint = guideOp?.live;
                for (const key of ['requestBody', 'responses', 'parameters', 'security']) {
                    if (guideOp?.contract?.[key] !== undefined) {
                        facts[key] = guideOp.contract[key];
                        (facts.factSources ??= {})[key] = 'guide';
                    }
                }
                if (hint !== undefined)
                    facts.live = hint;
                point.contract = { version: 1, id: point.method + ' ' + point.orig,
                    source: graphql ? 'graphql' : def.swagger ? 'swagger2' : 'openapi3',
                    json: contractJSON(facts) };
            }
        }
    }
    return { ok: true, msg: 'contract' };
};
exports.contractTransform = contractTransform;
//# sourceMappingURL=contract.js.map