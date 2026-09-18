/* Copyright (c) 2024-2026 Voxgig, MIT License */


import { relativizePath } from '../utility'


// A single argument on a root field or a type field.
type GqlArg = {
  name: string
  gqltype: string    // rendered GraphQL type, e.g. 'String!' or '[Int!]'
  type: string       // named (unwrapped) type, e.g. 'String'
  reqd: boolean
  deflt?: any
}


// A field on an object/interface type, or a root field.
type GqlField = {
  name: string
  gqltype: string
  type: string       // named (unwrapped) type
  reqd: boolean
  list: boolean
  args: GqlArg[]
  deprecated: boolean
  desc?: string
}


// A named type in the schema. `fields` is present for OBJECT, INTERFACE and
// INPUT_OBJECT kinds; `values` for ENUM; `possible` for UNION/INTERFACE.
type GqlType = {
  name: string
  kind: string       // OBJECT | INPUT_OBJECT | ENUM | SCALAR | INTERFACE | UNION
  fields: Record<string, GqlField>
  values?: string[]
  possible?: string[]
  interfaces?: string[]
  desc?: string
}


type GqlDef = {
  graphql: true
  info: Record<string, any>
  servers: { url: string }[]
  types: Record<string, GqlType>
  query: Record<string, GqlField>
  mutation: Record<string, GqlField>
  subscription: Record<string, GqlField>
}


// `graphql` is an OPTIONAL peer dependency: REST-only consumers should not
// have to install it. Resolve it lazily, and fail with an actionable message
// rather than a bare MODULE_NOT_FOUND.
function loadGraphQL(meta: { file: string }): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('graphql')
  }
  catch (err: any) {
    throw new Error(
      '@voxgig/apidef: parse: GraphQL: the "graphql" package is required to' +
      ' parse GraphQL schemas - install it alongside @voxgig/apidef' +
      ` (${relativizePath(meta.file)})`
    )
  }
}


// Introspection JSON arrives either bare (`{__schema:...}`) or wrapped in a
// GraphQL response envelope (`{data:{__schema:...}}`).
function asIntrospection(source: string): any {
  const trimmed = source.trimStart()
  if (!trimmed.startsWith('{')) {
    return undefined
  }

  let parsed: any
  try {
    parsed = JSON.parse(source)
  }
  catch (err: any) {
    return undefined
  }

  if (null != parsed?.__schema) {
    return parsed
  }
  if (null != parsed?.data?.__schema) {
    return parsed.data
  }

  return undefined
}


function describeType(G: any, gtype: any) {
  const gqltype = String(gtype)
  const named = G.getNamedType(gtype)
  return {
    gqltype,
    type: named.name,
    reqd: G.isNonNullType(gtype),
    list: G.isListType(G.isNonNullType(gtype) ? gtype.ofType : gtype),
  }
}


function buildArgs(G: any, gargs: any[]): GqlArg[] {
  return (gargs || []).map((ga: any) => {
    const d = describeType(G, ga.type)
    const arg: GqlArg = {
      name: ga.name,
      gqltype: d.gqltype,
      type: d.type,
      reqd: d.reqd,
    }
    if (undefined !== ga.defaultValue && null !== ga.defaultValue) {
      arg.deflt = ga.defaultValue
    }
    return arg
  })
}


function buildField(G: any, gfield: any): GqlField {
  const d = describeType(G, gfield.type)
  const field: GqlField = {
    name: gfield.name,
    gqltype: d.gqltype,
    type: d.type,
    reqd: d.reqd,
    list: d.list,
    args: buildArgs(G, gfield.args),
    deprecated: null != gfield.deprecationReason,
  }
  if (null != gfield.description && '' !== gfield.description) {
    field.desc = gfield.description
  }
  return field
}


function fieldMap(G: any, gtype: any): Record<string, GqlField> {
  const out: Record<string, GqlField> = {}
  const gfields = gtype.getFields ? gtype.getFields() : {}
  // Sorted: downstream output must be byte-stable.
  for (const name of Object.keys(gfields).sort()) {
    out[name] = buildField(G, gfields[name])
  }
  return out
}


function typeKind(G: any, gtype: any): string {
  if (G.isObjectType(gtype)) return 'OBJECT'
  if (G.isInputObjectType(gtype)) return 'INPUT_OBJECT'
  if (G.isEnumType(gtype)) return 'ENUM'
  if (G.isInterfaceType(gtype)) return 'INTERFACE'
  if (G.isUnionType(gtype)) return 'UNION'
  if (G.isScalarType(gtype)) return 'SCALAR'
  return 'UNKNOWN'
}


function buildTypes(G: any, schema: any): Record<string, GqlType> {
  const out: Record<string, GqlType> = {}
  const typeMap = schema.getTypeMap()

  for (const name of Object.keys(typeMap).sort()) {
    // Introspection meta types (__Schema, __Type, ...) are not API surface.
    if (name.startsWith('__')) {
      continue
    }

    const gtype = typeMap[name]
    const kind = typeKind(G, gtype)

    const desc: GqlType = {
      name,
      kind,
      fields: ('OBJECT' === kind || 'INTERFACE' === kind || 'INPUT_OBJECT' === kind) ?
        fieldMap(G, gtype) : {},
    }

    if ('ENUM' === kind) {
      desc.values = gtype.getValues().map((v: any) => v.name).sort()
    }

    if ('UNION' === kind) {
      desc.possible = schema.getPossibleTypes(gtype).map((t: any) => t.name).sort()
    }

    if ('INTERFACE' === kind) {
      desc.possible = schema.getPossibleTypes(gtype).map((t: any) => t.name).sort()
    }

    if ('OBJECT' === kind || 'INTERFACE' === kind) {
      const ifaces = (gtype.getInterfaces ? gtype.getInterfaces() : [])
        .map((t: any) => t.name).sort()
      if (0 < ifaces.length) {
        desc.interfaces = ifaces
      }
    }

    if (null != gtype.description && '' !== gtype.description) {
      desc.desc = gtype.description
    }

    out[name] = desc
  }

  return out
}


function rootFields(G: any, gtype: any): Record<string, GqlField> {
  return null == gtype ? {} : fieldMap(G, gtype)
}


async function parseGraphQL(
  source: string,
  meta: { file: string },
  opts?: { endpoint?: string, title?: string, version?: string }
): Promise<GqlDef> {
  const G = loadGraphQL(meta)

  const endpoint = opts?.endpoint
  if (null == endpoint || '' === String(endpoint).trim()) {
    throw new Error(
      '@voxgig/apidef: parse: GraphQL: an endpoint option is required' +
      ' (a GraphQL schema declares no server URL)' +
      ` (${relativizePath(meta.file)})`
    )
  }

  let schema: any
  const introspection = asIntrospection(source)

  if (null != introspection) {
    schema = G.buildClientSchema(introspection)
  }
  else {
    schema = G.buildSchema(source)
  }

  const def: GqlDef = {
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
  }

  return def
}


export {
  parseGraphQL,
}

export type {
  GqlDef,
  GqlType,
  GqlField,
  GqlArg,
}
