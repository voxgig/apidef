/* Copyright (c) 2024-2026 Voxgig, MIT License */

// The command-line tool. `bin/voxgig-apidef` and the standalone executable
// entry points are shims over `main`, so the option handling and the project
// layout live in one place and under test.

import * as Fs from 'node:fs'
import Path from 'node:path'
import { parseArgs } from 'node:util'

import { Shape, Fault } from 'shape'

import { ApiDef } from './apidef'


const Pkg = require('../package.json')

const GUIDE_FILE = 'guide.aon'
const LEGACY_GUIDE_FILE = 'guide.aontu'
const BASE_GUIDE_FILE = 'base-guide.aon'

const WATCH_INTERVAL_MS = 500


type CliOptions = {
  name: string
  folder: string
  def: string
  prefix?: string
  watch: boolean
  debug?: string
  help: boolean
  version: boolean
}


type CliProject = {
  root: string
  folder: string
  outprefix: string
  def: string
  model: { name: string, def: string }
  guide: string
  legacyguide: string
}


type CliIO = {
  log: (...args: any[]) => void
  error: (...args: any[]) => void
}


const CONSOLE_IO: CliIO = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
}


function usage(): string {
  return [
    'Usage: voxgig-apidef <name> [options]',
    '',
    'Build the API model for project <name> from an OpenAPI, Swagger or',
    'GraphQL definition file.',
    '',
    'Options:',
    '  -f, --folder <dir>    project folder (default: <name>)',
    '  -d, --def <file>      the API definition file (required)',
    '  -p, --prefix <text>   prefix for generated file names (default: <name>-)',
    '  -w, --watch           rebuild when the definition file changes',
    '  -g, --debug <level>   log level (debug, info, warn, error); also writes',
    '                        the resolved definition as <def>.full.json',
    '  -h, --help            print this help and exit',
    '  -v, --version         print the package version and exit',
    '',
    'The model is written to <folder>/model, which must already hold the guide',
    'entry file <folder>/model/guide/<prefix>' + GUIDE_FILE + ':',
    '',
    '  @"@voxgig/apidef/model/' + GUIDE_FILE + '"',
    '  @"./<prefix>' + BASE_GUIDE_FILE + '"',
  ].join('\n')
}


function resolveOptions(argv: string[]): CliOptions {
  const args = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      folder: { type: 'string', short: 'f', default: '' },
      def: { type: 'string', short: 'd', default: '' },
      prefix: { type: 'string', short: 'p' },
      watch: { type: 'boolean', short: 'w' },
      debug: { type: 'string', short: 'g' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    }
  })

  const name = args.positionals[0]

  return {
    name,
    folder: '' === args.values.folder ? name : args.values.folder,
    def: args.values.def,
    prefix: args.values.prefix,
    watch: !!args.values.watch,
    debug: args.values.debug,
    help: !!args.values.help,
    version: !!args.values.version,
  }
}


function validateOptions(rawOptions: CliOptions): CliOptions {
  const optShape = Shape({
    name: Fault('The first argument should be the project name.', String),
    folder: String,
    def: Fault('A definition file is required: --def <file>.', String),
    watch: Boolean,
    help: Boolean,
    version: Boolean,
  })

  // An absent prefix defaults to <name>- later, an empty one is a valid
  // choice, and an absent debug leaves the library its own default; the
  // shape rejects all three, so they are validated by hand.
  const { prefix, debug, ...shaped } = rawOptions
  if (null != prefix && 'string' !== typeof prefix) {
    throw new Error('The prefix should be a string.')
  }
  if (null != debug && 'string' !== typeof debug) {
    throw new Error('The debug level should be a string.')
  }

  const err: any[] = []
  const options: CliOptions = optShape(shaped, { err })

  if (err[0]) {
    throw new Error(err[0].text)
  }

  options.prefix = prefix
  options.debug = debug

  options.def = Path.resolve(options.def)
  const stat = Fs.statSync(options.def, { throwIfNoEntry: false })
  if (null == stat) {
    throw new Error('Definition file not found: ' + options.def)
  }

  return options
}


// The pipeline reads the definition at <base>/../def/<model.def> and writes
// under the output folder; both are <root>/model here, so a definition kept
// anywhere is named relative to <root>/def.
function resolveProject(options: CliOptions): CliProject {
  const root = Path.resolve(options.folder)
  const folder = Path.join(root, 'model')
  const outprefix = null == options.prefix ? options.name + '-' : options.prefix
  const def = Path.resolve(options.def)
  const guidefolder = Path.join(folder, 'guide')

  return {
    root,
    folder,
    outprefix,
    def,
    model: {
      name: options.name,
      def: Path.relative(Path.join(folder, '..', 'def'), def),
    },
    guide: Path.join(guidefolder, outprefix + GUIDE_FILE),
    legacyguide: Path.join(guidefolder, outprefix + LEGACY_GUIDE_FILE),
  }
}


// A legacy `.aontu` guide is accepted here because the guide stage migrates
// it to `.aon` before reading it.
function checkProject(project: CliProject): void {
  if (Fs.existsSync(project.guide) || Fs.existsSync(project.legacyguide)) {
    return
  }

  throw new Error(
    'Guide entry file not found: ' + project.guide + '\n' +
    'Create it with these two lines:\n' +
    '  @"@voxgig/apidef/model/' + GUIDE_FILE + '"\n' +
    '  @"./' + project.outprefix + BASE_GUIDE_FILE + '"')
}


async function runBuild(project: CliProject, options: CliOptions): Promise<any> {
  const build = await ApiDef.makeBuild({
    folder: project.folder,
    outprefix: project.outprefix,
    debug: options.debug,
  })

  return await build(project.model, { spec: { base: project.folder } }, {})
}


function report(result: any, project: CliProject, io: CliIO): void {
  if (result.ok) {
    const entities = Object.keys(result.apimodel?.main?.kit?.entity || {})
    io.log('voxgig-apidef: ok' +
      '  model: ' + project.folder +
      '  entities: ' + (0 < entities.length ? entities.join(' ') : 'none'))
  }
  else {
    const last = result.steps?.[result.steps.length - 1] || 'start'
    io.log('voxgig-apidef: failed after step ' + last + ': ' +
      (result.err?.message || 'unknown error'))
  }
}


function watchDef(project: CliProject, rebuild: () => Promise<void>, io: CliIO): Promise<never> {
  return new Promise(() => {
    let running = false
    let pending = false

    const run = async () => {
      if (running) {
        pending = true
        return
      }
      running = true
      try {
        await rebuild()
      }
      finally {
        running = false
        if (pending) {
          pending = false
          await run()
        }
      }
    }

    Fs.watchFile(project.def, { interval: WATCH_INTERVAL_MS }, () => { run() })
    io.log('voxgig-apidef: watching ' + project.def)
  })
}


async function runCli(argv: string[], io: CliIO = CONSOLE_IO): Promise<number> {
  try {
    let options = resolveOptions(argv)

    if (options.version) {
      io.log(Pkg.version)
      return 0
    }

    if (options.help) {
      io.log(usage())
      return 0
    }

    options = validateOptions(options)

    const project = resolveProject(options)
    checkProject(project)

    const result = await runBuild(project, options)
    report(result, project, io)

    if (options.watch) {
      await watchDef(project, async () => {
        report(await runBuild(project, options), project, io)
      }, io)
    }

    return result.ok ? 0 : 1
  }
  catch (err: any) {
    io.error('Voxgig API Definition Error:')
    io.error(err?.message || err)
    return 1
  }
}


function main(): void {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}


export {
  main,
  runCli,
  resolveOptions,
  validateOptions,
  resolveProject,
  checkProject,
  usage,
}

export type {
  CliOptions,
  CliProject,
  CliIO,
}
