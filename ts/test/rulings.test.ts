/* Copyright (c) 2026 Voxgig Ltd, MIT License */

// The rulings on the manual corpus: each fixture shows one, and both
// strategies must classify it the same way.

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe, after } from 'node:test'
import assert from 'node:assert'

import { Pino } from '@voxgig/util'

import { ApiDef } from '../dist/apidef'


const DEFDIR = Path.join(__dirname, '..', 'test', 'def')

const SILENT = Pino({ level: 'silent' })

const staged: string[] = []


async function guide(def: string, strategy: string): Promise<any> {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-rulings-'))
  staged.push(dir)
  const folder = Path.join(dir, 'model')
  Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
  Fs.mkdirSync(Path.join(dir, 'def'))
  Fs.copyFileSync(Path.join(DEFDIR, def), Path.join(dir, 'def', def))
  Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'),
    '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n')
  const build = await ApiDef.makeBuild({ folder, strategy })
  const bres = await build({ name: 'rulings', def }, {
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
  return bres.guide
}


// The entity and operation of each route, keyed `METHOD path`.
function owners(g: any): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [ename, ent] of Object.entries(g.entity) as [string, any][]) {
    for (const [p, gp] of Object.entries(ent.path ?? {}) as [string, any][]) {
      for (const [opname, op] of Object.entries(gp.op ?? {}) as [string, any][]) {
        const actions = Object.keys(gp.action ?? {}).sort()
        out[op.method + ' ' + p] = ename + ' ' + opname + (0 < actions.length ? ' ' + actions.join(',') : '')
      }
    }
  }
  return out
}


const RULINGS: { def: string, expect: Record<string, string> }[] = [
  {
    def: 'tag-noun-def.json',
    expect: {
      'GET /folders/': 'folder list',
      'POST /folders/': 'folder create',
      'GET /folders/{folder_id}': 'folder load',
      'DELETE /folders/{folder_id}': 'folder remove',
      'GET /reference-data/locations/pois/{poisId}': 'poi load',
      'GET /{id}': 'thing load',
    },
  },
  {
    def: 'wrapper-cmp-def.json',
    expect: {
      'GET /templates': 'template list',
      'POST /templates': 'template create',
      'GET /templates/{id}': 'template load',
      'DELETE /templates/{id}': 'template remove',
      'GET /templates/{id}/file': 'template_file load',
    },
  },
  {
    def: 'key-param-def.json',
    expect: {
      'GET /b': 'bucket list',
      'POST /b': 'bucket create',
      'GET /b/{bucket}': 'bucket load',
      'PATCH /b/{bucket}': 'bucket patch',
      'DELETE /b/{bucket}': 'bucket remove',
      'GET /b/{bucket}/o': 'object list',
      'GET /b/{bucket}/o/{object}': 'object load',
    },
  },
  {
    def: 'placeholder-ext-def.json',
    expect: {
      'GET /lists.{format}': 'list list',
      'GET /lists/names.{format}': 'name list',
      'GET /reviews.{format}': 'review list',
    },
  },
]


describe('rulings', () => {

  after(() => {
    for (const dir of staged) {
      Fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  for (const ruling of RULINGS) {
    for (const strategy of ['heuristic01', 'neural01']) {
      test(ruling.def + ' under ' + strategy, async () => {
        const got = owners(await guide(ruling.def, strategy))
        for (const [route, expect] of Object.entries(ruling.expect)) {
          assert.strictEqual(got[route], expect, route)
        }
      })
    }
  }
})
