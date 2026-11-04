/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import * as Os from 'node:os'
import * as Path from 'node:path'

import { test, describe, after } from 'node:test'
import assert from 'node:assert'

import { Pino } from '@voxgig/util'

import { ApiDef } from '../dist/apidef'
import {
  dense, forward, makeNet, decide, softmax, argmax, explain, saveNets, loadNets, WEIGHTS_FORMAT,
} from '../dist/guide/nn'
import { parseSafetensors, serializeSafetensors } from '../dist/guide/safetensors'
import { canonize } from '../dist/utility'
import type { SafeTensors } from '../dist/guide/safetensors'
import { guideNets, GUIDE_NETS } from '../dist/guide/neural01'

const { buildGuideWeights } = require('../build/nn-weights.js')

const REPO = Path.resolve(__dirname, '..', '..')

const WEIGHTS = Path.join(__dirname, '..', 'nn', 'guide.safetensors')

const NETS = guideNets()

// The real corpus, found as the Go goldens find it: an apidef-validate
// checkout beside this one, or the v1 folder APIDEF_VALIDATE_DIR names.
const VALIDATE = process.env.APIDEF_VALIDATE_DIR ?? Path.join(REPO, '..', 'apidef-validate', 'v1')
const VALIDATE_DEFS = Path.join(VALIDATE, '..', 'def')
const validateDefs = Fs.existsSync(VALIDATE_DEFS) ? Fs.readdirSync(VALIDATE_DEFS)
  .filter((f) => /\.(json|yaml)$/.test(f) && !f.endsWith('.full.json') && !f.includes('graphql'))
  .sort() : []

// The manual corpus, metsitaba/api-entity-corpus, checked out beside this one
// or named by API_ENTITY_CORPUS_DIR: each operation the analysts put on a
// resource, embedded or command entity, scored by whether the guide's entity
// shares that entity's name. Virtual and protocol entities are the analysts'
// readings of content the guide never names from, and are left out.
const CORPUS = process.env.API_ENTITY_CORPUS_DIR ?? Path.join(REPO, '..', 'api-entity-corpus')
const CORPUS_BATCH = Path.join(CORPUS, 'batches', 'batch-01')
const CORPUS_MANIFEST = Path.join(CORPUS_BATCH, 'manifest.json')
const corpusApis: any[] = Fs.existsSync(CORPUS_MANIFEST) ?
  JSON.parse(Fs.readFileSync(CORPUS_MANIFEST, 'utf8')).apis : []

// The share of routes on which the guide's entity shares the analysts' name,
// as a run of whole words (contact for student_contact), that a change may
// not fall below.
const CORPUS_FLOOR = 0.65

const CORPUS_KINDS = ['resource', 'embedded', 'command']


function sharesName(a: string, b: string): boolean {
  const wa = a.split('_').filter(Boolean)
  const wb = b.split('_').filter(Boolean)
  const [s, l] = wa.length <= wb.length ? [wa, wb] : [wb, wa]
  for (let i = 0; 0 < s.length && i + s.length <= l.length; i++) {
    if (s.every((w, j) => w === l[i + j])) {
      return true
    }
  }
  return false
}


const DEFDIR = Path.join(__dirname, '..', 'test', 'def')

const SILENT = Pino({ level: 'silent' })

const staged: string[] = []


function stage(def: string, srcdir: string = DEFDIR): string {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-neural-'))
  staged.push(dir)
  const folder = Path.join(dir, 'model')
  Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
  Fs.mkdirSync(Path.join(dir, 'def'))
  Fs.copyFileSync(Path.join(srcdir, def), Path.join(dir, 'def', def))
  Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'),
    '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n')
  return folder
}


async function run(def: string, strategy: string, why?: boolean, srcdir?: string) {
  const folder = stage(def, srcdir)
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


// A file from a header object and raw tensor bytes, as a tool would write it.
function file(header: any, data: number[]): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(header))
  const out = new Uint8Array(8 + json.length + data.length)
  new DataView(out.buffer).setBigUint64(0, BigInt(json.length), true)
  out.set(json, 8)
  out.set(data, 8 + json.length)
  return out
}


describe('safetensors', () => {

  test('round-trip', () => {
    const st: SafeTensors = {
      metadata: { format: 'test/1', names: '["a","b"]' },
      tensors: {
        w: { dtype: 'F32', shape: [2, 3], data: [1, -2, 0.5, 0, 3, -0.25] },
        b: { dtype: 'F64', shape: [2], data: [0.1, -7] },
        i: { dtype: 'I64', shape: [3], data: [1, -2, 3] },
        c: { dtype: 'I32', shape: [2], data: [2147483647, -5] },
        s: { dtype: 'I16', shape: [1], data: [-300] },
        y: { dtype: 'I8', shape: [2], data: [-1, 127] },
        u: { dtype: 'U8', shape: [1], data: [200] },
        k: { dtype: 'BOOL', shape: [2], data: [1, 0] },
        e: { dtype: 'F32', shape: [0], data: [] },
      },
    }
    const bytes = serializeSafetensors(st)
    const hlen = Number(new DataView(bytes.buffer).getBigUint64(0, true))
    assert.strictEqual(hlen % 8, 0)
    assert.deepStrictEqual(parseSafetensors(bytes), st)
    assert.deepStrictEqual(serializeSafetensors(parseSafetensors(bytes)), bytes)
    assert.deepStrictEqual(parseSafetensors(serializeSafetensors({ metadata: {}, tensors: {} })),
      { metadata: {}, tensors: {} })
  })


  test('half-precision-reads', () => {
    const bytes = file({
      h: { dtype: 'F16', shape: [4], data_offsets: [0, 8] },
      g: { dtype: 'BF16', shape: [2], data_offsets: [8, 12] },
    }, [0x00, 0x3c, 0x00, 0xc1, 0x00, 0x38, 0x01, 0x00, 0x80, 0x3f, 0x00, 0xc0])
    const st = parseSafetensors(bytes)
    assert.deepStrictEqual(st.tensors.h.data, [1, -2.5, 0.5, 2 ** -24])
    assert.deepStrictEqual(st.tensors.g.data, [1, -2])
  })


  test('rejects-malformed', () => {
    const one = { dtype: 'F32', shape: [1], data_offsets: [0, 4] }
    const four = [0, 0, 0x80, 0x3f]
    assert.throws(() => parseSafetensors(new Uint8Array(4)), /shorter/)
    assert.throws(() => parseSafetensors(file({ a: one }, [])), /range exceeds the file/)
    assert.throws(() => parseSafetensors(file({ a: one }, four).subarray(0, 9)),
      /header length \d+ exceeds the file/)
    assert.throws(() => parseSafetensors(file({ a: { ...one, dtype: 'F128' } }, four)), /unknown dtype/)
    assert.throws(() => parseSafetensors(file({ a: { ...one, shape: [-1] } }, four)), /invalid shape/)
    assert.throws(() => parseSafetensors(file({ a: { ...one, data_offsets: [4, 0] } }, four)),
      /invalid data offsets/)
    assert.throws(() => parseSafetensors(file({ a: one, b: { ...one, data_offsets: [8, 12] } },
      [...four, ...four, ...four])), /does not follow/)
    assert.throws(() => parseSafetensors(file({ a: { ...one, shape: [2] } }, four)),
      /does not match its shape/)
    assert.throws(() => parseSafetensors(file({ a: one }, [...four, 0])), /do not fill/)
    assert.throws(() => parseSafetensors(file({ __metadata__: { n: 1 }, a: one }, four)),
      /not a string/)
    assert.throws(() => parseSafetensors(file([1], [])), /not an object/)
    assert.throws(() => serializeSafetensors({ metadata: {}, tensors: {
      a: { dtype: 'F32', shape: [2], data: [1] } } }), /1 values for shape/)
    assert.throws(() => serializeSafetensors({ metadata: {}, tensors: {
      a: { dtype: 'F16', shape: [1], data: [1] } } }), /not supported/)
  })
})


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

    const view = { view_key: 1, tail_singular: 1, route_not_extended: 1, view_parent_avail: 1 }
    assert.strictEqual(name(view), 'PARENT')
    assert.strictEqual(name({ ...view, res_record: 1 }), 'NONE')
    assert.strictEqual(name({ ...view, res_record: 1, res_scalars: 1 }), 'PARENT')
    assert.strictEqual(name({ ...view, m_write: 1 }), 'NONE')
    assert.strictEqual(name({ ...view, ...tpt, record_avail: 1, cmp_avail: 1, cmp_ne_path: 1,
      cmp_infrequent: 1 }), 'PARENT')

    const rec = {
      shaped: 1, shape_tp: 1, record_avail: 1, cmp_avail: 1, cmp_ne_path: 1, cmp_infrequent: 1,
      cmp_in_path: 1,
    }
    assert.strictEqual(name(rec), 'REC')
    assert.strictEqual(name({ ...rec, cmp_differs: 1, cmp_names_key: 1 }), 'CMP')
    assert.strictEqual(name({ ...rec, twin_cmd_avail: 1 }), 'TWIN')
    assert.strictEqual(name({ ...rec, record_avail: 0, record_wraps: 1 }), 'PATH')
    assert.strictEqual(name({ ...tpt, record_avail: 1, last_is_cmp: 1, path_has_children: 1 }), 'REC')
    assert.strictEqual(name({ param_avail: 1, opid_avail: 1, title_avail: 1 }), 'PARAM')

    const post = { shaped: 1, shape_t: 1, m_post: 1, m_write: 1, lit_last: 1, last_lit_singular: 1 }
    const command = { ...post, body_cmp_avail: 1, cmp_avail: 1, cmp_ne_path: 1, cmp_infrequent: 1 }
    assert.strictEqual(name(command), 'BODY')
    assert.strictEqual(name({ ...command, cmp_in_path: 1 }), 'BODY')
    assert.strictEqual(name({ ...command, last_is_cmp: 1 }), 'CMP')
    assert.strictEqual(name({ ...command, verbish: 1 }), 'CMP')
    assert.strictEqual(name({ ...command, item_beneath: 1 }), 'CMP')
    assert.strictEqual(name({ ...command, item_route_exists: 1 }), 'CMP')
    assert.strictEqual(name({ ...command, same_path_record: 1 }), 'CMP')
    assert.strictEqual(name({ ...command, post_read: 1, read_noun_avail: 1 }), 'NOUN')
    assert.strictEqual(name({ ...command, post_read: 1 }), 'CMP')
    assert.strictEqual(name({ ...post, post_read: 1, read_noun_avail: 1, cmp_avail: 1, cmp_ne_path: 1,
      cmp_qualifies: 1 }), 'NOUN')

    const op = (x: Record<string, number>) => decide(NETS.op, x).cls
    assert.strictEqual(op({ m_get: 1, res_array: 1 }), 'list')
    assert.strictEqual(op({ m_get: 1, res_array: 1, view: 1 }), 'load')
    assert.strictEqual(op({ m_get: 1, res_array_prop: 1, view: 1 }), 'load')
    assert.strictEqual(op({ m_post: 1 }), 'create')
    assert.strictEqual(op({ m_post: 1, post_read: 1 }), 'list')
  })


  test('nets-round-trip', () => {
    const nets = {
      tiny: makeNet(['x', 'y'], {
        both: { b: -1, w: { x: 1, y: 1 } },
        either: { b: 0, w: { x: 1, y: 1 } },
      }, {
        YES: { b: 0, w: { both: 4, either: 1 } },
        NO: { b: 1, w: {} },
      }),
    }
    const back = loadNets(saveNets(nets))
    assert.deepStrictEqual(back, nets)
    assert.strictEqual(decide(back.tiny, { x: 1, y: 1 }).cls, 'YES')

    assert.throws(() => loadNets(serializeSafetensors({ metadata: { format: 'other/1' }, tensors: {} })),
      /format is other\/1/)
    assert.throws(() => loadNets(serializeSafetensors({ metadata: {
      format: WEIGHTS_FORMAT, nets: '["t"]', 't.features': '["x"]', 't.hidden': '["h"]',
      't.classes': '["A"]', 't.activation': 'relu',
    }, tensors: {} })), /lack tensor t.hidden/)
  })


  // The shipped file is what the authored tables write, byte for byte.
  test('guide-weights-match-authored-tables', () => {
    assert.strictEqual(
      Buffer.compare(Fs.readFileSync(WEIGHTS), Buffer.from(buildGuideWeights())), 0,
      'nn/guide.safetensors differs from ts/build/nn-weights.js (run: make nn)')
  })


  // nn/ is canonical; ts/nn/ ships in the npm package and go/nn/ is embedded
  // in the Go module. Checked here so CI holds it, as it does for the model.
  test('guide-weights-mirrors', () => {
    const canonical = Fs.readFileSync(Path.join(REPO, 'nn', 'guide.safetensors'))
    for (const root of ['ts', 'go']) {
      const mirror = Fs.readFileSync(Path.join(REPO, root, 'nn', 'guide.safetensors'))
      assert.strictEqual(Buffer.compare(canonical, mirror), 0,
        root + '/nn/guide.safetensors drifted from nn/guide.safetensors (run: make sync-nn)')
    }
  })


  test('guide-weights-file', () => {
    const st = parseSafetensors(Fs.readFileSync(WEIGHTS))
    assert.strictEqual(st.metadata.format, WEIGHTS_FORMAT)
    assert.deepStrictEqual(JSON.parse(st.metadata.nets), GUIDE_NETS)
    for (const [name, tensor] of Object.entries(st.tensors)) {
      assert.strictEqual(tensor.dtype, 'F32', name)
      assert.ok(tensor.data.every((v) => Number.isInteger(2 * v)), name)
    }
    assert.deepStrictEqual(st.tensors['name.hidden.weight'].shape,
      [NETS.name.layers[0].outputs.length, NETS.name.features.length])
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


  async function assertParity(def: string, srcdir?: string) {
    const h = await run(def, 'heuristic01', false, srcdir)
    const n = await run(def, 'neural01', false, srcdir)
    assert.strictEqual(h.bres.ok, true, def + ': ' + String(h.bres.err?.message))
    assert.strictEqual(n.bres.ok, true, def + ': ' + String(n.bres.err?.message))
    assert.deepStrictEqual(routes(n.bres.guide), routes(h.bres.guide), def)
    assert.deepStrictEqual(
      Object.keys(n.bres.guide.entity).sort(), Object.keys(h.bres.guide.entity).sort(), def)
    assert.deepStrictEqual(n.bres.guide.metrics.count, h.bres.guide.metrics.count, def)
  }


  // The whole corpus, route by route, against the canonical heuristic.
  test('agrees-with-heuristic01-on-the-corpus', async () => {
    const defs = Fs.readdirSync(DEFDIR)
      .filter((f) => /-def\.(json|yaml)$/.test(f) && !f.includes('graphql'))
      .sort()
    assert.ok(30 < defs.length, 'corpus: ' + defs.length)
    for (const def of defs) {
      await assertParity(def)
    }
  })


  test('scores-against-api-entity-corpus', {
    skip: 0 === corpusApis.length ? 'no api-entity-corpus manifest at ' + CORPUS_MANIFEST : false,
  }, async (t) => {
    let scored = 0
    let agreed = 0
    for (const api of corpusApis) {
      const doc = JSON.parse(Fs.readFileSync(Path.join(CORPUS_BATCH, api.entitiesFile), 'utf8'))
      const { bres } = await run(Path.basename(api.specFile), 'neural01', false,
        Path.join(CORPUS_BATCH, Path.dirname(api.specFile)))
      assert.strictEqual(bres.ok, true, api.name + ': ' + String(bres.err?.message))
      // A route the analysts put on several entities agrees through any of them.
      const named: Record<string, string[]> = {}
      for (const ent of doc.entities ?? []) {
        if (!CORPUS_KINDS.includes(ent.kind)) {
          continue
        }
        for (const op of ent.operations ?? []) {
          const key = op.path + ' ' + String(op.method).toUpperCase()
          ;(named[key] = named[key] ?? []).push(canonize(ent.name))
        }
      }
      const got = routes(bres.guide)
      for (const [key, names] of Object.entries(named)) {
        if (null == got[key]) {
          continue
        }
        scored++
        agreed += names.some((name) => sharesName(name, got[key].entity)) ? 1 : 0
      }
    }
    const rate = agreed / Math.max(1, scored)
    t.diagnostic('api-entity-corpus: ' + agreed + ' of ' + scored + ' routes share the analysts\' ' +
      'entity name (' + (100 * rate).toFixed(1) + '%)')
    assert.ok(CORPUS_FLOOR <= rate, 'api-entity-corpus agreement ' + (100 * rate).toFixed(1) +
      '% is below the floor of ' + (100 * CORPUS_FLOOR) + '%')
  })


  test('agrees-with-heuristic01-on-apidef-validate', {
    skip: 0 === validateDefs.length ? 'no apidef-validate definitions at ' + VALIDATE_DEFS : false,
  }, async () => {
    for (const def of validateDefs) {
      await assertParity(def, VALIDATE_DEFS)
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
