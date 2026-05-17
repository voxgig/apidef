"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topTransform = void 0;
const struct_1 = require("@voxgig/struct");
const types_1 = require("../types");
// Guide* => from guide model
// *Desc => internal working descriptiuon
// *Def => API spec definition
// Model* => Generated SDK Model
// type GuideEntity = {
//   name: string,
//   path: Record<string, GuidePath>
//   paths$: PathDesc[]
//   opm$: Record<OpName, OpDesc>
// }
const topTransform = async function (ctx) {
    const { apimodel, def } = ctx;
    const kit = apimodel.main[types_1.KIT];
    kit.info = stringifyInfoScalars(def.info ?? {});
    kit.info.servers = stringifyInfoScalars(def.servers ?? []);
    // Swagger 2.0
    if (def.host) {
        kit.info.servers.push({
            url: (def.schemes?.[0] ?? 'https') + '://' + (0, struct_1.join)([def.host, def.basePath], '/', true)
        });
    }
    // Some specs omit the scheme on `servers[].url` — e.g. the Art
    // Institute of Chicago lists `api.artic.edu/api/v1` (no
    // https://). Go's net/http barfs on that with "unsupported
    // protocol scheme". Default to https when the URL has no scheme
    // and the value isn't a relative path.
    for (const server of kit.info.servers) {
        if (!server || 'string' !== typeof server.url)
            continue;
        const url = server.url.trim();
        if (url === '')
            continue;
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url))
            continue; // already has scheme
        // `//host/path` is a protocol-relative URL — meaningless to a
        // backend SDK, treat as missing-scheme and default to https.
        if (url.startsWith('//')) {
            server.url = 'https:' + url;
            continue;
        }
        // `/path` is path-only (relative to wherever the spec is served).
        // Leave it untouched; it's a valid OpenAPI form.
        if (url.startsWith('/'))
            continue;
        server.url = 'https://' + url;
    }
    // A usable SDK requires a base URL. OpenAPI 3 puts it in `servers[].url`;
    // Swagger 2 derives it from `host` + `basePath`. If neither yields a
    // non-empty url, the generated SDK has no way to issue requests, so fail
    // the apidef model build rather than emit broken code.
    const firstServerUrl = kit.info.servers?.[0]?.url;
    if (null == firstServerUrl || '' === String(firstServerUrl).trim()) {
        throw new Error('apidef: no server URL found in API definition (servers[0].url is required).');
    }
    return { ok: true, msg: 'top' };
};
exports.topTransform = topTransform;
// OpenAPI's `info` object (and the `servers` array) declares every scalar
// leaf as a string. YAML/JSON parsers don't enforce that — `version: 2`
// without quotes parses as the number 2, `version: true` as a boolean.
// Apidef's downstream schema (apidef.jsonic) unifies info fields as
// `string`, so non-string scalars cause an aontu unify failure during
// model resolution. Normalise scalar leaves to strings here, at the
// model-build boundary, rather than relax the schema.
function stringifyInfoScalars(node) {
    if (null == node)
        return node;
    if (Array.isArray(node))
        return node.map(stringifyInfoScalars);
    if ('object' === typeof node) {
        const out = {};
        for (const [k, v] of Object.entries(node)) {
            out[k] = stringifyInfoScalars(v);
        }
        return out;
    }
    if ('number' === typeof node || 'boolean' === typeof node) {
        return String(node);
    }
    return node;
}
// export type {
//   GuideEntity,
// }
//# sourceMappingURL=top.js.map