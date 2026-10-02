/* Copyright (c) 2026 Voxgig Ltd, MIT License */

// A point records its request body when the body is not JSON alone, and the
// guide chooses the media type the body is sent as.

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert'

import { ApiDef } from '../dist/apidef'


const DEF = 'request-body-def.json'

// The heuristic alone would choose text/markdown, first in code point order.
const GUIDE = 'guide: entity: render: path: "/renders": op: create: body: media: "text/plain"\n'


describe('body', () => {

  let dir: string
  let bres: any

  before(async () => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-body-'))
    const folder = Path.join(dir, 'model')
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
    Fs.mkdirSync(Path.join(dir, 'def'))
    Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF))
    Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'),
      '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n' + GUIDE)

    const build = await ApiDef.makeBuild({ folder })
    bres = await build({ name: 'request-body', def: DEF }, {
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

  const bodies = (entity: string, op: string) =>
    bres.apimodel.main.kit.entity[entity].op[op].points
      .map((point: any) => [point.o, point.rb ?? null])


  test('a JSON body and a read record nothing', () => {
    assert.ok(bres.ok, 'build failed: ' + bres.err?.message)
    assert.deepStrictEqual(bodies('note', 'create'), [['/notes', null]])
    for (const entity of ['avatar', 'note', 'render', 'subscription', 'upload']) {
      assert.deepStrictEqual(bodies(entity, 'load').map(([, rb]: any) => rb), [null])
    }
  })


  test('a raw, multipart or form body records its media type', () => {
    assert.deepStrictEqual(bodies('upload', 'create'), [['/uploads', {
      kind: 'raw', media: 'application/octet-stream', binary: true,
    }]])
    assert.deepStrictEqual(bodies('avatar', 'create'), [['/avatars', {
      kind: 'multipart', media: 'multipart/form-data', fields: [
        { name: 'caption' },
        { name: 'image', binary: true, media: 'image/png' },
      ],
    }]])
    assert.deepStrictEqual(bodies('subscription', 'create'), [['/subscriptions', {
      kind: 'form', media: 'application/x-www-form-urlencoded', fields: [
        { name: 'email' },
        { name: 'topics', list: true },
      ],
    }]])
  })


  test('the guide chooses the media type a body is sent as', () => {
    assert.deepStrictEqual(bodies('render', 'create'), [['/renders', {
      kind: 'raw', media: 'text/plain',
      alternatives: [{ kind: 'raw', media: 'text/markdown' }],
    }]])
  })

})
