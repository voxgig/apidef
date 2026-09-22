"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topTransform = void 0;
exports.resolveSecurity = resolveSecurity;
exports.resolveSummary = resolveSummary;
exports.ensureDescription = ensureDescription;
exports.resolveWebsite = resolveWebsite;
exports.homepageFromServer = homepageFromServer;
exports.findAuthPrefix = findAuthPrefix;
const struct_1 = require("@voxgig/struct");
const types_1 = require("../types");
const utility_1 = require("../utility");
const topTransform = async function (ctx) {
    const { apimodel, def } = ctx;
    const kit = apimodel.main[types_1.KIT];
    kit.info = stringifyInfoScalars(def.info ?? {});
    kit.info.servers = stringifyInfoScalars(def.servers ?? []);
    // Guarantee at least one sentence of API description. Many specs (e.g. the
    // readme.io-hosted Bluefin APIs) ship a placeholder `info.description` of
    // "." — letterless, useless prose. When the description is empty or has no
    // letters, synthesise a sentence from the title so the api-info.aon (and
    // the docs generated from it) never carry an empty/degenerate description.
    kit.info.description = ensureDescription(kit.info);
    if (true === def.graphql) {
        // A GraphQL schema NEVER declares HTTP auth, so specDeclaresAuth would
        // report every secured GraphQL API (Linear included) as public and
        // suppress all generated auth code. Take the explicit build option
        // instead: only an option that actively says "public" emits the no-auth
        // signal; silence leaves auth unset so the SDK's own config governs.
        const authopt = ctx.opts?.auth;
        if (null != authopt) {
            if (false === authopt.active) {
                kit.info.auth = false;
            }
            else {
                kit.info.security = {
                    scheme: authopt.scheme ?? 'apikey',
                    type: authopt.type ?? 'apiKey',
                    in: authopt.in ?? 'header',
                    name: authopt.name ?? 'Authorization',
                    prefix: authopt.prefix ?? '',
                };
            }
        }
    }
    else if (!specDeclaresAuth(def)) {
        kit.info.auth = false;
    }
    else {
        // Describe the primary security scheme so generators can emit the
        // API's actual credential format instead of assuming `Bearer` —
        // e.g. Statuspage documents `Authorization: OAuth <key>`.
        const security = resolveSecurity(def);
        if (null != security) {
            kit.info.security = security;
            const exchange = findAuthExchange(def);
            if (null != exchange) {
                kit.info.security.exchange = exchange;
            }
        }
    }
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
            continue;
        if (url.startsWith('//')) {
            server.url = 'https:' + url;
            continue;
        }
        if (url.startsWith('/'))
            continue;
        server.url = 'https://' + url;
    }
    const firstServerUrl = kit.info.servers?.[0]?.url;
    if (null == firstServerUrl || '' === String(firstServerUrl).trim()) {
        throw new Error(true === def.graphql ?
            'apidef: no endpoint given for GraphQL schema' +
                ' (the endpoint build option is required).' :
            'apidef: no server URL found in API definition (servers[0].url is required).');
    }
    const summary = resolveSummary(def);
    if (null != summary) {
        kit.info.summary = summary;
    }
    const website = resolveWebsite(def, kit.info.servers);
    if (null != website) {
        kit.info.website = website;
    }
    return { ok: true, msg: 'top' };
};
exports.topTransform = topTransform;
function hasLetters(text) {
    return /[a-zA-Z]/.test(text);
}
// A non-empty, at-least-one-sentence description for the API. Keeps the spec's
// own `info.description` when it is real prose; otherwise synthesises a sentence
// from the title (falling back to a generic sentence when even that is
// missing). Never returns an empty or letterless string.
function ensureDescription(info) {
    const current = 'string' === typeof info.description ? info.description.trim() : '';
    if ('' !== current && hasLetters(current)) {
        return info.description;
    }
    const title = 'string' === typeof info.title ? info.title.trim() : '';
    if ('' === title || !hasLetters(title)) {
        return 'Client SDK for this API.';
    }
    // Avoid a redundant "… Api API." when the title already names itself an API.
    return 'The ' + title + (/\bapi\b/i.test(title) ? '' : ' API') + '.';
}
// A short one-line description of the API's purpose: the spec's
// `info.summary` (OpenAPI 3.1) when present, else the first prose sentence
// of `info.description` with leading markdown headings/blank lines stripped
// and the length capped. Returns undefined when no usable prose exists
// (e.g. GitLab, whose top-level description is empty).
function resolveSummary(def) {
    const info = def?.info ?? {};
    const explicit = 'string' === typeof info.summary ? info.summary.trim() : '';
    if ('' !== explicit && hasLetters(explicit)) {
        return (0, utility_1.firstSentence)(explicit);
    }
    const desc = 'string' === typeof info.description ? info.description : '';
    if ('' === desc.trim() || !hasLetters(desc)) {
        return undefined;
    }
    const lines = desc.split('\n');
    let i = 0;
    while (i < lines.length &&
        ('' === lines[i].trim() ||
            /^\s*#{1,6}\s/.test(lines[i]) ||
            /^\s*(-{2,}|={2,})\s*$/.test(lines[i]))) {
        i++;
    }
    const para = [];
    while (i < lines.length &&
        '' !== lines[i].trim() &&
        !/^\s*#{1,6}\s/.test(lines[i])) {
        para.push(lines[i].trim());
        i++;
    }
    const paragraph = para.join(' ').trim();
    return '' === paragraph ? undefined : (0, utility_1.firstSentence)(paragraph);
}
function resolveWebsite(def, servers) {
    const info = def?.info ?? {};
    const ext = def?.externalDocs?.url;
    if (isHttpUrl(ext))
        return ext.trim();
    const logoHref = info['x-logo']?.href;
    if (isHttpUrl(logoHref))
        return logoHref.trim();
    const home = homepageFromServer(servers?.[0]?.url);
    if (null != home)
        return home;
    if (isHttpUrl(info.contact?.url))
        return info.contact.url.trim();
    if (isHttpUrl(info.termsOfService))
        return info.termsOfService.trim();
    return undefined;
}
// Derive a homepage from an API server URL by dropping the path and an
// `api.` / `developer.` / `docs.` / `www.` service subdomain — e.g.
// `https://api.thesmsworks.co.uk/v1` -> `https://thesmsworks.co.uk`.
function homepageFromServer(url) {
    if ('string' !== typeof url || '' === url.trim())
        return undefined;
    try {
        const u = new URL(url.includes('://') ? url : 'https://' + url);
        let host = u.hostname;
        if ('' === host || !host.includes('.'))
            return undefined;
        if (/[{}]/.test(host))
            return undefined;
        host = host.replace(/^(api|api-[a-z0-9]+|apis|developer|developers|docs?|www)\./i, '');
        return u.protocol + '//' + host;
    }
    catch (_e) {
        return undefined;
    }
}
function isHttpUrl(v) {
    return 'string' === typeof v && /^https?:\/\//i.test(v.trim());
}
function resolveSecurity(def) {
    const schemes = def.components?.securitySchemes ?? def.securityDefinitions ?? {};
    let schemeName = Array.isArray(def.security) && def.security[0] &&
        'object' === typeof def.security[0] ?
        Object.keys(def.security[0])[0] : undefined;
    if (null == schemeName || null == schemes[schemeName]) {
        schemeName = Object.keys(schemes)[0];
    }
    const scheme = null == schemeName ? null : schemes[schemeName];
    if (null == scheme || 'object' !== typeof scheme) {
        return null;
    }
    const type = String(scheme.type ?? '').toLowerCase();
    const out = {
        scheme: schemeName,
        type: scheme.type ?? '',
        in: scheme.in ?? 'header',
        name: scheme.name ?? 'Authorization',
        prefix: '',
    };
    if ('http' === type) {
        out.prefix = 'basic' === String(scheme.scheme ?? '').toLowerCase() ?
            'Basic' : 'Bearer';
    }
    else if ('basic' === type) {
        out.prefix = 'Basic';
    }
    else if ('oauth2' === type || 'openidconnect' === type) {
        out.in = 'header';
        out.name = 'Authorization';
        out.prefix = 'Bearer';
    }
    else if ('apikey' === type) {
        if ('header' === String(out.in).toLowerCase() &&
            'authorization' === String(out.name).toLowerCase()) {
            // Only adopt a prefix the API's prose actually documents; otherwise
            // the apiKey goes in raw (no assumed 'Bearer').
            out.prefix =
                findAuthPrefix(scheme.description) ??
                    findAuthPrefix(def.info?.description) ??
                    '';
        }
    }
    return out;
}
function findAuthExchange(def) {
    const secured = (0, utility_1.specSecuredByDefault)(def);
    if (!secured) {
        return null;
    }
    for (const [pathStr, pdef] of (0, utility_1.sortedEntries)(def.paths ?? {})) {
        for (const [methodName, mdef] of (0, utility_1.sortedEntries)(pdef)) {
            const found = (0, utility_1.authExchangeOp)({ ...mdef, method: methodName.toUpperCase() }, secured);
            if (null != found) {
                const out = {
                    path: String(pathStr).replace(/^\/+/, ''),
                    method: methodName.toUpperCase(),
                    response: found.response,
                };
                // Only when the heuristic actually recognised the credential field.
                // Absent, sdkgen keeps its own documented default rather than
                // carrying a guess that reads like a fact.
                if (null != found.request) {
                    out.request = found.request;
                }
                return out;
            }
        }
    }
    return null;
}
function findAuthPrefix(text) {
    if ('string' !== typeof text || '' === text) {
        return null;
    }
    const explicit = text.match(/Authorization:[ \t]*([A-Za-z][A-Za-z0-9._-]{0,14})[ \t]+(?:<[^>\n]+>|\{[^}\n]+\}|\$[A-Za-z_][A-Za-z0-9_]*|[Yy][Oo][Uu][Rr][A-Za-z0-9_-]*|[A-Za-z0-9._~+/=-]{8,})/);
    if (null != explicit) {
        return explicit[1];
    }
    const example = text.match(/(?:example|e\.g\.)[:\s][^\n]{0,20}?\b(Bearer|OAuth2?|Token|Basic)\b[ \t]+(?:<[^>\n]+>|\{[^}\n]+\}|[A-Za-z0-9._~+/=-]{6,})/i);
    if (null != example) {
        return canonAuthScheme(example[1]);
    }
    const named = text.match(/\b(Bearer|OAuth2?|Token|Basic)\b[ \t]+(?:scheme|authentication|auth\b|credentials?)/i);
    if (null != named) {
        return canonAuthScheme(named[1]);
    }
    return null;
}
function canonAuthScheme(word) {
    const w = word.toLowerCase();
    if (w.startsWith('oauth'))
        return 'OAuth';
    if ('bearer' === w)
        return 'Bearer';
    if ('token' === w)
        return 'Token';
    if ('basic' === w)
        return 'Basic';
    return word;
}
function specDeclaresAuth(def) {
    if (null == def || 'object' !== typeof def)
        return false;
    const nonEmptyObj = (v) => null != v && 'object' === typeof v && Object.keys(v).length > 0;
    if (nonEmptyObj(def.components?.securitySchemes))
        return true;
    if (nonEmptyObj(def.securityDefinitions))
        return true;
    if (Array.isArray(def.security) && def.security.length > 0)
        return true;
    const paths = def.paths;
    if (paths && 'object' === typeof paths) {
        for (const pathItem of Object.values(paths)) {
            if (null == pathItem || 'object' !== typeof pathItem)
                continue;
            for (const op of Object.values(pathItem)) {
                if (op && 'object' === typeof op &&
                    Array.isArray(op.security) && op.security.length > 0) {
                    return true;
                }
            }
        }
    }
    return false;
}
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
//# sourceMappingURL=top.js.map