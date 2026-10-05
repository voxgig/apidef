/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import type { TransformResult, Transform } from '../transform'

import { KIT } from '../types'

import { guideActive, mergedProperties, sortedKeys } from '../utility'

import type {
  BodyKind,
  ModelBody,
  ModelBodyField,
  ModelPoint,
} from '../model'


// JSON first, as generated SDKs send it; then the kinds by what each can carry.
const KIND_ORDER: BodyKind[] = ['json', 'multipart', 'form', 'raw']

const JSON_MEDIA = 'application/json'
const FORM_MEDIA = 'application/x-www-form-urlencoded'
const MULTIPART_MEDIA = 'multipart/form-data'
const OCTET_MEDIA = 'application/octet-stream'

const SUCCESS_RE = /^2(\d\d|xx)$/i

const TYPING_KEYS = [
  'type', 'format', 'properties', 'additionalProperties', 'items',
  'allOf', 'anyOf', 'oneOf', 'enum', 'const', 'contentMediaType', 'contentEncoding',
]


type Offer = {
  media: string
  schema?: any
  encoding?: any
  swagger?: boolean
}

type Ranked = {
  offer: Offer
  declared: string
  body: ModelBody
}


const bodyTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def, guide } = ctx
  const entities = apimodel.main[KIT].entity

  let msg = 'body '

  for (const entname of sortedKeys(entities)) {
    const ops = entities[entname].op ?? {}
    for (const opname of sortedKeys(ops)) {
      for (const mpoint of (ops[opname]?.points ?? []) as ModelPoint[]) {
        if ('graphql' === mpoint.k) {
          continue
        }
        const media = guideMedia(guide, entname, opname, mpoint)
        const rb = requestBody(def, mpoint.m, mpoint.o, media.body)
        if (null != rb) {
          mpoint.rb = rb
        }
        const rs = responseBody(def, mpoint.m, mpoint.o, media.response)
        if (null != rs) {
          mpoint.rs = rs
        }
      }
    }
    msg += entname + ' '
  }

  return { ok: true, msg }
}


// The entry of the point's own op, as ops can share a path and method.
// A patch the operation pass promotes to update keeps its entry under patch.
function guideMedia(
  guide: any,
  entname: string,
  opname: string,
  mpoint: ModelPoint,
): { body?: string, response?: string } {
  const gops = guide?.entity?.[entname]?.path?.[mpoint.o]?.op ?? {}
  for (const name of 'update' === opname ? ['update', 'patch'] : [opname]) {
    const gop = gops[name]
    if (null != gop && guideActive(gop) &&
      String(gop.method ?? '').toUpperCase() === String(mpoint.m).toUpperCase()) {
      return { body: textOf(gop.body?.media), response: textOf(gop.response?.media) }
    }
  }
  return {}
}


// Undefined when the operation sends JSON alone.
function requestBody(
  def: any,
  method: string,
  path: string,
  media?: string,
): ModelBody | undefined {
  const offers = requestOffers(def, method, path)
  if (null == offers) {
    return undefined
  }

  const body = chooseBody(offers, media)

  if (null == body || ('json' === body.kind && JSON_MEDIA === essence(body.media) &&
    (body.alternatives ?? []).every((other) => 'json' === other.kind))) {
    return undefined
  }

  return body
}


// Undefined when no success response declares a body.
function responseBody(
  def: any,
  method: string,
  path: string,
  media?: string,
): ModelBody | undefined {
  const opdef = def?.paths?.[path]?.[String(method).toLowerCase()]
  if (!isMap(opdef)) {
    return undefined
  }

  return chooseBody(null != def.swagger ?
    swaggerResponseOffers(def, opdef) : openapiResponseOffers(opdef), media)
}


function requestOffers(def: any, method: string, path: string): Offer[] | undefined {
  const pathdef = def?.paths?.[path]
  const opdef = pathdef?.[String(method).toLowerCase()]
  if (!isMap(opdef)) {
    return undefined
  }
  return null != def.swagger ? swaggerOffers(def, pathdef, opdef) : openapiOffers(opdef)
}


function chooseBody(offers: Offer[], media?: string): ModelBody | undefined {
  const ranked = rankOffers(offers)
  const bodies = ranked.map((entry) => entry.body).filter((body, i, all) =>
    i === all.findIndex((other) => other.media === body.media))

  const chosen = chooseOffer(ranked, media)?.body ??
    (null == textOf(media) ? undefined : describeBody({ media: textOf(media) as string }))

  if (null == chosen) {
    return undefined
  }

  const alternatives = bodies.filter((body) => body.media !== chosen.media)
  return 0 < alternatives.length ? { ...chosen, alternatives } : chosen
}


function rankOffers(offers: Offer[]): Ranked[] {
  return offers
    .sort((a, b) => compare(a.media, b.media))
    .map((offer) => ({ offer, declared: offer.media.trim().toLowerCase(), body: describeBody(offer) }))
    .sort((a, b) => byPreference(a.body, b.body))
}


// A named media type is matched as declared first, so a range keeps its schema.
function chooseOffer(ranked: Ranked[], media?: string): Ranked | undefined {
  const named = textOf(media)?.toLowerCase()
  return null == named ? ranked[0] :
    ranked.find((entry) => entry.declared === named) ??
    ranked.find((entry) => entry.body.media.toLowerCase() === named)
}


function openapiOffers(opdef: any): Offer[] {
  const content = opdef.requestBody?.content
  if (!isMap(content)) {
    return []
  }
  return Object.keys(content).map((media) => ({
    media,
    schema: content[media]?.schema,
    encoding: content[media]?.encoding,
  }))
}


// A response's `encoding` is ignored, as OpenAPI applies it to request bodies only.
function openapiResponseOffers(opdef: any): Offer[] {
  const responses = isMap(opdef.responses) ? opdef.responses : {}
  return sortedKeys(responses).filter((status) => SUCCESS_RE.test(status))
    .flatMap((status) => {
      const content = responses[status]?.content
      return isMap(content) ?
        Object.keys(content).map((media) => ({ media, schema: content[media]?.schema })) : []
    })
}


// Swagger declares a body as a `body` parameter or as `formData` parameters,
// and its media types in `consumes`, the operation's replacing the document's.
function swaggerOffers(def: any, pathdef: any, opdef: any): Offer[] {
  const params = swaggerParams(pathdef, opdef)
  const body = params.find((param) => 'body' === param.in)
  const form = params.filter((param) =>
    'formData' === param.in && 'string' === typeof param.name && '' !== param.name)

  if (null == body && 0 === form.length) {
    return []
  }

  const bodySchema = null == body ? undefined : (body.schema ?? {})
  const required = form.filter((param) => true === param.required).map((param) => param.name)
  const formSchema = 0 === form.length ? undefined : {
    type: 'object',
    properties: Object.fromEntries(form.map((param) => [param.name, formProperty(param)])),
    ...(0 < required.length ? { required } : {}),
  }

  const declared = listOf(Array.isArray(opdef.consumes) ? opdef.consumes : def.consumes)
    .filter((media) => null != textOf(media))
  const consumes = 0 < declared.length ? declared : [
    null != body ? JSON_MEDIA :
      form.some((param) => 'file' === param.type) ? MULTIPART_MEDIA : FORM_MEDIA
  ]

  return consumes.map((media: string) => ({
    media,
    schema: fielded(essence(media)) ? (formSchema ?? bodySchema) : (bodySchema ?? formSchema),
    swagger: true,
  }))
}


// An operation's parameter replaces the path's of the same location and name.
function swaggerParams(pathdef: any, opdef: any): any[] {
  const key = (param: any) => (textOf(param.in) ?? '') + '\u0000' + (textOf(param.name) ?? '')
  const own = listOf(opdef.parameters).filter(isMap)
  const owned = new Set(own.map(key))
  return [...own, ...listOf(pathdef?.parameters).filter(isMap).filter((param) => !owned.has(key(param)))]
}


// A Swagger response with no schema has no body.
function swaggerResponseOffers(def: any, opdef: any): Offer[] {
  const responses = isMap(opdef.responses) ? opdef.responses : {}
  const status = sortedKeys(responses).find((code) =>
    SUCCESS_RE.test(code) && null != responses[code]?.schema)
  if (null == status) {
    return []
  }
  const declared = listOf(Array.isArray(opdef.produces) ? opdef.produces : def.produces)
    .filter((media) => null != textOf(media))
  return (0 < declared.length ? declared : [JSON_MEDIA])
    .map((media: string) => ({ media, schema: responses[status].schema }))
}


function formProperty(param: any): any {
  const prop: any = {}
  for (const key of ['type', 'format', 'items', 'collectionFormat']) {
    if (null != param[key]) {
      prop[key] = param[key]
    }
  }
  return prop
}


function describeBody(offer: Offer): ModelBody {
  const media = offer.media.trim()
  const type = essence(media)
  const [major, minor = ''] = type.split('/')

  if (JSON_MEDIA === type || 'text/json' === type || minor.endsWith('+json')) {
    return { kind: 'json', media: type.includes('*') ? JSON_MEDIA : media }
  }

  if (FORM_MEDIA === type) {
    return withFields({ kind: 'form', media }, offer)
  }

  if ('multipart' === major) {
    return withFields({ kind: 'multipart', media: '*' === minor ? MULTIPART_MEDIA : media }, offer)
  }

  // A range that admits JSON stays JSON unless its schema is bytes.
  if ('*' === minor && ('*' === major || 'application' === major)) {
    return binarySchema(offer.schema) ?
      { kind: 'raw', media: OCTET_MEDIA, binary: true } :
      { kind: 'json', media: JSON_MEDIA }
  }

  const body: ModelBody = { kind: 'raw', media }
  if (rawBinary(type, offer.schema)) {
    body.binary = true
  }
  return body
}


function withFields(body: ModelBody, offer: Offer): ModelBody {
  const props = mergedProperties(offer.schema)
  const fields = sortedKeys(props).map((name: string) =>
    bodyField(name, props![name], offer.encoding?.[name], offer.swagger ? 'swagger' : body.kind))
  if (0 < fields.length) {
    body.fields = fields
  }
  return body
}


function bodyField(name: string, prop: any, encoding: any, arrays: string): ModelBodyField {
  const list = hasType(prop, 'array')
  const item = list ? prop.items : prop
  const field: ModelBodyField = { name }
  if (binarySchema(item)) {
    field.binary = true
  }
  if (list) {
    const join = arrayJoin(prop, encoding, arrays)
    if (null == join) {
      field.list = true
    }
    else {
      field.join = join
    }
  }
  const media = textOf(encoding?.contentType) ?? textOf(isMap(item) ? item.contentMediaType : undefined)
  if (null != media) {
    field.media = media
  }
  return field
}


// The delimiter an array's items are joined with, or undefined when each item
// is sent as a field of its own: Swagger's `collectionFormat` (`csv` unless
// `multi`), a form's `style` and `explode`, and always for a multipart part.
function arrayJoin(prop: any, encoding: any, arrays: string): string | undefined {
  if ('swagger' === arrays) {
    const format = 'string' === typeof prop.collectionFormat ? prop.collectionFormat : 'csv'
    return 'multi' === format ? undefined : delimiter(format)
  }
  if ('form' === arrays) {
    const style = 'string' === typeof encoding?.style ? encoding.style : 'form'
    const explode = 'boolean' === typeof encoding?.explode ? encoding.explode : 'form' === style
    return explode ? undefined : delimiter(style)
  }
  return undefined
}


function delimiter(format: string): string {
  return 'ssv' === format || 'spaceDelimited' === format ? ' ' :
    'tsv' === format ? '\t' :
      'pipes' === format || 'pipeDelimited' === format ? '|' : ','
}


// Bytes unless the schema says text, or the media type is text and the schema typed.
function rawBinary(type: string, schema: any): boolean {
  if (encodedText(schema)) {
    return false
  }
  return untyped(schema) || binarySchema(schema) || !textMedia(type)
}


function binarySchema(schema: any): boolean {
  return isMap(schema) && !encodedText(schema) &&
    ('binary' === schema.format || 'file' === schema.type || null != schema.contentMediaType)
}


function encodedText(schema: any): boolean {
  return isMap(schema) && ('byte' === schema.format || null != schema.contentEncoding)
}


function untyped(schema: any): boolean {
  return !isMap(schema) || !TYPING_KEYS.some((key) => null != schema[key])
}


function textMedia(type: string): boolean {
  const [major, minor = ''] = type.split('/')
  return 'text' === major || 'xml' === minor || minor.endsWith('+xml')
}


function fielded(type: string): boolean {
  return FORM_MEDIA === type || type.startsWith('multipart/')
}


function byPreference(a: ModelBody, b: ModelBody): number {
  return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    Number(JSON_MEDIA !== essence(a.media)) - Number(JSON_MEDIA !== essence(b.media)) ||
    compare(a.media, b.media)
}


function essence(media: string): string {
  return media.split(';')[0].trim().toLowerCase()
}


function hasType(schema: any, type: string): boolean {
  return isMap(schema) &&
    (type === schema.type || (Array.isArray(schema.type) && schema.type.includes(type)))
}


function textOf(val: any): string | undefined {
  return 'string' === typeof val && '' !== val.trim() ? val.trim() : undefined
}


function listOf(val: any): any[] {
  return Array.isArray(val) ? val : []
}


function isMap(val: any): boolean {
  return null != val && 'object' === typeof val && !Array.isArray(val)
}


function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}


// The schema the body step sends a request body with, when that body is JSON.
function jsonSchema(offers: Offer[], media?: string): any {
  const chosen = chooseOffer(rankOffers(offers), media)
  return 'json' === chosen?.body.kind ? chosen.offer.schema : undefined
}


function jsonRequestSchema(opdef: any): any {
  return isMap(opdef) ? jsonSchema(openapiOffers(opdef)) : undefined
}


// The JSON schema a point's request body is sent with, under the media type
// the guide names, else the one the body step prefers.
function requestSchema(def: any, method: string, path: string, media?: string): any {
  return jsonSchema(requestOffers(def, method, path) ?? [], media)
}


// The schema of the request body offered under the media type the guide
// names, of any kind, else the preferred JSON one.
function selectedRequestSchema(def: any, method: string, path: string, media?: string): any {
  const offers = requestOffers(def, method, path) ?? []
  const named = null == textOf(media) ? undefined : chooseOffer(rankOffers(offers), media)
  return null == named ? jsonSchema(offers) : named.offer.schema
}


function arrayRequestSchema(def: any, method: string, path: string, media?: string): any {
  return arrayShape(requestSchema(def, method, path, media))
}


// An array, or an allOf whose parts make one, or a oneOf or anyOf of one, or
// of arrays alone, beside any null: each fact from the first part that states
// it, outermost first, the items from the array's own part first, and null
// only where the composition admits it.
function arrayShape(schema: any): any {
  const parts: any[] = []
  const visit = (node: any) => {
    if (isMap(node) && !parts.includes(node)) {
      parts.push(node)
      ; (Array.isArray(node.allOf) ? node.allOf : []).forEach(visit)
      for (const one of [node.oneOf, node.anyOf]) {
        const members = Array.isArray(one) ? one.filter((member: any) => !nullOnly(member)) : []
        if (1 === members.length) visit(members[0])
        else if (1 < members.length && members.every(arrayOnly)) parts.push(unionArray(members))
      }
    }
  }
  visit(schema)
  const found = parts.find(isArray)
  const list = null == found || null != found.type ? found : { ...found, type: 'array' }
  if (null == list) {
    return list
  }
  const items = list.items ?? parts.find((part) => null != part.items)?.items
  const description = parts.find((part) => null != part.description)?.description
  const types = [list.type].flat().filter((type: any) => 'null' !== type)
  return {
    ...list,
    type: 1 === types.length ? types[0] : types,
    ...(null == items ? {} : { items }),
    ...(null == description ? {} : { description }),
    nullable: admitsNull(schema),
  }
}


// Null must pass the schema's own type, const and enum, every allOf part,
// exactly one oneOf member, and some anyOf member.
function admitsNull(schema: any): boolean {
  if (!isMap(schema)) return false
  const own = (null == schema.type || hasType(schema, 'null') || true === schema.nullable) &&
    (!('const' in schema) || null === schema.const) &&
    (!Array.isArray(schema.enum) || schema.enum.includes(null))
  return own && listOf(schema.allOf).every(admitsNull) &&
    (!Array.isArray(schema.oneOf) || 1 === schema.oneOf.filter(admitsNull).length) &&
    (!Array.isArray(schema.anyOf) || schema.anyOf.some(admitsNull))
}


// Only null passes: by its type, a const or enum of null alone, an allOf part
// that passes only null, or a oneOf or anyOf every member of which does.
function nullOnly(schema: any): boolean {
  if (!isMap(schema)) return false
  if ('const' in schema) return null === schema.const
  if (Array.isArray(schema.enum)) return 0 < schema.enum.length && schema.enum.every((v: any) => null === v)
  if (listOf(schema.allOf).some(nullOnly)) return true
  if ([schema.oneOf, schema.anyOf].some((one) => Array.isArray(one) && 0 < one.length && one.every(nullOnly))) {
    return true
  }
  return null != schema.type && [schema.type].flat().every((type) => 'null' === type)
}


// Only arrays pass: by a const, or an enum, of arrays alone.
function arrayValued(schema: any): boolean {
  return Array.isArray(schema.const) ||
    (Array.isArray(schema.enum) && 0 < schema.enum.length && schema.enum.every(Array.isArray))
}


function isArray(schema: any): boolean {
  return isMap(schema) && (hasType(schema, 'array') || (null == schema.type && arrayValued(schema)))
}


// Only arrays pass, beside any null: a union member that admits a string too is
// no array.
function arrayOnly(schema: any): boolean {
  if (!isMap(schema)) return false
  if (arrayValued(schema)) return true
  const types = null == schema.type ? [] : [schema.type].flat()
  return types.includes('array') && types.every((type: any) => 'array' === type || 'null' === type)
}


// The items are kept only where every member's items name one component.
function unionArray(members: any[]): any {
  const ref = members[0].items?.['x-ref']
  const one = null != ref && members.every((member) => ref === member.items?.['x-ref'])
  return { type: 'array', ...(one ? { items: members[0].items } : {}) }
}


// A nullable array says so with `nullable` in OpenAPI 3.0, and a type list in 3.1.
function nullableType(schema: any): any {
  return true === schema.nullable && !hasType(schema, 'null') ? [schema.type, 'null'].flat() : schema.type
}


const REQDATA_FIELD_RE = /^`reqdata\.([A-Za-z_][A-Za-z0-9_]*)`$/

// The field of the request data a point's JSON array body is sent from, when
// its request transform unwraps one.
function arrayCarrier(
  def: any,
  mpoint: ModelPoint,
  media?: string,
): { name: string, required: boolean, type: string | string[], description?: string } | undefined {
  const req: any = mpoint.t?.req
  const name = 'string' === typeof req ? req.match(REQDATA_FIELD_RE)?.[1] : undefined
  const schema = null == name ? undefined : arrayRequestSchema(def, mpoint.m, mpoint.o, media)
  if (null == name || null == schema) {
    return undefined
  }
  const decl = requestDecl(def, mpoint.m, mpoint.o)
  return {
    name,
    required: true === decl?.required,
    type: nullableType(schema),
    description: textOf(decl?.description) ?? textOf(schema.description),
  }
}


// OpenAPI's request body, or the Swagger parameter that is one.
function requestDecl(def: any, method: string, path: string): any {
  const pathdef = def?.paths?.[path]
  const opdef = pathdef?.[String(method).toLowerCase()]
  if (!isMap(opdef)) {
    return undefined
  }
  return null != def.swagger ?
    swaggerParams(pathdef, opdef).find((param) => 'body' === param.in) : opdef.requestBody
}


// Types compare by value, and a type list as the set it is, in one order.
function sameType(a: any, b: any): boolean {
  return JSON.stringify(typeSet(a)) === JSON.stringify(typeSet(b))
}


function typeSet(type: any): any {
  return !Array.isArray(type) ? type :
    type.every((member: any) => 'string' === typeof member) ? [...type].sort() : type.map(typeSet)
}


export {
  bodyTransform,
  guideMedia,
  requestBody,
  responseBody,
  jsonRequestSchema,
  requestSchema,
  arrayRequestSchema,
  arrayCarrier,
  requestDecl,
  nullableType,
  sameType,
  selectedRequestSchema,
}
