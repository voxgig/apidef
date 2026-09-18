"use strict";
/* Copyright (c) 2024-2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = parse;
const jsonic_1 = require("@tabnas/jsonic");
const yaml_1 = require("@tabnas/yaml");
const utility_1 = require("./utility");
const graphql_1 = require("./parse/graphql");
// NOTE: @tabnas/yaml types its Plugin against @tabnas/parser, while
// Jsonic.use expects @tabnas/jsonic's own (structurally identical) Plugin
// type - hence the cast.
const yamlParser = jsonic_1.Jsonic.make().use(yaml_1.Yaml);
// Matches any line that is not purely a YAML comment or whitespace.
const RE_HAS_CONTENT = /^\s*[^#\s]/m;
// Parse an API definition source into a JSON sructure.
async function parse(kind, source, meta) {
    if ('OpenAPI' === kind) {
        validateSource(kind, source, meta);
        try {
            const def = await parseOpenAPI(source, meta);
            return def;
        }
        catch (pe) {
            if (pe.originalError) {
                pe.originalError.message =
                    `@voxgig/apidef: parse: syntax: ${pe.originalError.message}` +
                        ` (${(0, utility_1.relativizePath)(meta.file)})`;
                pe = pe.originalError;
            }
            else if (pe.code && pe.code.startsWith('jsonic')) {
                pe.message =
                    `@voxgig/apidef: parse: syntax: ${pe.message}` +
                        ` (${(0, utility_1.relativizePath)(meta.file)})`;
            }
            else {
                pe.message =
                    `@voxgig/apidef: parse: internal: ${pe.message}` +
                        ` (${(0, utility_1.relativizePath)(meta.file)})`;
            }
            throw pe;
        }
    }
    else if ('GraphQL' === kind) {
        validateSource(kind, source, meta);
        try {
            const def = await (0, graphql_1.parseGraphQL)(source, meta, meta.graphql);
            return def;
        }
        catch (pe) {
            // Already-decorated errors (missing endpoint, missing package) carry
            // the package prefix; only raw parser failures need wrapping.
            if ('string' === typeof pe.message &&
                !pe.message.startsWith('@voxgig/apidef:')) {
                pe.message =
                    `@voxgig/apidef: parse: syntax: ${pe.message}` +
                        ` (${(0, utility_1.relativizePath)(meta.file)})`;
            }
            throw pe;
        }
    }
    else {
        throw new Error(`@voxgig/apidef: parse: unknown kind: ${kind}` +
            ` (${(0, utility_1.relativizePath)(meta.file)})`);
    }
}
async function parseOpenAPI(source, _meta) {
    let parsed;
    try {
        parsed = yamlParser(source);
    }
    catch (err) {
        // Rethrow jsonic parse errors with context
        throw err;
    }
    // Validate parsed result is a non-null object
    if (null == parsed || 'object' !== typeof parsed || Array.isArray(parsed)) {
        throw new Error(`@voxgig/apidef: parse: JSON/YAML source must be an object`);
    }
    // Validate it's an OpenAPI or Swagger spec
    if (!parsed.openapi && !parsed.swagger) {
        throw new Error(`@voxgig/apidef: parse: Unsupported spec: missing 'openapi' or 'swagger' version field`);
    }
    if (null == parsed.components) {
        parsed.components = {};
    }
    // Normalize path keys: jsonic's YAML parser leaves the surrounding double
    // quotes IN the key for explicit-key form (`? "..."`). gitlab uses this for
    // long paths and as a result every downstream split('/') sees a literal
    // quote character at the head/tail of the path, breaking URL substitution.
    if (parsed.paths && 'object' === typeof parsed.paths) {
        const cleaned = {};
        for (const [k, v] of Object.entries(parsed.paths)) {
            const stripped = k.replace(/^"+|"+$/g, '');
            cleaned[stripped] = v;
        }
        parsed.paths = cleaned;
    }
    // Single-pass: add x-ref properties and resolve $ref pointers together.
    addXRefsAndResolve(parsed, parsed);
    const def = decycle(parsed);
    return def;
}
function decycle(root) {
    // Entry path of each node on the current ancestor chain; presence in this
    // map is what identifies a back-edge. Nodes are removed on the way out, so
    // a node reachable twice as a *sibling* is not treated as a cycle.
    const onPath = new Map();
    // Fully-processed nodes. Revisiting one is legitimate sharing, not a cycle,
    // and must not be walked (or copied) again.
    const done = new WeakSet();
    const path = [];
    const walk = (node) => {
        if (null == node || 'object' !== typeof node)
            return;
        if (done.has(node))
            return;
        if (!Array.isArray(node) && null === Object.getPrototypeOf(node)) {
            Object.setPrototypeOf(node, Object.prototype);
        }
        onPath.set(node, path.slice());
        const keys = Array.isArray(node) ?
            node.map((_, i) => i) : Object.keys(node);
        for (const key of keys) {
            const val = node[key];
            if (null == val || 'object' !== typeof val)
                continue;
            const cyclePath = onPath.get(val);
            if (undefined !== cyclePath) {
                node[key] = `[Circular *${cyclePath.join('.')}]`;
                continue;
            }
            path.push(String(key));
            walk(val);
            path.pop();
        }
        onPath.delete(node);
        done.add(node);
    };
    walk(root);
    return root;
}
function refSiblings(node) {
    const out = {};
    for (const k of Object.keys(node)) {
        if ('$ref' === k)
            continue;
        out[k] = node[k];
    }
    return out;
}
function addXRefsAndResolve(obj, root, visited) {
    if (!obj || typeof obj !== 'object')
        return;
    if (!visited)
        visited = new WeakSet();
    if (visited.has(obj))
        return;
    visited.add(obj);
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            const item = obj[i];
            if (item && typeof item === 'object') {
                if (typeof item.$ref === 'string') {
                    const xref = item.$ref;
                    const resolved = resolvePointer(root, xref);
                    if (resolved !== undefined) {
                        obj[i] = { ...resolved, ...refSiblings(item), 'x-ref': xref };
                        addXRefsAndResolve(obj[i], root, visited);
                    }
                    else {
                        item['x-ref'] = xref;
                        addXRefsAndResolve(item, root, visited);
                    }
                }
                else {
                    addXRefsAndResolve(item, root, visited);
                }
            }
        }
    }
    else {
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (val && typeof val === 'object') {
                if (typeof val.$ref === 'string') {
                    const xref = val.$ref;
                    const resolved = resolvePointer(root, xref);
                    if (resolved !== undefined) {
                        obj[key] = { ...resolved, ...refSiblings(val), 'x-ref': xref };
                        addXRefsAndResolve(obj[key], root, visited);
                    }
                    else {
                        val['x-ref'] = xref;
                        addXRefsAndResolve(val, root, visited);
                    }
                }
                else {
                    addXRefsAndResolve(val, root, visited);
                }
            }
        }
    }
}
function resolvePointer(root, ref) {
    const seen = new Set();
    const siblings = [];
    let current = undefined;
    let pointer = ref;
    for (;;) {
        if (!pointer.startsWith('#/'))
            return undefined;
        if (seen.has(pointer))
            return undefined;
        seen.add(pointer);
        const parts = pointer
            .substring(2)
            .split('/')
            .map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
        current = root;
        for (const part of parts) {
            if (current == null || typeof current !== 'object')
                return undefined;
            current = current[part];
        }
        // Landed on another alias: follow it. Anything else is the target.
        if (current != null &&
            'object' === typeof current &&
            !Array.isArray(current) &&
            'string' === typeof current.$ref) {
            const sib = {};
            let hasSib = false;
            for (const k of Object.keys(current)) {
                if ('$ref' === k)
                    continue;
                sib[k] = current[k];
                hasSib = true;
            }
            if (hasSib)
                siblings.push(sib);
            pointer = current.$ref;
            continue;
        }
        if (0 === siblings.length) {
            // No siblings anywhere on the chain: return the target itself, so
            // multiple references keep sharing one object (see the note on
            // addXRefsAndResolve — a fresh copy per site would defeat that).
            return current;
        }
        // Siblings present: a merged view is necessarily a new object. Apply
        // deepest-first so the outermost alias's keywords win.
        const merged = (null != current && 'object' === typeof current &&
            !Array.isArray(current)) ? { ...current } : {};
        for (let i = siblings.length - 1; 0 <= i; i--) {
            Object.assign(merged, siblings[i]);
        }
        return merged;
    }
}
function validateSource(kind, source, meta) {
    if (typeof source !== 'string') {
        throw new Error(`@voxgig/apidef: parse: ${kind}: source must be a string` +
            ` (${(0, utility_1.relativizePath)(meta.file)})`);
    }
    // Check if source has any non-comment, non-whitespace content
    // without creating a full string copy.
    if (!RE_HAS_CONTENT.test(source)) {
        throw new Error(`@voxgig/apidef: parse: ${kind}: source is empty` +
            ` (${(0, utility_1.relativizePath)(meta.file)})`);
    }
}
//# sourceMappingURL=parse.js.map