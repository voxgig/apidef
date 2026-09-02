/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

// End-to-end GraphQL ingestion: SDL in, apimodel out.
//
// The final test here is the one that keeps the canonical schema honest — it
// unifies the EMITTED model through @voxgig/apidef/model/apidef.aontu, so a
// point shape the schema does not accept fails the suite rather than
// surfacing downstream in sdkgen. (No such assertion existed for the REST
// path: apidef.test.ts's `full-solar` is disabled.)

import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { Aontu } from 'aontu'

import { ApiDef } from '../dist/apidef'
import { deriveRetShape } from '../dist/guide/graphql01'


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

    // query issue(id:) -> load; issues(...): IssueConnection -> list
    assert.equal(issue.issue.op.load.optype, 'query')
    assert.equal(issue.issues.op.list.optype, 'query')

    // Input-object shapes drive create/update; delete verb drives remove.
    assert.equal(issue.issueCreate.op.create.optype, 'mutation')
    assert.equal(issue.issueUpdate.op.update.optype, 'mutation')
    assert.equal(issue.issueDelete.op.remove.optype, 'mutation')

    // The command mutation folds onto update as an $action point.
    assert.deepStrictEqual(Object.keys(issue.issueArchive.action), ['archive'])
    assert.equal(issue.issueArchive.op.update.optype, 'mutation')

    // Ragged op sets are the norm: Team is read-only, Comment create-only.
    assert.deepStrictEqual(Object.keys(gent.team.field).sort(), ['team', 'teams'])
    assert.deepStrictEqual(
      Object.keys(gent.comment.field).sort(),
      ['commentCreate', 'commentDelete'])

    // Root fields, not paths, are what got classified.
    assert.equal(bres.guide.metrics.count.entity, 3)
    assert.equal(bres.guide.metrics.count.path, 0)
    assert.ok(0 < bres.guide.metrics.count.field)
  })


  // Entity fields come from the object type: non-deprecated scalars, no
  // required-argument fields, to-one relations as id stubs.
  test('fields-graphql', async () => {
    const bres = await buildGraphql({ generate: false })
    assert.equal(bres.ok, true)

    const issue = bres.apimodel.main.kit.entity.issue
    const names = issue.fields.map((f: any) => f.name)

    // `team` is the to-one relation stub. The fragment selects `team { id }`,
    // so the response carries a nested object — declaring a flat `team_id`
    // would advertise a field the wire never returns.
    //
    // Field names are the WIRE names, verbatim. The schema declares
    // `archivedAt: DateTime`, so that is what the response carries and that is
    // what the model must say. These used to be snake_cased by `canonize`,
    // which is right for entity/type names and wrong for fields — and doubly
    // wrong for GraphQL, where camelCase is the convention, so it renamed
    // essentially every field of every GraphQL API. Same reasoning as the
    // `team_id` note above: do not advertise a name the wire never uses.
    assert.deepStrictEqual(names, [
      'archivedAt', 'createdAt', 'id', 'identifier', 'priority',
      'team', 'title',
    ])

    // `legacyCode` is deprecated and `icon(size: Int!)` needs an argument:
    // selecting either in a fixed fragment is wrong (the latter is a hard
    // GraphQL validation error), so neither may appear.
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
    // GraphQL points ride the HTTP machinery: one POST, no path segments.
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

    // Documents are single-line: byte-stable output, and the string survives
    // the JSONIC round-trip into the emitted model.
    assert.ok(!load.graphql.doc.includes('\n'))

    // Relay connection -> list, with the pagination descriptor recorded and
    // the unwrap pointing at the node array.
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

    // Mutation payload is unwrapped, so create returns the entity itself —
    // exactly as a REST create does.
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

    // NOTE: no `fs` injection. @tabnas/multisource switches to Path.posix
    // whenever an fs is present, so injecting the real node:fs makes it parse
    // Windows paths ('D:\...' contains no '/') with POSIX semantics, the
    // include base resolves to '' and every sibling include fails. apidef's
    // own buildGuide forwards fs only when the caller supplied one, for
    // exactly this reason (see guide/guide.ts).
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


// Return-shape derivation feeds the classifier; these are the two shapes
// where picking the wrong type silently produces an invalid document.
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

    // No entity fragment, and crucially no `{ id }`: DeletePayload has none.
    assert.ok(!point.graphql.doc.includes('fragment'))
    assert.ok(!point.graphql.doc.includes('{ id }'))

    // Unwraps to the payload itself, since no entity is nested in it.
    assert.equal(point.transform.res, '`body.data.commentDelete`')
  })

})
