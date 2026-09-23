/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe, after } from 'node:test'
import assert from 'node:assert'

import Pino from 'pino'

import { ApiDef } from '../dist/apidef'


// The Go port pins the same behaviour in go/generate_test.go.

const NOW = 1790000000000
const PREFIX = 'solar-1.0.0-openapi-3.0.0-'
const DEF = PREFIX + 'def.yaml'

// In the order the builders emit them, which is the order of the meta log.
const FILES = [
  'entity/' + PREFIX + 'moon.aontu',
  'entity/' + PREFIX + 'planet.aontu',
  'entity/' + PREFIX + 'entity-index.aontu',
  'api/' + PREFIX + 'api-info.aontu',
  'flow/' + PREFIX + 'BasicMoonFlow.aontu',
  'flow/' + PREFIX + 'BasicPlanetFlow.aontu',
  'flow/' + PREFIX + 'flow-index.aontu',
]


const staged: string[] = []


function stage(): string {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-generate-'))
  staged.push(dir)
  const folder = Path.join(dir, 'model')
  Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
  Fs.mkdirSync(Path.join(dir, 'def'))
  Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF))
  Fs.writeFileSync(Path.join(folder, 'guide', PREFIX + 'guide.aontu'), [
    '@"@voxgig/apidef/model/guide.aontu"',
    '@"./' + PREFIX + 'base-guide.aontu"',
    '',
    'guide: {}',
    '',
  ].join('\n'))
  return folder
}


async function generate(folder: string): Promise<any> {
  const apidef = ApiDef({ folder, outprefix: PREFIX, pino: Pino({ level: 'silent' }) })
  return apidef.generate({
    model: { name: 'solar', def: DEF },
    build: { spec: { base: folder } },
    now: () => NOW,
  })
}


function rel(folder: string, files: string[]): string[] {
  return files.map((file) => Path.relative(folder, file).split(Path.sep).join('/')).sort()
}


function read(folder: string, file: string): string {
  return Fs.readFileSync(Path.join(folder, file), 'utf8')
}


function meta(folder: string): any {
  return JSON.parse(read(folder, '.jostraca/jostraca.meta.log'))
}


describe('generate', () => {

  after(() => {
    for (const dir of staged) {
      Fs.rmSync(dir, { recursive: true, force: true })
    }
  })


  test('first-run-writes-model-and-bookkeeping', async () => {
    const folder = stage()
    const res = await generate(folder)

    assert.strictEqual(res.ok, true, String(res.err?.message))
    assert.strictEqual(res.reload, true)
    assert.deepStrictEqual(rel(folder, res.jres.files.written), [...FILES].sort())
    assert.deepStrictEqual(res.jres.files.unchanged, [])

    const log = meta(folder)
    assert.strictEqual(log.last, NOW)
    assert.deepStrictEqual(Object.keys(log.files), FILES)
    for (const file of FILES) {
      const entry = log.files[file]
      assert.deepStrictEqual(
        [entry.action, entry.exists, entry.actions, entry.when],
        ['write', false, ['write'], NOW], file)
      assert.strictEqual(read(folder, '.jostraca/generated/' + file), read(folder, file), file)
    }

    assert.strictEqual(read(folder, '.jostraca/.gitignore'), '\njostraca.meta.log\ngenerated\n')
    assert.ok(read(folder, FILES[2]).includes('@"./' + PREFIX + 'moon.aontu"'))
  })


  test('rerun-over-own-output-changes-nothing', async () => {
    const folder = stage()
    await generate(folder)
    const before = FILES.map((file) => read(folder, file))

    const res = await generate(folder)

    assert.strictEqual(res.ok, true, String(res.err?.message))
    assert.strictEqual(res.reload, false)
    assert.deepStrictEqual(res.jres.files.written, [])
    assert.deepStrictEqual(rel(folder, res.jres.files.unchanged), [...FILES].sort())
    assert.deepStrictEqual(FILES.map((file) => read(folder, file)), before)

    const log = meta(folder)
    assert.deepStrictEqual(Object.keys(log.files), FILES)
    for (const file of FILES) {
      assert.strictEqual(log.files[file].exists, true, file)
    }
  })


  test('rerun-overwrites-hand-edit-and-collects-orphan', async () => {
    const folder = stage()
    await generate(folder)

    const moon = FILES[0]
    const generated = read(folder, moon)
    Fs.appendFileSync(Path.join(folder, moon), '\n# hand edit\n')
    const orphan = 'entity/' + PREFIX + 'comet.aontu'
    Fs.writeFileSync(Path.join(folder, orphan), '# Entity: comet\n')

    const res = await generate(folder)

    assert.strictEqual(res.ok, true, String(res.err?.message))
    assert.strictEqual(res.reload, true)
    assert.deepStrictEqual(rel(folder, res.jres.files.written), [moon])
    assert.strictEqual(read(folder, moon), generated)
    assert.strictEqual(Fs.existsSync(Path.join(folder, orphan)), false)
  })

})
