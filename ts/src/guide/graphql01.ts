/* Copyright (c) 2024-2026 Voxgig, MIT License */

// GraphQL guide strategy: classify schema root fields into entities and
// operations, the way heuristic01 classifies REST paths.
//
// Classification is SHAPE FIRST, NAME SECOND. Verb spellings diverge wildly
// between GraphQL ecosystems (Hasura `insert_x_one`, Amplify `createTodo`,
// Linear `issueCreate`, PostGraphile `createUser` — and PostGraphile's
// inflector plugin can change them wholesale), but the type shapes do not:
// a query returning the entity type behind a single required id argument is
// a load in every one of them.
//
// Anything on Mutation that touches an entity but matches no CRUD shape
// becomes an ACTION on a canonical op, reaching the SDK as an
// `$action`-discriminated point — the same mechanism REST action paths
// (/planet/{id}/terraform) already use. Nothing is ever dropped silently.
//
// `classifyGraphQLField` is a pure function of plain JSON, so it is driven
// by a shared TSV fixture and can be ported to Go unchanged.

import { each } from 'jostraca'

import type {
  ApiDefContext,
  Guide,
  GuideEntity,
  GuidePath,
} from '../types'

import type { GqlDef, GqlField, GqlType } from '../parse/graphql'

import { canonize, depluralize, normalizeFieldName } from '../utility'


// Op the classifier can assign. 'update' hosts id-bearing actions,
// 'create' hosts id-less ones.
type GqlOpName = 'load' | 'list' | 'create' | 'update' | 'remove'


// Shape of a root field's return type, derived before classification so the
// classifier itself stays free of schema-object access.
type GqlRetShape = {
  kind: 'entity' | 'connection' | 'list' | 'payload' | 'scalar' | 'other'
  entity?: string
  // Connection only: the field holding the node array ('nodes' | 'edges').
  nodes?: string
  // Payload only: the field the entity is wrapped in, if any.
  unwrap?: string
  // Payload only: a delete-ish payload carries no entity.
  deleteish?: boolean
}


type GqlArgSig = {
  name: string
  gqltype: string
  reqd: boolean
}


// Everything the classifier needs about one root field.
type GqlFieldSig = {
  optype: 'query' | 'mutation'
  name: string
  args: GqlArgSig[]
  ret: GqlRetShape
  inputTypeName?: string
  // Entity named by the field itself, used when the return type carries
  // none (see nameEntityType).
  nameEntity?: string
}


type GqlClassification = {
  exclude?: boolean
  entity?: string
  op?: GqlOpName
  action?: string
  optype?: 'query' | 'mutation'
  why: string[]
}


// Naming profile. Profiles only supply name patterns layered ON TOP of the
// shape rules; 'none' is the conservative default that relies on shape alone
// and leans on the guide file for anything ambiguous.
type GqlProfile = 'linear' | 'relay' | 'none'


const CREATE_RE = /^(create|insert|add|new)$/i
const UPDATE_RE = /^(update|edit|modify|patch|set)$/i
const REMOVE_RE = /^(delete|remove|destroy|drop)$/i

// Type-name suffixes that mark schema machinery rather than API entities.
const MACHINERY_RE =
  /(Connection|Edge|PageInfo|Payload|Input|Filter|Comparator|Sort|OrderBy)$/


// Strip a leading entity name off a mutation field name, returning the
// residual verb. `issueCreate` -> `Create`; `createIssue` -> `create`.
function splitEntityVerb(fieldName: string, entity: string): string {
  const lowerField = fieldName.toLowerCase()
  const lowerEnt = entity.toLowerCase()

  if (lowerField.startsWith(lowerEnt)) {
    return fieldName.slice(entity.length)
  }
  if (lowerField.endsWith(lowerEnt)) {
    return fieldName.slice(0, fieldName.length - entity.length)
  }
  return fieldName
}


// Does this field take a required id-ish argument?
//
// Any required id counts, not just a lone one: a command like
// `planetForbid(id: String!, forbid: Boolean!)` addresses an existing record
// just as much as `planetArchive(id: String!)` does. Requiring it to be the
// only required argument made an operation stop looking id-addressed the
// moment the API made a second argument mandatory, which flipped it from an
// update action to a create.
function idArg(args: GqlArgSig[]): GqlArgSig | undefined {
  return args.find(
    (a: GqlArgSig) => a.reqd && /^(id|.*Id)$/i.test(a.name))
}


// Classify one root field. PURE: plain-JSON in, plain-JSON out, no schema
// objects, no closures, no I/O — so a shared TSV fixture can drive this in
// both TypeScript and Go.
function classifyGraphQLField(
  sig: GqlFieldSig,
  profile: GqlProfile
): GqlClassification {
  const why: string[] = []
  const ret = sig.ret

  if ('scalar' === ret.kind || 'other' === ret.kind) {
    why.push('ret:' + ret.kind)
    return { exclude: true, why }
  }

  // A payload that carries no entity (Linear's DeletePayload is just
  // `entityId`) still belongs to the entity its field NAMES. Without this,
  // every such delete mutation is dropped and the entity silently loses its
  // remove op. Confined to payload returns: a query returning a scalar must
  // not be rescued by its name.
  const entity = ret.entity ??
    ('payload' === ret.kind ? sig.nameEntity : undefined)

  if (null == entity) {
    why.push('ret:' + ret.kind + ':no-entity')
    return { exclude: true, why }
  }

  if (null == ret.entity) {
    why.push('entity-by-name:' + entity)
  }
  const id = idArg(sig.args)

  if ('query' === sig.optype) {
    // Connection or list of the entity -> list.
    if ('connection' === ret.kind || 'list' === ret.kind) {
      why.push('query:' + ret.kind)
      return { entity, op: 'list', optype: 'query', why }
    }

    // Single entity behind one required id -> load.
    if ('entity' === ret.kind) {
      if (null != id) {
        why.push('query:entity:id=' + id.name)
        return { entity, op: 'load', optype: 'query', why }
      }

      // No id argument: a singleton accessor (viewer, organization). Still a
      // load — the op simply takes no id.
      if (0 === sig.args.filter((a: GqlArgSig) => a.reqd).length) {
        why.push('query:entity:singleton')
        return { entity, op: 'load', optype: 'query', why }
      }

      why.push('query:entity:args')
      return { entity, op: 'load', optype: 'query', why }
    }

    why.push('query:unmatched:' + ret.kind)
    return { exclude: true, why }
  }

  // --- mutation ---
  const verb = splitEntityVerb(sig.name, entity).replace(/^[_-]+/, '')
  const input = sig.inputTypeName ?? ''

  // create: <Entity>CreateInput, or a create-ish verb, and no id argument.
  const createByInput = new RegExp('^' + entity + '(Create|Insert|New)Input$', 'i').test(input)
  if (createByInput || (CREATE_RE.test(verb) && null == id)) {
    why.push(createByInput ? 'mutation:input:' + input : 'mutation:verb:' + verb)
    return { entity, op: 'create', optype: 'mutation', why }
  }

  // update: <Entity>UpdateInput, or an update-ish verb.
  const updateByInput = new RegExp('^' + entity + '(Update|Edit|Patch|Set)Input$', 'i').test(input)
  if (updateByInput || UPDATE_RE.test(verb)) {
    why.push(updateByInput ? 'mutation:input:' + input : 'mutation:verb:' + verb)
    return { entity, op: 'update', optype: 'mutation', why }
  }

  // remove: a delete-ish verb.
  if (REMOVE_RE.test(verb)) {
    why.push('mutation:verb:' + verb)
    return { entity, op: 'remove', optype: 'mutation', why }
  }

  // Everything else on Mutation is a command: fold it onto a canonical op as
  // an action, exactly as REST action paths are folded. Id-bearing commands
  // ride update (they address an existing record); id-less ones ride create.
  const action = canonize(normalizeFieldName(verb || sig.name))
  const host: GqlOpName = null != id ? 'update' : 'create'
  why.push('mutation:action:' + action + ':host=' + host +
    (profile === 'none' ? '' : ':profile=' + profile))

  return { entity, op: host, action, optype: 'mutation', why }
}


// Derive the return shape of a root field from the normalised type map.
// Separated from classification so the classifier stays plain-JSON pure.
function deriveRetShape(
  field: GqlField,
  types: Record<string, GqlType>
): GqlRetShape {
  const named = types[field.type]

  if (null == named) {
    return { kind: 'scalar' }
  }

  if ('SCALAR' === named.kind || 'ENUM' === named.kind) {
    return { kind: 'scalar' }
  }

  if ('OBJECT' !== named.kind && 'INTERFACE' !== named.kind) {
    return { kind: 'other' }
  }

  // Relay connection: has pageInfo plus nodes and/or edges.
  const fnames = Object.keys(named.fields)
  if (fnames.includes('pageInfo') &&
    (fnames.includes('nodes') || fnames.includes('edges'))) {

    if (fnames.includes('nodes')) {
      return {
        kind: 'connection',
        entity: named.fields.nodes.type,
        nodes: 'nodes',
      }
    }

    // Edges-only connection: the entity is the EDGE'S NODE type, not the
    // edge wrapper. Taking IssueEdge here would spread a fragment declared
    // on IssueEdge inside `edges { node { ... } }` (a validation error) and
    // unwrap the response to edge wrappers instead of entities.
    const edgeType = types[named.fields.edges.type]
    const nodeType = edgeType?.fields?.node?.type

    if (null != nodeType) {
      return { kind: 'connection', entity: nodeType, nodes: 'edges' }
    }
  }

  // Mutation payload wrapper: <X>Payload holding the entity (plus success /
  // lastSyncId style metadata).
  if (/Payload$/.test(named.name)) {
    // Candidates: single object-typed fields that are not machinery. LISTS
    // are excluded — the widespread `errors: [UserError!]!` convention would
    // otherwise win on sort order and make the payload's error collection the
    // "entity", unwrapping errors instead of the record.
    const candidates = fnames.filter((fname: string) => {
      const f = named.fields[fname]
      const ftype = types[f.type]
      return null != ftype && 'OBJECT' === ftype.kind &&
        !f.list && !MACHINERY_RE.test(ftype.name) &&
        !/^(errors?|userErrors?)$/i.test(fname)
    })

    // Prefer the field whose name matches the payload's own entity prefix
    // (IssuePayload -> issue), which is the convention every CRUD-regular
    // GraphQL API follows; fall back to the single remaining candidate.
    const prefix = named.name.replace(/Payload$/, '')
    const byName = candidates.find((fname: string) =>
      fname.toLowerCase() === prefix.toLowerCase() ||
      types[named.fields[fname].type]?.name === prefix)

    const chosen = byName ?? candidates[0]

    if (null != chosen) {
      return {
        kind: 'payload',
        entity: types[named.fields[chosen].type].name,
        unwrap: chosen,
      }
    }

    return { kind: 'payload', deleteish: true }
  }

  if (MACHINERY_RE.test(named.name)) {
    return { kind: 'other' }
  }

  // A list of the entity is a list op even without connection machinery.
  if (field.list) {
    return { kind: 'list', entity: named.name }
  }

  return { kind: 'entity', entity: named.name }
}


// Build the classifier signature for a root field.
function fieldSig(
  optype: 'query' | 'mutation',
  field: GqlField,
  types: Record<string, GqlType>
): GqlFieldSig {
  // The input-object argument, if any, drives create/update detection.
  let inputTypeName: string | undefined = undefined
  for (const arg of field.args) {
    const at = types[arg.type]
    if (null != at && 'INPUT_OBJECT' === at.kind) {
      inputTypeName = at.name
      break
    }
  }

  return {
    optype,
    name: field.name,
    args: field.args.map((a) => ({
      name: a.name, gqltype: a.gqltype, reqd: a.reqd,
    })),
    ret: deriveRetShape(field, types),
    inputTypeName,
    nameEntity: nameEntityType(field.name, types),
  }
}


// Verb suffixes a mutation field name may carry, longest first so
// `issueUnarchive` strips `Unarchive` rather than `Archive`.
const NAME_VERBS = [
  'Unarchive', 'Archive', 'Delete', 'Remove', 'Destroy',
  'Create', 'Update', 'Insert', 'Upsert',
]


// Resolve the entity a mutation NAMES, for payloads that do not carry one.
// Linear's DeletePayload holds `entityId: String!` and nothing else, so
// `commentDelete` has no entity in its return type — the field name is the
// only signal, and by convention it is a reliable one.
function nameEntityType(
  fieldName: string,
  types: Record<string, GqlType>
): string | undefined {
  for (const verb of NAME_VERBS) {
    if (!fieldName.endsWith(verb)) {
      continue
    }

    const stem = fieldName.slice(0, fieldName.length - verb.length)
    if ('' === stem) {
      continue
    }

    const candidate = stem.charAt(0).toUpperCase() + stem.slice(1)
    const gtype = types[candidate]

    if (null != gtype && 'OBJECT' === gtype.kind) {
      return candidate
    }
  }

  return undefined
}


// Entity model name from a GraphQL type name: Issue -> issue,
// WorkflowState -> workflow_state (canonize handles the casing rules that
// the REST path classifier already uses).
function entityName(typeName: string): string {
  return depluralize(canonize(normalizeFieldName(typeName)))
}


function newGuidePath(): GuidePath {
  return {
    why_path: [],
    action: {},
    rename: { param: {} },
    op: {},
  }
}


// The GraphQL guide strategy.
async function graphql01(ctx: ApiDefContext): Promise<Guide> {
  const def: GqlDef = ctx.def
  const profile: GqlProfile = (ctx.opts.profile ?? 'none') as GqlProfile

  const guide: Guide = {
    control: {},
    entity: {},
    metrics: {
      count: {
        path: 0,
        field: 0,
        method: 0,
        tag: 0,
        cmp: 0,
        entity: 0,
        origcmprefs: {},
      },
      found: {
        tag: {},
        cmp: {},
      },
    },
  }

  const types = def.types ?? {}

  const roots: { optype: 'query' | 'mutation', fields: Record<string, GqlField> }[] = [
    { optype: 'query', fields: def.query ?? {} },
    { optype: 'mutation', fields: def.mutation ?? {} },
  ]

  for (const root of roots) {
    // Sorted iteration: byte-stable guide output.
    for (const fname of Object.keys(root.fields).sort()) {
      guide.metrics.count.field++

      const field = root.fields[fname]
      const sig = fieldSig(root.optype, field, types)
      const cls = classifyGraphQLField(sig, profile)

      if (cls.exclude || null == cls.entity || null == cls.op) {
        ctx.log.debug({
          point: 'graphql-exclude',
          field: fname,
          note: cls.why.join(';'),
        })
        continue
      }

      const entname = entityName(cls.entity)

      const gent: GuideEntity = guide.entity[entname] ?? {
        name: entname,
        orig: cls.entity,
        field: {},
        path: {},
      }
      guide.entity[entname] = gent

      const gfields = (gent.field = gent.field ?? {})
      const gpath: GuidePath = gfields[fname] ?? newGuidePath()
      gfields[fname] = gpath

      gpath.why_path.push(cls.why.join(';'))

      if (null != cls.action) {
        gpath.action[cls.action] = {
          kind: 'graphql',
          why_action: ['mutation:' + fname],
        }
      }

      gpath.op[cls.op] = {
        // GraphQL points synthesize POST; optype carries the real distinction.
        method: 'POST',
        optype: cls.optype,
        why_op: cls.why.join(';') as any,
        transform: { req: undefined, res: undefined },
      }
    }
  }

  guide.metrics.count.entity = Object.keys(guide.entity).length

  ctx.log.info({
    point: 'graphql-guide',
    note: `entities=${guide.metrics.count.entity} ` +
      `fields=${guide.metrics.count.field}`,
  })

  return guide
}


export {
  graphql01,
  classifyGraphQLField,
  deriveRetShape,
  fieldSig,
  entityName,
}

export type {
  GqlFieldSig,
  GqlArgSig,
  GqlRetShape,
  GqlClassification,
  GqlProfile,
  GqlOpName,
}
