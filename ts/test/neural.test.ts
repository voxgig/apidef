/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe, after } from 'node:test'
import assert from 'node:assert'

import { Pino } from '@voxgig/util'

import { ApiDef } from '../dist/apidef'
import { dense, forward, makeNet, decide, softmax, argmax, explain } from '../dist/guide/nn'
import { NETS } from '../dist/guide/neural01'


const DEFDIR = Path.join(__dirname, '..', 'test', 'def')

const SILENT = Pino({ level: 'silent' })

const staged: string[] = []


function stage(def: string): string {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-neural-'))
  staged.push(dir)
  const folder = Path.join(dir, 'model')
  Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
  Fs.mkdirSync(Path.join(dir, 'def'))
  Fs.copyFileSync(Path.join(DEFDIR, def), Path.join(dir, 'def', def))
  Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'),
    '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n')
  return folder
}


async function run(def: string, strategy: string, why?: boolean) {
  const folder = stage(def)
  const build = await ApiDef.makeBuild({ folder, strategy, why: { show: true === why } })
  const bres = await build({ name: 'neural', def }, {
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
  const basepath = Path.join(folder, 'guide', 'base-guide.aontu')
  const base = Fs.existsSync(basepath) ? Fs.readFileSync(basepath, 'utf8') : ''
  return { bres, base }
}


// Every classification of a guide, keyed by route, in a comparable form.
function routes(guide: any): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [ename, ent] of Object.entries(guide.entity ?? {}) as [string, any][]) {
    for (const [p, gp] of Object.entries(ent.path ?? {}) as [string, any][]) {
      for (const [opname, op] of Object.entries(gp.op ?? {}) as [string, any][]) {
        out[p + ' ' + op.method] = {
          entity: ename,
          op: opname,
          active: ent.active,
          actions: Object.keys(gp.action ?? {}).sort(),
          renames: Object.entries(gp.rename?.param ?? {})
            .map(([k, v]: [string, any]) => k + '->' + (v?.target ?? v)).sort(),
          transform: op.transform,
        }
      }
    }
  }
  return out
}


describe('nn', () => {

  test('dense-rejects-unknown-input', () => {
    assert.throws(() => dense(['a'], { u: { b: 0, w: { nope: 1 } } }, 'relu'),
      /unknown input nope/)
  })


  test('gates', () => {
    const layer = dense(['a', 'b', 'c'], {
      and3: { b: -2, w: { a: 1, b: 1, c: 1 } },
      or2: { b: 0, w: { a: 1, b: 1 } },
      a_not_b: { b: 0, w: { a: 1, b: -1 } },
      not_a: { b: 1, w: { a: -1 } },
    }, 'relu')
    const at = (a: number, b: number, c: number) => forward([layer], [a, b, c])[1]
    assert.deepStrictEqual(at(1, 1, 1), [1, 2, 0, 0])
    assert.deepStrictEqual(at(1, 1, 0), [0, 2, 0, 0])
    assert.deepStrictEqual(at(1, 0, 0), [0, 1, 1, 0])
    assert.deepStrictEqual(at(0, 0, 0), [0, 0, 0, 1])
  })


  test('softmax-argmax', () => {
    const p = softmax([1, 2, 3])
    assert.ok(Math.abs(p.reduce((a, v) => a + v, 0) - 1) < 1e-12)
    assert.ok(p[2] > p[1] && p[1] > p[0])
    assert.strictEqual(argmax([0, 2, 2, 1]), 1)
    assert.strictEqual(argmax([-1]), 0)
  })


  test('decide-explains', () => {
    const net = makeNet(['x', 'y'], {
      both: { b: -1, w: { x: 1, y: 1 } },
      either: { b: 0, w: { x: 1, y: 1 } },
    }, {
      YES: { b: 0, w: { both: 4, either: 1 } },
      NO: { b: 1, w: {} },
    })
    const yes = decide(net, { x: 1, y: 1 })
    assert.strictEqual(yes.cls, 'YES')
    assert.deepStrictEqual(yes.evidence.map((e) => e.unit), ['both', 'either'])
    assert.strictEqual(explain('t', yes), 'nn:t=YES(0.99)[both=4.0,either=2.0]')
    // A tie resolves to the earlier class.
    const tie = decide(net, { x: 1 })
    assert.deepStrictEqual(tie.logits, [1, 1])
    assert.strictEqual(tie.cls, 'YES')
    assert.deepStrictEqual(tie.evidence.map((e) => e.unit), ['either'])
    const no = decide(net, {})
    assert.strictEqual(no.cls, 'NO')
    assert.deepStrictEqual(no.evidence, [])
  })


  // The read-out encodes the heuristic's if/else-if order: a branch's gate
  // beats any number of gates for the branches below it.
  test('name-net-precedence', () => {
    const name = (x: Record<string, number>) => decide(NETS.name, x).cls
    const cmp = { shaped: 1, shape_tp: 1, cmp_avail: 1, cmp_ne_path: 1 }
    assert.strictEqual(name({ ...cmp, cmp_qualifies: 1, cmp_infrequent: 1, cmp_in_path: 1 }), 'CMPQ')
    assert.strictEqual(name({ ...cmp, cmp_infrequent: 1, cmp_in_path: 1 }), 'CMP')
    assert.strictEqual(name({ ...cmp, cmp_infrequent: 1, cmp_shared: 1 }), 'PATH')
    assert.strictEqual(name({ ...cmp, cmp_infrequent: 1, cmp_shared: 1, cmp_in_path: 1 }), 'CMP')
    assert.strictEqual(name({ ...cmp }), 'PATH')

    const tpt = { shaped: 1, shape_tpt: 1, probable: 1 }
    const del = { ...tpt, m_delete: 1, m_write: 1, delcmp_avail: 1 }
    assert.strictEqual(name({ ...del, last_is_cmp: 1, path_has_children: 1 }), 'DELCMP')
    assert.strictEqual(name({ ...tpt, last_is_cmp: 1, path_has_children: 1 }), 'LAST')
    assert.strictEqual(name({ ...tpt, path_has_children: 1 }), 'LAST')
    assert.strictEqual(name(tpt), 'PART')
    assert.strictEqual(name({ shaped: 1, shape_tpt: 1 }), 'ACT')
    assert.strictEqual(name({ shaped: 1, shape_tpt: 1, cmp_avail: 1, cmp_from_tag: 1, same_path_avail: 1 }),
      'SAMEPATH')
    assert.strictEqual(name({ opid_avail: 1, title_avail: 1, seg_avail: 1 }), 'OPID')
    assert.strictEqual(name({}), 'NONE')
  })


  test('strategy-nets-are-well-formed', () => {
    for (const [name, net] of Object.entries(NETS)) {
      assert.strictEqual(net.layers.length, 2, name)
      assert.ok(0 < net.classes.length, name)
      const d = decide(net, {})
      assert.ok(d.logits.every((v) => Number.isFinite(v)), name)
      assert.ok(net.classes.includes(d.cls), name)
    }
  })
})


describe('neural01', () => {

  after(() => {
    for (const dir of staged) {
      Fs.rmSync(dir, { recursive: true, force: true })
    }
  })


  test('guide-solar', async () => {
    const { bres } = await run('solar-1.0.0-openapi-3.0.0-def.yaml', 'neural01')
    assert.strictEqual(bres.ok, true, String(bres.err?.message))
    assert.deepStrictEqual(bres.guide.entity, SOLAR_GUIDE.entity)
    assert.strictEqual(bres.guide.metrics.count.entity, 2)
    assert.strictEqual(bres.guide.metrics.count.path, 6)
    assert.strictEqual(bres.guide.metrics.count.method, 12)
  })


  test('guide-verb-on-parent', async () => {
    const { bres } = await run('verb-def.json', 'neural01')
    assert.strictEqual(bres.ok, true, String(bres.err?.message))
    assert.deepStrictEqual(Object.keys(bres.guide.entity).sort(), ['note', 'thing'])

    const merge = bres.guide.entity.thing.path['/things/{thing_number}/merge']
    assert.ok(null != merge, 'merge path did not join thing')
    assert.deepStrictEqual(Object.keys(merge.action ?? {}), ['merge'])
    assert.deepStrictEqual(Object.keys(merge.op).sort(), ['load', 'update'])
    assert.strictEqual(merge.rename.param.thing_number, 'id')

    const notes = bres.guide.entity.note.path['/things/{thing_number}/notes']
    assert.ok(null != notes, 'nested collection lost')
    assert.ok(null == notes.action || 0 === Object.keys(notes.action).length)
  })


  test('traces-name-the-deciding-units', async () => {
    const { bres, base } = await run('verb-def.json', 'neural01', true)
    assert.strictEqual(bres.ok, true, String(bres.err?.message))
    assert.ok(base.includes('nn:name=PARENT('), base)
    assert.ok(base.includes('[vop='), base)
    assert.ok(base.includes('nn:op=list('), base)
    assert.ok(base.includes('nn:param=ID('), base)
    assert.ok(base.includes('nn:action=LAST('), base)
  })


  test('unknown-strategy-is-refused', async () => {
    const { bres } = await run('verb-def.json', 'neural02')
    assert.strictEqual(bres.ok, false)
    assert.ok(String(bres.err?.message).includes('Unknown guide strategy: neural02'))
  })


  // The whole corpus, route by route, against the canonical heuristic.
  test('agrees-with-heuristic01-on-the-corpus', async () => {
    const defs = Fs.readdirSync(DEFDIR)
      .filter((f) => /-def\.(json|yaml)$/.test(f) && !f.includes('graphql'))
      .sort()
    assert.ok(30 < defs.length, 'corpus: ' + defs.length)

    for (const def of defs) {
      const h = await run(def, 'heuristic01')
      const n = await run(def, 'neural01')
      assert.strictEqual(h.bres.ok, true, def + ': ' + String(h.bres.err?.message))
      assert.strictEqual(n.bres.ok, true, def + ': ' + String(n.bres.err?.message))
      assert.deepStrictEqual(routes(n.bres.guide), routes(h.bres.guide), def)
      assert.deepStrictEqual(
        Object.keys(n.bres.guide.entity).sort(), Object.keys(h.bres.guide.entity).sort(), def)
      assert.deepStrictEqual(n.bres.guide.metrics.count, h.bres.guide.metrics.count, def)
    }
  })
})


const SOLAR_GUIDE = {
  entity: {
    moon: {
      path: {
        '/api/planet/{planet_id}/moon': {
          op: {
            create: { method: 'POST' },
            list: { method: 'GET' }
          }
        },
        '/api/planet/{planet_id}/moon/{moon_id}': {
          rename: { param: { moon_id: 'id' } },
          op: {
            load: { method: 'GET' },
            remove: { method: 'DELETE' },
            update: { method: 'PUT' }
          }
        }
      },
      name: 'moon'
    },
    planet: {
      path: {
        '/api/planet': {
          op: {
            create: { method: 'POST' },
            list: { method: 'GET' }
          }
        },
        '/api/planet/{planet_id}': {
          rename: { param: { planet_id: 'id' } },
          op: {
            load: { method: 'GET' },
            remove: { method: 'DELETE' },
            update: { method: 'PUT' }
          }
        },
        '/api/planet/{planet_id}/forbid': {
          action: { forbid: {} },
          rename: { param: { planet_id: 'id' } },
          op: { create: { method: 'POST' } }
        },
        '/api/planet/{planet_id}/terraform': {
          action: { terraform: {} },
          rename: { param: { planet_id: 'id' } },
          op: { create: { method: 'POST' } }
        }
      },
      name: 'planet'
    }
  },
}
