/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { ApiDef } from '../dist/apidef'


// go/array_body_test.go builds the same definition and checks it against the
// expectations and the base guide this writes.
describe('array-body', () => {

  test('an array request body is sent from one field', async () => {
    const folder = __dirname + '/../test/array-body'
    const build = await ApiDef.makeBuild({ folder })
    const bres = await build(
      { name: 'array-body', def: 'array-body-def.json' },
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

    assert.ok(bres.ok, 'build failed: ' + bres.err?.message)

    const expected = JSON.parse(Fs.readFileSync(folder + '/expected.json', 'utf8'))
    const entities = bres.apimodel.main.kit.entity
    const names = Object.keys(entities).sort()

    const points = names.flatMap((ename) =>
      Object.keys(entities[ename].op).sort().flatMap((opname) =>
        entities[ename].op[opname].points.map((pt: any) =>
          ename + '.' + opname + ' ' + pt.m + ' ' + pt.o +
          ' exist=' + (pt.q?.exist ?? []).join(',') +
          ' action=' + (pt.q?.$action ?? '') +
          ' req=' + JSON.stringify(pt.t?.req))))
    assert.deepStrictEqual(points, expected.points)

    const fields = Object.fromEntries(names.map((ename) =>
      [ename, Object.fromEntries(Object.values(entities[ename].fields)
        .map((f: any) => [f.n, {
          t: f.t, r: f.r,
          ...(null == f.sh ? {} : { sh: f.sh }),
          ...(0 === Object.keys(f.op ?? {}).length ? {} : { op: f.op }),
        }]))]))
    assert.deepStrictEqual(fields, expected.fields)
  })
})
