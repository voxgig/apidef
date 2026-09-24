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


// Laid out as a consumer project, with the package installed beside the
// model, so the package include resolves from any working directory.
function stage(guide: string = 'guide: {}'): string {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-generate-'))
  staged.push(dir)
  const folder = Path.join(dir, 'model')
  Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
  Fs.mkdirSync(Path.join(dir, 'def'))
  Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF))
  const installed = Path.join(dir, 'node_modules', '@voxgig', 'apidef', 'model')
  Fs.mkdirSync(installed, { recursive: true })
  Fs.copyFileSync(Path.join(__dirname, '..', 'model', 'guide.aontu'),
    Path.join(installed, 'guide.aontu'))
  Fs.writeFileSync(Path.join(folder, 'guide', PREFIX + 'guide.aontu'), [
    '@"@voxgig/apidef/model/guide.aontu"',
    '@"./' + PREFIX + 'base-guide.aontu"',
    '',
    guide,
    '',
  ].join('\n'))
  return folder
}


async function generate(folder: string, def: string = DEF): Promise<any> {
  const apidef = ApiDef({ folder, outprefix: PREFIX, pino: Pino({ level: 'silent' }) })
  return apidef.generate({
    model: { name: 'solar', def },
    build: { spec: { base: folder } },
    now: () => NOW,
  })
}


// apidef-warnings.txt is written to the working directory, so each run that
// reads it works from the project's own.
async function inProject(folder: string, run: () => Promise<any>): Promise<any> {
  const cwd = process.cwd()
  process.chdir(Path.dirname(folder))
  try {
    return await run()
  }
  finally {
    process.chdir(cwd)
  }
}


function warnings(folder: string): string | undefined {
  const file = Path.join(Path.dirname(folder), 'apidef-warnings.txt')
  return Fs.existsSync(file) ? Fs.readFileSync(file, 'utf8') : undefined
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
    const res = await inProject(folder, () => generate(folder))

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
    assert.strictEqual(read(folder, FILES[6]), [
      '# Flows\n',
      '@"./' + PREFIX + 'BasicMoonFlow.aontu"',
      '@"./' + PREFIX + 'BasicPlanetFlow.aontu"',
    ].join('\n'))

    assert.strictEqual(res.apimodel.main.kit.entity.moon.key$, 'moon')
    assert.strictEqual(warnings(folder), undefined)
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


  test('warnings-file-is-written-on-success', async () => {
    const folder = stage('guide: entity: planet: path: "/api/planet": op: frob: method: "POST"')
    const res = await inProject(folder, () => generate(folder))

    assert.strictEqual(res.ok, true, String(res.err?.message))
    const text = warnings(folder)
    assert.ok(text?.includes('on entity=planet path=/api/planet is dropped'), text)
    assert.ok(!text?.includes('!! BUILD FAILED !!'), text)
  })


  test('write-failure-fails-build-and-writes-warnings', async () => {
    const folder = stage()
    Fs.writeFileSync(Path.join(folder, 'entity'), 'a file where the entity folder goes\n')

    const res = await inProject(folder, () => generate(folder))

    assert.strictEqual(res.ok, false)
    assert.ok(res.err)
    assert.deepStrictEqual(res.steps, ['parse', 'guide', 'transformers', 'builders'])
    assert.ok(warnings(folder)?.includes('!! BUILD FAILED !!'), warnings(folder))
  })


  test('pre-generate-failure-writes-warnings', async () => {
    const folder = stage()
    const res = await inProject(folder, () => generate(folder, 'missing-def.yaml'))

    assert.strictEqual(res.ok, false)
    assert.ok(res.err)
    assert.deepStrictEqual(res.steps, [])
    assert.ok(warnings(folder)?.includes('!! BUILD FAILED !!'), warnings(folder))
  })


  test('parse-failure-writes-warnings', async () => {
    const folder = stage()
    Fs.writeFileSync(Path.join(Path.dirname(folder), 'def', 'bad.yaml'), 'a: [\n  b: }\n')
    const res = await inProject(folder, () => generate(folder, 'bad.yaml'))

    assert.strictEqual(res.ok, false)
    assert.deepStrictEqual(res.steps, [])
    assert.ok(warnings(folder)?.includes('!! BUILD FAILED !!'), warnings(folder))
  })


  test('guide-failure-writes-warnings', async () => {
    const folder = stage('@"./nope.aontu"')
    const res = await inProject(folder, () => generate(folder))

    assert.strictEqual(res.ok, false)
    assert.deepStrictEqual(res.steps, ['parse'])
    assert.ok(warnings(folder)?.includes('!! BUILD FAILED !!'), warnings(folder))
  })

})
