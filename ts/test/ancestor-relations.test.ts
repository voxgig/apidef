import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Path from 'node:path'
import { Aontu } from 'aontu'
import { entityAncestorSource } from '../dist/builder/entity/entity'
import { filterEntityAncestors } from '../dist/transform/entity'

const root = Path.resolve(__dirname, '../..')
const schema = readFileSync(Path.join(root, 'model/apidef.aon'), 'utf8')

test('inferred ancestors retain only existing other entities', () => {
  const row = JSON.parse(readFileSync(Path.join(root, 'ts/test/ancestor-targets.json'), 'utf8'))
  filterEntityAncestors(row.entities)
  assert.deepEqual(row.entities, row.expected)
})

test('ancestor source preserves chains and does not mutate the model', () => {
  const cases = JSON.parse(readFileSync(Path.join(root, 'ts/test/ancestor-relations.json'), 'utf8'))
  for (const row of cases) {
    const before = JSON.stringify(row.entity)
    assert.deepEqual(entityAncestorSource(row.entity), { model: row.model, relations: row.relations })
    assert.equal(JSON.stringify(row.entity), before)
  }
  const { relations } = entityAncestorSource(cases[0].entity)
  const model = new Aontu().generate(schema + '\nmain:kit:entity:{galaxy:{} planet:{} moon:{' + relations + '}}')
  assert.deepEqual(model.main.kit.entity.moon.relations.ancestors,
    [['$.main.kit.entity.planet'], ['$.main.kit.entity.galaxy', '$.main.kit.entity.planet']])
})

test('ancestors must link to existing other entities', () => {
  for (const target of ['missing', 'moon', 'planet.fields']) {
    const src = schema + '\nmain:kit:entity:{planet:{} moon:relations:ancestors:[[path($.main.kit.entity.' + target + ')]]}'
    assert.throws(() => new Aontu().generate(src), /aontu\/(rel_unresolved|constraint)/)
  }
  for (const value of ['path($.main.kit.flow.other)', '"planet"', '"$.main.kit.entity.planet"']) {
    const src = schema + '\nmain:kit:flow:other:{}\nmain:kit:entity:{planet:{} moon:relations:ancestors:[[' + value + ']]}'
    assert.throws(() => new Aontu().generate(src), /aontu\/(rel_address|scalar_value)/)
  }
})
