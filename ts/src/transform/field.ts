

import { each, getx } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import {
  validator, canonizeField, inferFieldType, normalizeFieldName, envelopeProp,
  scanUntaggedUnion, firstSentence,
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
    const seen: any = {}

    for (let opname of opFieldPrecedence) {
      const mop = ment.op[opname]
      if (mop) {
        const mpoints = mop.points

        for (let mpoint of mpoints) {
          const opfields = resolveOpFields(ment, mop, mpoint, def)

          for (let opfield of opfields) {
            if (!seen[opfield.name]) {
              fields.push(opfield)
              seen[opfield.name] = opfield
            }
            else {
              mergeField(mop, seen[opfield.name], opfield)
            }
          }
        }
      }
    }

    fields.sort((a: ModelField, b: ModelField) => {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    })

    // Mark the entity as having an id only when the spec actually declares one.
    // Downstream (test generators, fixture builders) gate id-specific code on
    // this presence so that public read-only APIs without ids don't get
    // bogus id assertions.
    // COMPOSITE FIRST, because a compound key need not come with an `id`.
    //
    // An entity addressed by `{owner}/{repo}` whose response carries only
    // `owner` and `name` has no field literally named `id`, and its adjacent
    // placeholders are left unrenamed so `addressedById` is false too.
    // Neither branch below then ran, so the entity got NO id descriptor and
    // even an explicit `guide.entity.<name>.id.parts` was silently ignored —
    // while the Go port, which initialises a descriptor unconditionally,
    // emitted the composite. The ports disagreed on exactly the shape this
    // feature exists for.
    const gent = guide?.entity?.[ment.name]
    const composite = compositeId(ment, gent)

    const idField = fields.find((f: ModelField) => 'id' === f.name)

    // A COMPOSITE ID IS A STRING, whatever the API's own `id` field is —
    // AND THE API'S OWN id IS KEPT.
    //
    // github's repo declares `id` as an integer, its global database id,
    // while the composite identity is `owner/repo`. Two facts have to
    // survive: `id` must hold a string, because that is what the joined
    // value is and what every generated type has to store; and the spec's
    // numeric property must not be silently reinterpreted, because a
    // consumer that wants the database id is entitled to it with its own
    // type and format intact.
    //
    // So the API's field MOVES to `<api>_id` rather than being rewritten in
    // place, carrying its type, format and per-op overrides with it, and the
    // entity's `alias.field` map records where it went. Retyping in place
    // (the first attempt) claimed the server's numeric id was a string;
    // leaving it alone made `id.field` name a declaration the runtime value
    // cannot satisfy. Moving it is the only option that lies about neither.
    if (null != composite.parts && null != idField && !scalarStringField(idField)) {
      const idf: any = idField
      const apiname = String((model as any)?.name || 'api')
      const keep = apiname + '_id'

      if (!fields.some((f: ModelField) => f.name === keep)) {
        fields.push({ ...idf, name: keep } as any)

        const alias = ((ment as any).alias = (ment as any).alias || {})
        alias.field = alias.field || {}
        alias.field[keep] = 'id'
      }

      idf.type = '`$STRING`'
      // The facts that described the moved type go with it: `format: int64`
      // beside a string, or a per-op `type` override still saying integer,
      // is a model contradicting itself — and the op override is what a
      // generator reads for that op.
      delete idf.format
      for (const opname of Object.keys(idf.op || {})) {
        delete idf.op[opname].type
      }

      fields.sort((a: ModelField, b: ModelField) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    }

    if (null != composite.parts && null == idField) {
      // The FIELD as well as the descriptor, for the reason the branch below
      // documents: a model that declares the descriptor without the field
      // makes the generated type disagree with the generated test.
      fields.push({
        name: 'id',
        type: '`$STRING`',
        req: false,
      } as any)
      fields.sort((a: ModelField, b: ModelField) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    }

    const singleKey = (composite as any).single
    delete (composite as any).single

    if (null == idField && null != singleKey && null == composite.parts) {
      // The guide disabled composite; the terminal parameter is the key, and
      // the entity needs the field to carry it for the same reason the
      // composite branch above does.
      fields.push({
        name: 'id',
        type: '`$STRING`',
        req: false,
      } as any)
      fields.sort((a: ModelField, b: ModelField) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    }

    if (idField || null != composite.parts || null != singleKey) {
      ment.id = { name: 'id', field: 'id', ...composite }
    }
    else if (addressedById(ment)) {
      // The FIELD as well as the descriptor. An entity addressed by id has an
      // id at runtime — the test fixture seeds one, and the SDK sends it — so
      // a model that declares the descriptor without the field makes the
      // generated TYPE disagree with the generated TEST: trello's Option,
      // Reaction and Sticker compiled to `TS2339: Property 'id' does not
      // exist` the moment the test started assigning data.id.
      fields.push({
        name: 'id',
        type: '`$STRING`',
        req: false,
      } as any)
      fields.sort((a: ModelField, b: ModelField) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

      // ADDRESSABLE BY ID WITHOUT DECLARING ONE AS A FIELD.
      //
      // The rule above reads the RESPONSE schema, and plenty of real entities
      // are addressed by an id their response never repeats. github's
      // private_registry is one: PATCH /orgs/{org}/private-registries/{secret_name}
      // renames secret_name to id, so the entity is addressed by id on every
      // one of its own routes, while its schema declares only created_at, key,
      // name, url and friends.
      //
      // Downstream that absence is not cosmetic. TestEntity gates
      // `data.id = <created>.id` on THIS descriptor, so the generated update
      // carried no id at all, the test mock's selector fell back to whatever
      // else was in reqdata (org_id), matched no single record, and the flow
      // failed with a 404 that named nothing to do with ids.
      //
      // An entity whose own points take an `id` param IS addressable by id;
      // that is the property the downstream generators actually want. Entities
      // with neither a field nor an id param — the read-only public APIs the
      // rule above was written for — still get no descriptor, so they still
      // get no id assertions.
      ment.id = { name: 'id', field: 'id', ...composite }
    }

    msg += ment.name + ' '
  })

  return { ok: true, msg }
}



// The separator that joins a composite id into one string.
//
// A forward slash cannot occur inside a single path segment — a raw `/`
// would end the segment, and a value that legitimately contains one arrives
// percent-encoded as `%2F` — so joining on it can never be ambiguous, and
// splitting on it can never over-split. That is what makes the composite id
// safe to carry as a single opaque string, which is the property the SDK and
// Seneca entities are built on.
const ID_SEP = '/'


// The parameters that TOGETHER name one record: the trailing run of
// ADJACENT variable segments on the addressing route.
//
// ADJACENCY IS THE WHOLE TEST, and it is what separates a compound key from
// ordinary parent/child nesting:
//
//   /repos/{owner}/{repo}                     -> owner, repo   COMPOSITE
//   /api/planet/{planet_id}/moon/{moon_id}    -> moon_id       single
//   /repos/{owner}/{repo}/pulls/{pull_number} -> pull_number   single
//
// A literal segment between two variables names a SUB-COLLECTION, so the
// earlier variable scopes the later one — `planet_id` says which planet's
// moons, and `moon_id` alone identifies the moon. Two variables with nothing
// between them address no sub-collection: neither value names anything on
// its own, and only the pair identifies a repository.
//
// Taking every variable on the path instead was tried first and is wrong on
// most real specs — it made `moon` (planet_id + moon_id), petstore's `order`,
// `pet` and `user`, and taxonomy's `domain` and `kingdom` all falsely
// composite, which the apidef-validate goldens caught immediately. Nested
// resources are the common shape; compound keys are the exception, and
// adjacency is the thing that actually distinguishes them.
//
// Read from the op that names a single record, never from `list`: a
// collection route's path params are the entity's parents. A point ending in
// a literal is a verb ON the record (`.../{number}/merge`) and carries the
// same variables, so it is a fallback rather than a different answer.
function identityParams(ment: ModelEntity): string[] {
  for (const opname of ['load', 'update', 'patch', 'remove']) {
    const mop = (ment as any).op?.[opname]
    if (null == mop) {
      continue
    }

    const points = (mop.points || []).filter((pt: any) =>
      null == (pt && pt.select && pt.select['$action']))
    const items = points.filter((pt: any) => {
      const segs = (pt && pt.segments) || []
      return null != segs[segs.length - 1]?.var
    })

    const point = items[0] || points[0]
    if (null == point) {
      continue
    }

    // Walk back from the end, collecting variables until a literal stops
    // the run. That literal is the sub-collection boundary; anything before
    // it scopes this record rather than naming it.
    const segs = ((point.segments || []) as any[]).filter((s: any) => null != s)
    const run: string[] = []
    for (let i = segs.length - 1; 0 <= i; i--) {
      const seg = segs[i]
      if (null == seg.var) {
        break
      }
      run.unshift(String(seg.var))
    }

    if (0 < run.length) {
      return run
    }
  }

  return []
}


// Is this model field declared as a string? A composite id is the parts
// joined, so the field that holds it has to be one.
function scalarStringField(f: any): boolean {
  return String(f?.type || '').toUpperCase().includes('STRING')
}


// WHICH PARAMETER IS THE RECORD'S OWN KEY, among several that looked
// adjacent. The same shape apidef's id handling recognises everywhere else:
//
//   1. one named exactly `id`
//   2. `<entity>_id` — the entity's own id, however the path spells it
//   3. any `*_id` — an id by name
//   4. failing all that, the terminal parameter
//
// Position is the LAST resort, not the first.
function singleKeyOf(ment: ModelEntity, parts: string[]): string | undefined {
  if (0 === parts.length) {
    return undefined
  }

  return parts.find((p: string) => 'id' === p)
    ?? parts.find((p: string) => p === ment.name + '_id')
    ?? parts.find((p: string) => p.endsWith('_id'))
    ?? parts[parts.length - 1]
}


// The composite half of the id descriptor, or `{}` for the ordinary case.
//
// Emitted ONLY for a genuinely composite id (two or more addressing
// parameters). A single-parameter entity already round-trips through one
// `id` and gains nothing from carrying a one-element `parts`, so its
// descriptor is left exactly as it was — no existing model output moves.
function compositeId(
  ment: ModelEntity,
  gent?: any,
): { parts?: string[], sep?: string } {
  const gid = gent?.id
  const sep = null != gid?.sep && '' !== String(gid.sep) ? String(gid.sep) : ID_SEP

  // `composite: false` turns the inference off. A boolean rather than an
  // empty `parts`, because aontu resolves an empty list to nothing and the
  // key would arrive absent — indistinguishable from never having been set.
  if (null != gid && false === gid.composite) {
    // DISABLING COMPOSITE MUST NOT DISABLE THE ID. The correction says these
    // adjacent parameters are not a compound key; it does not say the record
    // has no key. Returning a bare `{}` left an entity whose response has no
    // literal `id` with no descriptor at all — the false positive removed and
    // nothing identifying the real key.
    //
    // WHICH of the adjacent parameters is that key is decided by the same
    // id-finding rules apidef uses elsewhere, not by position. Taking the
    // terminal one picked `archive_format` for
    // `/artifacts/{artifact_id}/{archive_format}` — the modifier, precisely
    // the false positive the correction exists to undo.
    return { single: singleKeyOf(ment, identityParams(ment)) } as any
  }

  if (null != gid && null != gid.parts) {
    const given = (gid.parts as any[])
      .filter((p: any) => null != p && '' !== String(p))
      .map((p: any) => String(p))
    return 1 < given.length ? { parts: given, sep } : {}
  }

  const parts = identityParams(ment)
  return 1 < parts.length ? { parts, sep } : {}
}


// True when any of the entity's own operation points declares an `id`
// parameter — i.e. the API addresses this entity by id, whether or not its
// response schema declares an id field.
function addressedById(ment: ModelEntity): boolean {
  let found = false
  each((ment as any).op, (mop: any) => {
    each(mop?.points, (mpoint: any) => {
      each(mpoint?.args?.params, (param: any) => {
        if (param && 'id' === param.name) {
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
      name,
      type: inferFieldType(name, validator(fielddef.type)),
      req: !!fielddef.required,
      op: {},
    }
    // Carry the spec's own words for the field, when it has any.
    //
    // Every generated per-entity table has a Description column and every cell
    // was blank, because nothing ever read the property `description` the spec
    // supplies. Trimmed, and only when it is a non-empty string: a whitespace
    // or non-string value would put a meaningless cell where an empty one is
    // honest.
    // ONE LINE, not the whole description. Every generated Readme drops this
    // straight into a markdown table cell, where a raw newline ends the row
    // and orphans the rest of the table — and specs put bullet lists, fenced
    // examples and multi-paragraph notes in `description`. firstSentence is
    // the same reduction the API summary uses, so `short` means the same
    // thing wherever it appears.
    const fdesc = (fielddef as any).description
    if ('string' === typeof fdesc && '' !== fdesc.trim()) {
      const short = firstSentence(fdesc)
      if ('' !== short) {
        mfield.short = short
      }
    }

    // SPEC FACTS ABOUT THE FIELD, carried through verbatim.
    //
    // These four are declared by OpenAPI on the property and were being
    // dropped on the floor. `readOnly` is the one that matters most: it is
    // the difference between a field a client MAY send and one it may not,
    // and nothing else in the model says which — so every generator has been
    // putting server-assigned fields into the type a caller fills in.
    //
    // ONLY WHEN THE SPEC SAYS SO, and for the booleans only when TRUE. Each
    // defaults to false in OpenAPI, so an absent key and an explicit `false`
    // carry the same information; emitting the false ones would add a key to
    // every field of every model and say nothing. Same discipline as
    // `short`: absent means "the spec did not say", never "apidef dropped
    // it".
    for (const flag of ['readOnly', 'writeOnly', 'deprecated'] as const) {
      if (true === (fielddef as any)[flag]) {
        mfield[flag] = true
      }
    }

    // `format` is an open vocabulary — OpenAPI defines a handful and lets a
    // spec coin its own — so it is carried as the string it is rather than
    // interpreted here. `password` is the one a generator acts on today.
    const ffmt = (fielddef as any).format
    if ('string' === typeof ffmt && '' !== ffmt.trim()) {
      mfield.format = ffmt.trim()
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
  const typeName = (mpoint.graphql as any)?.entityType$ ??
    (ment as any).orig$ ?? ''
  const gtype = def.types?.[typeName]

  if (null == gtype) {
    return []
  }

  const out: SchemaDef[] = []

  // Sorted by construction in parse/graphql.ts, so output stays byte-stable.
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
        // GraphQL puts the field's own words on GqlField.desc (see
        // parse/graphql.ts). resolveOpFields reads `description`, the OpenAPI
        // spelling, so name it that here rather than teaching the reader two.
        description: f.desc,
      } as any)
    }
    else if (('OBJECT' === kind || 'INTERFACE' === kind) && !f.list) {
      // To-one relation. The default fragment selects `team { id }`, so the
      // response carries a nested stub object — declare it as such. Naming a
      // flat `team_id` here would advertise a field the wire never returns,
      // since nothing flattens the response.
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


// GraphQL named type -> the type names the field typing understands.
//
// Built-ins only: a custom scalar (JSON, JSONObject, Upload, ...) can hold
// any JSON value, so advertising it as a string would misdescribe the data
// and make generated validation reject values the schema accepts. Enums are
// mapped by the caller, which knows they are strings.
function gqlFieldType(typeName: string): string | undefined {
  return 'Int' === typeName ? 'integer' :
    'Float' === typeName ? 'number' :
      'Boolean' === typeName ? 'boolean' :
        ('String' === typeName || 'ID' === typeName) ? 'string' :
          undefined
}


function findFieldDefs(
  _ment: ModelEntity,
  mop: ModelOp,
  mpoint: ModelPoint,
  def: any
): SchemaDef[] {
  if ('graphql' === mpoint.kind) {
    return findGraphqlFieldDefs(_ment, mpoint, def)
  }

  const fielddefs: SchemaDef[] = []
  const pathdef = def.paths[mpoint.orig]

  const method = mpoint.method.toLowerCase()
  const opdef: any = pathdef[method]

  if (opdef) {
    const responses = opdef.responses
    const requestBody = opdef.requestBody

    let fieldSets

    if (responses) {
      fieldSets = getx(responses, '200 content "application/json" schema') ??
        getx(responses, '200 schema')
      if ('list' == mop.name) {
        // List responses commonly come in three shapes:
        //   1. direct array — { type: array, items: { ...item } }
        //   2. wrapper object — { properties: { items: [Item], page, ... } }
        //      (a single array-of-object property inside an object schema)
        //   3. legacy "list of created items" under 201
        // Resolve to the inner item schema when we can identify one
        // unambiguously; otherwise fall through to the 200 schema as-is.
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

      // Single-entity responses get the same treatment the list branch above
      // already gives collections: a body that is only an envelope around the
      // entity — `{item: {...}}` — describes the WRAPPER, not the entity, so
      // its sole property would otherwise be harvested as a field. That is
      // how an entity `todoitem` ended up with a required `item` field of
      // type object, which then appeared in the generated create/update data
      // types. envelopeProp applies the same two rules used to pick the
      // response transform, so the field list and the transform agree.
      if ('list' != mop.name) {
        const envelope = envelopeProp(fieldSets?.properties, mop.name)
        if (null != envelope) {
          fieldSets = fieldSets.properties[envelope]
        }
      }
    }

    // A QUERY (RFC 10008) request body is a filter/query schema, not the
    // entity shape, so it must not contribute entity fields. Fields for a
    // QUERY op come from its response only. Other methods (POST/PUT/PATCH)
    // carry the entity in the body, so merge as usual.
    if (requestBody && 'query' !== method) {
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

  // Swagger 2.0: schema.example
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


// unwrapArrayWrapper inspects a list-response schema and, when it is an
// object with a single array-of-object-schema property (e.g.
// { boards: [Board] }, { items: [Foo], page, total, ... }), returns the
// inner item schema so that field resolution sees the actual entity
// properties rather than the wrapper's bookkeeping.
//
// Returns null if the input is not unambiguously such a wrapper:
//   - schema is already an array → return null (let caller use it directly)
//   - no array-of-object-schema property → return null
//   - more than one array-of-object-schema property → ambiguous, return null
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
  if (newField.req !== existingField.req) {
    existingField.op[mop.name] = {
      req: newField.req,
      type: newField.type,
    }
  }

  // Field identity is first-writer-wins, but a DESCRIPTION is not part of
  // identity: the op that first names a field is often not the one that
  // documents it (a load response referencing a bare component, a create body
  // referencing the annotated one). Take the first non-empty description in
  // opFieldPrecedence order and keep it — dropping it left a blank cell in
  // every generated table while the spec had the words all along.
  if (null == existingField.short && null != newField.short) {
    existingField.short = newField.short
  }

  // The spec facts merge the same way, and for the same reason: one schema
  // annotates the field and another references it bare, so taking the first
  // declaration in opFieldPrecedence order is what finds the annotation.
  //
  // THE PRECEDENCE ORDER PUTS `load` FIRST, WHICH IS THE SAFE DIRECTION HERE.
  // A field the response schema marks readOnly and a request body also lists
  // is a self-contradictory spec — OpenAPI says a client must not send a
  // readOnly property at all — and this resolves it by believing the
  // restriction rather than the omission. Marking a writable field readOnly
  // costs a caller one field; the other way round sends a value the server
  // rejects.
  for (const flag of ['readOnly', 'writeOnly', 'deprecated', 'format'] as const) {
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
