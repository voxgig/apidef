/* Copyright (c) 2024-2026 Voxgig, MIT License */

// Render the GraphQL wire data onto each point: the complete operation
// document, its variable bindings, the response unwrap path, and (for list
// ops) the pagination descriptor.
//
// Documents are computed HERE, once, and stored in the model as strings.
// The alternative — shipping structured selection data and assembling query
// text inside every generated SDK — would mean one query assembler per
// language target, all of which must stay semantically identical. One
// renderer in apidef is the whole reason GraphQL support stays affordable
// across the target matrix.
//
// Documents are rendered SINGLE-LINE with sorted selection fields, so the
// emitted model is byte-stable and schema drift shows up in model diffs.

import { each } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { KIT } from '../types'

import type { KitModel, GuidePath } from '../types'

import type {
  OpName,
  ModelOp,
  ModelEntity,
  ModelPoint,
  ModelGraphqlVar,
} from '../model'

import { deriveRetShape } from '../guide/graphql01'


// Fields the default fragment never selects on a to-one relation: the stub
// carries the id only, so the caller loads the related entity through its
// own entity op.
const REL_STUB = '{ id }'


function pascal(s: string): string {
  return s.replace(/(^|[_-])([a-z])/g, (_m, _p, c) => c.toUpperCase())
}


// Build the selection set for an entity type: every non-deprecated scalar,
// skipping fields that require arguments (they cannot appear in a fixed
// fragment without binding those arguments), plus an id stub per to-one
// relation. Sorted — byte-stability.
function selectionFields(typeName: string, def: any): string[] {
  const gtype = def.types?.[typeName]
  if (null == gtype) {
    return []
  }

  const out: string[] = []

  for (const fname of Object.keys(gtype.fields)) {
    const f = gtype.fields[fname]

    if (f.deprecated) {
      continue
    }
    if (f.args.some((a: any) => a.reqd)) {
      continue
    }

    const ftype = def.types?.[f.type]
    const kind = ftype?.kind

    if ('SCALAR' === kind || 'ENUM' === kind) {
      out.push(fname)
    }
    else if (('OBJECT' === kind || 'INTERFACE' === kind) && !f.list) {
      if (null != ftype.fields?.id) {
        out.push(fname + ' ' + REL_STUB)
      }
    }
  }

  return out.sort()
}


// Scalar fields of a payload type, for payloads that carry no entity. Used
// when there is nothing to spread a fragment on, so the operation still has
// a valid selection set.
function payloadScalarFields(typeName: string, def: any): string[] {
  const gtype = def.types?.[typeName]
  if (null == gtype) {
    return []
  }

  const out: string[] = []

  for (const fname of Object.keys(gtype.fields)) {
    const f = gtype.fields[fname]
    const kind = def.types?.[f.type]?.kind

    if (!f.deprecated && !f.args.some((a: any) => a.reqd) &&
      ('SCALAR' === kind || 'ENUM' === kind)) {
      out.push(fname)
    }
  }

  return out.sort()
}


// Variable bindings for a root field: one per argument. `from` is the op
// argument the value is read from; for the input-object argument that is the
// request data itself.
function buildVars(fielddef: any, def: any): ModelGraphqlVar[] {
  const args = fielddef?.args ?? []

  // The whole-request-body binding is the SINGLE-entity-input convention
  // (issueCreate(input: IssueCreateInput!)). A field taking several input
  // objects — items(filter: Filter, orderBy: OrderBy) — must bind each from
  // its own argument, or they all receive the same value and at least one
  // fails input validation.
  const inputs = args.filter((a: any) => {
    const atype = def.types?.[a.type]
    return null != atype && 'INPUT_OBJECT' === atype.kind
  })
  const soleInput = 1 === inputs.length ? inputs[0].name : undefined

  return args.map((arg: any) => {
    const v: any = {
      name: arg.name,
      from: arg.name === soleInput ? '' : arg.name,
      gqltype: arg.gqltype,
    }
    if (undefined !== arg.deflt) {
      v.deflt = arg.deflt
    }
    return v
  })
}


// `issue(id: $id, first: $first)` — argument list wired to variables.
function argList(vars: ModelGraphqlVar[]): string {
  return 0 === vars.length ? '' :
    '(' + vars.map((v) => v.name + ': $' + v.name).join(', ') + ')'
}


// `($id: String!, $first: Int = 100)` — the operation's variable
// declarations. A schema default is carried through: without it a non-null
// argument that the schema makes omittable (`first: Int! = 100`) would fail
// variable coercion when the caller leaves it out.
function varDecl(vars: ModelGraphqlVar[]): string {
  return 0 === vars.length ? '' :
    '(' + vars.map((v) => '$' + v.name + ': ' + v.gqltype +
      (undefined === (v as any).deflt ? '' :
        ' = ' + JSON.stringify((v as any).deflt))).join(', ') + ')'
}


// Render one operation document, single-line.
function renderDoc(
  opname: string,
  optype: string,
  field: string,
  vars: ModelGraphqlVar[],
  selection: string,
  fragName: string,
  fragType: string,
  fragFields: string[]
): string {
  const doc =
    optype + ' ' + opname + varDecl(vars) +
    ' { ' + field + argList(vars) + ' ' + selection + ' }' +
    (0 < fragFields.length ?
      ' fragment ' + fragName + ' on ' + fragType +
      ' { ' + fragFields.join(' ') + ' }' : '')

  // Collapse any accidental double spacing so the string is canonical.
  return doc.replace(/\s+/g, ' ').trim()
}


const graphqlTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def, guide } = ctx

  if (true !== def?.graphql) {
    return { ok: true, msg: 'graphql (skipped: not a graphql def)' }
  }

  const kit: KitModel = apimodel.main[KIT]

  let msg = 'graphql '

  each(kit.entity, (ment: ModelEntity, entname: string) => {
    const gent = guide.entity[entname]

    each(ment.op, (mop: ModelOp, opname: OpName) => {
      each(mop.points, (mpoint: ModelPoint) => {
        const rootfield = mpoint.orig

        const gfield: GuidePath | undefined = (gent as any)?.field?.[rootfield]
        const optype = (gfield?.op?.[opname] as any)?.optype ?? 'query'

        const fielddef = 'mutation' === optype ?
          def.mutation?.[rootfield] : def.query?.[rootfield]

        if (null == fielddef) {
          return
        }

        const ret = deriveRetShape(fielddef, def.types ?? {})
        const entityType = ret.entity ?? ''

        const fragFields = selectionFields(entityType, def)
        const fragName = pascal(entname) + 'Fields'
        const fragSpread = 0 < fragFields.length ? '{ ...' + fragName + ' }' : '{ id }'

        const vars = buildVars(fielddef, def)

        // Selection shape and response unwrap both follow the return kind.
        let selection = fragSpread
        let respath = 'body.data.' + rootfield

        if ('connection' === ret.kind) {
          const nodes = ret.nodes ?? 'nodes'
          selection = 'nodes' === nodes ?
            '{ nodes ' + fragSpread + ' pageInfo { endCursor hasNextPage } }' :
            '{ edges { node ' + fragSpread + ' } pageInfo { endCursor hasNextPage } }'
          respath = 'body.data.' + rootfield + '.' + nodes
        }
        else if ('list' === ret.kind) {
          selection = fragSpread
        }
        else if ('payload' === ret.kind && null == ret.entity) {
          // Entity-less payload: Linear's DeletePayload is entityId +
          // success + lastSyncId and nothing else. The classifier admits
          // these (the entity comes from the field name), so the renderer
          // must not fall through to the default `{ id }` spread — the
          // payload HAS no id, and the server rejects the whole document.
          // Select the payload's own scalars and unwrap to the payload.
          const own = payloadScalarFields(fielddef.type, def)
          selection = '{ ' + (0 < own.length ? own.join(' ') : '__typename') + ' }'
          respath = 'body.data.' + rootfield
        }
        else if ('payload' === ret.kind && null != ret.unwrap) {
          // Mutation payload wrapper: select the entity inside it (plus the
          // conventional success flag when present) and unwrap on the way
          // back, so create/update return the entity exactly as REST does.
          const payloadType = def.types?.[fielddef.type]
          const hasSuccess = null != payloadType?.fields?.success
          selection = '{ ' + ret.unwrap + ' ' + fragSpread +
            (hasSuccess ? ' success' : '') + ' }'
          respath = 'body.data.' + rootfield + '.' + ret.unwrap
        }

        // Distinct operation name per point. The action comes from the GUIDE,
        // not from mpoint.select: selectTransform runs after this stage, so
        // $action is not set yet, and without the suffix every action point
        // on an op would ship the same operation name (three PlanetUpdates),
        // which is what server logs, tracing and APM key on.
        const actionName = Object.keys((gfield as any)?.action ?? {})[0]
        const docname = pascal(entname) + pascal(opname) +
          (null != actionName ? pascal(actionName) : '')

        // GraphQL points ride the HTTP machinery: POST to the single
        // endpoint, no path segments. The document carries everything else.
        mpoint.kind = 'graphql'
        mpoint.method = 'POST'
        mpoint.segments = []

        mpoint.graphql = {
          optype: optype as 'query' | 'mutation',
          field: rootfield,
          doc: renderDoc(docname, optype, rootfield, vars, selection,
            fragName, entityType, fragFields),
          vars,
        }

        // Carried for the field transform, which derives entity fields from
        // the same object type. The `$` suffix makes cleanTransform strip it
        // from the emitted model — it is pipeline state, not wire data.
        ;(mpoint.graphql as any).entityType$ = entityType

        if ('connection' === ret.kind) {
          mpoint.graphql.page = {
            style: 'relay',
            nodes: ret.nodes ?? 'nodes',
            cursor: 'pageInfo.endCursor',
            more: 'pageInfo.hasNextPage',
          }
        }

        mpoint.transform.res = '`' + respath + '`'
      })
    })

    msg += ment.name + ' '
  })

  return { ok: true, msg }
}


export {
  graphqlTransform,
  selectionFields,
  renderDoc,
}
