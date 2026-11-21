/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { ApiDef } from '../dist/apidef'
import { mergeCommandEntities, mergeFoldedEntities } from '../dist/transform/entity'


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
  // `/usecases.json` for its segment; the item route is the collection's load.
  // go/apidef_test.go reads the base guide this writes.
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
      use_case: ['list /usecases.json', 'load /usecases/{id}.json'],
    })
    assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity).sort(),
      ['repo', 'use_case'])
    assert.deepStrictEqual(bres.apimodel.main.kit.entity.use_case.op.list.points
      .map((p: any) => p.o).sort(), ['/usecases.json'])
    assert.deepStrictEqual(bres.apimodel.main.kit.entity.use_case.op.load.points
      .map((p: any) => p.o).sort(), ['/usecases/{id}.json'])
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


describe('command-merge', () => {

  const actions = (guide: any, ename: string, path: string) =>
    Object.keys(guide.entity[ename].path[path].action ?? {})

  test('a command joins the entity whose route it writes beneath', () => {
    const guide: any = { entity: {
      doc: entity('doc', { '/api/doc': ['load'] }),
      mdconvert: entity('mdconvert', { '/api/doc/mdconvert': ['create'] }),
      run: entity('run', { '/runs/{run_id}': ['load'] }),
      rerun_failed_job: entity('rerun_failed_job', { '/runs/{run_id}/rerun-failed-jobs': ['create'] }),
    } }
    guide.entity.run.path['/runs/{run_id}'].rename = { param: { run_id: { target: 'id' } } }
    guide.entity.rerun_failed_job.path['/runs/{run_id}/rerun-failed-jobs'].rename =
      { param: { run_id: { target: 'run_id' } } }
    assert.deepStrictEqual(mergeCommandEntities(guide), ['mdconvert', 'rerun_failed_job'])
    assert.deepStrictEqual(routes(guide.entity), {
      doc: ['create /api/doc/mdconvert', 'load /api/doc'],
      run: ['create /runs/{run_id}/rerun-failed-jobs', 'load /runs/{run_id}'],
    })
    assert.deepStrictEqual(actions(guide, 'doc', '/api/doc/mdconvert'), ['mdconvert'])
    assert.deepStrictEqual(actions(guide, 'run', '/runs/{run_id}/rerun-failed-jobs'),
      ['rerun_failed_jobs'])
    assert.strictEqual(guide.entity.run.path['/runs/{run_id}/rerun-failed-jobs']
      .rename.param.run_id.target, 'id')
  })


  test('a command beneath another joins where that one went', () => {
    const guide: any = { entity: {
      package: entity('package', { '/p/{id}/packages': ['list'] }),
      nuget: entity('nuget', { '/p/{id}/packages/nuget': ['update'] }),
      symbolpackage: entity('symbolpackage', { '/p/{id}/packages/nuget/symbolpackage': ['update'] }),
    } }
    assert.deepStrictEqual(mergeCommandEntities(guide), ['nuget', 'symbolpackage'])
    assert.deepStrictEqual(Object.keys(guide.entity), ['package'])
    assert.deepStrictEqual(actions(guide, 'package', '/p/{id}/packages/nuget/symbolpackage'),
      ['symbolpackage'])
  })


  test('commands on one route join together, a route another entity reads stays', () => {
    const guide: any = { entity: {
      story: entity('story', { '/stories': ['create'] }),
      bulk: entity('bulk', { '/stories/bulk': ['remove'] }),
      create_story: entity('create_story', { '/stories/bulk': ['create'] }),
      branch: entity('branch', { '/branches/{id}': ['load'] }),
      branch_protection: entity('branch_protection', { '/branches/{id}/protection': ['load'] }),
      protected_branch: entity('protected_branch', { '/branches/{id}/protection': ['update'] }),
    } }
    assert.deepStrictEqual(mergeCommandEntities(guide), ['bulk', 'create_story'])
    assert.deepStrictEqual(routes(guide.entity).story,
      ['create /stories', 'create /stories/bulk', 'remove /stories/bulk'])
    assert.deepStrictEqual(actions(guide, 'story', '/stories/bulk'), ['bulk'])
    assert.deepStrictEqual(Object.keys(guide.entity).sort(),
      ['branch', 'branch_protection', 'protected_branch', 'story'])
  })


  test('a read, a key, a root route or an inactive entity is no command', () => {
    const guide: any = { entity: {
      thing: entity('thing', { '/things/{id}': ['load'] }),
      view: entity('view', { '/things/{id}/view': ['load'] }),
      part: entity('part', { '/things/{id}/{part}': ['update'] }),
      disable: entity('disable', { '/disable': ['create'] }),
      archive: entity('archive', { '/things/{id}/archive': ['create'] }, { active: false }),
    } }
    assert.deepStrictEqual(mergeCommandEntities(guide), [])
    assert.deepStrictEqual(Object.keys(guide.entity).sort(),
      ['archive', 'disable', 'part', 'thing', 'view'])
  })

})
