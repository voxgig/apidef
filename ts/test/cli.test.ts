/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import { spawnSync } from 'node:child_process'
import * as Fs from 'node:fs'
import * as Os from 'node:os'
import Path from 'node:path'

import { test, describe } from 'node:test'
import assert from 'node:assert'

import {
  runCli,
  resolveOptions,
  defName,
  resolveProject,
  checkProject,
} from '../dist/cli'


const Pkg = require('../package.json')

const SOLAR_PREFIX = 'solar-1.0.0-openapi-3.0.0-'
const SOLAR_DEF = SOLAR_PREFIX + 'def.yaml'

const FIXTURES = Path.join(__dirname, '..', 'test')
const PKG_MODEL = Path.join(__dirname, '..', 'model')


// A throwaway project in the documented layout: <root>/def holds the
// definition, <root>/model the guide entry file and the generated output.
// The package model is copied under <root>/node_modules so the guide's
// package include resolves outside the repository.
function makeProject(): string {
  const root = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-cli-'))

  Fs.mkdirSync(Path.join(root, 'def'))
  Fs.copyFileSync(
    Path.join(FIXTURES, 'def', SOLAR_DEF),
    Path.join(root, 'def', SOLAR_DEF))

  Fs.mkdirSync(Path.join(root, 'model', 'guide'), { recursive: true })
  Fs.copyFileSync(
    Path.join(FIXTURES, 'solar', 'guide', SOLAR_PREFIX + 'guide.aon'),
    Path.join(root, 'model', 'guide', SOLAR_PREFIX + 'guide.aon'))

  const pkgmodel = Path.join(root, 'node_modules', '@voxgig', 'apidef', 'model')
  Fs.mkdirSync(pkgmodel, { recursive: true })
  for (const file of Fs.readdirSync(PKG_MODEL)) {
    Fs.copyFileSync(Path.join(PKG_MODEL, file), Path.join(pkgmodel, file))
  }

  return root
}


function captureIO() {
  const out: string[] = []
  const err: string[] = []
  return {
    out,
    err,
    io: {
      log: (...args: any[]) => out.push(args.join(' ')),
      error: (...args: any[]) => err.push(args.join(' ')),
    }
  }
}


describe('cli', () => {

  test('resolve-options', () => {
    const defaults = resolveOptions(['petstore'])
    assert.equal(defaults.name, 'petstore')
    assert.equal(defaults.folder, 'petstore')
    assert.equal(defaults.def, '')
    assert.equal(defaults.prefix, undefined)
    assert.equal(defaults.watch, false)
    assert.equal(defaults.debug, undefined)

    const given = resolveOptions([
      'petstore', '-f', 'proj', '-d', 'spec.yml', '-p', 'ps-', '-w', '-g', 'warn'])
    assert.equal(given.folder, 'proj')
    assert.equal(given.def, 'spec.yml')
    assert.equal(given.prefix, 'ps-')
    assert.equal(given.watch, true)
    assert.equal(given.debug, 'warn')

    assert.equal(resolveOptions(['-v']).version, true)
    assert.equal(resolveOptions(['-h']).help, true)
  })


  // The layout the CLI resolves, pinned: the model folder is <root>/model,
  // the guide entry file is <root>/model/guide/<prefix>guide.aon, and the
  // definition is named so that the pipeline's <base>/../def/<def> rule
  // finds it wherever it is.
  test('resolve-project', () => {
    const root = Path.resolve('proj')
    const def = Path.join(root, 'def', 'petstore.yml')

    const project = resolveProject({
      name: 'petstore', folder: 'proj', def,
      watch: false, debug: 'info', help: false, version: false,
    })

    assert.equal(project.root, root)
    assert.equal(project.folder, Path.join(root, 'model'))
    assert.equal(project.outprefix, 'petstore-')
    assert.equal(project.def, def)
    assert.deepEqual(project.model, { name: 'petstore', def: 'petstore.yml' })
    assert.equal(project.guide,
      Path.join(root, 'model', 'guide', 'petstore-guide.aon'))
    assert.equal(project.legacyguide,
      Path.join(root, 'model', 'guide', 'petstore-guide.aontu'))
    assert.equal(
      Path.join(project.folder, '..', 'def', project.model.def), def)

    const elsewhere = Path.join(Path.dirname(root), 'specs', 'v2', 'petstore.json')
    const away = resolveProject({
      name: 'petstore', folder: 'proj', def: elsewhere, prefix: '',
      watch: false, debug: 'info', help: false, version: false,
    })
    assert.equal(away.outprefix, '')
    assert.equal(away.guide, Path.join(root, 'model', 'guide', 'guide.aon'))
    assert.equal(
      Path.join(away.folder, '..', 'def', away.model.def), elsewhere)
  })


  // The definition name the pipeline joins onto <root>/def: relative on the
  // same drive wherever the file is, refused on another drive.
  test('def-name', () => {
    const W = Path.win32
    assert.equal(defName('C:\\work\\proj\\def', 'C:\\work\\proj\\def\\petstore.yml', W),
      'petstore.yml')
    assert.equal(defName('C:\\work\\proj\\def', 'C:\\specs\\v2\\petstore.json', W),
      '..\\..\\..\\specs\\v2\\petstore.json')
    assert.throws(() => defName('C:\\work\\proj\\def', 'D:\\specs\\petstore.yml', W),
      /same drive/)

    const P = Path.posix
    assert.equal(defName('/work/proj/def', '/work/proj/def/petstore.yml', P), 'petstore.yml')
    assert.equal(defName('/work/proj/def', '/specs/v2/petstore.json', P),
      '../../../specs/v2/petstore.json')
  })


  test('check-project', () => {
    const root = makeProject()
    const options = {
      name: 'solar', folder: root, prefix: SOLAR_PREFIX,
      def: Path.join(root, 'def', SOLAR_DEF),
      watch: false, debug: 'warn', help: false, version: false,
    }

    checkProject(resolveProject(options))

    const missing = resolveProject({ ...options, prefix: 'other-' })
    assert.throws(() => checkProject(missing), (err: any) => {
      assert.ok(err.message.includes(
        Path.join(root, 'model', 'guide', 'other-guide.aon')), err.message)
      assert.ok(err.message.includes('@"./other-base-guide.aon"'), err.message)
      return true
    })
  })


  test('version-help', async () => {
    const version = captureIO()
    assert.equal(await runCli(['-v'], version.io), 0)
    assert.deepEqual(version.out, [Pkg.version])

    const help = captureIO()
    assert.equal(await runCli(['-h'], help.io), 0)
    assert.ok(help.out[0].startsWith('Usage: voxgig-apidef <name>'))
    assert.ok(help.out[0].includes('guide.aon'))
  })


  // The shims `bin/voxgig-apidef` and `cmd/bun/entry.js` are the only way a
  // user reaches the CLI, and runCli does not go through them: a wrong
  // require path or a missing export shows up nowhere else. Run them.
  test('entry-points', (t) => {
    const bin = Path.join(__dirname, '..', 'bin', 'voxgig-apidef')
    const node = spawnSync(process.execPath, [bin, '-v'], { encoding: 'utf8' })
    assert.equal(node.status, 0, node.stderr)
    assert.equal(node.stdout.trim(), Pkg.version)

    // Bun is not installed everywhere. Where it is, its entry point runs the
    // same CLI. Deno's cannot be run here at all; see cmd/RESULTS.md.
    if (0 !== spawnSync('bun', ['--version'], { encoding: 'utf8' }).status) {
      t.diagnostic('bun not found: cmd/bun/entry.js not run')
      return
    }

    const entry = Path.join(__dirname, '..', 'cmd', 'bun', 'entry.js')
    const bun = spawnSync('bun', [entry, '-v'], { encoding: 'utf8' })
    assert.equal(bun.status, 0, bun.stderr)
    assert.equal(bun.stdout.trim(), Pkg.version)
  })


  test('bad-options', async () => {
    const noname = captureIO()
    assert.equal(await runCli([], noname.io), 1)
    assert.ok(noname.err.join('\n').includes('project name'), noname.err.join('\n'))

    const nodef = captureIO()
    assert.equal(await runCli(['solar'], nodef.io), 1)
    assert.ok(nodef.err.join('\n').includes('--def'), nodef.err.join('\n'))

    const nofile = captureIO()
    assert.equal(await runCli(['solar', '-d', 'no-such-def.yml'], nofile.io), 1)
    assert.ok(nofile.err.join('\n').includes('Definition file not found'))

    const root = makeProject()
    const noguide = captureIO()
    assert.equal(await runCli([
      'solar', '-f', root, '-d', Path.join(root, 'def', SOLAR_DEF), '-g', 'warn',
    ], noguide.io), 1)
    assert.ok(noguide.err.join('\n').includes(
      Path.join(root, 'model', 'guide', 'solar-guide.aon')), noguide.err.join('\n'))
  })


  test('run-solar', async () => {
    const root = makeProject()
    const { io, out } = captureIO()

    const code = await runCli([
      'solar',
      '--folder', root,
      '--def', Path.join(root, 'def', SOLAR_DEF),
      '--prefix', SOLAR_PREFIX,
      '--debug', 'warn',
    ], io)

    assert.equal(code, 0, out.join('\n'))
    assert.ok(out[0].startsWith('voxgig-apidef: ok'), out.join('\n'))
    assert.ok(out[0].includes('entities: moon planet'), out.join('\n'))

    const model = Path.join(root, 'model')
    for (const file of [
      'guide/' + SOLAR_PREFIX + 'guide.aon',
      'guide/' + SOLAR_PREFIX + 'base-guide.aon',
      'api/' + SOLAR_PREFIX + 'api-info.aon',
      'entity/' + SOLAR_PREFIX + 'entity-index.aon',
      'entity/' + SOLAR_PREFIX + 'planet.aon',
      'entity/' + SOLAR_PREFIX + 'moon.aon',
      'flow/' + SOLAR_PREFIX + 'flow-index.aon',
    ]) {
      assert.ok(Fs.existsSync(Path.join(model, file)), 'missing ' + file)
    }

    const written = Fs.readdirSync(model, { recursive: true }) as string[]
    assert.deepEqual(written.filter((f) => f.endsWith('.aontu')), [])

    // An explicit --debug, at any level, also writes the resolved definition.
    assert.deepEqual(Fs.readdirSync(Path.join(root, 'def')).sort(),
      [SOLAR_DEF, SOLAR_DEF + '.full.json'])
  })


  // Without --debug the library gets no debug option at all, so the
  // definition folder holds nothing but the definition afterwards.
  test('run-default', async () => {
    const root = makeProject()
    const { io, out } = captureIO()

    const code = await runCli([
      'solar', '-f', root, '-d', Path.join(root, 'def', SOLAR_DEF), '-p', SOLAR_PREFIX,
    ], io)

    assert.equal(code, 0, out.join('\n'))
    assert.deepEqual(Fs.readdirSync(Path.join(root, 'def')), [SOLAR_DEF])
    assert.ok(Fs.existsSync(Path.join(root, 'model', 'entity', SOLAR_PREFIX + 'planet.aon')))
  })


  // A project created before the rename still carries <prefix>guide.aontu;
  // the CLI accepts it and the run leaves the migrated .aon in its place.
  test('run-legacy-guide', async () => {
    const root = makeProject()
    const guidefolder = Path.join(root, 'model', 'guide')
    const guide = Path.join(guidefolder, SOLAR_PREFIX + 'guide.aon')
    const legacy = Path.join(guidefolder, SOLAR_PREFIX + 'guide.aontu')

    Fs.unlinkSync(guide)
    Fs.writeFileSync(legacy, [
      '@"@voxgig/apidef/model/guide.aontu"',
      '@"' + SOLAR_PREFIX + 'base-guide.aontu"',
      '',
    ].join('\n'))

    const { io, out } = captureIO()
    const code = await runCli([
      'solar', '-f', root, '-d', Path.join(root, 'def', SOLAR_DEF),
      '-p', SOLAR_PREFIX, '-g', 'warn',
    ], io)

    assert.equal(code, 0, out.join('\n'))
    assert.ok(Fs.existsSync(guide), 'guide.aon not written by the migration')
    assert.ok(!Fs.existsSync(legacy), 'guide.aontu left behind')
    assert.ok(Fs.existsSync(Path.join(root, 'model', 'entity', SOLAR_PREFIX + 'planet.aon')))
  })


  // The same, for a legacy guide whose sibling include carries the `./`.
  test('run-legacy-guide-dotslash', async () => {
    const root = makeProject()
    const guidefolder = Path.join(root, 'model', 'guide')
    const guide = Path.join(guidefolder, SOLAR_PREFIX + 'guide.aon')
    const legacy = Path.join(guidefolder, SOLAR_PREFIX + 'guide.aontu')

    Fs.unlinkSync(guide)
    Fs.writeFileSync(legacy, [
      '@"@voxgig/apidef/model/guide.aontu"',
      '@"./' + SOLAR_PREFIX + 'base-guide.aontu"',
      '',
    ].join('\n'))

    const { io, out } = captureIO()
    const code = await runCli([
      'solar', '-f', root, '-d', Path.join(root, 'def', SOLAR_DEF),
      '-p', SOLAR_PREFIX, '-g', 'warn',
    ], io)

    assert.equal(code, 0, out.join('\n'))
    assert.ok(!Fs.existsSync(legacy), 'guide.aontu left behind')
    const migrated = Fs.readFileSync(guide, 'utf8')
    assert.ok(migrated.includes('@"./' + SOLAR_PREFIX + 'base-guide.aon"'), migrated)
    assert.ok(!migrated.includes('.aontu'), migrated)
    assert.ok(Fs.existsSync(Path.join(root, 'model', 'entity', SOLAR_PREFIX + 'planet.aon')))
  })

})
