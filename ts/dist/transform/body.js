"use strict";
/* Copyright (c) 2026 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bodyTransform = void 0;
exports.guideMedia = guideMedia;
exports.requestBody = requestBody;
exports.responseBody = responseBody;
exports.jsonRequestSchema = jsonRequestSchema;
exports.requestSchema = requestSchema;
exports.arrayRequestSchema = arrayRequestSchema;
exports.arrayCarrier = arrayCarrier;
const types_1 = require("../types");
const utility_1 = require("../utility");
// JSON first, as generated SDKs send it; then the kinds by what each can carry.
const KIND_ORDER = ['json', 'multipart', 'form', 'raw'];
const JSON_MEDIA = 'application/json';
const FORM_MEDIA = 'application/x-www-form-urlencoded';
const MULTIPART_MEDIA = 'multipart/form-data';
const OCTET_MEDIA = 'application/octet-stream';
const SUCCESS_RE = /^2(\d\d|xx)$/i;
const TYPING_KEYS = [
    'type', 'format', 'properties', 'additionalProperties', 'items',
    'allOf', 'anyOf', 'oneOf', 'enum', 'const', 'contentMediaType', 'contentEncoding',
];
const bodyTransform = async function (ctx) {
    const { apimodel, def, guide } = ctx;
    const entities = apimodel.main[types_1.KIT].entity;
    let msg = 'body ';
    for (const entname of (0, utility_1.sortedKeys)(entities)) {
        const ops = entities[entname].op ?? {};
        for (const opname of (0, utility_1.sortedKeys)(ops)) {
            for (const mpoint of (ops[opname]?.points ?? [])) {
                if ('graphql' === mpoint.k) {
                    continue;
                }
                const media = guideMedia(guide, entname, opname, mpoint);
                const rb = requestBody(def, mpoint.m, mpoint.o, media.body);
                if (null != rb) {
                    mpoint.rb = rb;
                }
                const rs = responseBody(def, mpoint.m, mpoint.o, media.response);
                if (null != rs) {
                    mpoint.rs = rs;
                }
            }
        }
        msg += entname + ' ';
    }
    return { ok: true, msg };
};
exports.bodyTransform = bodyTransform;
// The entry of the point's own op, as ops can share a path and method.
// A patch the operation pass promotes to update keeps its entry under patch.
function guideMedia(guide, entname, opname, mpoint) {
    const gops = guide?.entity?.[entname]?.path?.[mpoint.o]?.op ?? {};
    for (const name of 'update' === opname ? ['update', 'patch'] : [opname]) {
        const gop = gops[name];
        if (null != gop && (0, utility_1.guideActive)(gop) &&
            String(gop.method ?? '').toUpperCase() === String(mpoint.m).toUpperCase()) {
            return { body: textOf(gop.body?.media), response: textOf(gop.response?.media) };
        }
    }
    return {};
}
// Undefined when the operation sends JSON alone.
function requestBody(def, method, path, media) {
    const offers = requestOffers(def, method, path);
    if (null == offers) {
        return undefined;
    }
    const body = chooseBody(offers, media);
    if (null == body || ('json' === body.kind && JSON_MEDIA === essence(body.media) &&
        (body.alternatives ?? []).every((other) => 'json' === other.kind))) {
        return undefined;
    }
    return body;
}
// Undefined when no success response declares a body.
function responseBody(def, method, path, media) {
    const opdef = def?.paths?.[path]?.[String(method).toLowerCase()];
    if (!isMap(opdef)) {
        return undefined;
    }
    return chooseBody(null != def.swagger ?
        swaggerResponseOffers(def, opdef) : openapiResponseOffers(opdef), media);
}
function requestOffers(def, method, path) {
    const pathdef = def?.paths?.[path];
    const opdef = pathdef?.[String(method).toLowerCase()];
    if (!isMap(opdef)) {
        return undefined;
    }
    return null != def.swagger ? swaggerOffers(def, pathdef, opdef) : openapiOffers(opdef);
}
function chooseBody(offers, media) {
    const ranked = rankOffers(offers);
    const bodies = ranked.map((entry) => entry.body).filter((body, i, all) => i === all.findIndex((other) => other.media === body.media));
    const chosen = chooseOffer(ranked, media)?.body ??
        (null == textOf(media) ? undefined : describeBody({ media: textOf(media) }));
    if (null == chosen) {
        return undefined;
    }
    const alternatives = bodies.filter((body) => body.media !== chosen.media);
    return 0 < alternatives.length ? { ...chosen, alternatives } : chosen;
}
function rankOffers(offers) {
    return offers
        .sort((a, b) => compare(a.media, b.media))
        .map((offer) => ({ offer, declared: offer.media.trim().toLowerCase(), body: describeBody(offer) }))
        .sort((a, b) => byPreference(a.body, b.body));
}
// A named media type is matched as declared first, so a range keeps its schema.
function chooseOffer(ranked, media) {
    const named = textOf(media)?.toLowerCase();
    return null == named ? ranked[0] :
        ranked.find((entry) => entry.declared === named) ??
            ranked.find((entry) => entry.body.media.toLowerCase() === named);
}
function openapiOffers(opdef) {
    const content = opdef.requestBody?.content;
    if (!isMap(content)) {
        return [];
    }
    return Object.keys(content).map((media) => ({
        media,
        schema: content[media]?.schema,
        encoding: content[media]?.encoding,
    }));
}
// A response's `encoding` is ignored, as OpenAPI applies it to request bodies only.
function openapiResponseOffers(opdef) {
    const responses = isMap(opdef.responses) ? opdef.responses : {};
    return (0, utility_1.sortedKeys)(responses).filter((status) => SUCCESS_RE.test(status))
        .flatMap((status) => {
        const content = responses[status]?.content;
        return isMap(content) ?
            Object.keys(content).map((media) => ({ media, schema: content[media]?.schema })) : [];
    });
}
// Swagger declares a body as a `body` parameter or as `formData` parameters,
// and its media types in `consumes`, the operation's replacing the document's.
function swaggerOffers(def, pathdef, opdef) {
    const params = swaggerParams(pathdef, opdef);
    const body = params.find((param) => 'body' === param.in);
    const form = params.filter((param) => 'formData' === param.in && 'string' === typeof param.name && '' !== param.name);
    if (null == body && 0 === form.length) {
        return [];
    }
    const bodySchema = null == body ? undefined : (body.schema ?? {});
    const formSchema = 0 === form.length ? undefined : {
        type: 'object',
        properties: Object.fromEntries(form.map((param) => [param.name, formProperty(param)])),
    };
    const declared = listOf(Array.isArray(opdef.consumes) ? opdef.consumes : def.consumes)
        .filter((media) => null != textOf(media));
    const consumes = 0 < declared.length ? declared : [
        null != body ? JSON_MEDIA :
            form.some((param) => 'file' === param.type) ? MULTIPART_MEDIA : FORM_MEDIA
    ];
    return consumes.map((media) => ({
        media,
        schema: fielded(essence(media)) ? (formSchema ?? bodySchema) : (bodySchema ?? formSchema),
        swagger: true,
    }));
}
// An operation's parameter replaces the path's of the same location and name.
function swaggerParams(pathdef, opdef) {
    const key = (param) => (textOf(param.in) ?? '') + '\u0000' + (textOf(param.name) ?? '');
    const own = listOf(opdef.parameters).filter(isMap);
    const owned = new Set(own.map(key));
    return [...own, ...listOf(pathdef?.parameters).filter(isMap).filter((param) => !owned.has(key(param)))];
}
// A Swagger response with no schema has no body.
function swaggerResponseOffers(def, opdef) {
    const responses = isMap(opdef.responses) ? opdef.responses : {};
    const status = (0, utility_1.sortedKeys)(responses).find((code) => SUCCESS_RE.test(code) && null != responses[code]?.schema);
    if (null == status) {
        return [];
    }
    const declared = listOf(Array.isArray(opdef.produces) ? opdef.produces : def.produces)
        .filter((media) => null != textOf(media));
    return (0 < declared.length ? declared : [JSON_MEDIA])
        .map((media) => ({ media, schema: responses[status].schema }));
}
function formProperty(param) {
    const prop = {};
    for (const key of ['type', 'format', 'items', 'collectionFormat']) {
        if (null != param[key]) {
            prop[key] = param[key];
        }
    }
    return prop;
}
function describeBody(offer) {
    const media = offer.media.trim();
    const type = essence(media);
    const [major, minor = ''] = type.split('/');
    if (JSON_MEDIA === type || 'text/json' === type || minor.endsWith('+json')) {
        return { kind: 'json', media: type.includes('*') ? JSON_MEDIA : media };
    }
    if (FORM_MEDIA === type) {
        return withFields({ kind: 'form', media }, offer);
    }
    if ('multipart' === major) {
        return withFields({ kind: 'multipart', media: '*' === minor ? MULTIPART_MEDIA : media }, offer);
    }
    // A range that admits JSON stays JSON unless its schema is bytes.
    if ('*' === minor && ('*' === major || 'application' === major)) {
        return binarySchema(offer.schema) ?
            { kind: 'raw', media: OCTET_MEDIA, binary: true } :
            { kind: 'json', media: JSON_MEDIA };
    }
    const body = { kind: 'raw', media };
    if (rawBinary(type, offer.schema)) {
        body.binary = true;
    }
    return body;
}
function withFields(body, offer) {
    const props = (0, utility_1.mergedProperties)(offer.schema);
    const fields = (0, utility_1.sortedKeys)(props).map((name) => bodyField(name, props[name], offer.encoding?.[name], offer.swagger ? 'swagger' : body.kind));
    if (0 < fields.length) {
        body.fields = fields;
    }
    return body;
}
function bodyField(name, prop, encoding, arrays) {
    const list = hasType(prop, 'array');
    const item = list ? prop.items : prop;
    const field = { name };
    if (binarySchema(item)) {
        field.binary = true;
    }
    if (list) {
        const join = arrayJoin(prop, encoding, arrays);
        if (null == join) {
            field.list = true;
        }
        else {
            field.join = join;
        }
    }
    const media = textOf(encoding?.contentType) ?? textOf(isMap(item) ? item.contentMediaType : undefined);
    if (null != media) {
        field.media = media;
    }
    return field;
}
// The delimiter an array's items are joined with, or undefined when each item
// is sent as a field of its own: Swagger's `collectionFormat` (`csv` unless
// `multi`), a form's `style` and `explode`, and always for a multipart part.
function arrayJoin(prop, encoding, arrays) {
    if ('swagger' === arrays) {
        const format = 'string' === typeof prop.collectionFormat ? prop.collectionFormat : 'csv';
        return 'multi' === format ? undefined : delimiter(format);
    }
    if ('form' === arrays) {
        const style = 'string' === typeof encoding?.style ? encoding.style : 'form';
        const explode = 'boolean' === typeof encoding?.explode ? encoding.explode : 'form' === style;
        return explode ? undefined : delimiter(style);
    }
    return undefined;
}
function delimiter(format) {
    return 'ssv' === format || 'spaceDelimited' === format ? ' ' :
        'tsv' === format ? '\t' :
            'pipes' === format || 'pipeDelimited' === format ? '|' : ',';
}
// Bytes unless the schema says text, or the media type is text and the schema typed.
function rawBinary(type, schema) {
    if (encodedText(schema)) {
        return false;
    }
    return untyped(schema) || binarySchema(schema) || !textMedia(type);
}
function binarySchema(schema) {
    return isMap(schema) && !encodedText(schema) &&
        ('binary' === schema.format || 'file' === schema.type || null != schema.contentMediaType);
}
function encodedText(schema) {
    return isMap(schema) && ('byte' === schema.format || null != schema.contentEncoding);
}
function untyped(schema) {
    return !isMap(schema) || !TYPING_KEYS.some((key) => null != schema[key]);
}
function textMedia(type) {
    const [major, minor = ''] = type.split('/');
    return 'text' === major || 'xml' === minor || minor.endsWith('+xml');
}
function fielded(type) {
    return FORM_MEDIA === type || type.startsWith('multipart/');
}
function byPreference(a, b) {
    return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        Number(JSON_MEDIA !== essence(a.media)) - Number(JSON_MEDIA !== essence(b.media)) ||
        compare(a.media, b.media);
}
function essence(media) {
    return media.split(';')[0].trim().toLowerCase();
}
function hasType(schema, type) {
    return isMap(schema) &&
        (type === schema.type || (Array.isArray(schema.type) && schema.type.includes(type)));
}
function textOf(val) {
    return 'string' === typeof val && '' !== val.trim() ? val.trim() : undefined;
}
function listOf(val) {
    return Array.isArray(val) ? val : [];
}
function isMap(val) {
    return null != val && 'object' === typeof val && !Array.isArray(val);
}
function compare(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
// The schema the body step sends a request body with, when that body is JSON.
function jsonSchema(offers, media) {
    const chosen = chooseOffer(rankOffers(offers), media);
    return 'json' === chosen?.body.kind ? chosen.offer.schema : undefined;
}
function jsonRequestSchema(opdef) {
    return isMap(opdef) ? jsonSchema(openapiOffers(opdef)) : undefined;
}
// The JSON schema a point's request body is sent with, under the media type
// the guide names, else the one the body step prefers.
function requestSchema(def, method, path, media) {
    return jsonSchema(requestOffers(def, method, path) ?? [], media);
}
function arrayRequestSchema(def, method, path, media) {
    return arrayShape(requestSchema(def, method, path, media));
}
// An array, or an allOf whose members make one, with the outer description.
function arrayShape(schema, seen = new Set()) {
    if (hasType(schema, 'array')) {
        return schema;
    }
    if (!isMap(schema) || seen.has(schema) || !Array.isArray(schema.allOf)) {
        return undefined;
    }
    seen.add(schema);
    for (const member of schema.allOf) {
        const list = arrayShape(member, seen);
        if (null != list) {
            return null == schema.description ? list : { ...list, description: schema.description };
        }
    }
    return undefined;
}
const REQDATA_FIELD_RE = /^`reqdata\.([A-Za-z_][A-Za-z0-9_]*)`$/;
// The field of the request data a point's JSON array body is sent from, when
// its request transform unwraps one.
function arrayCarrier(def, mpoint, media) {
    const req = mpoint.t?.req;
    const name = 'string' === typeof req ? req.match(REQDATA_FIELD_RE)?.[1] : undefined;
    const schema = null == name ? undefined : arrayRequestSchema(def, mpoint.m, mpoint.o, media);
    if (null == name || null == schema) {
        return undefined;
    }
    const decl = requestDecl(def, mpoint.m, mpoint.o);
    return {
        name,
        required: true === decl?.required,
        description: textOf(decl?.description) ?? textOf(schema.description),
    };
}
// OpenAPI's request body, or the Swagger parameter that is one.
function requestDecl(def, method, path) {
    const pathdef = def?.paths?.[path];
    const opdef = pathdef?.[String(method).toLowerCase()];
    if (!isMap(opdef)) {
        return undefined;
    }
    return null != def.swagger ?
        swaggerParams(pathdef, opdef).find((param) => 'body' === param.in) : opdef.requestBody;
}
//# sourceMappingURL=body.js.map