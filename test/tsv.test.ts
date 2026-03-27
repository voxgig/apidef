/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'
import * as Path from 'node:path'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import {
  depluralize,
  canonize,
  sanitizeSlug,
  slugToPascalCase,
  transliterate,
  normalizeFieldName,
  cleanComponentName,
  inferFieldType,
  ensureMinEntityName,
  validator,
  nom,
  formatJsonSrc,
  getModelPath,
} from '../dist/utility'

import {
  inferTypeFromValue,
} from '../dist/transform/field'

import {
  parse,
} from '../dist/parse'

import {
  cleanTransform,
} from '../dist/transform/clean'

import {
  fixName,
  GuideShape,
} from '../dist/transform'


type TsvRow = Record<string, string>

function loadTsv(name: string): TsvRow[] {
  const filepath = Path.join(__dirname, '..', 'test', name + '.tsv')
  const text = Fs.readFileSync(filepath, 'utf8')
  const lines = text.split('\n').filter(line => line.trim() !== '')
  const headers = lines[0].split('\t')
  const rows: TsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    const row: TsvRow = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ?? ''
    }
    rows.push(row)
  }
  return rows
}


describe('tsv-depluralize', () => {
  const rows = loadTsv('depluralize')
  for (const row of rows) {
    test(`depluralize("${row.input}") => "${row.expected}"`, () => {
      assert.deepStrictEqual(depluralize(row.input), row.expected)
    })
  }
})


describe('tsv-canonize', () => {
  const rows = loadTsv('canonize')
  for (const row of rows) {
    test(`canonize("${row.input}") => "${row.expected}"`, () => {
      assert.deepStrictEqual(canonize(row.input), row.expected)
    })
  }
})


describe('tsv-sanitize-slug', () => {
  const rows = loadTsv('sanitize-slug')
  for (const row of rows) {
    test(`sanitizeSlug("${row.input}") => "${row.expected}"`, () => {
      assert.deepStrictEqual(sanitizeSlug(row.input), row.expected)
    })
  }
})


describe('tsv-slug-to-pascal', () => {
  const rows = loadTsv('slug-to-pascal')
  for (const row of rows) {
    test(`slugToPascalCase("${row.input}") => "${row.expected}"`, () => {
      assert.deepStrictEqual(slugToPascalCase(row.input), row.expected)
    })
  }
})


describe('tsv-transliterate', () => {
  const rows = loadTsv('transliterate')
  for (const row of rows) {
    test(`transliterate("${row.input}") => "${row.expected}"`, () => {
      assert.deepStrictEqual(transliterate(row.input), row.expected)
    })
  }
})


describe('tsv-normalize-field-name', () => {
  const rows = loadTsv('normalize-field-name')
  for (const row of rows) {
    test(`normalizeFieldName("${row.input}") => "${row.expected}"`, () => {
      assert.deepStrictEqual(normalizeFieldName(row.input), row.expected)
    })
  }
})


describe('tsv-clean-component-name', () => {
  const rows = loadTsv('clean-component-name')
  for (const row of rows) {
    test(`cleanComponentName("${row.input}") => "${row.expected}"`, () => {
      assert.deepStrictEqual(cleanComponentName(row.input), row.expected)
    })
  }
})


describe('tsv-infer-field-type', () => {
  const rows = loadTsv('infer-field-type')
  for (const row of rows) {
    test(`inferFieldType("${row.name}", "${row.specType}") => "${row.expected}"`, () => {
      assert.deepStrictEqual(inferFieldType(row.name, row.specType), row.expected)
    })
  }
})


describe('tsv-validator', () => {
  const rows = loadTsv('validator')
  for (const row of rows) {
    test(`validator("${row.input}") => "${row.expected}"`, () => {
      assert.deepStrictEqual(validator(row.input), row.expected)
    })
  }
})


describe('tsv-infer-type-from-value', () => {
  const rows = loadTsv('infer-type-from-value')
  for (const row of rows) {
    test(`inferTypeFromValue(${row.input}) => "${row.expected}"`, () => {
      let input: any
      if (row.input === 'null') {
        input = null
      } else if (row.input === 'true') {
        input = true
      } else if (row.input === 'false') {
        input = false
      } else {
        input = JSON.parse(row.input)
      }
      assert.deepStrictEqual(inferTypeFromValue(input), row.expected)
    })
  }
})


describe('tsv-ensure-min-entity-name', () => {
  const rows = loadTsv('ensure-min-entity-name')
  for (const row of rows) {
    test(`ensureMinEntityName("${row.input}") => "${row.expected}"`, () => {
      assert.deepStrictEqual(ensureMinEntityName(row.input, {}), row.expected)
    })
  }
})


describe('tsv-nom', () => {
  const rows = loadTsv('nom')
  for (const row of rows) {
    test(`nom(${row.object}, "${row.format}") => "${row.expected}"`, () => {
      const obj = JSON.parse(row.object)
      assert.deepStrictEqual(nom(obj, row.format), row.expected)
    })
  }
})


describe('tsv-format-json-src', () => {
  const rows = loadTsv('format-json-src')
  for (const row of rows) {
    test(`formatJsonSrc(${JSON.stringify(row.input)})`, () => {
      assert.deepStrictEqual(formatJsonSrc(row.input), row.expected)
    })
  }
})


describe('tsv-parse-errors', () => {
  const rows = loadTsv('parse-errors')
  for (const row of rows) {
    test(`parse("${row.kind}", ...) rejects /${row.errorPattern}/`, async () => {
      const source = row.source
      const pm = { file: 'test-file' }
      const pattern = new RegExp(row.errorPattern)
      await assert.rejects(parse(row.kind, source as any, pm), pattern)
    })
  }

  test('parse rejects undefined source with /string/', async () => {
    const pm = { file: 'test-file' }
    await assert.rejects(parse('OpenAPI', undefined as any, pm), /string/)
  })

  test('parse rejects multi-line YAML comments with /empty/', async () => {
    const pm = { file: 'test-file' }
    await assert.rejects(parse('OpenAPI', '# comment 1\n# comment 2', pm), /empty/)
  })

  test('parse rejects YAML syntax error with /syntax/', async () => {
    const pm = { file: 'test-file' }
    await assert.rejects(parse('OpenAPI', 'openapi: 3.0.0\na::1', pm), /syntax/)
  })
})


describe('tsv-fixName', () => {
  test('fixName sets lowercase, camelCase, and UPPERCASE', () => {
    const base: any = {}
    fixName(base, 'planet')
    assert.deepStrictEqual(base.name, 'planet')
    assert.deepStrictEqual(base.Name, 'Planet')
    assert.deepStrictEqual(base.NAME, 'PLANET')
  })

  test('fixName with custom prop', () => {
    const base: any = {}
    fixName(base, 'moon', 'entity')
    assert.deepStrictEqual(base.entity, 'moon')
    assert.deepStrictEqual(base.Entity, 'Moon')
    assert.deepStrictEqual(base.ENTITY, 'MOON')
  })

  test('fixName with null base does not throw', () => {
    fixName(null, 'test')
    fixName(undefined, 'test')
  })
})


describe('tsv-GuideShape', () => {
  test('GuideShape validates default structure', () => {
    const result = GuideShape({
      entity: { foo: {} },
      control: {},
      transform: {},
      manual: {},
    })
    assert.deepStrictEqual(result.entity.foo, {})
  })
})


describe('tsv-cleanTransform-extended', () => {
  test('removes nested empty objects', async () => {
    const ctx: any = {
      apimodel: {
        a: { b: { c: {} } },
        d: { e: 1 },
      }
    }
    await cleanTransform(ctx)
    assert.deepStrictEqual(ctx.apimodel.d, { e: 1 })
    assert.strictEqual(ctx.apimodel.a, undefined)
  })

  test('removes undefined values', async () => {
    const ctx: any = {
      apimodel: {
        a: { x: undefined, y: 1 },
      }
    }
    await cleanTransform(ctx)
    assert.deepStrictEqual(ctx.apimodel, { a: { y: 1 } })
  })

  test('removes $ suffixed keys', async () => {
    const ctx: any = {
      apimodel: {
        good: { x: 1 },
        bad$: { x: 2 },
        paths$: [{ a: 1 }],
      }
    }
    await cleanTransform(ctx)
    assert.strictEqual(ctx.apimodel.bad$, undefined)
    assert.strictEqual(ctx.apimodel.paths$, undefined)
    assert.deepStrictEqual(ctx.apimodel.good, { x: 1 })
  })

  test('preserves non-empty arrays', async () => {
    const ctx: any = {
      apimodel: {
        items: [1, 2, 3],
        nested: { arr: [{ x: 1 }] },
      }
    }
    await cleanTransform(ctx)
    assert.deepStrictEqual(ctx.apimodel.items, [1, 2, 3])
    assert.deepStrictEqual(ctx.apimodel.nested.arr, [{ x: 1 }])
  })
})


describe('tsv-getModelPath-extended', () => {
  test('deep nested access', () => {
    const model = { a: { b: { c: { d: { e: 42 } } } } }
    const [v] = [getModelPath(model, 'a.b.c.d.e')]
    assert.deepStrictEqual(v, 42)
  })

  test('array value access', () => {
    const model = { items: [10, 20, 30] }
    const v = getModelPath(model, 'items')
    assert.deepStrictEqual(v, [10, 20, 30])
  })

  test('boolean and falsy values', () => {
    const model = { a: { zero: 0, empty: '', flag: false } }
    assert.deepStrictEqual(getModelPath(model, 'a.zero'), 0)
    assert.deepStrictEqual(getModelPath(model, 'a.empty'), '')
    assert.deepStrictEqual(getModelPath(model, 'a.flag'), false)
  })

  test('required false returns undefined for missing', () => {
    const model = { a: 1 }
    assert.deepStrictEqual(getModelPath(model, 'b.c', { required: false }), undefined)
  })

  test('active filtering', () => {
    const model = {
      items: {
        a: { name: 'a', active: true },
        b: { name: 'b', active: false },
        c: { name: 'c', active: true },
      }
    }
    const v = getModelPath(model, 'items')
    assert.strictEqual(v.b, undefined)
    assert.deepStrictEqual(v.a.name, 'a')
    assert.deepStrictEqual(v.c.name, 'c')
  })
})
