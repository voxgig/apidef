

import { each, getx } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import {
  validator, canonizeField, inferFieldType, normalizeFieldName, envelopeProp,
  canonizeCmpName,
  scanUntaggedUnion, firstSentence, humanTitle,
} from '../utility'

import { KIT } from '../types'

import type {
  KitModel,
} from '../types'

import type {
  SchemaDef,
} from '../def'

import type {
  OpName,
  ModelOp,
  ModelEntity,
  ModelPoint,
  ModelField,
} from '../model'



const fieldTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def, guide, model } = ctx
  const kit: KitModel = apimodel.main[KIT]

  let msg = 'field '

  const opFieldPrecedence: OpName[] = ['load', 'create', 'update', 'patch', 'list']

  each(kit.entity, (ment: ModelEntity, _entname: string) => {
    const fields = ment.fields

    for (let opname of opFieldPrecedence) {
      const mop = ment.op[opname]
      if (mop) {
        const mpoints = mop.points

        for (let mpoint of mpoints) {
          const opfields = resolveOpFields(ment, mop, mpoint, def)

          for (let opfield of opfields) {
            if (!Object.prototype.hasOwnProperty.call(fields, opfield.n)) {
              fields[opfield.n] = opfield
            }
            else {
              mergeField(mop, fields[opfield.n], opfield)
            }
          }
        }
      }
    }


    const gent = guide?.entity?.[ment.name]
    const composite = compositeId(ment, gent, def)

    const idField = fields.id

    if (null != composite.parts && null != idField && !scalarStringField(idField)) {
      const idf: any = idField
      const apiname = String((model as any)?.name || 'api')
      const keep = apiname + '_id'

      if (!Object.prototype.hasOwnProperty.call(fields, keep)) {
        // A DEEP COPY, because the move is followed by deletions on the
        // original. A spread shares the `op` object, so clearing the stale
        // per-op `type` off `id` cleared it off the preserved field too —
        // the preservation preserved nothing for exactly the key it was
        // added to keep.
        fields[keep] = JSON.parse(JSON.stringify({ ...idf, n: keep }))

        const alias = ((ment as any).alias = (ment as any).alias || {})
        alias.field = alias.field || {}
        alias.field[keep] = 'id'
      }

      idf.t = '`$STRING`'
      // The facts that described the moved type go with it: `fo: int64`
      // beside a string, or a per-op `type` override still saying integer,
      // is a model contradicting itself — and the op override is what a
      // generator reads for that op.
      delete idf.fo
      for (const opname of Object.keys(idf.op || {})) {
        delete idf.op[opname].type
      }

    }

    if (null != composite.parts && null == idField) {
      // The FIELD as well as the descriptor, for the reason the branch below
      // documents: a model that declares the descriptor without the field
      // makes the generated type disagree with the generated test.
      fields.id = {
        n: 'id',
        h: humanTitle('id'),
        t: '`$STRING`',
        r: false,
      } as ModelField
    }

    const singleKey = (composite as any).single
    delete (composite as any).single

    if (null == idField && null != singleKey && null == composite.parts) {
      // The guide disabled composite; the terminal parameter is the key, and
      // the entity needs the field to carry it for the same reason the
      // composite branch above does.
      fields.id = {
        n: 'id',
        h: humanTitle('id'),
        t: '`$STRING`',
        r: false,
      } as ModelField
    }

    if (idField || null != composite.parts || null != singleKey) {
      ment.id = { name: 'id', field: 'id', ...composite }
    }
    else if (addressedById(ment)) {
      fields.id = {
        n: 'id',
        h: humanTitle('id'),
        t: '`$STRING`',
        r: false,
      } as ModelField

      ment.id = { name: 'id', field: 'id', ...composite }
    }

    ment.fields = Object.fromEntries(Object.keys(fields).sort().map(n => {
      const field = fields[n]
      field.h = humanTitle(field.n)
      return [n, field]
    }))

    msg += ment.name + ' '
  })

  return { ok: true, msg }
}



const ID_SEP = '/'

// Subfields that conventionally carry the identifying value of a nested
// object, in preference order. github's repo `owner` is a user object whose
// identifier is `login`; other specs use `name`, `slug` or `key`. `id` is
// last: it is the most common name and the least likely to be the value a
// PATH parameter takes (a path that wanted an id would say so).
const NESTED_ID_KEYS = ['login', 'slug', 'name', 'key', 'id']


// The ops that address ONE record, most authoritative first. Only a
// tie-break: identityParams compares candidates from all of them.
const ID_OPS = ['load', 'update', 'patch', 'remove']


function trailingVars(point: any): string[] {
  const segs = ((point?.s || []) as any[]).filter((s: any) => null != s)
  const run: string[] = []

  for (let i = segs.length - 1; 0 <= i; i--) {
    if (null == segs[i].var) {
      break
    }
    run.unshift(String(segs[i].var))
  }

  return run
}


function identityParams(ment: ModelEntity): string[] {
  const cands: any[] = []

  for (let o = 0; o < ID_OPS.length; o++) {
    const mop = (ment as any).op?.[ID_OPS[o]]
    if (null == mop) {
      continue
    }

    // Action points are verbs dispatched by `$action`, not addresses.
    for (const pt of (mop.points || [])) {
      if (null != pt?.q?.['$action']) {
        continue
      }
      const run = trailingVars(pt)
      if (0 === run.length) {
        continue
      }
      cands.push({
        run,
        // Segments BEFORE the run: how much parent scope the route needs.
        scope: ((pt.s || []).length - run.length),
        own: 'id' === run[run.length - 1] ||
          (ment as any).name + '_id' === run[run.length - 1],
        order: o,
      })
    }
  }

  const best = cands.reduce((b: any, c: any) => {
    if (null == b) {
      return c
    }
    if (c.scope !== b.scope) {
      return c.scope < b.scope ? c : b
    }
    if (c.own !== b.own) {
      return c.own ? c : b
    }
    if (c.run.length !== b.run.length) {
      return b.run.length < c.run.length ? c : b
    }
    return c.order < b.order ? c : b
  }, null)

  return null == best ? [] : best.run
}

function responseCandidates(ment: ModelEntity, def: any): any[] {
  const out: any[] = []
  const seen = new Set<any>()

  // Every property map this schema describes, expanding allOf.
  const propsOf = (schema: any): any[] => {
    const node = resolveRef(schema, def)
    if (null == node || seen.has(node)) {
      return []
    }
    seen.add(node)

    if (Array.isArray(node.allOf)) {
      return node.allOf.flatMap((member: any) => propsOf(member))
    }

    if (null != node.properties) {
      return [node.properties]
    }

    // A bare array response: the record is the item.
    const items = resolveRef(node.items, def)
    if (null != items) {
      return propsOf(items)
    }

    return []
  }

  const add = (schema: any, opname: string) => {
    for (const props of propsOf(schema)) {
      out.push(props)

      // One level in, but ONLY through the envelope property.
      const envelope = envelopeProp(props, opname)
      if (null == envelope) {
        continue
      }
      const inner = resolveRef(props[envelope], def)
      if (null == inner) {
        continue
      }
      for (const innerProps of propsOf(inner)) {
        out.push(innerProps)
      }
    }
  }

  for (const opname of ['load', 'list', 'update', 'create']) {
    const mop = (ment as any).op?.[opname]

    for (const mpoint of (mop?.points || [])) {
      // An action point's response is not the entity.
      if (null != mpoint?.q?.['$action']) {
        continue
      }

      const path = (def?.paths || {})[mpoint?.o]
      const method = String(mpoint?.m || '').toLowerCase()
      const responses = path?.[method]?.responses || {}

      for (const code of Object.keys(responses)) {
        if (!/^2/.test(code)) {
          continue
        }
        const resdef = responses[code] || {}

        const content = resdef.content || {}
        const ctypes = Object.keys(content)
        // Prefer JSON; fall back to whatever single type is offered.
        const json = ctypes.find((c: string) => c.includes('json'))
        if (null != json) {
          add(content[json]?.schema, opname)
        }
        else {
          for (const ctype of ctypes) {
            add(content[ctype]?.schema, opname)
          }
        }

        add(resdef.schema, opname)
      }
    }
  }

  return out
}



function namesEntity(schema: any, ment: ModelEntity): boolean {
  const xref = schema?.['x-ref']

  if ('string' !== typeof xref) {
    return false
  }

  const cmp = xref.slice(xref.lastIndexOf('/') + 1)

  return canonizeCmpName(cmp) === ment.name
}

// A `$ref` followed one hop, or the schema itself. apidef resolves most refs
// before this stage; this covers the ones that survive on a nested property.
function resolveRef(schema: any, def: any): any {
  if (null == schema) {
    return null
  }
  const ref = schema.$ref
  if ('string' !== typeof ref || !ref.startsWith('#/')) {
    return schema
  }

  let node: any = def
  for (const seg of ref.slice(2).split('/')) {
    node = node?.[seg]
    if (null == node) {
      return null
    }
  }
  return node
}


// The conventional identifying subfield of a property map, or null.
function conventionalIdKey(props: any): string | null {
  for (const key of NESTED_ID_KEYS) {
    const p = props[key]
    if (null == p) {
      continue
    }
    const t = String(p.type || '')
    if ('object' !== t && 'array' !== t) {
      return key
    }
  }

  return null
}


// Every name a part might be carried under: the model's name for it, plus the
// original wire names of any path parameter that was renamed to it.
function partAliases(ment: ModelEntity, part: string): string[] {
  const names = new Set<string>([part])

  each((ment as any).op, (mop: any) => {
    each(mop?.points, (mpoint: any) => {
      const rename = mpoint?.r?.param || {}
      for (const orig of Object.keys(rename)) {
        if (String(rename[orig]) === part) {
          names.add(orig)
        }
      }
      for (const arg of (mpoint?.g?.params || [])) {
        if (null != arg && arg.n === part && null != arg.or) {
          names.add(String(arg.or))
        }
      }
    })
  })

  return [...names]
}


function resolvePart(
  ment: ModelEntity,
  part: string,
  aliases: string[],
  props: any,
  def: any,
): string | null {
  if (null == props) {
    return null
  }

  const prop = (name: string) => resolveRef(props[name], def)
  const scalar = (p: any) =>
    null != p && 'object' !== String(p.type) && 'array' !== String(p.type) &&
    null == p.properties && null == p.items

  for (const name of aliases) {
    if (scalar(prop(name))) {
      return name
    }
  }

  if (part === ment.name && scalar(prop('name'))) {
    return 'name'
  }

  for (const name of aliases) {
    for (const suffix of ['_name', '_login', '_slug']) {
      if (scalar(prop(name + suffix))) {
        return name + suffix
      }
    }
  }

  for (const name of aliases) {
    const nested = prop(name)
    if (null != nested?.properties) {
      const sub = conventionalIdKey(nested.properties)
      if (null != sub) {
        return name + '.' + sub
      }
    }
  }

  return null
}


function identityFrom(
  ment: ModelEntity,
  parts: string[],
  def: any,
): Record<string, string> {
  const candidates = responseCandidates(ment, def)
  const out: Record<string, string> = {}

  for (const part of parts) {
    const aliases = partAliases(ment, part)

    let found: string | null = null

    for (const props of candidates) {
      found = resolvePart(ment, part, aliases, props, def)
      if (null != found) {
        break
      }
    }

    if (null != found) {
      out[part] = found
    }
  }

  return out
}


// Is this model field declared as a string? A composite id is the parts
// joined, so the field that holds it has to be one.
function scalarStringField(f: any): boolean {
  return String(f?.t || '').toUpperCase().includes('STRING')
}


function singleKeyOf(ment: ModelEntity, parts: string[]): string | undefined {
  if (0 === parts.length) {
    return undefined
  }

  return parts.find((p: string) => 'id' === p)
    ?? parts.find((p: string) => p === ment.name + '_id')
    ?? parts.find((p: string) => p.endsWith('_id'))
    ?? parts[parts.length - 1]
}


function compositeId(
  ment: ModelEntity,
  gent?: any,
  def?: any,
): { parts?: string[], sep?: string, from?: Record<string, string> } {
  const gid = gent?.id
  const sep = null != gid?.sep && '' !== String(gid.sep) ? String(gid.sep) : ID_SEP

  // `composite: false` turns the inference off. A boolean rather than an
  // empty `parts`, because aontu resolves an empty list to nothing and the
  // key would arrive absent — indistinguishable from never having been set.
  if (null != gid && false === gid.composite) {
    return { single: singleKeyOf(ment, identityParams(ment)) } as any
  }

  // `from` STATED IN guide.aontu WINS PER PART, so a spec can correct one
  // mapping without restating the others — which matters because the
  // heuristic gets most of them right and the odd one wrong.
  const withFrom = (parts: string[], usesep: string) => {
    const derived = identityFrom(ment, parts, def)
    const stated = null != gid?.from && 'object' === typeof gid.from ? gid.from : {}
    const from: Record<string, string> = {}

    for (const part of parts) {
      const say = (stated as any)[part]
      const use = null != say && '' !== String(say) ? String(say) : derived[part]
      if (null != use) {
        from[part] = use
      }
    }

    return 0 === Object.keys(from).length ?
      { parts, sep: usesep } : { parts, sep: usesep, from }
  }

  if (null != gid && null != gid.parts) {
    const given = (gid.parts as any[])
      .filter((p: any) => null != p && '' !== String(p))
      .map((p: any) => String(p))
    return 1 < given.length ? withFrom(given, sep) : {}
  }

  const parts = identityParams(ment)
  return 1 < parts.length ? withFrom(parts, sep) : {}
}


// True when any of the entity's own operation points declares an `id`
// parameter — i.e. the API addresses this entity by id, whether or not its
// response schema declares an id field.
function addressedById(ment: ModelEntity): boolean {
  let found = false
  each((ment as any).op, (mop: any) => {
    each(mop?.points, (mpoint: any) => {
      each(mpoint?.g?.params, (param: any) => {
        if (param && 'id' === param.n) {
          found = true
        }
      })
    })
  })
  return found
}


function resolveOpFields(
  ment: ModelEntity,
  mop: ModelOp,
  mpoint: ModelPoint,
  def: any
): ModelField[] {
  const mfields: ModelField[] = []
  const fielddefs = findFieldDefs(ment, mop, mpoint, def)

  for (let fielddef of fielddefs) {
    const fieldname = (fielddef as any).key$ as string
    // Field names are WIRE identifiers — see canonizeField. Using the
    // entity-name canonizer here renamed modelType -> model_type and
    // items -> item, so the SDK read keys the server never sends.
    const name = canonizeField(normalizeFieldName(fieldname))
    const mfield: ModelField = {
      n: name,
      h: humanTitle(name),
      t: inferFieldType(name, validator(fielddef.type)),
      r: !!fielddef.required,
      op: {},
    }
    const fdesc = (fielddef as any).description
    if ('string' === typeof fdesc && '' !== fdesc.trim()) {
      const short = firstSentence(fdesc)
      if ('' !== short) {
        mfield.sh = short
      }
    }

    for (const [flag, attr] of [['readOnly', 'ro'], ['writeOnly', 'wo'], ['deprecated', 'de']] as const) {
      if (true === (fielddef as any)[flag]) {
        mfield[attr] = true
      }
    }

    // `format` is an open vocabulary — OpenAPI defines a handful and lets a
    // spec coin its own — so it is carried as the string it is rather than
    // interpreted here. `password` is the one a generator acts on today.
    const ffmt = (fielddef as any).format
    if ('string' === typeof ffmt && '' !== ffmt.trim()) {
      mfield.fo = ffmt.trim()
    }

    // Record an untagged union under this field. The field is already typed
    // openly ($ANY/$ARRAY/$OBJECT) because there is nothing to narrow it to;
    // this says WHY, so the generated docs can explain the open type instead
    // of leaving it looking like a modelling failure.
    const union = scanUntaggedUnion(fielddef)
    if (null != union) {
      mfield.union = union
    }
    mfields.push(mfield)
  }

  return mfields
}


// GraphQL entity fields come straight from the object type: every
// non-deprecated scalar field, minus any that require arguments (selecting
// `download(format: Format!)` without binding its argument makes every
// operation using the fragment fail GraphQL validation), plus one id-stub
// reference per to-one relation.
function findGraphqlFieldDefs(
  ment: ModelEntity,
  mpoint: ModelPoint,
  def: any
): SchemaDef[] {
  const typeName = (mpoint.gq as any)?.entityType$ ??
    (ment as any).orig$ ?? ''
  const gtype = def.types?.[typeName]

  if (null == gtype) {
    return []
  }

  const out: SchemaDef[] = []

  for (const fname of Object.keys(gtype.fields)) {
    const f = gtype.fields[fname]

    if (f.deprecated) {
      continue
    }

    // A field taking required arguments cannot appear in a fixed fragment.
    if (f.args.some((a: any) => a.reqd)) {
      continue
    }

    const ftype = def.types?.[f.type]
    const kind = ftype?.kind

    if ('SCALAR' === kind || 'ENUM' === kind) {
      out.push({
        key$: fname,
        // Enum values are always strings; scalars map by name, with unknown
        // custom scalars left unconstrained.
        type: 'ENUM' === kind ? 'string' : gqlFieldType(f.type),
        required: f.reqd,
        description: f.desc,
      } as any)
    }
    else if (('OBJECT' === kind || 'INTERFACE' === kind) && !f.list) {
      const idField = ftype.fields?.id
      if (null != idField) {
        out.push({
          key$: fname,
          type: 'object',
          required: false,
          description: f.desc,
        } as any)
      }
    }
  }

  return out
}


function gqlFieldType(typeName: string): string | undefined {
  return 'Int' === typeName ? 'integer' :
    'Float' === typeName ? 'number' :
      'Boolean' === typeName ? 'boolean' :
        ('String' === typeName || 'ID' === typeName) ? 'string' :
          undefined
}


function findFieldDefs(
  ment: ModelEntity,
  mop: ModelOp,
  mpoint: ModelPoint,
  def: any
): SchemaDef[] {
  if ('graphql' === mpoint.k) {
    return findGraphqlFieldDefs(ment, mpoint, def)
  }

  // A verb, rather than an address: see the call site in the transform.
  const isAction = null != (mpoint as any)?.q?.['$action']

  const fielddefs: SchemaDef[] = []

  const pathdef = def.paths[mpoint.o]

  const method = mpoint.m.toLowerCase()
  const opdef: any = (pathdef as any)?.[method]

  if (opdef) {
    const responses = opdef.responses
    const requestBody = opdef.requestBody

    let fieldSets

    if (responses) {
      fieldSets = getx(responses, '200 content "application/json" schema') ??
        getx(responses, '200 schema')
      if ('list' == mop.name) {
        const unwrapped = unwrapArrayWrapper(fieldSets)
        if (unwrapped) {
          fieldSets = unwrapped
        }
        else {
          const fromCreated = getx(responses, '201 content "application/json" schema items') ??
            getx(responses, '201 schema items')
          if (fromCreated) fieldSets = fromCreated
        }
      }
      else if ('put' === method && null == fieldSets) {
        fieldSets = getx(responses, '201 content "application/json" schema') ??
          getx(responses, '201 schema')
      }

      if ('list' != mop.name) {
        const envelope = envelopeProp(fieldSets?.properties, mop.name)
        if (null != envelope) {
          fieldSets = fieldSets.properties[envelope]
        }
      }
    }

    if (isAction && !namesEntity(fieldSets, ment)) {
      return fielddefs
    }

    // A QUERY (RFC 10008) request body is a filter/query schema, not the
    // entity shape, so it must not contribute entity fields. Fields for a
    // QUERY op come from its response only. Other methods (POST/PUT/PATCH)
    // carry the entity in the body, so merge as usual -- except for an
    // action, whose body is the verb's arguments and never the record.
    if (requestBody && 'query' !== method && !isAction) {
      fieldSets = [
        fieldSets,
        getx(requestBody, 'content "application/json" schema') ??
        getx(requestBody, 'schema')
      ]
    }


    if (fieldSets) {
      if (Array.isArray(fieldSets.allOf)) {
        fieldSets = fieldSets.allOf
      }
      else if (fieldSets.properties) {
        fieldSets = [fieldSets]
      }
    }

    each(fieldSets, (fieldSet: any) => {
      const requiredNames: string[] = Array.isArray(fieldSet?.required)
        ? fieldSet.required : []
      each(fieldSet?.properties, (property: any) => {
        // Don't mutate the parsed schema: a $ref-resolved schema is shared
        // across every operation that references it, so flipping
        // `property.required = true` here would leak this operation's
        // required[] onto all the others. Derive `required` onto a shallow
        // copy instead (matches the Go port, which builds fresh field defs).
        if (!property.required && requiredNames.includes(property.key$)) {
          fielddefs.push({ ...property, required: true })
        }
        else {
          fielddefs.push(property)
        }
      })
    })
  }

  // Fallback: infer fields from example response data when no schema properties found
  if (0 === fielddefs.length && opdef) {
    const exampleFields = inferFieldsFromExamples(opdef)
    for (const ef of exampleFields) {
      fielddefs.push(ef)
    }
  }

  return fielddefs
}


function inferFieldsFromExamples(opdef: any): SchemaDef[] {
  const example = findExampleObject(opdef)
  if (null == example || 'object' !== typeof example || Array.isArray(example)) {
    return []
  }

  const fielddefs: SchemaDef[] = []
  for (const [key, value] of Object.entries(example).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const fielddef: any = {
      key$: key,
      type: inferTypeFromValue(value),
    }
    fielddefs.push(fielddef)
  }
  return fielddefs
}


function findExampleObject(opdef: any): any {
  const responses = opdef.responses
  if (null == responses) return null

  const resdef = responses['200'] ?? responses['201']
  if (null == resdef) return null

  // OpenAPI 3.x: content.application/json.example
  let example = getx(resdef, 'content "application/json" example')
  if (null != example && 'object' === typeof example) return unwrapExample(example)

  // OpenAPI 3.x: content.application/json.examples (named examples — take first)
  const examples = getx(resdef, 'content "application/json" examples')
  if (null != examples && 'object' === typeof examples) {
    for (const val of Object.values(examples)) {
      const ex = (val as any)?.value
      if (null != ex && 'object' === typeof ex) return unwrapExample(ex)
    }
  }

  // OpenAPI 3.x: content.application/json.schema.example
  example = getx(resdef, 'content "application/json" schema example')
  if (null != example && 'object' === typeof example) return unwrapExample(example)

  // Swagger 2.0: response.example / response.examples.application/json
  example = resdef.example
  if (null != example && 'object' === typeof example) return unwrapExample(example)

  example = getx(resdef, 'examples "application/json"')
  if (null != example && 'object' === typeof example) return unwrapExample(example)

  example = getx(resdef, 'schema example')
  if (null != example && 'object' === typeof example) return unwrapExample(example)

  return null
}


// If the example is a wrapper with a single array property, unwrap to the first item
function unwrapExample(example: any): any {
  if (Array.isArray(example)) {
    return example.length > 0 ? example[0] : null
  }
  return example
}


function unwrapArrayWrapper(schema: any): any {
  if (null == schema || 'object' !== typeof schema) return null
  // Direct list shape — caller can resolve from items directly.
  if (schema.type === 'array' && schema.items) {
    const items = schema.items
    if (items && (items.properties || Array.isArray(items.allOf))) {
      return items
    }
    return null
  }
  if (null == schema.properties || 'object' !== typeof schema.properties) return null
  let resolved: any = null
  for (const key of Object.keys(schema.properties)) {
    const prop = schema.properties[key]
    if (null == prop || 'object' !== typeof prop) continue
    if (prop.type !== 'array' || null == prop.items) continue
    const items = prop.items
    if (null == items || 'object' !== typeof items) continue
    if (!items.properties && !Array.isArray(items.allOf)) continue
    if (resolved != null) return null // ambiguous: multiple array-of-object props
    resolved = items
  }
  return resolved
}


function inferTypeFromValue(value: any): string {
  if (null == value) return 'string'
  if ('boolean' === typeof value) return 'boolean'
  if ('number' === typeof value) {
    return Number.isInteger(value) ? 'integer' : 'number'
  }
  if ('string' === typeof value) return 'string'
  if (Array.isArray(value)) return 'array'
  if ('object' === typeof value) return 'object'
  return 'string'
}


function mergeField(
  mop: ModelOp,
  existingField: ModelField,
  newField: ModelField
) {
  if (newField.r !== existingField.r) {
    existingField.op[mop.name] = {
      req: newField.r,
      type: newField.t,
    }
  }

  if (null == existingField.sh && null != newField.sh) {
    existingField.sh = newField.sh
  }

  for (const flag of ['ro', 'wo', 'de', 'fo'] as const) {
    if (null == existingField[flag] && null != newField[flag]) {
      (existingField as any)[flag] = newField[flag]
    }
  }

  return existingField
}


export {
  fieldTransform,
  inferFieldsFromExamples,
  inferTypeFromValue,
}
