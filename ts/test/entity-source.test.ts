/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import Path from 'node:path'

import { entitySource } from '../dist/builder/entity/entity'


// Read as tsv.test.ts reads its rows: a header, then tab-separated cells.
function rows(name: string): Record<string, string>[] {
  const lines = readFileSync(Path.join(__dirname, '..', 'test', name + '.tsv'), 'utf8')
    .split(/\r?\n/).filter((line) => '' !== line.trim())
  const head = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']))
  })
}


describe('entity-source', () => {
  const all = rows('entity-source')
  test('has rows', () => assert.ok(0 < all.length))
  for (const row of all) {
    test(row.entity.slice(0, 60), () => {
      assert.strictEqual(entitySource(JSON.parse(row.entity)), JSON.parse(row.expected))
    })
  }
})
