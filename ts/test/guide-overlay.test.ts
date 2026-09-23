/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe, after } from 'node:test'
import assert from 'node:assert'

import { ApiDef } from '../dist/apidef'
import { baseGuideHeader, missingGuideMessage } from '../dist/guide/guide'


const PREFIX = 'solar-1.0.0-openapi-3.0.0-'
const DEF = PREFIX + 'def.yaml'

const HEAD = [
  '@"@voxgig/apidef/model/guide.aontu"',
  '@"./' + PREFIX + 'base-guide.aontu"',
  '',
].join('\n')


const staged: string[] = []


function stage(entry: string | null, name: string = PREFIX + 'guide.aontu'): string {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-overlay-'))
  staged.push(dir)
  const folder = Path.join(dir, 'model')
  Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
  Fs.mkdirSync(Path.join(dir, 'def'))
  Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF))
  if (null != entry) {
    Fs.writeFileSync(Path.join(folder, 'guide', name), entry)
  }
  return folder
}


async function run(folder: string, log?: any): Promise<any> {
  const build = await ApiDef.makeBuild({ folder, outprefix: PREFIX })
  return build({ name: 'solar', def: DEF }, {
    log,
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


  test('base-guide-overwritten', async () => {
    const folder = stage(HEAD + 'guide: {}\n')
    const basepath = Path.join(folder, 'guide', PREFIX + 'base-guide.aontu')
    Fs.writeFileSync(basepath, [
      '<<<<<<< ours',
      'guide: entity: moon: active: false',
      '=======',
      '>>>>>>> theirs',
      '',
    ].join('\n'))

    const bres = await run(folder)
    assert.strictEqual(bres.ok, true, String(bres.err?.message))

    const base = Fs.readFileSync(basepath, 'utf8')
    assert.ok(base.startsWith(baseGuideHeader(PREFIX).join('\n') + '\n'), base)
    assert.ok(!base.includes('<<<<<<<'), base)
    assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity).sort(),
      ['moon', 'planet'])
  })


  test('no-guide-fails', async () => {
    for (const entry of ['', '# nothing\n', 'foo: 1\n']) {
      const folder = stage(entry)
      const bres = await run(folder)
      assert.strictEqual(bres.ok, false, JSON.stringify(entry))
      assert.ok(String(bres.err?.message).includes(missingGuideMessage(
        Path.join(folder, 'guide', PREFIX + 'guide.aontu'), PREFIX)), bres.err?.message)
    }
  })


  test('legacy-entry-migrated', async () => {
    for (const dir of ['', './']) {
      const folder = stage([
        '@"@voxgig/apidef/model/guide.aon"',
        '@"' + dir + PREFIX + 'base-guide.aon"',
        'guide: entity: moon: active: false',
        '',
      ].join('\n'), PREFIX + 'guide.aon')
      const bres = await run(folder)
      assert.strictEqual(bres.ok, true, String(bres.err?.message))

      const guidedir = Path.join(folder, 'guide')
      assert.ok(!Fs.existsSync(Path.join(guidedir, PREFIX + 'guide.aon')))
      const entry = Fs.readFileSync(Path.join(guidedir, PREFIX + 'guide.aontu'), 'utf8')
      assert.ok(entry.includes('@"@voxgig/apidef/model/guide.aontu"'), entry)
      assert.ok(entry.includes('@"./' + PREFIX + 'base-guide.aontu"'), entry)
      assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet'])
    }
  })


  test('legacy-include-migrated', async () => {
    const folder = stage([
      '@"@voxgig/apidef/model/guide.aontu"',
      '@"./' + PREFIX + 'base-guide.aon"',
      'guide: entity: moon: active: false',
      '',
    ].join('\n'))
    const bres = await run(folder)
    assert.strictEqual(bres.ok, true, String(bres.err?.message))

    const entry =
      Fs.readFileSync(Path.join(folder, 'guide', PREFIX + 'guide.aontu'), 'utf8')
    assert.ok(entry.includes('@"./' + PREFIX + 'base-guide.aontu"'), entry)
    assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet'])
  })


  test('bare-include-migrated', async () => {
    const folder = stage([
      '@"@voxgig/apidef/model/guide.aontu"',
      '@"' + PREFIX + 'base-guide.aontu"',
      'guide: entity: moon: active: false',
      '',
    ].join('\n'))
    const bres = await run(folder)
    assert.strictEqual(bres.ok, true, String(bres.err?.message))

    const entry =
      Fs.readFileSync(Path.join(folder, 'guide', PREFIX + 'guide.aontu'), 'utf8')
    assert.ok(entry.includes('@"./' + PREFIX + 'base-guide.aontu"'), entry)
    assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet'])
  })


  test('schema-include-spellings', async () => {
    for (const include of [
      '@\'@voxgig/apidef/model/guide.aontu\'',
      '@ "@voxgig/apidef/model/guide.aontu"',
      '@`@voxgig/apidef/model/guide.aontu`',
      '@\n"@voxgig/apidef/model/guide.aontu"',
    ]) {
      const bres = await run(stage([
        include,
        '@"./' + PREFIX + 'base-guide.aontu"',
        'guide: entity: moon: active: false',
        '',
      ].join('\n')))
      assert.strictEqual(bres.ok, true, include + ': ' + String(bres.err?.message))
      assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet'])
    }
  })


  test('nested-schema-include', async () => {
    const folder = stage([
      '@"./shared.aontu"',
      'guide: entity: moon: active: false',
      '',
    ].join('\n'))
    Fs.writeFileSync(Path.join(folder, 'guide', 'shared.aontu'), HEAD)
    const bres = await run(folder)
    assert.strictEqual(bres.ok, true, String(bres.err?.message))
    assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['planet'])
  })


  test('missing-entry-fails', async () => {
    const bres = await run(stage(null))
    assert.strictEqual(bres.ok, false)
    assert.match(String(bres.err?.message), /guide\.aontu/)
  })


  test('conflict-marker-fails', async () => {
    const folder = stage(HEAD + [
      '<<<<<<< ours',
      'guide: entity: moon: active: false',
      '=======',
      '>>>>>>> theirs',
      '',
    ].join('\n'))
    const bres = await run(folder)
    const entry = Path.join(folder, 'guide', PREFIX + 'guide.aontu')
    assert.strictEqual(bres.ok, false)
    assert.ok(String(bres.err?.message).includes(
      '@voxgig/apidef: guide: unresolved merge conflict at ' + entry + ':3\n' +
      '  <<<<<<< ours\n' +
      'Resolve the marked block in ' + entry + '.'), String(bres.err?.message))
  })


  test('type-error-fails', async () => {
    const bres = await run(stage(HEAD + 'guide: entity: moon: active: "no"\n'))
    assert.strictEqual(bres.ok, false)
    assert.match(String(bres.err?.message), /^SUMMARY \(1 errors\): /)
    assert.match(String(bres.err?.message), /no_scalar_unify/)
    const [aerr] = bres.err.errs()
    assert.strictEqual(aerr.aontu, true)
    assert.deepStrictEqual(aerr.errs().map((e: any) => e.why), ['no_scalar_unify'])
  })


  for (const [name, line, why, text] of [
    ['incomplete-value-fails', 'extra: string', 'mapval_no_gen', 'mapval_no_gen'],
    ['syntax-error-fails', '}}}', 'syntax', 'unexpected character'],
    ['missing-include-fails', '@"./nope.aontu"', 'multisource_not_found', 'source not found: ./nope.aontu'],
  ]) {
    test(name, async () => {
      const logged: any[] = []
      const log: any = {
        child: () => log, info() { }, debug() { }, warn() { }, trace() { }, fatal() { },
        error: (e: any) => logged.push(e),
      }
      const bres = await run(stage(HEAD + line + '\n'), log)
      assert.strictEqual(bres.ok, false)
      assert.ok(String(bres.err?.message).startsWith('SUMMARY (1 errors): '), bres.err?.message)
      assert.ok(String(bres.err?.message).includes(text), bres.err?.message)
      assert.deepStrictEqual(bres.err.errs()[0].errs().map((e: any) => e.why), [why])
      assert.ok(logged.includes(bres.err))
    })
  }

})
