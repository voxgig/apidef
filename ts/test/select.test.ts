/* Copyright (c) 2026 Voxgig Ltd, MIT License */

// A REST point is selected by its path parameters and required arguments;
// points of one operation that share a selector are a warning.

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert'

import { ApiDef } from '../dist/apidef'


const DEF = 'rest-select-def.json'


describe('select', () => {

  let dir: string
  let bres: any

  before(async () => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-select-'))
    const folder = Path.join(dir, 'model')
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
    Fs.mkdirSync(Path.join(dir, 'def'))
    Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF))
    Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'),
      '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n')

    const build = await ApiDef.makeBuild({ folder })
    bres = await build({ name: 'rest-select', def: DEF }, {
      spec: {
        base: folder,
        buildargs: {
          apidef: {
            ctrl: {
              step: {
                parse: true, guide: true, transformers: true,
                builders: false, generate: false,
              }
            }
          }
        }
      }
    }, {})
  })

  after(() => {
    Fs.rmSync(dir, { recursive: true, force: true })
  })

  const selectors = (entity: string, op: string) =>
    bres.apimodel.main.kit.entity[entity].op[op].points
      .map((point: any) => [point.o, point.q?.exist ?? []])


  test('an optional argument never selects a route', () => {
    assert.ok(bres.ok, 'build failed: ' + bres.err?.message)
    assert.deepStrictEqual(selectors('permission', 'remove'), [
      ['/public/database/{id}/permission/{msisdn}', ['database_id', 'id']],
      ['/public/database/{id}/permission/permanent/{msisdn}', ['database_id', 'msisdn']],
    ])
    assert.deepStrictEqual(selectors('permission', 'list'), [
      ['/public/database/{id}/permission', ['database_id']],
    ])
  })


  test('points of one operation sharing a selector are a warning', () => {
    const shared = bres.ctx.warn.history
      .filter((warning: any) => /same selector/.test(warning.note))
      .map((warning: any) => [warning.entity, warning.op, warning.points])
    assert.deepStrictEqual(shared, [
      ['disable', 'update', ['PUT /entity-templates/disable', 'PUT /iterations/disable']],
    ])
  })

})
