/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { Pino } from '@voxgig/util'

import { ApiDef } from '../dist/apidef'
import { nearMissText } from '../dist/utility'


const DEF = 'collection-owner-def.json'
const SILENT = Pino({ level: 'silent' })


async function buildIn(dir: string, why: any) {
  const folder = Path.join(dir, 'model')
  Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
  Fs.mkdirSync(Path.join(dir, 'def'))
  Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', DEF), Path.join(dir, 'def', DEF))
  Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'),
    '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n')
  const build = await ApiDef.makeBuild({ folder, strategy: 'heuristic01', why })
  const cwd = process.cwd()
  process.chdir(dir)
  try {
    return await build({ name: 'near-miss', def: DEF }, {
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
  }
  finally {
    process.chdir(cwd)
  }
}


describe('near-miss', () => {

  test('report-written-with-why', async () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-near-miss-'))
    try {
      const bres: any = await buildIn(dir, { show: true })
      assert.ok(bres.ok, String(bres.err?.message))
      const text = Fs.readFileSync(Path.join(dir, 'apidef-near-misses.txt'), 'utf8')
      assert.strictEqual(text, nearMissText(bres.ctx.nearmiss))
      assert.ok(text.split('\n').includes('-2\tGET /teams\tmember\tteam (path, response)'), text)
    }
    finally {
      Fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('report-kept-in-memory-without-why', async () => {
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-near-miss-'))
    try {
      const bres: any = await buildIn(dir, undefined)
      assert.ok(bres.ok, String(bres.err?.message))
      assert.strictEqual(Fs.existsSync(Path.join(dir, 'apidef-near-misses.txt')), false)
      assert.deepStrictEqual(bres.ctx.nearmiss[0], {
        route: 'GET /teams',
        entity: 'member',
        margin: -2,
        support: [],
        alternatives: [{ name: 'team', sources: ['path', 'response'] }],
      })
    }
    finally {
      Fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
