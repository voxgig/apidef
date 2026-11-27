/* Copyright (c) 2026 Voxgig Ltd, MIT License */

// Every route of every OpenAPI test definition, as the shared table
// test/def-routes.tsv records it. The Go suite reads the same table.
// Running make def-routes rewrites it from this port.

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe, after } from 'node:test'
import assert from 'node:assert'

import { Pino } from '@voxgig/util'

import { ApiDef } from '../dist/apidef'
import { activeActions } from '../dist/utility'


const DEFDIR = Path.join(__dirname, '..', 'test', 'def')
const TABLE = Path.join(__dirname, '..', '..', 'test', 'def-routes.tsv')
const COLUMNS = ['def', 'route', 'entity', 'active', 'op', 'actions', 'renames', 'transform',
  'nearmiss']
const UPDATE = '1' === process.env.UPDATE_DEF_ROUTES

const SILENT = Pino({ level: 'silent' })

const staged: string[] = []
const written: Record<string, string[][]> = {}


function definitions(): string[] {
  return Fs.readdirSync(DEFDIR)
    .filter((name) => /\.(json|ya?ml)$/.test(name) && !name.includes('.graphql.'))
    .sort()
}


function readTable(): Record<string, Record<string, string>> {
  const table: Record<string, Record<string, string>> = {}
  if (!Fs.existsSync(TABLE)) {
    return table
  }
  const lines = Fs.readFileSync(TABLE, 'utf8').split('\n').filter((line) => '' !== line)
  for (const line of lines.slice(1)) {
    const cols = line.split('\t')
    table[cols[0]] = table[cols[0]] ?? {}
    table[cols[0]][cols[1]] = cols.slice(2).join('\t')
  }
  return table
}


function canonical(val: any): any {
  if (Array.isArray(val)) {
    return val.map(canonical)
  }
  if (null == val || 'object' !== typeof val) {
    return val
  }
  const out: Record<string, any> = {}
  for (const key of Object.keys(val).sort()) {
    if (null != val[key]) {
      out[key] = canonical(val[key])
    }
  }
  return out
}


async function routes(def: string): Promise<string[][]> {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-def-routes-'))
  staged.push(dir)
  const folder = Path.join(dir, 'model')
  Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
  Fs.mkdirSync(Path.join(dir, 'def'))
  Fs.copyFileSync(Path.join(DEFDIR, def), Path.join(dir, 'def', def))
  Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'),
    '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n')
  const build = await ApiDef.makeBuild({ folder, strategy: 'heuristic01' })
  const bres = await build({ name: 'routes', def }, {
    log: SILENT,
    spec: {
      base: folder,
      buildargs: {
        apidef: {
          ctrl: {
            step: {
              parse: true, guide: true, transformers: false, builders: false, generate: false,
            }
          }
        }
      }
    }
  }, {})
  assert.strictEqual(bres.ok, true, def + ': ' + String(bres.err?.message))

  const near: Record<string, string> = {}
  for (const miss of bres.ctx.nearmiss ?? []) {
    near[miss.route] = [String(miss.margin), miss.support.join('+'),
      miss.alternatives.map((alt: any) => alt.name + '<' + alt.sources.join('+')).join(' ')].join('/')
  }

  const rows: string[][] = []
  for (const [ename, ent] of Object.entries(bres.guide.entity ?? {}) as [string, any][]) {
    for (const [path, gp] of Object.entries(ent.path ?? {}) as [string, any][]) {
      const actions = Object.keys(activeActions(gp.action)).sort().join(',')
      const renames = Object.entries(gp.rename?.param ?? {})
        .map(([from, to]: [string, any]) => from + '->' + (to?.target ?? to))
        .sort().join(',')
      for (const [opname, op] of Object.entries(gp.op ?? {}) as [string, any][]) {
        const transform = canonical(op.transform ?? {})
        rows.push([def, op.method + ' ' + path, ename, false === ent.active ? 'false' : 'true',
          opname, actions, renames, 0 === Object.keys(transform).length ? '' : JSON.stringify(transform),
          near[op.method + ' ' + path] ?? ''])
      }
    }
  }
  return rows.sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)
}


describe('def-routes', () => {
  const table = readTable()

  after(() => {
    for (const dir of staged) {
      Fs.rmSync(dir, { recursive: true, force: true })
    }
    if (UPDATE) {
      const lines = [COLUMNS.join('\t')]
      for (const def of Object.keys(written).sort()) {
        lines.push(...written[def].map((row) => row.join('\t')))
      }
      Fs.writeFileSync(TABLE, lines.join('\n') + '\n')
    }
  })

  test('the table names only test definitions', { skip: UPDATE }, () => {
    const extra = Object.keys(table).filter((def) => !definitions().includes(def))
    assert.deepStrictEqual(extra, [], 'rows for definitions that are gone: make def-routes')
  })

  for (const def of definitions()) {
    test(def, async () => {
      const rows = await routes(def)
      if (UPDATE) {
        written[def] = rows
        return
      }
      const got = Object.fromEntries(rows.map((row) => [row[1], row.slice(2).join('\t')]))
      assert.deepStrictEqual(got, table[def] ?? {},
        def + ' reads differently from test/def-routes.tsv; if the change is meant,' +
        ' run make def-routes and make the Go port read it the same')
    })
  }
})
