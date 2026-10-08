/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { ApiDef } from '../dist/apidef'


// go/array_body_test.go builds the same definitions and checks them against
// the expectations and the base guides this writes.
describe('array-body', () => {

  for (const name of ['array-body', 'array-body-swagger']) {
    test(name + ': an array request body is sent from one field', async () => {
      const folder = __dirname + '/../test/' + name
      const build = await ApiDef.makeBuild({ folder })
      const bres = await build(
        { name, def: name + '-def.json' },
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
            ' req=' + JSON.stringify(pt.t?.req) +
            ' bf=' + JSON.stringify(pt.bf ?? null))))
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
  }
})
