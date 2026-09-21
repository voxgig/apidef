/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */

// The shared aontu model is canonical at top-level model/ and mirrored into
// ts/model/ (for npm) and go/model/ (for the Go module) — see AGENTS.md.
// Each packaging system can only ship files under its own root, so the copies
// are physically duplicated. This test fails if they drift; run
// `make sync-model` to re-sync from the canonical model/.

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { readFileSync } from 'node:fs'
import Path from 'node:path'
import { Aontu } from 'aontu'
import type { ModelEntityFlowStep } from '../src/model'


const REPO = Path.resolve(__dirname, '..', '..')
const MODEL_FILES = ['apidef.aon', 'guide.aon']


describe('model-mirror', () => {

  test('alias keys preserve the explicit declaration schema', () => {
    const source = readFileSync(Path.join(REPO, 'model', 'apidef.aon'), 'utf8')
    const explicit = source.replace(/^(\s*)%([\w-]+):/gm, '$1$2: %$2 =')
    assert.notStrictEqual(source, explicit)
    assert.strictEqual(new Aontu().unify(source, { path: 'model-schema.aon' }).canon,
      new Aontu().unify(explicit, { path: 'model-schema.aon' }).canon)
  })


  test('flow-step alias supplies defaults and preserves disabled steps and payload keys', () => {
    const step: ModelEntityFlowStep = {
      o: 'update', a: false,
      m: { op: 'payload', active: false }, d: { input: 'payload' },
      i: { ref: 'widget01' },
      s: [{ apply: 'TextFieldMark', def: { mark: 'mark01' } }],
      v: [{ apply: 'ItemExists', def: { ref: 'widget01' } }],
    }
    const source = readFileSync(Path.join(REPO, 'model', 'apidef.aon'), 'utf8') + '\n' +
      'main:kit:flow:BasicWidgetFlow:' + JSON.stringify({ step: [{ o: 'list' }, step] })
    const model = new Aontu().generate(source)
    assert.deepStrictEqual(model.main.kit.flow.BasicWidgetFlow.step, [
      { a: true, o: 'list', m: {}, d: {}, i: {}, s: [], v: [] }, step,
    ])
  })


  test('op-points and point-args aliases apply compact keys and defaults', () => {
    const point = {
      m: 'GET', o: '/widgets/{id}', s: [{ var: 'id' }],
      g: {
        params: [{ n: 'id', or: 'widget_id', r: true, t: '`$STRING`' }],
        query: [{ n: 'limit', r: false, t: '`$NUMBER`', ex: 0, a: false }],
        header: [{ n: 'trace', r: false, t: '`$STRING`' }],
        cookie: [{ n: 'session', r: false, t: '`$STRING`' }],
      },
      q: { exist: ['id'] }, r: { param: { widget_id: 'id' } },
      t: { req: '`reqdata`', res: '`body`' },
      co: { version: 2, id: 'GET /widgets/{id}', source: 'openapi3' }, li: false,
    }
    const source = readFileSync(Path.join(REPO, 'model', 'apidef.aon'), 'utf8') + '\n' +
      'main:kit:entity:widget:op:load:' + JSON.stringify({ name: 'load', points: [point] })
    const model = new Aontu().generate(source)
    const result = model.main.kit.entity.widget.op.load.points[0]
    assert.deepStrictEqual(result, {
      ...point, a: true, k: 'http',
      g: Object.fromEntries(Object.entries(point.g).map(([kind, args]) =>
        [kind, args.map(arg => ({ a: true, ...arg, k: kind === 'params' ? 'param' : kind }))])),
    })
  })

  test('entity-field alias uses compact keys and defaults activation', () => {
    const fields = {
      id: { n: 'id', h: 'Id', r: true, t: '`$STRING`' },
      secret: { n: 'secret', h: 'Secret', r: false, t: '`$STRING`', a: false,
        sh: 'A secret.', ro: true, wo: true, de: true, fo: 'password' },
    }
    const source = readFileSync(Path.join(REPO, 'model', 'apidef.aon'), 'utf8') + '\n' +
      'main:kit:entity:widget:fields:' + JSON.stringify(fields)
    const model = new Aontu().generate(source)
    assert.deepStrictEqual(model.main.kit.entity.widget.fields,
      { id: { ...fields.id, a: true }, secret: fields.secret })
  })

  for (const file of MODEL_FILES) {
    test(`ts/model/${file} matches canonical model/${file}`, () => {
      const canonical = readFileSync(Path.join(REPO, 'model', file), 'utf8')
      const tsMirror = readFileSync(Path.join(REPO, 'ts', 'model', file), 'utf8')
      assert.strictEqual(
        tsMirror, canonical,
        `ts/model/${file} drifted from model/${file} — run: make sync-model`)
    })

    test(`go/model/${file} matches canonical model/${file}`, () => {
      const canonical = readFileSync(Path.join(REPO, 'model', file), 'utf8')
      const goMirror = readFileSync(Path.join(REPO, 'go', 'model', file), 'utf8')
      assert.strictEqual(
        goMirror, canonical,
        `go/model/${file} drifted from model/${file} — run: make sync-model`)
    })
  }

})
