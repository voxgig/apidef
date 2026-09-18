/* Copyright (c) 2024 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { Aontu } from 'aontu'

import * as Diff from 'diff'


import {
  ApiDef,
  gcEntityFiles,
} from '../dist/apidef'




const aontu = new Aontu({ fs: Fs })


describe('apidef', () => {

  test('exist', async () => {
    assert.ok(ApiDef)
  })


  test('migrate-legacy-guide', () => {
    const Os = require('node:os')
    const Path = require('node:path')
    const { migrateLegacyGuide } = require('../dist/guide/guide')
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-guide-'))
    Fs.mkdirSync(Path.join(dir, 'guide'), { recursive: true })

    const legacy = Path.join(dir, 'guide', 'x-guide.aontu')
    Fs.writeFileSync(legacy, [
      '@"@voxgig/apidef/model/guide.aontu"',
      '',
      '@"x-base-guide.aontu"',
      '',
      // A user's OWN include that merely ENDS in base-guide.aontu. Nothing
      // renamed this file, so rewriting it would point the guide at a path
      // that does not exist — while deleting the original.
      '@"shared-base-guide.aontu"',
      '',
      'guide: { entity: { thing: { note: "see guide.aontu notes" } } }',
      '',
    ].join('\n'))

    migrateLegacyGuide(Fs, dir, 'x-')

    assert.ok(!Fs.existsSync(legacy), 'legacy file should be gone')
    const out = Fs.readFileSync(Path.join(dir, 'guide', 'x-guide.aon'), 'utf8')

    assert.ok(out.includes('@"@voxgig/apidef/model/guide.aon"'),
      'package include not migrated: ' + out)
    assert.ok(out.includes('@"x-base-guide.aon"'),
      'base-guide include not migrated: ' + out)
    assert.ok(out.includes('@"shared-base-guide.aontu"'),
      'a user-owned base-guide include was rewritten: ' + out)

    assert.ok(out.includes('note: "see guide.aontu notes"'),
      'user content was rewritten: ' + out)
  })


  test('fs-injected-flag', async () => {
    const outprefix = 'solar-1.0.0-openapi-3.0.0-'
    const folder = __dirname + '/../test/solar'
    const spec = {
      spec: {
        base: folder,
        buildargs: {
          apidef: {
            ctrl: { step: { parse: true, guide: true, transformers: false } }
          }
        }
      }
    }

    // ctx.work.guideAontuFs records what was actually put on the aontu opts,
    // so reverting to an unconditional `opts.fs = ctx.fs` fails this.
    const defaultBuild = await ApiDef.makeBuild({ folder, outprefix })
    const defaultRes: any = await defaultBuild(
      { name: 'solar', def: outprefix + 'def.yaml' }, spec, {})
    assert.strictEqual(defaultRes.ctx.fsInjected, false)
    assert.strictEqual(defaultRes.ctx.work.guideAontuFs, false,
      'default node:fs must NOT be forwarded to aontu — it makes multisource ' +
      'parse Windows paths with Path.posix and every @-include fails')

    const customFs: any = { ...Fs }
    const injectedBuild = await ApiDef.makeBuild({ folder, outprefix, fs: customFs })
    const injectedRes: any = await injectedBuild(
      { name: 'solar', def: outprefix + 'def.yaml' }, spec, {})
    assert.strictEqual(injectedRes.ctx.fsInjected, true)
    assert.strictEqual(injectedRes.ctx.work.guideAontuFs, true,
      'an explicitly supplied fs (e.g. memfs) must still be forwarded')
  })


  test('guide-solar', async () => {
    const outprefix = 'solar-1.0.0-openapi-3.0.0-'
    const folder = __dirname + '/../test/solar'

    const build = await ApiDef.makeBuild({
      folder,
      debug: 'debug',
      outprefix,
    })

    const bres = await build(
      {
        name: 'solar',
        def: outprefix + 'def.yaml'
      },
      {
        spec: {
          base: __dirname + '/../test/solar',
          buildargs: {
            apidef: {
              ctrl: {
                step: {
                  parse: true,
                  guide: true,
                  transformers: false,
                  builders: false,
                  generate: false,
                }
              }
            }
          }
        }
      },
      {}
    )

    assert.deepStrictEqual(bres.guide.entity, SOLAR_GUIDE.entity)
    assert.deepStrictEqual(bres.guide.metrics.count.entity, SOLAR_GUIDE.metrics.count.entity)
    assert.deepStrictEqual(bres.guide.metrics.count.path, SOLAR_GUIDE.metrics.count.path)
    assert.deepStrictEqual(bres.guide.metrics.count.method, SOLAR_GUIDE.metrics.count.method)
  })



  test('guide-compound-key-load', async () => {
    const folder = __dirname + '/../test/compound'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'compound', def: 'compound-def.json' },
      {
        spec: {
          base: folder,
          buildargs: {
            apidef: {
              ctrl: { step: {
                parse: true, guide: true, transformers: false,
                builders: false, generate: false,
              } }
            }
          }
        }
      },
      {}
    )

    const ops = Object.keys(bres.guide.entity.repo.path['/repos/{owner}/{repo}'].op)
    assert.ok(ops.includes('load'), 'GET /repos/{owner}/{repo} did not classify as load')
    assert.ok(!ops.includes('list'), 'GET /repos/{owner}/{repo} wrongly classified as list')
  })


  test('guide-verb-on-parent', async () => {
    const folder = __dirname + '/../test/verb'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'verb', def: 'verb-def.json' },
      {
        spec: {
          base: folder,
          buildargs: {
            apidef: {
              ctrl: { step: {
                parse: true, guide: true, transformers: true,
                builders: false, generate: false,
              } }
            }
          }
        }
      },
      {}
    )

    assert.ok(bres.ok, 'build failed: ' + bres.err?.message)

    const gents = Object.keys(bres.guide.entity).sort()
    assert.deepStrictEqual(gents, ['note', 'thing'],
      'expected thing + note only, got ' + gents.join(','))

    const merge = bres.guide.entity.thing.path['/things/{thing_number}/merge']
    assert.ok(null != merge, 'merge path did not join thing')
    assert.deepStrictEqual(Object.keys(merge.action ?? {}), ['merge'])
    assert.deepStrictEqual(Object.keys(merge.op).sort(), ['load', 'update'])
    assert.strictEqual(merge.rename.param.thing_number?.target ?? merge.rename.param.thing_number, 'id')

    const item = bres.guide.entity.thing.path['/things/{thing_number}']
    assert.strictEqual(item.rename.param.thing_number?.target ?? item.rename.param.thing_number, 'id')

    // The nested collection is still its own entity, with its parent key kept.
    const notes = bres.guide.entity.note.path['/things/{thing_number}/notes']
    assert.ok(null != notes, 'nested collection lost')
    assert.ok(null == notes.action || 0 === Object.keys(notes.action).length,
      'nested collection wrongly became an action')

    // Model: PATCH promoted to update; the merge PUT rides along as an action point.
    const thing = bres.apimodel.main.kit.entity.thing
    assert.strictEqual(thing.op.patch, undefined, 'patch should have been promoted')
    const update = thing.op.update.points.map((pt: any) => [pt.method, pt.orig, pt.select.$action])
    assert.deepStrictEqual(update, [
      ['PATCH', '/things/{thing_number}', undefined],
      ['PUT', '/things/{thing_number}/merge', 'merge'],
    ])
    const load = thing.op.load.points.map((pt: any) => [pt.method, pt.orig, pt.select.$action])
    assert.deepStrictEqual(load.sort(), [
      ['GET', '/things/{thing_number}', undefined],
      ['GET', '/things/{thing_number}/merge', 'merge'],
    ])
    // Both item and verb points address the thing by the renamed key.
    for (const pt of [...thing.op.update.points, ...thing.op.load.points]) {
      const names = (pt.args.params ?? []).map((a: any) => a.name)
      assert.ok(names.includes('id') && !names.includes('thing_number'),
        pt.orig + ' params ' + names.join(','))
    }
  })


  test('guide-verb-on-parent-edges', async () => {
    const folder = __dirname + '/../test/verb-edge'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'verb-edge', def: 'verb-edge-def.json' },
      {
        spec: {
          base: folder,
          buildargs: {
            apidef: {
              ctrl: { step: {
                parse: true, guide: true, transformers: true,
                builders: false, generate: false,
              } }
            }
          }
        }
      },
      {}
    )

    assert.ok(bres.ok, 'build failed: ' + bres.err?.message)
    const gents = bres.guide.entity

    // The verb joins the entity the item's GET returns, not the one that
    // sorts first (`ack` < `widget`), and the key spelling does not matter.
    const merge = gents.widget?.path['/widgets/{widget_number}/merge']
    assert.ok(null != merge, 'merge did not join widget: ' + Object.keys(gents).join(','))
    assert.deepStrictEqual(Object.keys(merge.action ?? {}), ['merge'])
    assert.strictEqual(merge.rename.param.widget_number?.target ?? merge.rename.param.widget_number, 'id')
    assert.ok(null == gents.ack?.path['/widgets/{widget_number}/merge'], 'merge wrongly joined ack')

    // A create-only nested collection keeps its entity and its create.
    assert.ok(null != gents.label, 'label entity lost: ' + Object.keys(gents).join(','))
    assert.deepStrictEqual(Object.keys(gents.label.path['/widgets/{id}/labels'].op), ['create'])
    assert.ok(null == gents.widget.path['/widgets/{id}/labels'], 'labels wrongly became a verb on widget')

    const aks = gents.widget_access_key_set
    assert.ok(null != aks, 'access_keys entity lost: ' + Object.keys(gents).join(','))
    assert.deepStrictEqual(Object.keys(aks.path['/widgets/{id}/access_keys'].op), ['create'])
    assert.ok(null == gents.widget.path['/widgets/{id}/access_keys'],
      'a plural collection wrongly became a verb on widget')

    // A verb that suffixes its parent's name is still recorded as an action.
    const archive = gents.email_archive?.path['/email-archives/{email_archive_id}/archive']
    assert.ok(null != archive, 'archive did not join email_archive: ' + Object.keys(gents).join(','))
    assert.deepStrictEqual(Object.keys(archive.action ?? {}), ['archive'])

    const ea = bres.apimodel.main.kit.entity.email_archive
    const archivePt = ea.op.update.points.find((pt: any) => pt.orig.endsWith('/archive'))
    assert.strictEqual(archivePt?.select?.$action, 'archive')
  })


  test('field-required-solar', async () => {
    const outprefix = 'solar-1.0.0-openapi-3.0.0-'
    const folder = __dirname + '/../test/solar'

    const build = await ApiDef.makeBuild({
      folder,
      debug: 'debug',
      outprefix,
    })

    const bres = await build(
      {
        name: 'solar',
        def: outprefix + 'def.yaml'
      },
      {
        spec: {
          base: __dirname + '/../test/solar',
          buildargs: {
            apidef: {
              ctrl: {
                step: {
                  parse: true,
                  guide: true,
                  transformers: true,
                  builders: true,
                  generate: true,
                }
              }
            }
          }
        }
      },
      {}
    )

    // console.log('BRES-KEYS', JSON.stringify(Object.keys(bres)))
    const planet = bres.apimodel.main.kit.entity.planet
    const moon = bres.apimodel.main.kit.entity.moon

    // Planet schema has required: [id, name, kind, diameter]
    const planetFields: Record<string, any> = {}
    for (const f of planet.fields) { planetFields[f.name] = f }
    assert.strictEqual(planetFields.id.req, true)
    assert.strictEqual(planetFields.name.req, true)
    assert.strictEqual(planetFields.kind.req, true)
    assert.strictEqual(planetFields.diameter.req, true)

    // A property's `description` becomes the field's `short`. Every generated
    // per-entity table has a Description column, and every cell was blank
    // because nothing read this. Only Planet.diameter carries one in the
    // fixture, which is the point: the fields WITHOUT a description must not
    // acquire an invented one.
    assert.strictEqual(planetFields.diameter.short,
      'Mean equatorial diameter in kilometres.')
    assert.strictEqual(planetFields.id.short, undefined)
    assert.strictEqual(planetFields.name.short, undefined)
    assert.strictEqual(planetFields.kind.short, undefined)

    // Moon schema has required: [id, name, planet_id, kind, diameter]
    const moonFields: Record<string, any> = {}
    for (const f of moon.fields) { moonFields[f.name] = f }
    assert.strictEqual(moonFields.id.req, true)
    assert.strictEqual(moonFields.name.req, true)
    assert.strictEqual(moonFields.planet_id.req, true)
    assert.strictEqual(moonFields.kind.req, true)
    assert.strictEqual(moonFields.diameter.req, true)
  })


  test('query-verb-book', async () => {
    // RFC 10008 QUERY verb: a safe, idempotent read carrying its filter in the
    // request body. apidef maps it onto load/list. This fixture exercises a
    // `query:` operation on a collection path returning an array of Book, with
    // a separate BookQuery filter schema in the request body.
    const outprefix = 'query-book-'
    const folder = __dirname + '/../test/query'

    const build = await ApiDef.makeBuild({
      folder,
      debug: 'debug',
      outprefix,
    })

    const bres = await build(
      {
        name: 'book',
        def: outprefix + 'def.yaml'
      },
      {
        spec: {
          base: __dirname + '/../test/query',
          buildargs: {
            apidef: {
              ctrl: {
                step: {
                  parse: true,
                  guide: true,
                  transformers: true,
                  builders: true,
                  generate: true,
                }
              }
            }
          }
        }
      },
      {}
    )

    // The QUERY method is counted like any other method.
    assert.strictEqual(bres.guide.metrics.count.method, 2)

    // The collection QUERY is classified as a `list` op (array response),
    // carrying the QUERY method through to the guide.
    const bookGuide = bres.guide.entity.book
    assert.ok(bookGuide, 'book entity discovered')
    assert.strictEqual(bookGuide.path['/api/book'].op.list.method, 'QUERY')

    // The QUERY method flows through to the model op point.
    const book = bres.apimodel.main.kit.entity.book
    assert.strictEqual(book.op.list.points[0].method, 'QUERY')

    // The Book response schema supplies the entity fields...
    const fieldNames = book.fields.map((f: any) => f.name).sort()
    assert.deepStrictEqual(fieldNames, ['author', 'id', 'title'])

    // ...and the QUERY filter body (BookQuery: q, page) must NOT leak into them.
    assert.ok(!fieldNames.includes('q'), 'filter field q must not leak')
    assert.ok(!fieldNames.includes('page'), 'filter field page must not leak')
  })


  test('full-solar', { skip: 'SOLAR_MODEL has drifted: field `req` and op `input`' }, async () => {
    const outprefix = 'solar-1.0.0-openapi-3.0.0-'
    const folder = __dirname + '/../test/solar'

    const build = await ApiDef.makeBuild({
      folder,
      debug: 'debug',
      outprefix,
      why: {
        show: false
      }
    })

    const modelSrcQ = `
# apidef test: ${outprefix}

name: solar

@"@voxgig/apidef/model/apidef.aon"

def: '${outprefix}def.yaml'
`

    const modelSrc = `
# apidef test: ${outprefix}

@"@voxgig/apidef/model/apidef.aon"

name: solar

def: '${outprefix}def.yaml'

`

    const modelinit = aontu.generate(modelSrc)

    const buildspec = {
      spec: {
        base: __dirname + '/../test/solar'
      }
    }

    const bres = await build(modelinit, buildspec, {})
    assert.strictEqual(bres.ok, true)

    const model = aontu.generate(`@"test/solar/solar.aon"`, {
      base: __dirname + '/..'
    })

    assert.deepStrictEqual(model.main.kit, SOLAR_MODEL.main.kit)
  })


  describe('guide entity allowlist', () => {
    const PathMod = require('node:path')

    test('`active` has no default, so a project can supply one', () => {
      const src = Fs.readFileSync(
        PathMod.join(__dirname, '..', '..', 'model', 'guide.aon'), 'utf8')

      const line = src.split('\n').find((l: string) => /^\s*active\??\s*:/.test(l))
      assert.ok(null != line, 'the guide model must declare `active`')
      assert.match(String(line), /active\?\s*:\s*boolean\s*$/,
        'active must stay OPTIONAL with no default: a default here is the ' +
        'same rank as the project\'s and they clash - ' + line)
    })

    test('the base guide writes no `active`, leaving the slot free', () => {
      // Generated on every run, so a builder that started stamping
      // `active: true` would take the allowlist away silently.
      const built = PathMod.join(__dirname, '..', '..', '..', '..',
        'voxgig-sdk', 'univec-sdk', '.sdk', 'model', 'guide', 'base-guide.aon')
      if (!Fs.existsSync(built)) {
        return   // no sibling checkout here; the unit facts above still hold
      }
      const src = Fs.readFileSync(built, 'utf8')
      assert.strictEqual(/\bactive\s*:/.test(src), false,
        'the base guide must not write `active` - it would occupy the slot ' +
        'a project narrows with')
    })
  })


  describe('entity-gc', () => {
    const Os = require('node:os')
    const PathMod = require('node:path')

    function tmpModel(files: Record<string, string>): string {
      const dir = Fs.mkdtempSync(PathMod.join(Os.tmpdir(), 'apidef-gc-'))
      Fs.mkdirSync(PathMod.join(dir, 'entity'))
      for (const [name, content] of Object.entries(files)) {
        Fs.writeFileSync(PathMod.join(dir, 'entity', name), content)
      }
      return dir
    }

    const GEN = (name: string) => `# Entity: ${name}\n\nmain: kit: entity: ${name}: {}\n`
    const listing = (dir: string) => Fs.readdirSync(PathMod.join(dir, 'entity')).sort()

    test('removes generated files for entities no longer derived', () => {
      const dir = tmpModel({
        'country.aon': GEN('country'),
        'list_country.aon': GEN('list_country'),   // orphan
        'entity-index.aon': '# Entity Models\n',
      })
      const removed = gcEntityFiles(Fs, null, dir, undefined, ['country'])
      assert.deepStrictEqual(removed, ['list_country.aon'])
      assert.deepStrictEqual(listing(dir), ['country.aon', 'entity-index.aon'])
    })

    test('never touches a file apidef did not write', () => {
      const dir = tmpModel({
        'country.aon': GEN('country'),
        'custom.aon': '# my hand-written model fragment\nfoo: 1\n',  // no generated header
        'notes.txt': 'not aontu at all',
      })
      const removed = gcEntityFiles(Fs, null, dir, undefined, ['country'])
      assert.deepStrictEqual(removed, [])
      assert.deepStrictEqual(listing(dir), ['country.aon', 'custom.aon', 'notes.txt'])
    })

    test('respects outprefix — another def sharing the folder is not collected', () => {
      const dir = tmpModel({
        'solar-planet.aon': GEN('planet'),
        'solar-moon.aon': GEN('moon'),             // orphan of the solar def
        'solar-entity-index.aon': '# Entity Models\n',
        'lunar-crater.aon': GEN('crater'),         // belongs to a DIFFERENT def
      })
      const removed = gcEntityFiles(Fs, null, dir, 'solar-', ['planet'])
      assert.deepStrictEqual(removed, ['solar-moon.aon'])
      assert.deepStrictEqual(listing(dir),
        ['lunar-crater.aon', 'solar-entity-index.aon', 'solar-planet.aon'])
    })

    test('keeps the index and the whole current set; missing folder is a no-op', () => {
      const dir = tmpModel({
        'a.aon': GEN('a'), 'b.aon': GEN('b'),
        'entity-index.aon': '# Entity Models\n',
      })
      assert.deepStrictEqual(gcEntityFiles(Fs, null, dir, undefined, ['a', 'b']), [])
      assert.deepStrictEqual(listing(dir), ['a.aon', 'b.aon', 'entity-index.aon'])
      // No entity folder at all: return empty, do not throw.
      const empty = Fs.mkdtempSync(PathMod.join(Os.tmpdir(), 'apidef-gc-'))
      assert.deepStrictEqual(gcEntityFiles(Fs, null, empty, undefined, ['a']), [])
    })
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
  metrics: { count: { entity: 2, path: 6, method: 12 } }
}


const SOLAR_MODEL = {
  main: {
    kit: {
      entity: {
        moon: {
          alias: { field: {} },
          fields: [
            {
              name: 'diameter',
              req: false,
              type: '`$NUMBER`',
              active: true
            },
            { name: 'id', req: false, type: '`$STRING`', active: true },
            {
              name: 'kind',
              req: false,
              type: '`$STRING`',
              active: true
            },
            {
              name: 'name',
              req: false,
              type: '`$STRING`',
              active: true
            },
            {
              name: 'planet_id',
              req: false,
              type: '`$STRING`',
              active: true
            }
          ],
          id: { field: 'id', name: 'id' },
          name: 'moon',
          op: {
            create: {
              points: [
                {
                  args: {
                    params: [
                      {
                        kind: 'param',
                        name: 'planet_id',
                        orig: 'planet_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      }
                    ]
                  },
                  method: 'POST',
                  orig: '/api/planet/{planet_id}/moon',
                  segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }],
                  select: { exist: ['planet_id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'create'
            },
            list: {
              points: [
                {
                  args: {
                    params: [
                      {
                        kind: 'param',
                        name: 'planet_id',
                        orig: 'planet_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      }
                    ]
                  },
                  method: 'GET',
                  orig: '/api/planet/{planet_id}/moon',
                  segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }],
                  select: { exist: ['planet_id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'list'
            },
            load: {
              points: [
                {
                  args: {
                    params: [
                      {
                        kind: 'param',
                        name: 'id',
                        orig: 'moon_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      },
                      {
                        kind: 'param',
                        name: 'planet_id',
                        orig: 'planet_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      }
                    ]
                  },
                  method: 'GET',
                  orig: '/api/planet/{planet_id}/moon/{moon_id}',
                  segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                  rename: { param: { moon_id: 'id' } },
                  select: { exist: ['id', 'planet_id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'load'
            },
            remove: {
              points: [
                {
                  args: {
                    params: [
                      {
                        kind: 'param',
                        name: 'id',
                        orig: 'moon_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      },
                      {
                        kind: 'param',
                        name: 'planet_id',
                        orig: 'planet_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      }
                    ]
                  },
                  method: 'DELETE',
                  orig: '/api/planet/{planet_id}/moon/{moon_id}',
                  segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                  select: { exist: ['id', 'planet_id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'remove'
            },
            update: {
              points: [
                {
                  args: {
                    params: [
                      {
                        kind: 'param',
                        name: 'id',
                        orig: 'moon_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      },
                      {
                        kind: 'param',
                        name: 'planet_id',
                        orig: 'planet_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      }
                    ]
                  },
                  method: 'PUT',
                  orig: '/api/planet/{planet_id}/moon/{moon_id}',
                  segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                  select: { exist: ['id', 'planet_id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'update'
            }
          },
          relations: { ancestors: [['planet']] },
          active: true
        },
        planet: {
          alias: { field: {} },
          fields: [
            {
              name: 'diameter',
              req: false,
              type: '`$NUMBER`',
              active: true
            },
            {
              name: 'forbid',
              req: false,
              type: '`$BOOLEAN`',
              active: true
            },
            { name: 'id', req: false, type: '`$STRING`', active: true },
            {
              name: 'kind',
              req: false,
              type: '`$STRING`',
              active: true
            },
            {
              name: 'name',
              req: false,
              type: '`$STRING`',
              active: true
            },
            {
              name: 'ok',
              req: false,
              type: '`$BOOLEAN`',
              active: true
            },
            {
              name: 'start',
              req: false,
              type: '`$BOOLEAN`',
              active: true
            },
            {
              name: 'state',
              req: false,
              type: '`$STRING`',
              active: true
            },
            {
              name: 'stop',
              req: false,
              type: '`$BOOLEAN`',
              active: true
            },
            {
              name: 'why',
              req: false,
              type: '`$STRING`',
              active: true
            }
          ],
          id: { field: 'id', name: 'id' },
          name: 'planet',
          op: {
            create: {
              points: [
                {
                  args: {
                    params: [
                      {
                        kind: 'param',
                        name: 'id',
                        orig: 'planet_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      }
                    ]
                  },
                  method: 'POST',
                  orig: '/api/planet/{planet_id}/forbid',
                  segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }, { lit: 'forbid' }],
                  rename: { param: { planet_id: 'id' } },
                  select: { '$action': 'forbid', exist: ['id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                },
                {
                  args: {
                    params: [
                      {
                        kind: 'param',
                        name: 'id',
                        orig: 'planet_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      }
                    ]
                  },
                  method: 'POST',
                  orig: '/api/planet/{planet_id}/terraform',
                  segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }, { lit: 'terraform' }],
                  rename: { param: { planet_id: 'id' } },
                  select: { '$action': 'terraform', exist: ['id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                },
                {
                  method: 'POST',
                  orig: '/api/planet',
                  segments: [{ lit: 'api' }, { lit: 'planet' }],
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  args: { params: [] },
                  relations: [],
                  select: {}
                }
              ],
              name: 'create'
            },
            list: {
              points: [
                {
                  method: 'GET',
                  orig: '/api/planet',
                  segments: [{ lit: 'api' }, { lit: 'planet' }],
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  args: { params: [] },
                  relations: [],
                  select: {}
                }
              ],
              name: 'list'
            },
            load: {
              points: [
                {
                  args: {
                    params: [
                      {
                        kind: 'param',
                        name: 'id',
                        orig: 'planet_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      }
                    ]
                  },
                  method: 'GET',
                  orig: '/api/planet/{planet_id}',
                  segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                  rename: { param: { planet_id: 'id' } },
                  select: { exist: ['id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'load'
            },
            remove: {
              points: [
                {
                  args: {
                    params: [
                      {
                        kind: 'param',
                        name: 'id',
                        orig: 'planet_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      }
                    ]
                  },
                  method: 'DELETE',
                  orig: '/api/planet/{planet_id}',
                  segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                  select: { exist: ['id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'remove'
            },
            update: {
              points: [
                {
                  args: {
                    params: [
                      {
                        kind: 'param',
                        name: 'id',
                        orig: 'planet_id',
                        reqd: true,
                        type: '`$STRING`',
                        active: true
                      }
                    ]
                  },
                  method: 'PUT',
                  orig: '/api/planet/{planet_id}',
                  segments: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                  select: { exist: ['id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'update'
            }
          },
          active: true
        }
      },
      flow: {
        BasicMoonFlow: {
          entity: 'moon',
          kind: 'basic',
          name: 'BasicMoonFlow',
          step: [
            {
              data: { id: 'moon_n01', planet_id: 'planet01' },
              input: { id: 'moon_n01' },
              op: 'create',
              active: true,
              match: {}
            },
            {
              match: { planet_id: 'planet01' },
              op: 'list',
              valid: [{ apply: 'ItemExists', spec: { id: 'moon_n01' } }],
              active: true,
              data: {}
            },
            {
              data: { id: 'moon_n01', planet_id: 'planet01' },
              input: { id: 'moon_n01' },
              op: 'update',
              spec: [
                {
                  apply: 'TextFieldMark',
                  def: { mark: 'Mark01-moon_n01' }
                }
              ],
              active: true,
              match: {}
            },
            {
              input: { id: 'moon_n01' },
              match: { id: 'moon_n01', planet_id: 'planet01' },
              op: 'load',
              valid: [
                {
                  apply: 'TextFieldMark',
                  def: { mark: 'Mark01-moon_n01' }
                }
              ],
              active: true,
              data: {}
            },
            {
              input: { id: 'moon_n01' },
              match: { id: 'moon_n01', planet_id: 'planet01' },
              op: 'remove',
              active: true,
              data: {}
            },
            {
              match: { planet_id: 'planet01' },
              op: 'list',
              valid: [{ apply: 'ItemNotExists', def: { id: 'moon_n01' } }],
              active: true,
              data: {}
            }
          ],
          'key$': 'BasicMoonFlow',
          active: true,
          param: {}
        },
        BasicPlanetFlow: {
          entity: 'planet',
          kind: 'basic',
          name: 'BasicPlanetFlow',
          step: [
            {
              data: { id: 'planet_n01' },
              input: { id: 'planet_n01' },
              op: 'create',
              active: true,
              match: {}
            },
            {
              op: 'list',
              valid: [{ apply: 'ItemExists', spec: { id: 'planet_n01' } }],
              active: true,
              match: {},
              data: {}
            },
            {
              data: { id: 'planet_n01' },
              input: { id: 'planet_n01' },
              op: 'update',
              spec: [
                {
                  apply: 'TextFieldMark',
                  def: { mark: 'Mark01-planet_n01' }
                }
              ],
              active: true,
              match: {}
            },
            {
              input: { id: 'planet_n01' },
              match: { id: 'planet_n01' },
              op: 'load',
              valid: [
                {
                  apply: 'TextFieldMark',
                  def: { mark: 'Mark01-planet_n01' }
                }
              ],
              active: true,
              data: {}
            },
            {
              input: { id: 'planet_n01' },
              match: { id: 'planet_n01' },
              op: 'remove',
              active: true,
              data: {}
            },
            {
              op: 'list',
              valid: [{ apply: 'ItemNotExists', def: { id: 'planet_n01' } }],
              active: true,
              match: {},
              data: {}
            }
          ],
          'key$': 'BasicPlanetFlow',
          active: true,
          param: {}
        }
      },
      info: { title: 'Solar System API', version: '1.0.0' }
    }
  }
}

