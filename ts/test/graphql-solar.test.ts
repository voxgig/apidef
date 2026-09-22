/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */


import * as Path from 'node:path'
import * as Fs from 'node:fs'

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { Aontu } from 'aontu'

import { ApiDef } from '../dist/apidef'


const GQL_PREFIX = 'solar-1.0.0-graphql-'
const GQL_FOLDER = Path.join(__dirname, '..', 'test', 'graphql-solar')
const ENDPOINT = 'https://api.solardemo.test/api/graphql'

const REST_PREFIX = 'solar-1.0.0-openapi-3.0.0-'
const REST_FOLDER = Path.join(__dirname, '..', 'test', 'solar')


function steps(over?: Record<string, boolean>) {
  return {
    spec: {
      base: '',
      buildargs: {
        apidef: {
          ctrl: {
            step: {
              parse: true, guide: true, transformers: true,
              builders: true, generate: true, ...(over ?? {}),
            },
          },
        },
      },
    },
  }
}


// NOTE: no `kind` option. The format is sniffed from the .graphql extension
// through the documented makeBuild path, which is how a real consumer builds.
async function buildGraphql(over?: Record<string, boolean>) {
  const build = await ApiDef.makeBuild({
    folder: GQL_FOLDER,
    outprefix: GQL_PREFIX,
    debug: 'debug',
    endpoint: ENDPOINT,
    auth: { scheme: 'apikey', prefix: '' },
  })

  const spec: any = steps(over)
  spec.spec.base = GQL_FOLDER

  return await build(
    { name: 'solar', def: GQL_PREFIX + 'def.graphql' }, spec, {})
}


async function buildRest() {
  const build = await ApiDef.makeBuild({
    folder: REST_FOLDER,
    outprefix: REST_PREFIX,
    debug: 'debug',
  })

  const spec: any = steps({ generate: false })
  spec.spec.base = REST_FOLDER

  return await build(
    { name: 'solar', def: REST_PREFIX + 'def.yaml' }, spec, {})
}


describe('graphql-solar', () => {

  // The whole domain arrives: both entities, all five ops on each.
  test('baseline-entities', async () => {
    const bres = await buildGraphql({ generate: false })
    assert.equal(bres.ok, true)

    const ents = bres.apimodel.main.kit.entity

    assert.deepStrictEqual(Object.keys(ents).sort(), ['moon', 'planet'])

    for (const name of ['moon', 'planet']) {
      assert.deepStrictEqual(
        Object.keys(ents[name].op).sort(),
        ['create', 'list', 'load', 'remove', 'update'],
        name + ' ops')
    }

    assert.deepStrictEqual(
      Object.keys(ents.planet.fields),
      ['diameter', 'id', 'kind', 'name'])
  })


  test('rest-graphql-correspondence', async () => {
    const [gres, rres] = await Promise.all([
      buildGraphql({ generate: false }), buildRest()])

    assert.equal(gres.ok, true)
    assert.equal(rres.ok, true)

    const gents = gres.apimodel.main.kit.entity
    const rents = rres.apimodel.main.kit.entity

    // Same entities.
    assert.deepStrictEqual(
      Object.keys(gents).sort(), Object.keys(rents).sort(),
      'entity names must match across formats')

    for (const name of Object.keys(rents).sort()) {
      // Same operations per entity.
      assert.deepStrictEqual(
        Object.keys(gents[name].op).sort(),
        Object.keys(rents[name].op).sort(),
        name + ': op names must match across formats')

      // Same actions, reached the same way ($action-discriminated points).
      const actions = (ents: any) => {
        const out: string[] = []
        for (const op of Object.values(ents[name].op) as any[]) {
          for (const p of op.points ?? []) {
            if (null != p.q?.$action) {
              out.push(p.q.$action)
            }
          }
        }
        return out.sort()
      }

      assert.deepStrictEqual(
        actions(gents), actions(rents),
        name + ': actions must match across formats')
    }

    // The planet actions are the ones that matter: they are the reason a
    // command mutation must not be dropped or forced into CRUD.
    assert.deepStrictEqual(
      (Object.values(gents.planet.op) as any[])
        .flatMap((op: any) => op.points ?? [])
        .map((p: any) => p.q?.$action)
        .filter((a: any) => null != a).sort(),
      ['forbid', 'terraform'])
  })


  // Wire data for the baseline: documents complete, single-line, unwrapping
  // through the existing transform.res mechanism.
  test('baseline-points', async () => {
    const bres = await buildGraphql({ generate: false })
    assert.equal(bres.ok, true)

    const ops = bres.apimodel.main.kit.entity.planet.op

    const load = ops.load.points[0]
    assert.equal(load.k, 'graphql')
    assert.equal(load.m, 'POST')
    assert.equal(
      load.gq.doc,
      'query PlanetLoad($id: String!) { planet(id: $id) { ...PlanetFields } }' +
      ' fragment PlanetFields on Planet' +
      ' { diameter id kind name }')
    assert.equal(load.t.res, '`body.data.planet`')

    const list = ops.list.points[0]
    assert.equal(list.t.res, '`body.data.planets.nodes`')
    assert.equal(list.gq.page.style, 'relay')

    // Payload unwrapping: create returns the planet, as REST does.
    assert.equal(
      ops.create.points[0].t.res, '`body.data.planetCreate.planet`')

    const updocs = ops.update.points
      .map((p: any) => p.gq.doc.split(/[\s(]/)[1]).sort()
    assert.deepStrictEqual(
      updocs, ['PlanetUpdate', 'PlanetUpdateForbid', 'PlanetUpdateTerraform'])

    // The action payload unwraps to the entity, not to the state wrapper.
    const terraform = ops.update.points
      .find((p: any) => 'terraform' === p.q?.$action)
    assert.ok(null != terraform)
    assert.equal(
      terraform.t.res, '`body.data.planetTerraform.planet`')
  })


  // Schema gate: the emitted baseline model must unify against the canonical
  // apidef schema.
  test('unify-graphql-solar', async () => {
    const bres = await buildGraphql()
    assert.equal(bres.ok, true)

    const modelpath = Path.join(GQL_FOLDER, 'graphql-solar.aontu')
    const src = Fs.readFileSync(modelpath, 'utf8')

    const errs: any[] = []
    // No fs injection: see the note in graphql.test.ts (multisource parses
    // Windows paths with POSIX semantics whenever an fs is present).
    const out: any = new Aontu().generate(src, { path: modelpath, errs })

    assert.deepStrictEqual(
      errs.map((e: any) => String(e).split('\n')[0]), [],
      'emitted solar GraphQL model must unify against model/apidef.aontu')

    assert.equal(
      out.main.kit.entity.planet.op.load.points[0].k, 'graphql')
  })

})
