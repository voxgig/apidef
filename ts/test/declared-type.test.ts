/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { ApiDef } from '../dist/apidef'


// go/declared_type_test.go builds the same definition and checks it against
// the expectation and the base guide this writes.
describe('declared-type', () => {

  test('a declared type is typed alike in a field and in an argument', async () => {
    const folder = __dirname + '/../test/declared-type'
    const build = await ApiDef.makeBuild({ folder })
    const bres = await build(
      { name: 'declared-type', def: 'declared-type-def.json' },
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

    const fields: Record<string, Record<string, any>> = {}
    const args: Record<string, Record<string, Record<string, any>>> = {}
    for (const ename of Object.keys(entities)) {
      fields[ename] = Object.fromEntries(Object.values(entities[ename].fields)
        .map((f: any) => [f.n, f.t]))
      for (const [opname, mop] of Object.entries(entities[ename].op) as [string, any][]) {
        for (const pt of mop.points) {
          for (const [kind, list] of Object.entries(pt.g ?? {}) as [string, any[]][]) {
            for (const arg of list) {
              const opargs = args[ename + '.' + opname] = args[ename + '.' + opname] ?? {}
              const kindargs = opargs[kind] = opargs[kind] ?? {}
              kindargs[arg.n] = arg.t
            }
          }
        }
      }
    }

    assert.deepStrictEqual(fields, expected.fields)
    assert.deepStrictEqual(args, expected.args)
  })
})
