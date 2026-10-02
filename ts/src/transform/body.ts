/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import type { TransformResult, Transform } from '../transform'

import { KIT } from '../types'

import { guideActive, mergedProperties, sortedKeys } from '../utility'

import type {
  ModelPoint,
  ModelRequestBody,
  ModelRequestBodyField,
  RequestBodyKind,
} from '../model'


// JSON first, as generated SDKs send it; then the kinds by what each can carry.
const KIND_ORDER: RequestBodyKind[] = ['json', 'multipart', 'form', 'raw']

const JSON_MEDIA = 'application/json'
const FORM_MEDIA = 'application/x-www-form-urlencoded'
const MULTIPART_MEDIA = 'multipart/form-data'
const OCTET_MEDIA = 'application/octet-stream'

const TYPING_KEYS = [
  'type', 'format', 'properties', 'additionalProperties', 'items',
  'allOf', 'anyOf', 'oneOf', 'enum', 'const', 'contentMediaType', 'contentEncoding',
]


type Offer = {
  media: string
  schema?: any
  encoding?: any
}


const bodyTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def, guide } = ctx
  const entities = apimodel.main[KIT].entity

  let msg = 'body '

  for (const entname of sortedKeys(entities)) {
    for (const mop of Object.values(entities[entname].op ?? {}) as any[]) {
      for (const mpoint of (mop?.points ?? []) as ModelPoint[]) {
        if ('graphql' === mpoint.k) {
          continue
        }
        const rb = requestBody(def, mpoint.m, mpoint.o, guideMedia(guide, entname, mpoint))
        if (null != rb) {
          mpoint.rb = rb
        }
      }
    }
    msg += entname + ' '
  }

  return { ok: true, msg }
}


function guideMedia(guide: any, entname: string, mpoint: ModelPoint): string | undefined {
  const gops = guide?.entity?.[entname]?.path?.[mpoint.o]?.op ?? {}
  for (const opname of sortedKeys(gops)) {
    const gop = gops[opname]
    if (guideActive(gop) &&
      String(gop?.method ?? '').toUpperCase() === String(mpoint.m).toUpperCase()) {
      return textOf(gop?.body?.media)
    }
  }
  return undefined
}


// Undefined when the operation sends JSON alone.
function requestBody(
  def: any,
  method: string,
  path: string,
  media?: string,
): ModelRequestBody | undefined {
  const pathdef = def?.paths?.[path]
  const opdef = pathdef?.[String(method).toLowerCase()]
  if (!isMap(opdef)) {
    return undefined
  }

  const offers = null != def.swagger ?
    swaggerOffers(def, pathdef, opdef) : openapiOffers(opdef)

  const ranked = offers
    .sort((a, b) => compare(a.media, b.media))
    .map(describeBody)
    .sort(byPreference)
  const bodies = ranked.filter((body, i) =>
    i === ranked.findIndex((other) => other.media === body.media))

  const named = textOf(media)
  const chosen = null == named ? bodies[0] :
    bodies.find((body) => body.media.toLowerCase() === named.toLowerCase()) ??
    describeBody({ media: named })

  if (null == chosen) {
    return undefined
  }

  const alternatives = bodies.filter((body) => body.media !== chosen.media)

  if ('json' === chosen.kind && JSON_MEDIA === essence(chosen.media) &&
    alternatives.every((body) => 'json' === body.kind)) {
    return undefined
  }

  return 0 < alternatives.length ? { ...chosen, alternatives } : chosen
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


// Swagger declares a body as a `body` parameter or as `formData` parameters,
// and its media types in `consumes`, the operation's replacing the document's.
function swaggerOffers(def: any, pathdef: any, opdef: any): Offer[] {
  const params = [...listOf(pathdef?.parameters), ...listOf(opdef.parameters)].filter(isMap)
  const body = params.find((param) => 'body' === param.in)
  const form = params.filter((param) =>
    'formData' === param.in && 'string' === typeof param.name && '' !== param.name)

  if (null == body && 0 === form.length) {
    return []
  }

  const bodySchema = null == body ? undefined : (body.schema ?? {})
  const formSchema = 0 === form.length ? undefined : {
    type: 'object',
    properties: Object.fromEntries(form.map((param) => [param.name, formProperty(param)])),
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
  }))
}


function formProperty(param: any): any {
  const prop: any = {}
  for (const key of ['type', 'format', 'items']) {
    if (null != param[key]) {
      prop[key] = param[key]
    }
  }
  return prop
}


function describeBody(offer: Offer): ModelRequestBody {
  const media = offer.media.trim()
  const type = essence(media)
  const [major, minor = ''] = type.split('/')

  if (JSON_MEDIA === type || minor.endsWith('+json')) {
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

  const body: ModelRequestBody = { kind: 'raw', media }
  if (rawBinary(type, offer.schema)) {
    body.binary = true
  }
  return body
}


function withFields(body: ModelRequestBody, offer: Offer): ModelRequestBody {
  const props = mergedProperties(offer.schema)
  const fields = sortedKeys(props).map((name: string) =>
    bodyField(name, props![name], offer.encoding?.[name]))
  if (0 < fields.length) {
    body.fields = fields
  }
  return body
}


function bodyField(name: string, prop: any, encoding: any): ModelRequestBodyField {
  const list = hasType(prop, 'array')
  const item = list ? prop.items : prop
  const field: ModelRequestBodyField = { name }
  if (isMap(item) && !encodedText(item) &&
    ('binary' === item.format || 'file' === item.type || null != item.contentMediaType)) {
    field.binary = true
  }
  if (list) {
    field.list = true
  }
  const media = textOf(encoding?.contentType) ?? textOf(isMap(item) ? item.contentMediaType : undefined)
  if (null != media) {
    field.media = media
  }
  return field
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
    ('binary' === schema.format || null != schema.contentMediaType)
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


function byPreference(a: ModelRequestBody, b: ModelRequestBody): number {
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


export {
  bodyTransform,
  requestBody,
}
