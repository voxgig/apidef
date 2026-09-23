/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe, after } from 'node:test'
import assert from 'node:assert'

import { ApiDef } from '../dist/apidef'


const PREFIX = 'solar-1.0.0-openapi-3.0.0-'
const DEF = PREFIX + 'def.yaml'

const HEAD = [
  '@"@voxgig/apidef/model/guide.aontu"',
  '@"./' + PREFIX + 'base-guide.aontu"',
  '',
].join('\n')


const staged: string[] = []


function stage(entry: string | null): string {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-overlay-'))
  staged.push(dir)
  const folder = Path.join(dir, 'model')
  Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
  Fs.mkdirSync(Path.join(dir, 'def'))
  Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF))
  if (null != entry) {
    Fs.writeFileSync(Path.join(folder, 'guide', PREFIX + 'guide.aontu'), entry)
  }
  return folder
}


async function run(folder: string): Promise<any> {
  const build = await ApiDef.makeBuild({ folder, outprefix: PREFIX })
  return build({ name: 'solar', def: DEF }, {
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
}


describe('guide-overlay', () => {

  after(() => {
    for (const dir of staged) {
      Fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('customizations-honoured', async () => {
    const folder = stage(HEAD + [
      'guide: entity: moon: active: false',
      'guide: entity: planet: path: "/api/planet/{planet_id}": op: remove: active: false',
      '',
    ].join('\n'))

    const bres = await run(folder)
    assert.strictEqual(bres.ok, true, String(bres.err?.message))

    assert.strictEqual(bres.guide.entity.moon.active, false)
    assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet'])
    assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity.planet.op).sort(),
      ['create', 'list', 'load', 'update'])
  })


  test('id-correction-reaches-guide', async () => {
    const bres = await run(stage(HEAD + [
      'guide: entity: planet: id: {',
      '  parts: [ "planet_id" ]',
      '  sep: ":"',
      '  composite: *true',
      '  from: planet_id: "id"',
      '}',
      '',
    ].join('\n')))
    assert.strictEqual(bres.ok, true, String(bres.err?.message))
    assert.deepStrictEqual(bres.guide.entity.planet.id, {
      parts: ['planet_id'], sep: ':', composite: true, from: { planet_id: 'id' },
    })
  })


  test('bare-overlay-matches-heuristic', async () => {
    const bres = await run(stage(HEAD + 'guide: {}\n'))
    assert.strictEqual(bres.ok, true, String(bres.err?.message))
    assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity).sort(),
      ['moon', 'planet'])
    assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity.planet.op).sort(),
      ['create', 'list', 'load', 'remove', 'update'])
  })


  test('missing-entry-fails', async () => {
    const bres = await run(stage(null))
    assert.strictEqual(bres.ok, false)
    assert.match(String(bres.err?.message), /guide\.aontu/)
  })


  test('conflict-marker-fails', async () => {
    const bres = await run(stage(HEAD + [
      '<<<<<<< ours',
      'guide: entity: moon: active: false',
      '=======',
      '>>>>>>> theirs',
      '',
    ].join('\n')))
    assert.strictEqual(bres.ok, false)
    assert.match(String(bres.err?.message), /unresolved merge conflict/)
  })


  test('type-error-fails', async () => {
    const bres = await run(stage(HEAD + 'guide: entity: moon: active: "no"\n'))
    assert.strictEqual(bres.ok, false)
    assert.match(String(bres.err?.message), /no_scalar_unify/)
  })

})
