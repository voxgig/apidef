/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */


import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { Aontu } from 'aontu'

import { ApiDef } from '../dist/apidef'
import {
  deriveRetShape,
  entityName,
  resolveEntityName,
} from '../dist/guide/graphql01'


const OUTPREFIX = 'graphql-linearish-'
const FOLDER = Path.join(__dirname, '..', 'test', 'graphql')
const ENDPOINT = 'https://api.example.test/graphql'


async function buildGraphql(step?: Record<string, boolean>) {
  const build = await ApiDef.makeBuild({
    folder: FOLDER,
    outprefix: OUTPREFIX,
    debug: 'debug',
    kind: 'GraphQL',
    endpoint: ENDPOINT,
    auth: { scheme: 'apikey', prefix: '' },
  })

  return await build(
    { name: 'graphql', def: OUTPREFIX + 'def.graphql' },
    {
      spec: {
        base: FOLDER,
        buildargs: {
          apidef: {
            ctrl: {
              step: {
                parse: true,
                guide: true,
                transformers: true,
                builders: true,
                generate: true,
                ...(step ?? {}),
              },
            },
          },
        },
      },
    },
    {}
  )
}


describe('graphql', () => {

  // Classification: shape drives the op, the entity/op split comes out of
  // the root-field names, and the command mutation folds onto update as an
  // action rather than being dropped or forced into CRUD.
  test('guide-graphql', async () => {
    const bres = await buildGraphql({
      transformers: false, builders: false, generate: false,
    })

    assert.equal(bres.ok, true)

    const gent = bres.guide.entity

    assert.deepStrictEqual(Object.keys(gent).sort(), ['comment', 'issue', 'team'])

    const issue = gent.issue.field
    assert.deepStrictEqual(Object.keys(issue).sort(), [
      'issue', 'issueArchive', 'issueCreate', 'issueDelete', 'issueUpdate', 'issues',
    ])

    assert.equal(issue.issue.op.load.optype, 'query')
    assert.equal(issue.issues.op.list.optype, 'query')

    assert.equal(issue.issueCreate.op.create.optype, 'mutation')
    assert.equal(issue.issueUpdate.op.update.optype, 'mutation')
    assert.equal(issue.issueDelete.op.remove.optype, 'mutation')

    assert.deepStrictEqual(Object.keys(issue.issueArchive.action), ['archive'])
    assert.equal(issue.issueArchive.op.update.optype, 'mutation')

    assert.deepStrictEqual(Object.keys(gent.team.field).sort(), ['team', 'teams'])
    assert.deepStrictEqual(
      Object.keys(gent.comment.field).sort(),
      ['commentCreate', 'commentDelete'])

    assert.equal(bres.guide.metrics.count.entity, 3)
    assert.equal(bres.guide.metrics.count.path, 0)
    assert.ok(0 < bres.guide.metrics.count.field)
  })


  test('fields-graphql', async () => {
    const bres = await buildGraphql({ generate: false })
    assert.equal(bres.ok, true)

    const issue = bres.apimodel.main.kit.entity.issue
    const names = Object.keys(issue.fields)

    assert.deepStrictEqual(names, [
      'archivedAt', 'createdAt', 'id', 'identifier', 'priority',
      'team', 'title',
    ])

    assert.ok(!names.includes('legacy_code'))
    assert.ok(!names.includes('icon'))

    assert.deepStrictEqual(issue.id, { field: 'id', name: 'id' })
  })


  // Wire data: the document is complete and single-line, and the response
  // unwrap path rides the existing transform.res mechanism.
  test('points-graphql', async () => {
    const bres = await buildGraphql({ generate: false })
    assert.equal(bres.ok, true)

    const ops = bres.apimodel.main.kit.entity.issue.op

    const load = ops.load.points[0]
    assert.equal(load.kind, 'graphql')
    assert.equal(load.method, 'POST')
    assert.deepStrictEqual(load.segments, undefined)
    assert.equal(load.graphql.optype, 'query')
    assert.equal(load.graphql.field, 'issue')
    assert.equal(
      load.graphql.doc,
      'query IssueLoad($id: String!) { issue(id: $id) { ...IssueFields } }' +
      ' fragment IssueFields on Issue' +
      ' { archivedAt createdAt id identifier priority team { id } title }')
    assert.equal(load.transform.res, '`body.data.issue`')
    assert.deepStrictEqual(load.graphql.vars, [
      { name: 'id', from: 'id', gqltype: 'String!' },
    ])

    assert.ok(!load.graphql.doc.includes('\n'))

    const list = ops.list.points[0]
    assert.equal(list.transform.res, '`body.data.issues.nodes`')
    assert.deepStrictEqual(list.graphql.page, {
      style: 'relay',
      nodes: 'nodes',
      cursor: 'pageInfo.endCursor',
      more: 'pageInfo.hasNextPage',
    })
    assert.ok(list.graphql.doc.includes('pageInfo { endCursor hasNextPage }'))

    // `exist` names values that must be present for a point to be selected.
    // Relay's optional first/after must NOT appear, or list() would demand
    // every pagination argument before it could be chosen.
    assert.deepStrictEqual(list.select?.exist, undefined)

    const create = ops.create.points[0]
    assert.equal(create.graphql.optype, 'mutation')
    assert.equal(create.transform.res, '`body.data.issueCreate.issue`')

    // The command mutation is a second point on update, selected at runtime
    // by $action (the mechanism REST action paths already use).
    const updatePoints = ops.update.points
    assert.equal(updatePoints.length, 2)
    const archive = updatePoints.find((p: any) => 'archive' === p.select?.$action)
    assert.ok(null != archive, 'archive action point')
    assert.equal(archive.graphql.field, 'issueArchive')
    assert.equal(archive.transform.res, '`body.data.issueArchive.issue`')
  })


  // A GraphQL schema declares no auth and no server URL; both come from
  // build options, and the no-auth signal must NOT be emitted just because
  // the schema is silent (that would suppress all generated auth code).
  test('info-graphql', async () => {
    const bres = await buildGraphql({ generate: false })
    assert.equal(bres.ok, true)

    const info = bres.apimodel.main.kit.info
    assert.equal(info.servers[0].url, ENDPOINT)
    assert.notEqual(info.auth, false)
    assert.equal(info.security.prefix, '')
    assert.equal(info.security.name, 'Authorization')
  })


  // THE SCHEMA GATE: unify the emitted model through the canonical apidef
  // schema. Any point shape the schema rejects fails here.
  test('unify-graphql', async () => {
    const bres = await buildGraphql()
    assert.equal(bres.ok, true)

    const modelpath = Path.join(FOLDER, 'graphql.aon')
    const src = Fs.readFileSync(modelpath, 'utf8')

    const errs: any[] = []
    const out: any = new Aontu().generate(src, { path: modelpath, errs })

    assert.deepStrictEqual(
      errs.map((e: any) => String(e).split('\n')[0]), [],
      'emitted GraphQL model must unify against model/apidef.aon')

    const point = out.main.kit.entity.issue.op.load.points[0]
    assert.equal(point.kind, 'graphql')
    assert.equal(point.method, 'POST')
    assert.deepStrictEqual(point.segments, [])
    assert.ok(point.graphql.doc.startsWith('query IssueLoad'))
  })

})


describe('graphql-retshape', () => {

  // An edges-only Relay connection: the entity is the edge's NODE type.
  // Taking the edge wrapper would spread a fragment declared on IssueEdge
  // inside `edges { node { ... } }` — a validation error — and unwrap the
  // response to edge wrappers instead of entities.
  test('edges-only-follows-node', () => {
    const types: any = {
      IssueConnection: {
        name: 'IssueConnection', kind: 'OBJECT', fields: {
          edges: { name: 'edges', type: 'IssueEdge', list: true, args: [], deprecated: false },
          pageInfo: { name: 'pageInfo', type: 'PageInfo', list: false, args: [], deprecated: false },
        },
      },
      IssueEdge: {
        name: 'IssueEdge', kind: 'OBJECT', fields: {
          node: { name: 'node', type: 'Issue', list: false, args: [], deprecated: false },
        },
      },
      Issue: {
        name: 'Issue', kind: 'OBJECT', fields: {
          id: { name: 'id', type: 'ID', list: false, args: [], deprecated: false },
        },
      },
      PageInfo: { name: 'PageInfo', kind: 'OBJECT', fields: {} },
    }

    assert.deepStrictEqual(
      deriveRetShape(
        { name: 'issues', type: 'IssueConnection', list: false, args: [], deprecated: false } as any,
        types),
      { kind: 'connection', entity: 'Issue', nodes: 'edges' })
  })


  // The `errors: [UserError!]!` convention must not win on sort order and
  // become the payload's "entity" — that would unwrap errors, not the record.
  test('payload-prefers-entity-over-errors', () => {
    const types: any = {
      IssuePayload: {
        name: 'IssuePayload', kind: 'OBJECT', fields: {
          errors: { name: 'errors', type: 'UserError', list: true, args: [], deprecated: false },
          issue: { name: 'issue', type: 'Issue', list: false, args: [], deprecated: false },
        },
      },
      UserError: { name: 'UserError', kind: 'OBJECT', fields: {} },
      Issue: {
        name: 'Issue', kind: 'OBJECT', fields: {
          id: { name: 'id', type: 'ID', list: false, args: [], deprecated: false },
        },
      },
    }

    assert.deepStrictEqual(
      deriveRetShape(
        { name: 'issueCreate', type: 'IssuePayload', list: false, args: [], deprecated: false } as any,
        types),
      { kind: 'payload', entity: 'Issue', unwrap: 'issue' })
  })

})


describe('graphql-entity-name', () => {

  test('leading-digit-guarded', () => {
    assert.equal(entityName('_3DSSessions'), 'n3_ds_session')
    assert.equal(entityName('_3dsSession'), 'n3ds_session')
    assert.equal(entityName('3DSSession'), 'n3_ds_session')
    assert.equal(entityName('_2FAToken'), 'n2_fa_token')
  })

  test('ordinary-names-unchanged', () => {
    assert.equal(entityName('Issue'), 'issue')
    assert.equal(entityName('WorkflowStates'), 'workflow_state')
    assert.equal(entityName('__Type'), 'type')
    assert.equal(entityName('_v2Users'), 'v2_user')
  })


  test('guard-induced-collision-is-split', () => {
    const entities: any = {}
    const a = resolveEntityName('N3DSSession', entities)
    assert.equal(a, 'n3_ds_session')
    entities[a] = { name: a, orig: 'N3DSSession' }

    const b = resolveEntityName('_3DSSessions', entities)
    assert.equal(b, 'n3_ds_session2')
  })


  test('guard-induced-collision-is-split-either-order', () => {
    const entities: any = {}
    const a = resolveEntityName('_3DSSessions', entities)
    assert.equal(a, 'n3_ds_session')
    entities[a] = { name: a, orig: '_3DSSessions' }

    const b = resolveEntityName('N3DSSession', entities)
    assert.equal(b, 'n3_ds_session2')
  })


  // The scope is exactly the collisions the guard creates. A collision that
  // predates it is canonicalization doing its job — singular and plural
  // spellings of one thing — and must still merge, guarded or not.
  test('canonical-merges-are-untouched', () => {
    const entities: any = {}

    entities.issue = { name: 'issue', orig: 'Issue' }
    assert.equal(resolveEntityName('Issues', entities), 'issue')

    entities.n3_ds_session = { name: 'n3_ds_session', orig: '_3DSSessions' }
    assert.equal(resolveEntityName('_3DSSession', entities), 'n3_ds_session')
  })


  // The same type reached from several root fields (query + mutation) is one
  // entity, so its ops merge instead of minting a phantom second entry.
  test('same-type-reuses-its-own-entry', () => {
    const entities: any = {
      n3_ds_session: { name: 'n3_ds_session', orig: '_3DSSessions' },
      n3_ds_session2: { name: 'n3_ds_session2', orig: 'N3DSSession' },
    }
    assert.equal(resolveEntityName('N3DSSession', entities), 'n3_ds_session2')
    assert.equal(resolveEntityName('_3DSSessions', entities), 'n3_ds_session')
  })

})


// A payload that names no entity (Linear's DeletePayload: entityId, success)
// is admitted by classification via the field name — so the renderer must
// select the payload's OWN fields. Spreading an entity fragment, or the
// default { id }, produces a document the server rejects outright, which
// would break every recovered remove op at runtime rather than at build.
describe('graphql-entityless-payload', () => {

  test('remove-selects-payload-fields', async () => {
    const bres = await buildGraphql({ generate: false })
    assert.equal(bres.ok, true)

    const remove = bres.apimodel.main.kit.entity.comment.op.remove
    assert.ok(null != remove, 'comment gains remove from commentDelete')

    const point = remove.points[0]

    assert.equal(
      point.graphql.doc,
      'mutation CommentRemove($id: String!)' +
      ' { commentDelete(id: $id) { entityId success } }')

    assert.ok(!point.graphql.doc.includes('fragment'))
    assert.ok(!point.graphql.doc.includes('{ id }'))

    assert.equal(point.transform.res, '`body.data.commentDelete`')
  })

})
