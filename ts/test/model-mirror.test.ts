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


const REPO = Path.resolve(__dirname, '..', '..')
const MODEL_FILES = ['apidef.aon', 'guide.aon']


describe('model-mirror', () => {

  test('entity-field alias uses compact keys and defaults activation', () => {
    const fields = {
      id: { n: 'id', h: 'Id', r: true, t: '`$STRING`' },
      secret: { n: 'secret', h: 'Secret', r: false, t: '`$STRING`', a: false,
        sh: 'A secret.', ro: true, wo: true, de: true, fo: 'password' },
    }
    const source = '@"' + Path.join(REPO, 'model', 'apidef.aon') + '"\n' +
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
