"use strict";
/* Copyright (c) 2024-2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DUPLICATE_PARAMS_KEY = exports.IGNORED_HEADERS_KEY = void 0;
exports.parse = parse;
exports.decycledChild = decycledChild;
exports.normalizePathKeys = normalizePathKeys;
exports.colonPathKeys = colonPathKeys;
const openapi_1 = require("@tabnas/openapi");
const utility_1 = require("./utility");
const graphql_1 = require("./parse/graphql");
// Matches any line that is not purely a YAML comment or whitespace.
const RE_HAS_CONTENT = /^\s*[^#\s]/m;
// Parse an API definition source into a JSON sructure.
async function parse(kind, source, meta) {
    if ('OpenAPI' === kind) {
        try {
            const def = await parseOpenAPI(source, meta);
            return def;
        }
        catch (pe) {
            const where = ` (${(0, utility_1.relativizePath)(meta.file)})`;
            if (isOwnError(pe)) {
                pe.message += where;
            }
            // The reader's refusals carry a code.
            else if ('string' === typeof pe.code) {
                pe.message = `@voxgig/apidef: parse: syntax: ${pe.message}` + where;
            }
            else {
                pe.message = `@voxgig/apidef: parse: internal: ${pe.message}` + where;
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
function isOwnError(err) {
    return 'string' === typeof err?.message && err.message.startsWith('@voxgig/apidef:');
}
async function parseOpenAPI(source, _meta) {
    if ('string' !== typeof source) {
        throw new Error(`@voxgig/apidef: parse: OpenAPI: source must be a string`);
    }
    let parsed;
    try {
        // The reader's size limit is for a process of unknown memory; this one
        // has always read whatever it was given. The reading is named, so that
        // the reader's default can change without moving what is read here.
        parsed = (0, openapi_1.parse)(source, { duplicates: 'merge', maxBytes: Infinity, reading: 'base' });
    }
    catch (err) {
        const code = err?.code;
        if ('openapi_root' === code && 'empty' === err.details?.kind) {
            throw new Error(`@voxgig/apidef: parse: OpenAPI: source is empty`);
        }
        if ('openapi_alias_budget' === code) {
            throw new Error(`@voxgig/apidef: parse: OpenAPI: YAML aliases would expand the source to` +
                ` about ${err.details.size} bytes, past the limit of ${err.details.budget}`);
        }
        if ('openapi_root' === code || 'openapi_stream' === code) {
            throw new Error(`@voxgig/apidef: parse: JSON/YAML source must be an object`);
        }
        throw err;
    }
    // Validate it's an OpenAPI or Swagger spec
    if (!parsed.openapi && !parsed.swagger) {
        throw new Error(`@voxgig/apidef: parse: Unsupported spec: missing 'openapi' or 'swagger' version field`);
    }
    // A lone surrogate is read as U+FFFD, which is what an encoder writes in
    // its place in UTF-8. Keys that this makes equal are merged, as the
    // reader merges a repeated key.
    parsed = (0, openapi_1.wellFormed)(parsed, { duplicates: 'merge' });
    if (null == parsed.components) {
        parsed.components = {};
    }
    if (isRecord(parsed.paths)) {
        parsed.paths = renameKeys(parsed.paths, normalizePathKeys(Object.keys(parsed.paths)));
    }
    const resolved = (0, openapi_1.resolve)(parsed, { compat: 'apidef' });
    parsed = resolved.tree;
    // After resolution, so a pointer into `paths` names the key as written and a
    // parameter declared by `$ref` counts. See docs/design/derived-names.md
    const renamed = normalizeColonPathParams(parsed, _meta);
    dropIgnoredHeaders(parsed, resolved.ignored, renamed);
    dropDuplicateParams(parsed);
    const def = decycle(parsed);
    return def;
}
// In an OpenAPI 3 definition, a header parameter named Accept, Content-Type or
// Authorization is ignored, and the reader says which those are. Each is
// dropped and recorded for a warning, a path's own before its operations'.
const IGNORED_HEADERS_KEY = 'x-apidef-ignored-headers';
exports.IGNORED_HEADERS_KEY = IGNORED_HEADERS_KEY;
function dropIgnoredHeaders(parsed, ignored, renamed) {
    delete parsed[IGNORED_HEADERS_KEY];
    if (!String(parsed.openapi ?? '').startsWith('3') || !isRecord(parsed.paths))
        return;
    const dropped = [];
    const rank = new Map();
    const gone = new Map();
    for (const row of ignored) {
        if ('parameter' !== row.what || 'path' !== row.kind || row.additional)
            continue;
        const method = row.method?.toLowerCase();
        if (null != method && !METHODS.includes(method))
            continue;
        const path = renamed.get(row.path) ?? row.path;
        const holder = null == method ? parsed.paths[path] : parsed.paths[path][method];
        gone.set(holder, (gone.get(holder) ?? new Set()).add(row.index));
        const entry = { path, ...(null == method ? {} : { method: row.method }), name: row.name };
        rank.set(entry, null == method ? -1 : METHODS.indexOf(method));
        dropped.push(entry);
    }
    for (const [holder, indexes] of gone) {
        holder.parameters = holder.parameters.filter((_, i) => !indexes.has(i));
    }
    dropped.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 :
        rank.get(a) - rank.get(b));
    if (0 < dropped.length)
        parsed[IGNORED_HEADERS_KEY] = dropped;
}
// A parameter list must not repeat a location and name (OpenAPI 3 and Swagger
// 2 alike). A definition that does keeps the first and records the rest for a
// warning. Header names compare without case, as HTTP compares them.
const DUPLICATE_PARAMS_KEY = 'x-apidef-duplicate-params';
exports.DUPLICATE_PARAMS_KEY = DUPLICATE_PARAMS_KEY;
function dropDuplicateParams(parsed) {
    delete parsed[DUPLICATE_PARAMS_KEY];
    if (!isRecord(parsed.paths))
        return;
    const dropped = [];
    const kept = (list, path, method) => {
        const seen = new Set();
        return list.filter((param) => {
            const key = (0, utility_1.paramKey)(param);
            if (null == key)
                return true;
            if (!seen.has(key)) {
                seen.add(key);
                return true;
            }
            dropped.push({ path, ...(method ? { method: method.toUpperCase() } : {}), in: param.in, name: param.name });
            return false;
        });
    };
    for (const path of Object.keys(parsed.paths).sort()) {
        const item = parsed.paths[path];
        if (!isRecord(item))
            continue;
        if (Array.isArray(item.parameters))
            item.parameters = kept(item.parameters, path);
        for (const method of METHODS) {
            const op = item[method];
            if (isRecord(op) && Array.isArray(op.parameters))
                op.parameters = kept(op.parameters, path, method);
        }
    }
    if (0 < dropped.length)
        parsed[DUPLICATE_PARAMS_KEY] = dropped;
}
function renameKeys(obj, keys) {
    const out = Object.create(Object.getPrototypeOf(obj));
    Object.keys(obj).forEach((key, i) => { out[keys[i]] = obj[key]; });
    return out;
}
// A path key that still carries its quotes loses them. A rename that would
// collide with another key is not made.
function normalizePathKeys(keys) {
    return keepDistinct(keys, keys.map(unquotePathKey));
}
function unquotePathKey(key) {
    if (key.length < 2 || key[0] !== key[key.length - 1])
        return key;
    if ("'" === key[0])
        return key.slice(1, -1).replace(/''/g, "'");
    if ('"' !== key[0])
        return key;
    try {
        const decoded = JSON.parse(key);
        if ('string' === typeof decoded)
            return (0, openapi_1.wellFormed)(decoded);
    }
    catch (_e) {
        // Not a JSON string: an escape only YAML knows, so strip the quotes alone.
    }
    return key.slice(1, -1);
}
function keepDistinct(keys, next) {
    const count = new Map();
    keys.forEach((key, i) => {
        count.set(key, (count.get(key) ?? 0) + 1);
        if (next[i] !== key)
            count.set(next[i], (count.get(next[i]) ?? 0) + 1);
    });
    return keys.map((key, i) => next[i] !== key && 1 < (count.get(next[i]) ?? 0) ? key : next[i]);
}
// Edges decycle cut, so the guide can still count through them; a clone has none.
const DECYCLED = new WeakMap();
function decycledChild(holder, key) {
    const cut = DECYCLED.get(holder)?.get(String(key));
    return undefined === cut ? holder[key] : cut;
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
                let cuts = DECYCLED.get(node);
                if (undefined === cuts) {
                    cuts = new Map();
                    DECYCLED.set(node, cuts);
                }
                cuts.set(String(key), val);
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
function isRecord(node) {
    return null != node && 'object' === typeof node && !Array.isArray(node);
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
const METHODS = [
    'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'
];
// Rewrite `/a/:b/c` to `/a/{b}/c`, for a `:b` the path or one of its
// operations declares `in: path`. See docs/design/derived-names.md
// Gives each path that was renamed, by the name it had.
function normalizeColonPathParams(parsed, meta) {
    const renames = new Map();
    if (!isRecord(parsed.paths))
        return renames;
    const paths = Object.keys(parsed.paths);
    const next = colonPathKeys(parsed.paths);
    parsed.paths = renameKeys(parsed.paths, next);
    const renamed = paths.filter((path, i) => next[i] !== path);
    paths.forEach((path, i) => { if (next[i] !== path)
        renames.set(path, next[i]); });
    if (0 < renamed.length && null != meta?.log?.info) {
        meta.log.info({
            point: 'path-colon-params',
            count: renamed.length,
            note: 'rewrote ' + renamed.length + ' colon-style path parameter(s) to' +
                ' OpenAPI brace form, e.g. ' + renamed[0]
        });
    }
    return renames;
}
// Every `in: path` name counts: the path item's parameters and each operation's.
function colonPathKeys(paths) {
    const keys = Object.keys(paths);
    return keepDistinct(keys, keys.map((path) => {
        if (!path.includes('/:'))
            return path;
        const item = paths[path];
        const declared = new Set();
        const collect = (params) => {
            if (!Array.isArray(params))
                return;
            for (const param of params) {
                if (param && 'path' === param.in && 'string' === typeof param.name) {
                    declared.add(param.name);
                }
            }
        };
        if (null != item) {
            collect(item.parameters);
            for (const method of METHODS) {
                if (null != item[method])
                    collect(item[method].parameters);
            }
        }
        return path.split('/').map((seg) => seg.startsWith(':') && declared.has(seg.slice(1)) ? '{' + seg.slice(1) + '}' : seg).join('/');
    }));
}
//# sourceMappingURL=parse.js.map