/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { fieldTransform } from '../dist/transform/field'



function seg(...parts: string[]) {
  return parts.map((p: string) =>
    p.startsWith('{') ? { var: p.slice(1, -1) } : { lit: p })
}


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


async function run(
  name: string, path: string[], fields: any[] = [], guide?: any, model?: any,
) {
  const { ent } = entity(name, path, fields)
  const apimodel = { main: { kit: { entity: { [name]: ent } } } }

  // Field extraction reads the response schema off the definition, so the
  // definition has to carry the point's path. The schema itself is empty:
  // these tests are about IDENTITY STRUCTURE, which comes from the route.
  const orig = '/' + path.join('/')
  const def: any = {
    paths: { [orig]: { get: { responses: { '200': { content: {} } } } } },
  }

  const ctx: any = { apimodel, def, guide, model }

  await fieldTransform(ctx)

  return ent
}


async function runPoints(name: string, paths: string[][], model?: any) {
  const ent: any = {
    name,
    fields: [],
    op: {
      load: {
        points: paths.map((path: string[]) => ({
          orig: '/' + path.join('/'),
          method: 'GET',
          segments: seg(...path),
        })),
      },
    },
  }

  const apimodel = { main: { kit: { entity: { [name]: ent } } } }
  const def: any = { paths: {} }
  for (const path of paths) {
    def.paths['/' + path.join('/')] =
      { get: { responses: { '200': { content: {} } } } }
  }

  await fieldTransform({ apimodel, def, guide: undefined, model } as any)

  return ent
}


describe('composite-identity', () => {

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


  test('a trailing literal yields no parts', async () => {
    const ent = await run('geo', ['api', 'geo', '{id}', 'graphql'])

    assert.equal(ent.id?.parts, undefined)
  })


  test('the least-qualified record route decides the parts', async () => {
    const ent = await runPoints('repo', [
      ['repos', '{owner}', '{repo}', 'attestations', '{subject_digest}'],
      ['repos', '{owner}', '{repo}', 'contents', '{path}'],
      ['repos', '{owner}', '{repo}'],
      ['repos', '{owner}', '{repo}', 'collaborators', '{username}'],
    ])

    assert.deepStrictEqual(ent.id.parts, ['owner', 'repo'])
  })


  test('a non-record route does not win', async () => {
    const ent = await runPoints('repo', [
      ['repos', '{owner}', '{repo}', 'forks'],
      ['repos', '{owner}', '{repo}'],
    ])

    assert.deepStrictEqual(ent.id.parts, ['owner', 'repo'])
  })


  test('a shorter list route does not beat the full address', async () => {
    const ent = await runPoints('vulnerability', [
      ['vulnerabilities', '{owner}'],
      ['vulnerabilities', '{owner}', '{repo}'],
      ['vulnerabilities', '{owner}', '{repo}', '{package}', '{identifier}'],
      ['vulnerabilities', '{owner}', '{repo}', '{package}'],
    ])

    assert.deepStrictEqual(ent.id.parts,
      ['owner', 'repo', 'package', 'identifier'])
  })


  // A RUN ENDING IN THE RECORD'S OWN KEY NEEDS NOTHING MORE.
  // `/gists/{gist_id}` is a gist and `/gists/{gist_id}/{sha}` is a REVISION
  // of one; on key length alone the revision wins, and a gist came out keyed
  // `gist_id/sha` while the SDK's own load match takes the one parameter.
  test('a run ending in the entity id beats a longer one', async () => {
    const ent = await runPoints('gist', [
      ['gists', '{gist_id}', '{sha}'],
      ['gists', '{gist_id}'],
    ])

    assert.equal(ent.id?.parts, undefined)
  })


  test('the renamed id parameter is recognised too', async () => {
    const ent = await runPoints('vulnerability', [
      ['vulnerabilities', '{owner}', '{repo}', '{package}', '{identifier}'],
      ['vulnerabilities', '{id}'],
    ])

    assert.equal(ent.id?.parts, undefined)
  })


  test('a merely _id-suffixed part does not win', async () => {
    const ent = await runPoints('api_insights_summary_stat', [
      ['api-insights', '{actor_type}', '{actor_id}'],
      ['api-insights', '{actor_type}'],
    ])

    assert.deepStrictEqual(ent.id.parts, ['actor_type', 'actor_id'])
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


  test('the API id moves aside rather than being rewritten', async () => {
    const ent = await run('repo', ['repos', '{owner}', '{repo}'], [
      {
        name: 'id', type: '`$INTEGER`', req: true, format: 'int64',
        op: { list: { req: true, type: '`$INTEGER`' } },
      },
    ], undefined, { name: 'github' })

    const idf = ent.fields.find((f: any) => 'id' === f.name)
    assert.equal(idf.type, '`$STRING`')
    assert.equal(idf.format, undefined)
    assert.equal(idf.op.list.type, undefined)

    const kept = ent.fields.find((f: any) => 'github_id' === f.name)
    assert.equal(kept.type, '`$INTEGER`')
    assert.equal(kept.format, 'int64')
    // AND the per-op metadata, which a shallow copy silently lost: the
    // deletions that clean up `id` ran over a shared `op` object, so the
    // preserved field kept nothing for the one key it exists to keep.
    assert.equal(kept.op.list.type, '`$INTEGER`')
    assert.equal(ent.alias.field.github_id, 'id')
  })


  describe('where a part lives in the response', () => {

    async function withResponse(
      name: string, path: string[], properties: any, guide?: any,
    ) {
      const ent: any = {
        name,
        fields: [],
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

      const orig = '/' + path.join('/')
      const def: any = {
        paths: {
          [orig]: {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: { type: 'object', properties },
                    },
                  },
                },
              },
            },
          },
        },
      }

      await fieldTransform(
        { apimodel: { main: { kit: { entity: { [name]: ent } } } },
          def, guide, model: undefined } as any)

      return ent
    }


    test('an object part resolves to its conventional subfield', async () => {
      const ent = await withResponse('repo', ['repos', '{owner}', '{repo}'], {
        name: { type: 'string' },
        owner: {
          type: 'object',
          properties: { login: { type: 'string' }, id: { type: 'integer' } },
        },
      })

      assert.deepStrictEqual(ent.id.from, { owner: 'owner.login', repo: 'name' })
    })


    // A PART NO RULE RESOLVES IS LEFT OUT rather than guessed at: an
    // incomplete map says the id cannot be rebuilt for that entity, which
    // beats a confidently wrong id on a real record.
    test('an unresolvable part is left out', async () => {
      const ent = await withResponse('thing', ['things', '{tenant}', '{slug}'], {
        slug: { type: 'string' },
      })

      assert.deepStrictEqual(ent.id.from, { slug: 'slug' })
    })


    test('a stated from wins per part', async () => {
      const ent = await withResponse('thing', ['things', '{tenant}', '{slug}'], {
        slug: { type: 'string' },
      }, { entity: { thing: { id: { from: { tenant: 'meta.tenant' } } } } })

      assert.deepStrictEqual(ent.id.from,
        { tenant: 'meta.tenant', slug: 'slug' })
    })

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
    // DISABLING COMPOSITE MUST NOT DISABLE THE ID, and WHICH parameter is
    // the key is decided by the id-finding rules rather than by position:
    // this route ends in a format selector, so position picks the modifier.
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
