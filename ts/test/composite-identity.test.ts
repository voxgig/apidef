/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { fieldTransform } from '../dist/transform/field'


// Composite entity identity: an API that addresses one record by SEVERAL
// adjacent path parameters, with no single parameter that is the id.
//
// ADJACENCY IS THE WHOLE HEURISTIC, and these tests pin it from both sides,
// because the first implementation took every path variable instead and made
// solar's `moon`, petstore's `order`/`pet`/`user` and taxonomy's `domain` all
// falsely composite. Nested resources are the common shape; a compound key is
// the exception, and only adjacency separates them.
//
// Go carries the same cases in go/composite_test.go — this file is the
// canonical statement of the behaviour that port is held to.

function seg(...parts: string[]) {
  return parts.map((p: string) =>
    p.startsWith('{') ? { var: p.slice(1, -1) } : { lit: p })
}


// An entity whose load op has one point over the given path.
function entity(name: string, path: string[], fields: any[] = [], guide?: any) {
  const ent: any = {
    name,
    fields,
    op: {
      load: {
        points: [{
          orig: '/' + path.join('/'),
          method: 'GET',
          segments: seg(...path),
        }],
      },
    },
  }

  return { ent, guide }
}


async function run(name: string, path: string[], fields: any[] = [], guide?: any) {
  const { ent } = entity(name, path, fields)
  const apimodel = { main: { kit: { entity: { [name]: ent } } } }

  // Field extraction reads the response schema off the definition, so the
  // definition has to carry the point's path. The schema itself is empty:
  // these tests are about IDENTITY STRUCTURE, which comes from the route.
  const orig = '/' + path.join('/')
  const def: any = {
    paths: { [orig]: { get: { responses: { '200': { content: {} } } } } },
  }

  const ctx: any = { apimodel, def, guide }

  await fieldTransform(ctx)

  return ent
}


describe('composite-identity', () => {

  // /repos/{owner}/{repo} — two variables with nothing between them address
  // no sub-collection, so only the pair identifies a repository.
  test('adjacent parameters are a compound key', async () => {
    const ent = await run('repo', ['repos', '{owner}', '{repo}'])

    assert.deepStrictEqual(ent.id.parts, ['owner', 'repo'])
    assert.equal(ent.id.sep, '/')
  })


  // /api/planet/{planet_id}/moon/{moon_id} — the literal `moon` names a
  // sub-collection, so `planet_id` SCOPES the record and `moon_id` names it.
  test('a nested resource is not composite', async () => {
    const ent = await run('moon',
      ['api', 'planet', '{planet_id}', 'moon', '{moon_id}'])

    assert.equal(ent.id?.parts, undefined)
  })


  // A route ending in a literal is a verb ON the record, not its address.
  test('a trailing literal yields no parts', async () => {
    const ent = await run('geo', ['api', 'geo', '{id}', 'graphql'])

    assert.equal(ent.id?.parts, undefined)
  })


  test('three adjacent parameters compose in path order', async () => {
    const ent = await run('entitlement',
      ['entitlements', '{owner}', '{repo}', '{identifier}'])

    assert.deepStrictEqual(ent.id.parts, ['owner', 'repo', 'identifier'])
  })


  // A COMPOSITE ENTITY NEED NOT EXPOSE AN `id`. Without this the descriptor
  // was only built inside the single-id gate, so such an entity got none at
  // all — and an explicit guide correction was silently ignored.
  test('a composite entity with no id field still gets one', async () => {
    const ent = await run('repo', ['repos', '{owner}', '{repo}'],
      [{ name: 'name', type: '`$STRING`', req: true }])

    assert.deepStrictEqual(ent.id.parts, ['owner', 'repo'])
    const idf = ent.fields.find((f: any) => 'id' === f.name)
    assert.equal(idf.type, '`$STRING`')
  })


  // A COMPOSITE ID IS THE PARTS JOINED, so the field holding it is a string
  // whatever the API's own `id` happens to be — github's repo declares an
  // integer, its global database id.
  test('a non-string id field is retyped, with its stale facts', async () => {
    const ent = await run('repo', ['repos', '{owner}', '{repo}'], [
      {
        name: 'id', type: '`$INTEGER`', req: true, format: 'int64',
        op: { list: { req: true, type: '`$INTEGER`' } },
      },
    ])

    const idf = ent.fields.find((f: any) => 'id' === f.name)
    assert.equal(idf.type, '`$STRING`')
    // A `format: int64` beside a string, or a per-op override still saying
    // integer, is a model contradicting itself — and the op override is what
    // a generator reads for that op.
    assert.equal(idf.format, undefined)
    assert.equal(idf.op.list.type, undefined)
  })


  describe('guide corrections', () => {

    // Adjacency cannot always be right: github's
    // /…/artifacts/{artifact_id}/{archive_format} reads as composite and is
    // not — the format selects zip or tar.
    test('composite:false turns the inference off', async () => {
      const ent = await run('artifact',
        ['artifacts', '{artifact_id}', '{archive_format}'], [],
        { entity: { artifact: { id: { composite: false } } } })

      assert.equal(ent.id?.parts, undefined)
    })


    // DISABLING COMPOSITE MUST NOT DISABLE THE ID: the record still has a
    // key, and it is the terminal parameter.
    test('composite:false leaves a single-key descriptor', async () => {
      const ent = await run('artifact',
        ['artifacts', '{artifact_id}', '{archive_format}'], [],
        { entity: { artifact: { id: { composite: false } } } })

      assert.equal(ent.id.field, 'id')
      assert.ok(ent.fields.some((f: any) => 'id' === f.name))
    })


    test('an explicit parts list wins over the inference', async () => {
      const ent = await run('repo', ['repos', '{owner}', '{repo}'], [],
        { entity: { repo: { id: { parts: ['a', 'b', 'c'] } } } })

      assert.deepStrictEqual(ent.id.parts, ['a', 'b', 'c'])
    })


    // Restating every inferred part merely to change the separator is what
    // the optional key exists to avoid.
    test('a stated sep applies to inferred parts', async () => {
      const ent = await run('repo', ['repos', '{owner}', '{repo}'], [],
        { entity: { repo: { id: { sep: ':' } } } })

      assert.deepStrictEqual(ent.id.parts, ['owner', 'repo'])
      assert.equal(ent.id.sep, ':')
    })

  })

})
