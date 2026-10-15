/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { ApiDef } from '../dist/apidef'


// The same operations written as Swagger 2 and as OpenAPI 3 build the same
// model: a body or formData parameter is the request body, never an argument.
// go/swagger_twin_test.go builds both and checks them against the same
// expectation and the base guides this writes.
describe('swagger-twin', () => {

  test('a Swagger 2 body builds the model its OpenAPI 3 twin does', async () => {
    const folder = __dirname + '/../test/swagger-twin'
    const kit = async (kind: string) => {
      const build = await ApiDef.makeBuild({ folder, outprefix: kind + '-' })
      const bres = await build(
        { name: 'twin', def: 'swagger-twin-' + kind + '-def.json' },
        {
          spec: {
            base: folder,
            buildargs: {
              apidef: {
                ctrl: { step: {
                  parse: true, guide: true, transformers: true,
                  builders: false, generate: false,
                } }
              }
            }
          }
        },
        {}
      )
      assert.ok(bres.ok, kind + ' build failed: ' + bres.err?.message)
      return bres.apimodel.main.kit
    }

    const swagger = await kit('swagger')
    const openapi = await kit('openapi')

    // A point's contract names the format it was read from, and nothing else differs.
    const unsourced = (entities: any) => JSON.parse(JSON.stringify(entities, (key, val) =>
      'source' === key ? undefined : val))
    assert.deepStrictEqual(unsourced(swagger.entity), unsourced(openapi.entity))
    assert.deepStrictEqual(swagger.flow, openapi.flow)
    // Each base guide's header names its own entry file.
    const guide = (kind: string) => {
      const src = Fs.readFileSync(folder + '/guide/' + kind + '-base-guide.aontu', 'utf8')
      return src.slice(src.indexOf('\nguide:'))
    }
    assert.strictEqual(guide('swagger'), guide('openapi'))

    const expected = JSON.parse(Fs.readFileSync(folder + '/expected.json', 'utf8'))
    const entities = swagger.entity
    const names = Object.keys(entities).sort()

    const points = names.flatMap((ename) =>
      Object.keys(entities[ename].op).sort().flatMap((opname) =>
        entities[ename].op[opname].points.map((pt: any) =>
          ename + '.' + opname + ' ' + pt.m + ' ' + pt.o +
          ' args=' + Object.keys(pt.g ?? {}).sort().flatMap((kind) => pt.g[kind])
            .map((arg: any) => arg.k + ':' + arg.n).join(',') +
          ' exist=' + (pt.q?.exist ?? []).join(',') +
          ' req=' + JSON.stringify(pt.t?.req) +
          ' rb=' + (pt.rb?.kind ?? '') +
          ' bf=' + JSON.stringify(pt.bf ?? null))))
    assert.deepStrictEqual(points, expected.points)

    const fields = Object.fromEntries(names.map((ename) =>
      [ename, Object.fromEntries(Object.values(entities[ename].fields)
        .map((f: any) => [f.n, {
          t: f.t, r: f.r,
          ...(null == f.fo ? {} : { fo: f.fo }),
          ...(0 === Object.keys(f.op ?? {}).length ? {} : { op: f.op }),
        }]))]))
    assert.deepStrictEqual(fields, expected.fields)
  })
})
