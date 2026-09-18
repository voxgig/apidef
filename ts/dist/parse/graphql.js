"use strict";
/* Copyright (c) 2024-2026 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseGraphQL = parseGraphQL;
const utility_1 = require("../utility");
// `graphql` is an OPTIONAL peer dependency: REST-only consumers should not
// have to install it. Resolve it lazily, and fail with an actionable message
// rather than a bare MODULE_NOT_FOUND.
function loadGraphQL(meta) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('graphql');
    }
    catch (err) {
        throw new Error('@voxgig/apidef: parse: GraphQL: the "graphql" package is required to' +
            ' parse GraphQL schemas - install it alongside @voxgig/apidef' +
            ` (${(0, utility_1.relativizePath)(meta.file)})`);
    }
}
// Introspection JSON arrives either bare (`{__schema:...}`) or wrapped in a
// GraphQL response envelope (`{data:{__schema:...}}`).
function asIntrospection(source) {
    const trimmed = source.trimStart();
    if (!trimmed.startsWith('{')) {
        return undefined;
    }
    let parsed;
    try {
        parsed = JSON.parse(source);
    }
    catch (err) {
        return undefined;
    }
    if (null != parsed?.__schema) {
        return parsed;
    }
    if (null != parsed?.data?.__schema) {
        return parsed.data;
    }
    return undefined;
}
function describeType(G, gtype) {
    const gqltype = String(gtype);
    const named = G.getNamedType(gtype);
    return {
        gqltype,
        type: named.name,
        reqd: G.isNonNullType(gtype),
        list: G.isListType(G.isNonNullType(gtype) ? gtype.ofType : gtype),
    };
}
function buildArgs(G, gargs) {
    return (gargs || []).map((ga) => {
        const d = describeType(G, ga.type);
        const arg = {
            name: ga.name,
            gqltype: d.gqltype,
            type: d.type,
            reqd: d.reqd,
        };
        if (undefined !== ga.defaultValue && null !== ga.defaultValue) {
            arg.deflt = ga.defaultValue;
        }
        return arg;
    });
}
function buildField(G, gfield) {
    const d = describeType(G, gfield.type);
    const field = {
        name: gfield.name,
        gqltype: d.gqltype,
        type: d.type,
        reqd: d.reqd,
        list: d.list,
        args: buildArgs(G, gfield.args),
        deprecated: null != gfield.deprecationReason,
    };
    if (null != gfield.description && '' !== gfield.description) {
        field.desc = gfield.description;
    }
    return field;
}
function fieldMap(G, gtype) {
    const out = {};
    const gfields = gtype.getFields ? gtype.getFields() : {};
    // Sorted: downstream output must be byte-stable.
    for (const name of Object.keys(gfields).sort()) {
        out[name] = buildField(G, gfields[name]);
    }
    return out;
}
function typeKind(G, gtype) {
    if (G.isObjectType(gtype))
        return 'OBJECT';
    if (G.isInputObjectType(gtype))
        return 'INPUT_OBJECT';
    if (G.isEnumType(gtype))
        return 'ENUM';
    if (G.isInterfaceType(gtype))
        return 'INTERFACE';
    if (G.isUnionType(gtype))
        return 'UNION';
    if (G.isScalarType(gtype))
        return 'SCALAR';
    return 'UNKNOWN';
}
function buildTypes(G, schema) {
    const out = {};
    const typeMap = schema.getTypeMap();
    for (const name of Object.keys(typeMap).sort()) {
        // Introspection meta types (__Schema, __Type, ...) are not API surface.
        if (name.startsWith('__')) {
            continue;
        }
        const gtype = typeMap[name];
        const kind = typeKind(G, gtype);
        const desc = {
            name,
            kind,
            fields: ('OBJECT' === kind || 'INTERFACE' === kind || 'INPUT_OBJECT' === kind) ?
                fieldMap(G, gtype) : {},
        };
        if ('ENUM' === kind) {
            desc.values = gtype.getValues().map((v) => v.name).sort();
        }
        if ('UNION' === kind) {
            desc.possible = schema.getPossibleTypes(gtype).map((t) => t.name).sort();
        }
        if ('INTERFACE' === kind) {
            desc.possible = schema.getPossibleTypes(gtype).map((t) => t.name).sort();
        }
        if ('OBJECT' === kind || 'INTERFACE' === kind) {
            const ifaces = (gtype.getInterfaces ? gtype.getInterfaces() : [])
                .map((t) => t.name).sort();
            if (0 < ifaces.length) {
                desc.interfaces = ifaces;
            }
        }
        if (null != gtype.description && '' !== gtype.description) {
            desc.desc = gtype.description;
        }
        out[name] = desc;
    }
    return out;
}
function rootFields(G, gtype) {
    return null == gtype ? {} : fieldMap(G, gtype);
}
async function parseGraphQL(source, meta, opts) {
    const G = loadGraphQL(meta);
    const endpoint = opts?.endpoint;
    if (null == endpoint || '' === String(endpoint).trim()) {
        throw new Error('@voxgig/apidef: parse: GraphQL: an endpoint option is required' +
            ' (a GraphQL schema declares no server URL)' +
            ` (${(0, utility_1.relativizePath)(meta.file)})`);
    }
    let schema;
    const introspection = asIntrospection(source);
    if (null != introspection) {
        schema = G.buildClientSchema(introspection);
    }
    else {
        schema = G.buildSchema(source);
    }
    const def = {
        graphql: true,
        info: {
            title: opts?.title ?? '',
            version: opts?.version ?? '',
            description: '',
        },
        servers: [{ url: endpoint }],
        types: buildTypes(G, schema),
        query: rootFields(G, schema.getQueryType()),
        mutation: rootFields(G, schema.getMutationType()),
        subscription: rootFields(G, schema.getSubscriptionType()),
    };
    return def;
}
//# sourceMappingURL=graphql.js.map