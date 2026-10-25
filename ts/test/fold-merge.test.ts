/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { ApiDef } from '../dist/apidef'
import { mergeFoldedEntities } from '../dist/transform/entity'


function routes(entities: any) {
  return Object.fromEntries(Object.keys(entities).sort()
    .map((name) => [name, Object.entries(entities[name].path ?? {})
      .flatMap(([path, pd]: [string, any]) =>
        Object.keys(pd.op).map((op: string) => op + ' ' + path))
      .sort()]))
}


function entity(name: string, path: Record<string, string[]>, extra: any = {}) {
  return {
    name, ...extra,
    path: Object.fromEntries(Object.entries(path).map(([p, ops]) =>
      [p, { op: Object.fromEntries(ops.map((op) => [op, { method: 'GET' }])) }])),
  }
}


describe('fold-merge', () => {

  // `/usecases/{id}.json` is named for its component, UseCase, and
  // `/usecases.json` for its segment. go/apidef_test.go reads the base guide
  // this writes.
  test('guide-fold-merge', async () => {
    const folder = __dirname + '/../test/fold-merge'
    const build = await ApiDef.makeBuild({ folder })
    const bres = await build(
      { name: 'fold-merge', def: 'fold-merge-def.json' },
      { spec: { base: folder, buildargs: { apidef: { ctrl: { step: {
        parse: true, guide: true, transformers: true, builders: false, generate: false,
      } } } } } },
      {}
    )
    assert.ok(bres.ok, 'build failed: ' + bres.err?.message)

    assert.deepStrictEqual(routes(bres.guide.entity), {
      repo: ['list /repos.json'],
      use_case: ['list /usecases.json', 'list /usecases/{id}.json'],
    })
    assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity).sort(),
      ['repo', 'use_case'])
    assert.deepStrictEqual(bres.apimodel.main.kit.entity.use_case.op.list.points
      .map((p: any) => p.o).sort(), ['/usecases.json', '/usecases/{id}.json'])
  })


  test('the spelling with the most words keeps every path', () => {
    const guide = { entity: {
      usecase: entity('usecase', { '/usecases': ['list'] }),
      use_case: entity('use_case', { '/usecases/{id}': ['load'] }),
      UseCase: entity('UseCase', { '/v2/usecases': ['list'] }),
    } }
    assert.deepStrictEqual(mergeFoldedEntities(guide), ['UseCase', 'usecase'])
    assert.deepStrictEqual(routes(guide.entity), {
      use_case: ['list /usecases', 'list /v2/usecases', 'load /usecases/{id}'],
    })
  })


  test('one operation on one path keeps both apart', () => {
    const guide = { entity: {
      opt_out: entity('opt_out', { '/optouts': ['list'] }),
      optout: entity('optout', { '/optouts': ['list'], '/optouts/{id}': ['load'] }),
    } }
    assert.deepStrictEqual(mergeFoldedEntities(guide), [])
    assert.deepStrictEqual(Object.keys(guide.entity).sort(), ['opt_out', 'optout'])
  })


  test('an inactive entity is left to guide.aontu', () => {
    const guide = { entity: {
      opt_out: entity('opt_out', { '/optouts': ['list'] }),
      optout: entity('optout', { '/optouts/{id}': ['load'] }, { active: false }),
    } }
    assert.deepStrictEqual(mergeFoldedEntities(guide), [])
    assert.deepStrictEqual(Object.keys(guide.entity).sort(), ['opt_out', 'optout'])
  })


  test('names that fold apart are untouched', () => {
    const guide = { entity: {
      use: entity('use', { '/uses': ['list'] }),
      use_case: entity('use_case', { '/usecases': ['list'] }),
      case: entity('case', { '/cases': ['list'] }),
      constructor: entity('constructor', { '/constructors': ['list'] }),
    } }
    assert.deepStrictEqual(mergeFoldedEntities(guide), [])
    assert.deepStrictEqual(Object.keys(guide.entity).sort(),
      ['case', 'constructor', 'use', 'use_case'])
  })

})
