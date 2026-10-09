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

    const legacy = Path.join(dir, 'guide', 'x-guide.aon')
    Fs.writeFileSync(legacy, [
      '@"@voxgig/apidef/model/guide.aon"',
      '',
      '@"x-base-guide.aon"',
      '',
      '@"./x-base-guide.aon"',
      '',
      // A user's OWN include that merely ENDS in base-guide.aon. Nothing
      // renamed this file, so rewriting it would point the guide at a path
      // that does not exist — while deleting the original.
      '@"shared-base-guide.aon"',
      '',
      'guide: { entity: { thing: { note: "see guide.aon notes" } } }',
      '',
    ].join('\n'))

    migrateLegacyGuide(Fs, dir, 'x-')

    assert.ok(!Fs.existsSync(legacy), 'legacy file should be gone')
    const out = Fs.readFileSync(Path.join(dir, 'guide', 'x-guide.aontu'), 'utf8')

    assert.ok(out.includes('@"@voxgig/apidef/model/guide.aontu"'),
      'package include not migrated: ' + out)
    assert.ok(out.includes('@"x-base-guide.aontu"'),
      'base-guide include not migrated: ' + out)
    assert.ok(out.includes('@"./x-base-guide.aontu"'),
      './ base-guide include not migrated: ' + out)
    assert.ok(!out.includes('x-base-guide.aon"'),
      'a base-guide include still names the legacy file: ' + out)
    assert.ok(out.includes('@"shared-base-guide.aon"'),
      'a user-owned base-guide include was rewritten: ' + out)

    assert.ok(out.includes('note: "see guide.aon notes"'),
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
    const update = thing.op.update.points.map((pt: any) => [pt.m, pt.o, pt.q.$action])
    assert.deepStrictEqual(update, [
      ['PATCH', '/things/{thing_number}', undefined],
      ['PUT', '/things/{thing_number}/merge', 'merge'],
    ])
    const load = thing.op.load.points.map((pt: any) => [pt.m, pt.o, pt.q.$action])
    assert.deepStrictEqual(load.sort(), [
      ['GET', '/things/{thing_number}', undefined],
      ['GET', '/things/{thing_number}/merge', 'merge'],
    ])
    // Both item and verb points address the thing by the renamed key.
    for (const pt of [...thing.op.update.points, ...thing.op.load.points]) {
      const names = (pt.g.params ?? []).map((a: any) => a.n)
      assert.ok(names.includes('id') && !names.includes('thing_number'),
        pt.o + ' params ' + names.join(','))
    }
  })


  // The Go port pins the same renames in TestGuideRenameGuards.
  test('guide-rename-guards', async () => {
    const folder = __dirname + '/../test/rename-guard'
    const build = await ApiDef.makeBuild({ folder })
    const bres = await build(
      { name: 'rename-guard', def: 'rename-guard-def.json' },
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
    assert.ok(bres.ok, 'build failed: ' + bres.err?.message)

    const paths: any = {}
    for (const ent of Object.values<any>(bres.guide.entity)) Object.assign(paths, ent.path)
    const renames = (path: string) =>
      Object.fromEntries(Object.entries<any>(paths[path].rename?.param ?? {})
        .map(([k, v]) => [k, v?.target ?? v]))

    // Each `revisions` parent would rename its key to `revision_id`; the later one keeps its name.
    assert.deepStrictEqual(renames('/things/{thing_id}/revisions/{recipe_revision}' +
      '/packages/{package_ref}/revisions/{package_revision}/files/{file_name}'),
      { file_name: 'id', package_ref: 'package_id', recipe_revision: 'revision_id' })

    // `2fa_id` is not an identifier, so `code` keeps its name.
    assert.deepStrictEqual(renames('/things/{thing_id}/2fa/{code}/checks/{check_id}'),
      { check_id: 'id' })
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
    // The list joins it too, beside the load that answers with its record.
    assert.ok(null != gents.widget?.path['/widgets'], 'the list did not join widget')
    assert.ok(null == gents.ack?.path['/widgets'], 'the list wrongly joined ack')

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
    assert.strictEqual(archive.rename.param.email_archive_id?.target
      ?? archive.rename.param.email_archive_id, 'id')

    const ea = bres.apimodel.main.kit.entity.email_archive
    const archivePt = ea.op.update.points.find((pt: any) => pt.o.endsWith('/archive'))
    assert.strictEqual(archivePt?.q?.$action, 'archive')
  })


  // One page wrapper serves both collections through a shared response. Counted
  // per use it is frequent, so each list takes its name from its path.
  test('guide-shared-wrapper', async () => {
    const folder = __dirname + '/../test/shared-wrapper'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'shared-wrapper', def: 'shared-wrapper-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    const ops = Object.fromEntries(Object.keys(entities).sort()
      .map((name) => [name, Object.keys(entities[name].op ?? {}).sort()]))
    assert.deepStrictEqual(ops, {
      domain: ['list', 'load'],
      kingdom: ['list', 'load'],
    })
  })


  // An envelope never names its entity; the item it carries is judged instead,
  // so each list of the rare shared page keeps its path's name. No envelope:
  // a record with one nested object, a list beside other data (census), a
  // wrapper an operation does not unwrap (crew members, returned whole by a
  // create; the vault's 201), an item another wrapper carries too (metrics).
  test('guide-envelope', async () => {
    const folder = __dirname + '/../test/envelope'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'envelope', def: 'envelope-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    const ops = Object.fromEntries(Object.keys(entities).sort()
      .map((name) => [name, Object.keys(entities[name].op ?? {}).sort()]))
    assert.deepStrictEqual(ops, {
      // One record, but a page and an item on unrelated routes stay apart.
      auction: ['load'],
      census: ['list'],
      crew_member: ['create', 'list'],
      deposit: ['create'],
      domain: ['list', 'load', 'update'],
      fossil: ['load'],
      gallery: ['list'],
      greenhouse: ['create', 'load'],
      kennel: ['create'],
      kingdom: ['create', 'list', 'load'],
      // Its 200 has no JSON schema, and still decides over the 201 list.
      ledger: ['load'],
      observation: ['list'],
      package: ['load'],
      sample: ['load'],
      site: ['load'],
      // A page and a single item beneath its route are one resource.
      tally: ['create', 'list'],
      token: ['load'],
    })

    const listpt = entities.observation.op.list.points[0]
    assert.strictEqual(listpt.o, '/{year}/observation')
    assert.ok(null != entities.observation.fields.observedAt,
      'observation fields not unwrapped: ' + Object.keys(entities.observation.fields))

    // A record with one nested object reads the record, not the object.
    assert.strictEqual(entities.fossil.op.load.points[0].t.res, '`body`')

    // A response that is the entity's own component reads the record, though
    // one of its properties is named after the entity.
    assert.strictEqual(entities.greenhouse.op.load.points[0].t.res, '`body`')

    // A body wraps the record under the entity's name only when that is all
    // it holds.
    assert.strictEqual(entities.greenhouse.op.create.points[0].t.req, '`reqdata`')
    assert.deepStrictEqual(entities.kennel.op.create.points[0].t.req, { kennel: '`reqdata`' })

    // Such a body gives the fields of the record it wraps, not the wrapper.
    assert.deepStrictEqual(Object.keys(entities.kennel.fields).sort(), ['breed', 'name'])
  })


  // Lob's shape: a page composed with allOf, whose records are a oneOf, so
  // the fields come from the list example read through the same `data`. A
  // composed record keeps its one object (owner), and a page may hold a count
  // beside its records (notes).
  test('guide-allof-envelope', async () => {
    const folder = __dirname + '/../test/allof-envelope'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'allof-envelope', def: 'allof-envelope-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    const res = (ent: string, op: string) => entities[ent].op[op].points[0].t.res

    assert.strictEqual(res('address', 'list'), '`body.data`')
    assert.strictEqual(res('address', 'load'), '`body`')
    assert.strictEqual(res('address', 'remove'), '`body`')
    assert.strictEqual(res('owner', 'load'), '`body`')
    assert.strictEqual(res('note', 'list'), '`body.data`')

    assert.deepStrictEqual(Object.keys(entities.address.fields), [
      'address_line1', 'address_line2', 'address_zip', 'id', 'name',
    ])
    assert.deepStrictEqual(Object.keys(entities.owner.fields), ['id', 'name', 'settings'])
  })


  // Maxio wraps every record under the name of its type, in lists too, so
  // each item of a list holds one record. The list reads each item's record
  // through a struct transform, and the wrapper's key is no field. An item
  // holding more than the record, as an invoice beside its links, is whole.
  test('guide-item-envelope', async () => {
    const folder = __dirname + '/../test/item-envelope'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'item-envelope', def: 'item-envelope-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    const res = (ent: string, op: string) => entities[ent].op[op].points[0].t.res

    assert.deepStrictEqual(res('customer', 'list'),
      ['`$EACH`', 'body', { '`$MERGE`': '`.customer`' }])
    assert.strictEqual(res('customer', 'load'), '`body.customer`')
    assert.ok(Fs.readFileSync(folder + '/guide/base-guide.aontu', 'utf8').includes(
      'op: list: transform: res: *["`$EACH`","body",{"`$MERGE`":"`.customer`"}]|top'))
    assert.strictEqual(res('invoice', 'list'), '`body`')
    assert.deepStrictEqual(Object.keys(entities.customer.fields),
      ['email', 'first_name', 'id', 'last_name'])
  })


  // The list's transform is a default of the base guide, which the entry
  // guide overrides as it does a path.
  test('guide-item-envelope-overlay', async () => {
    const Os = require('node:os')
    const Path = require('node:path')
    const def = 'item-envelope-def.json'

    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-item-'))
    const folder = Path.join(dir, 'model')
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
    Fs.mkdirSync(Path.join(dir, 'def'))
    Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', def), Path.join(dir, 'def', def))
    Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'), [
      '@"@voxgig/apidef/model/guide.aontu"',
      '@"./base-guide.aontu"',
      'guide: entity: customer: path: "/customers.json": op: list: transform: res: "`body.data`"',
      '',
    ].join('\n'))

    const build = await ApiDef.makeBuild({ folder })
    const bres = await build(
      { name: 'item-envelope', def },
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
    const basepath = Path.join(folder, 'guide', 'base-guide.aontu')
    const baseguide = Fs.existsSync(basepath) ? Fs.readFileSync(basepath, 'utf8') : ''
    Fs.rmSync(dir, { recursive: true, force: true })

    assert.ok(bres.ok, 'build failed: ' + bres.err?.message)
    assert.ok(baseguide.includes(
      'op: list: transform: res: *["`$EACH`","body",{"`$MERGE`":"`.customer`"}]|top'),
      'base guide lacks the list default:\n' + baseguide)
    assert.strictEqual(
      bres.apimodel.main.kit.entity.customer.op.list.points[0].t.res, '`body.data`')
  })


  // A wrapper whose suffix was cleaned away to name the entity is still the
  // wrapper, so the record is read by the entity's name. The entity's own
  // component is the record, though one of its properties shares the name.
  test('guide-wrapper-name', async () => {
    const folder = __dirname + '/../test/wrapper-name'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'wrapper-name', def: 'wrapper-name-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    assert.strictEqual(entities.hive.op.load.points[0].t.res, '`body.hive`')
    assert.strictEqual(entities.garden.op.load.points[0].t.res, '`body`')
  })


  // A composed scalar is a scalar: an id described in an allOf (thing) or
  // written as a union (badge) is not an envelope around the record, a
  // described name is not a wrapper (label), and a described value beside a
  // page's records does not stop the page from unwrapping them (sample).
  test('guide-composed-scalar', async () => {
    const folder = __dirname + '/../test/composed-scalar'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'composed-scalar', def: 'composed-scalar-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    const point = (ent: string, op: string) => entities[ent]?.op[op]?.points[0]
    assert.strictEqual(point('thing', 'load')?.t.res, '`body`')
    assert.strictEqual(point('badge', 'load')?.t.res, '`body`')
    assert.strictEqual(point('label', 'load')?.t.res, '`body`')
    assert.strictEqual(point('label', 'create')?.t.res, '`body`')
    assert.strictEqual(point('label', 'create')?.t.req, '`reqdata`')
    assert.strictEqual(point('sample', 'list')?.t.res, '`body.data`')

    // The fields are the record's, not those of a value it holds.
    assert.deepStrictEqual(Object.keys(entities.thing.fields).sort(), ['id', 'status'])
    assert.deepStrictEqual(Object.keys(entities.badge.fields).sort(), ['id', 'status'])
    assert.deepStrictEqual(Object.keys(entities.label.fields).sort(), ['color', 'id', 'label'])
  })


  // A page with no data of its own reads its one list of records past a list
  // of scalars (metric) or an object (notification, preference), composed or
  // not (branch), while a response with a state of its own is read whole
  // (rollup). A create that
  // only an Accepted response answers reads its envelope as the load does.
  test('guide-page-side', async () => {
    const folder = __dirname + '/../test/page-side'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'page-side', def: 'page-side-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    const res = (ent: string, op: string) => entities[ent]?.op[op]?.points[0].t.res
    assert.strictEqual(res('metric', 'list'), '`body.data`')
    assert.strictEqual(res('notification', 'list'), '`body.data`')
    assert.strictEqual(res('preference', 'list'), '`body.workflows`')
    assert.strictEqual(res('rollup', 'list'), '`body`')
    assert.strictEqual(res('branch', 'list'), '`body.branches`')
    assert.strictEqual(res('job', 'create'), '`body.data`')
    assert.strictEqual(res('job', 'load'), '`body.data`')

    // With no read beside it, the fields come from the Accepted answer too.
    assert.strictEqual(res('export', 'create'), '`body.data`')
    assert.deepStrictEqual(Object.keys(entities.export.fields).sort(),
      ['format', 'id', 'state', 'url'])
  })


  // A response composed with allOf carries the record under the entity's name
  // beside its other parts (project), while an entity's own composed component
  // is the record, though one of its parts shares the entity's name (widget).
  test('guide-composed-part', async () => {
    const folder = __dirname + '/../test/composed-part'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'composed-part', def: 'composed-part-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    const res = (ent: string, op: string) => entities[ent]?.op[op]?.points[0].t.res
    assert.strictEqual(res('project', 'create'), '`body.project`')
    assert.strictEqual(res('project', 'load'), '`body.project`')
    assert.strictEqual(res('project', 'update'), '`body.project`')
    assert.strictEqual(res('project', 'remove'), '`body.project`')
    assert.strictEqual(res('widget', 'load'), '`body`')
  })


  // A list reads its records, past an object named for the entity beside
  // them: a quote beside its episodes, or the competition a page of its
  // matches repeats. A list under the entity's name, and a load, still
  // unwrap to it.
  test('guide-list-records', async () => {
    const folder = __dirname + '/../test/list-records'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'list-records', def: 'list-records-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    const res = (ent: string, op: string, path: string) =>
      entities[ent]?.op[op]?.points.find((pt: any) => pt.o === path)?.t.res
    assert.strictEqual(res('quote', 'list', '/quote/random'), '`body.episodes`')
    assert.strictEqual(res('competition', 'list', '/competitions/{id}/matches'), '`body.matches`')
    assert.strictEqual(res('competition', 'list', '/competitions/{id}/teams'), '`body.teams`')
    assert.strictEqual(res('scorer', 'list', '/competitions/{id}/scorers'), '`body.scorers`')
    assert.strictEqual(res('note', 'list', '/notes'), '`body.note`')
    assert.strictEqual(res('quote', 'load', '/quote/{id}'), '`body.quote`')
    assert.strictEqual(res('competition', 'load', '/competitions/{id}'), '`body`')
  })


  // Apicurio tags every /well-known route WellKnown and its agent, MCP tool and
  // schema reads answer nothing, so each takes its collection's segment, after
  // the tag where a route outside it, before or after it, has that name or its
  // stored form, then a number while one has that too. An item route its
  // collection names counts only once named; a verb on one claims its segment.
  test('guide-well-known', async () => {
    const folder = __dirname + '/../test/well-known'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'well-known', def: 'well-known-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    const paths = (ent: string, op: string) =>
      (entities[ent]?.op[op]?.points ?? []).map((pt: any) => pt.o).sort()
    const disco = 'well_known_discovery_endpoints_for_agents_and_model_context'
    const search = 'artifact_search_endpoints_from_groups_and_versions_and_branches_and'
    const admin = 'registry_administration_endpoints_for_role_mappings_and_config'
    assert.deepStrictEqual(Object.keys(entities).sort(),
      ['aaa_ijn', 'aaa_kit', 'abc', 'agent', 'agent_card', 'artifact', search, search + '2',
        search + '3', 'bcd', 'cask', 'cde', 'crate', 'dbase', 'dbn', 'dbset', 'dsn', 'dsx',
        'dtn', 'dun', 'efn', 'efn2', 'ghn', 'hive', 'ijn', 'kiln', 'kit', 'ledger', 'mcp_tool',
        'nest', 'note', 'note2', 'oven', 'parcel', 'pot', 'qqn', 'qrs', 'qrs_admin_qrs', 'qrt',
        admin, admin + '2', 'repo', 'rrn', 'sched', 'schema', 'uvn', 'vault', 'well_known_agent',
        'well_known_cask', 'well_known_crate', 'well_known_db', 'well_known_dbase', disco,
        disco + '2', disco + '3', 'well_known_ds', 'well_known_dt', 'well_known_du',
        'well_known_ef', 'well_known_gh', 'well_known_hive', 'well_known_ledger',
        'well_known_nest', 'well_known_nest2', 'well_known_qq', 'well_known_qq2',
        'well_known_repo', 'well_known_rr', 'well_known_rr2', 'well_known_uvn',
        'well_known_xyn', 'widget', 'xyn'])
    assert.deepStrictEqual(bres.ctx.warn.history.map((w: any) => w.note)
      .filter((note: string) => /same selector/.test(note)), [])
    assert.deepStrictEqual(paths('agent', 'list'), ['/well-known/agent.json'])
    assert.deepStrictEqual(paths('well_known_agent', 'list'), ['/well-known/agents'])
    assert.deepStrictEqual(paths('well_known_agent', 'load'),
      ['/well-known/agents/{groupId}/{artifactId}'])
    assert.deepStrictEqual(paths('mcp_tool', 'list'), ['/well-known/mcp-tools'])
    assert.deepStrictEqual(paths('mcp_tool', 'load'),
      ['/well-known/mcp-tools/{groupId}/{artifactId}'])
    assert.deepStrictEqual(paths('schema', 'load'),
      ['/well-known/schemas/{schemaType}/{version}'])
    assert.deepStrictEqual(paths('artifact', 'load'),
      ['/ids/contentIds/{contentId}', '/ids/globalIds/{globalId}'])
    assert.deepStrictEqual(paths('dbn', 'load'), ['/other/db'])
    assert.deepStrictEqual(paths('well_known_db', 'load'),
      ['/well-known/db', '/well-known/db/{id}'])
    assert.deepStrictEqual(paths('ledger', 'create'), ['/aaa/ledger/{id}/history'])
    assert.deepStrictEqual(paths('well_known_ledger', 'load'), ['/well-known/ledger/{id}'])
    assert.deepStrictEqual(paths('dbase', 'create'), ['/zzz/dbase/{id}/history'])
    assert.deepStrictEqual(paths('well_known_dbase', 'load'),
      ['/well-known/dbase', '/well-known/dbase/{id}'])
    assert.deepStrictEqual(paths('agent_card', 'list'),
      ['/well-known/agent-card.json', '/zzz/{id}/dbset'])
    assert.deepStrictEqual(paths('dbset', 'load'), ['/well-known/dbset/{id}'])
    assert.deepStrictEqual(paths('dsn', 'load'), ['/aaa/ds/{id}'])
    assert.deepStrictEqual(paths('well_known_ds', 'load'), ['/well-known/ds/{id}'])
    assert.deepStrictEqual(paths('dtn', 'load'), ['/zzz/dtn'])
    assert.deepStrictEqual(paths('well_known_dt', 'load'), ['/well-known/dt/{id}'])
    assert.deepStrictEqual(paths('dun', 'load'), ['/aaa/dun'])
    assert.deepStrictEqual(paths('well_known_du', 'load'), ['/well-known/du/{id}'])
    assert.deepStrictEqual(paths('widget', 'load'), ['/zzz/vault/{id}'])
    assert.deepStrictEqual(paths('widget', 'create'), ['/zzz/vault/{id}/merge'])
    assert.deepStrictEqual(paths('vault', 'load'), ['/well-known/vault/{id}'])
    assert.deepStrictEqual(paths('repo', 'load'), ['/zzz/repo/{id}'])
    assert.deepStrictEqual(paths('well_known_repo', 'load'), ['/well-known/repo/{id}'])
    assert.deepStrictEqual(paths('cask', 'load'), ['/aaa/cask/{id}'])
    assert.deepStrictEqual(paths('well_known_cask', 'load'), ['/well-known/cask/{id}'])
    assert.deepStrictEqual(paths('parcel', 'load'), ['/crates/{id}'])
    assert.deepStrictEqual(paths('crate', 'load'), ['/zzz/crate/{id}'])
    assert.deepStrictEqual(paths('well_known_crate', 'load'), ['/well-known/crate/{id}'])
    assert.deepStrictEqual(paths('xyn', 'load'), ['/zzz/xy'])
    assert.deepStrictEqual(paths('well_known_xyn', 'load'), ['/well-known/xyn/{id}'])
    assert.deepStrictEqual(paths('uvn', 'load'), ['/aaa/uv'])
    assert.deepStrictEqual(paths('well_known_uvn', 'load'), ['/well-known/uvn/{id}'])
    assert.deepStrictEqual(paths('qqn', 'load'), ['/aaa/qq'])
    assert.deepStrictEqual(paths('well_known_qq', 'load'), ['/well-known/qq/{id}'])
    assert.deepStrictEqual(paths('well_known_qq2', 'load'), ['/well-known/v2/qq/{id}'])
    assert.deepStrictEqual(paths('rrn', 'load'), ['/aaa/rr'])
    assert.deepStrictEqual(paths('well_known_rr', 'load'), ['/zzz/well_known_rr/{id}'])
    assert.deepStrictEqual(paths('well_known_rr2', 'load'), ['/well-known/rr/{id}'])

    // Names compare in their stored form: Aaa's item routes take efn and ghn
    // first, which ef and gh are stored as, so WellKnown's take its name, and
    // in the other order WellKnown's ij takes ijn first.
    assert.deepStrictEqual(paths('efn', 'load'), ['/aaa/efn/{id}'])
    assert.deepStrictEqual(paths('well_known_ef', 'load'), ['/well-known/ef/{id}'])
    assert.deepStrictEqual(paths('efn2', 'load'), ['/zzz/efn2/{id}'])
    assert.deepStrictEqual(paths('ghn', 'load'), ['/aaa/ghn/{id}'])
    assert.deepStrictEqual(paths('well_known_gh', 'load'), ['/well-known/gh/{id}'])
    assert.deepStrictEqual(paths('ijn', 'load'), ['/well-known/ij/{id}'])
    assert.deepStrictEqual(paths('aaa_ijn', 'load'), ['/zzz/ijn/{id}'])

    // Past the stored length the number follows the stored form, where a cut
    // cannot drop it, and a verb on the item route joins it; a cut name stays
    // with a route claiming it that sorts after the item route.
    assert.deepStrictEqual(paths('abc', 'load'), ['/zzz/abc'])
    assert.deepStrictEqual(paths('bcd', 'load'), ['/lt/bcd/{id}'])
    assert.deepStrictEqual(paths(disco, 'load'), ['/aaa/' + disco])
    assert.deepStrictEqual(paths(disco + '2', 'load'), ['/lt/abc/{id}'])
    assert.deepStrictEqual(paths(disco + '3', 'load'), ['/lt/v2/abc/{id}'])
    assert.deepStrictEqual(paths(search, 'load'), ['/lu/abc/{id}'])
    assert.deepStrictEqual(paths(search + '2', 'load'), ['/lu/v2/abc/{id}'])
    assert.deepStrictEqual(paths(search + '2', 'create'), ['/lu/v2/abc/{id}/merge'])
    assert.deepStrictEqual(paths(search + '3', 'load'), ['/lu/v3/abc/{id}'])
    assert.deepStrictEqual(paths(admin, 'load'), ['/zzz/' + admin])
    assert.deepStrictEqual(paths(admin + '2', 'load'), ['/lv/abc/{id}'])
    assert.deepStrictEqual(paths('cde', 'load'), ['/lv/cde/{id}'])

    // A route under a collection nested in another is outside the outer one,
    // so the nested one, which sorts first, keeps the name it takes.
    assert.deepStrictEqual(paths('nest', 'load'), ['/aaa/nest'])
    assert.deepStrictEqual(paths('well_known_nest', 'load'), ['/well-known/nest/v2/nest/{id}'])
    assert.deepStrictEqual(paths('well_known_nest2', 'load'), ['/well-known/nest/{id}'])
    assert.deepStrictEqual(paths('hive', 'load'), ['/well-known/hive/v2/hive/{id}'])
    assert.deepStrictEqual(paths('well_known_hive', 'load'), ['/well-known/hive/{id}'])

    // A segment that is the tag's own name is not held by the routes the tag
    // names, so Note's collection keeps note beside its send, and a second
    // collection with that segment takes a number rather than note_note.
    assert.deepStrictEqual(paths('note', 'create'), ['/note/send', '/notes'])
    assert.deepStrictEqual(paths('note', 'load'), ['/notes/{id}'])
    assert.deepStrictEqual(paths('note', 'remove'), ['/notes/{id}'])
    assert.deepStrictEqual(paths('note2', 'load'), ['/v2/notes/{id}'])
    assert.deepStrictEqual(paths('sched', 'load'), ['/notes/sched'])
    assert.deepStrictEqual(paths('sched', 'remove'), ['/notes/sched/{id}'])

    // Bare where no route outside has the name: Kiln's item route takes its
    // collection's record, QrsAdmin's counts only once named, and Aaa's kit
    // takes its tag, since the verb on WellKnown's kit claims kit.
    assert.deepStrictEqual(paths('oven', 'load'), ['/kilns/{id}'])
    assert.deepStrictEqual(paths('pot', 'list'), ['/zzz/pots'])
    assert.deepStrictEqual(paths('pot', 'load'), ['/zzz/pots/{id}'])
    assert.deepStrictEqual(paths('kiln', 'load'), ['/well-known/kiln/{id}'])
    assert.deepStrictEqual(paths('qrs', 'load'), ['/well-known/qrs/{id}'])
    assert.deepStrictEqual(paths('qrs_admin_qrs', 'load'), ['/zzz/qrs/{id}'])
    assert.deepStrictEqual(paths('qrt', 'load'), ['/zzz/qrt/{id}'])
    assert.deepStrictEqual(paths('kit', 'load'), ['/well-known/kit/{id}'])
    assert.deepStrictEqual(paths('kit', 'create'), ['/well-known/kit/{id}/merge'])
    assert.deepStrictEqual(paths('aaa_kit', 'load'), ['/aaa/kit/{id}'])
  })


  // A trailing parameter under its entity's segment is the entity's key,
  // whatever the response component is called: a rare component named for
  // another view of it, or a tag on a write that answers with no component.
  test('guide-trailing-key', async () => {
    const folder = __dirname + '/../test/trailing-key'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'trailing-key', def: 'trailing-key-def.json' },
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
    assert.deepStrictEqual(
      gents.runner_group.path['/orgs/{org}/runner-groups/{runner_group_id}'].rename.param,
      { org: 'org_id', runner_group_id: 'id' })
    assert.deepStrictEqual(
      gents.user.path['/user_groups/{id}/users/{uid}'].rename.param,
      { id: 'user_group_id', uid: 'id' })

    const entities = bres.apimodel.main.kit.entity
    const params = (pt: any) => (pt.g.params ?? []).map((a: any) => a.or + '>' + a.n).sort()
    for (const op of ['load', 'update']) {
      assert.deepStrictEqual(params(entities.runner_group.op[op].points[0]),
        ['org>org_id', 'runner_group_id>id'], 'runner_group ' + op)
    }
    for (const op of ['create', 'remove']) {
      assert.deepStrictEqual(params(entities.user.op[op].points[0]),
        ['id>user_group_id', 'uid>id'], 'user ' + op)
    }
  })


  // A literal that canonizes to nothing (`-`) names no entity and no
  // component: the key after it is not taken for the entity's own.
  test('guide-blank-segment', async () => {
    const folder = __dirname + '/../test/blank-segment'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'blank-segment', def: 'blank-segment-def.json' },
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

    const pathdesc = (path: string) => Object.values(bres.guide.entity)
      .map((ent: any) => ent.path[path]).find((pd: any) => null != pd)
    const idOf = (path: string) => Object.entries(pathdesc(path).rename?.param ?? {})
      .filter(([, target]) => 'id' === target).map(([orig]) => orig)

    assert.deepStrictEqual(idOf('/orders/-/{order_id}/lines/{line_id}'), ['line_id'])
    assert.deepStrictEqual(idOf('/orders/-/{order}/notes/{note_id}'), ['note_id'])
    assert.deepStrictEqual(idOf('/orders/-/{order_id}/refund'), [])
    assert.deepStrictEqual(Object.keys(pathdesc('/orders/-/{order_id}/refund').action ?? {}), [])
  })


  // An entity whose every operation is an access-token exchange is emitted
  // deactivated, never dropped; one exchange among other operations
  // (session) leaves its entity active. go/apidef_test.go reads the base
  // guide this writes.
  test('guide-auth-exchange', async () => {
    const folder = __dirname + '/../test/auth-exchange'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'auth-exchange', def: 'auth-exchange-def.json' },
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
    assert.deepStrictEqual(Object.keys(gents).sort(), ['session', 'token', 'widget'])
    assert.strictEqual(gents.token.active, false)
    assert.notStrictEqual(gents.session.active, false)
    assert.notStrictEqual(gents.widget.active, false)

    const baseGuide = Fs.readFileSync(folder + '/guide/base-guide.aontu', 'utf8')
    assert.ok(baseGuide.includes([
      '  entity: token: {',
      '    # Deactivated by the heuristic (auth-exchange). Set `active: true`' +
      ' here in guide.aontu to generate it as an entity.',
      '    active: *false',
      '    path: "/auth/token": {',
    ].join('\n')), baseGuide)
    assert.strictEqual(baseGuide.split('active: *false').length, 2, baseGuide)

    const entities = bres.apimodel.main.kit.entity
    const ops = Object.fromEntries(Object.keys(entities).sort()
      .map((name) => [name, Object.keys(entities[name].op ?? {}).sort()]))
    assert.deepStrictEqual(ops, {
      session: ['create', 'load'],
      widget: ['create', 'list', 'load', 'remove'],
    })
  })


  // A rare schema that several resources share yields to each path's name
  // (flag, counter, ack's variables). Not shared: a record with an id (memo),
  // a view beneath a co-sharing resource (stats/daily), item aliases (removal),
  // a name that different schemas would take (the manifests), and routes to
  // one name that no parameter tells apart (ack's secrets).
  test('guide-sharing', async () => {
    const folder = __dirname + '/../test/sharing'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'sharing', def: 'sharing-def.json' },
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

    const routes = Object.fromEntries(Object.keys(bres.guide.entity).sort()
      .map((name) => [name, Object.entries(bres.guide.entity[name].path)
        .flatMap(([path, pd]: [string, any]) =>
          Object.values(pd.op).map((op: any) => op.method + ' ' + path))
        .sort()]))
    assert.deepStrictEqual(routes, {
      ack: [
        'PUT /orgs/{org}/actions/secrets/{name}',
        'PUT /orgs/{org}/dependabot/secrets/{name}',
      ],
      counter: ['GET /stats/daily'],
      enforce_admin: ['GET /settings/enforce_admins'],
      job: ['GET /jobs', 'GET /jobs/{id}', 'POST /jobs/{id}/rerun'],
      metric: ['GET /metrics'],
      memo: ['GET /notes', 'GET /notes/{id}', 'GET /users/{uid}/starred_notes'],
      package_manifest: ['GET /packages/{pid}/digest', 'GET /packages/{pid}/download_urls'],
      recipe_manifest: ['GET /recipes/{rid}/digest', 'GET /recipes/{rid}/download_urls'],
      removal: [
        'DELETE /accounts/{aid}/bank_accounts/{id}',
        'DELETE /accounts/{aid}/external_accounts/{id}',
      ],
      required_signature: ['GET /settings/required_signatures'],
      stat: ['GET /stats'],
      variable: ['POST /orgs/{org}/actions/variables'],
    })

    const rerun = bres.apimodel.main.kit.entity.job.op.create.points[0]
    assert.strictEqual(rerun.q?.$action, 'rerun')
  })


  // Asking whether a response schema declares an `id` reads the def and
  // leaves it as parsed: a node that references share stays one node, which
  // is what the field transform's union count sees.
  test('guide-sharing-reads-def', async () => {
    const folder = __dirname + '/../test/shared-node'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'shared-node', def: 'shared-node-def.json' },
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

    assert.ok(bres.ok, 'build failed: ' + bres.err?.message)

    const reviews = (schema: any) => schema.properties.reviews.properties
    const rule = bres.ctx.def.components.schemas.Rule
    const put = bres.ctx.def.paths['/rules/{rule_id}'].put
      .responses['200'].content['application/json'].schema
    for (const schema of [rule, put]) {
      assert.strictEqual(reviews(schema).dismiss.items.properties.owner,
        reviews(schema).bypass.items.properties.owner)
    }
  })


  // A path item's parameters, servers, summary, description and extension
  // keys are not methods, so they name no entity: /mirrors/{mirror_id} holds
  // no operation at all. go/apidef_test.go reads the base guide this writes.
  test('guide-path-item-keys', async () => {
    const folder = __dirname + '/../test/path-item-keys'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'path-item-keys', def: 'path-item-keys-def.json' },
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

    const routes = Object.fromEntries(Object.keys(bres.guide.entity).sort()
      .map((name) => [name, Object.entries(bres.guide.entity[name].path)
        .flatMap(([path, pd]: [string, any]) =>
          Object.values(pd.op).map((op: any) => op.method + ' ' + path))
        .sort()]))
    assert.deepStrictEqual(routes, {
      crate: ['DELETE /crates/{crate_id}', 'GET /crates/{crate_id}'],
      release: ['GET /crates/{crate_id}/versions/{version_id}'],
    })

    const entities = bres.apimodel.main.kit.entity
    assert.deepStrictEqual(Object.keys(entities).sort(), ['crate', 'release'])
    assert.deepStrictEqual(entities.release.relations.ancestors, [['crate']])
  })


  // The base guide already carries a collection path on the entity that owns
  // its items: /keys is named for its component, /keys/{key_id} for its tag.
  // The component's entity, left with no path, is dropped from the guide and
  // the model. go/apidef_test.go reads the base guide this writes.
  test('guide-collection-merge', async () => {
    const folder = __dirname + '/../test/collection-merge'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'collection-merge', def: 'collection-merge-def.json' },
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

    const routes = Object.fromEntries(Object.keys(bres.guide.entity).sort()
      .map((name) => [name, Object.entries(bres.guide.entity[name].path ?? {})
        .flatMap(([path, pd]: [string, any]) =>
          Object.values(pd.op).map((op: any) => op.method + ' ' + path))
        .sort()]))
    assert.deepStrictEqual(routes, {
      setting: ['DELETE /keys/{key_id}', 'GET /keys', 'POST /keys'],
    })
    assert.deepStrictEqual(Object.keys(bres.apimodel.main.kit.entity), ['setting'])
  })


  // guide.aontu gives /keys back to the emptied entity, or to a new one, and
  // the model keeps that assignment. go/apidef_test.go mirrors this case.
  test('guide-collection-merge-overlay', async () => {
    const Os = require('node:os')
    const Path = require('node:path')
    const def = 'collection-merge-def.json'

    for (const owner of ['key', 'keyring']) {
      const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-merge-'))
      const folder = Path.join(dir, 'model')
      Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
      Fs.mkdirSync(Path.join(dir, 'def'))
      Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', def), Path.join(dir, 'def', def))
      Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'), [
        '@"@voxgig/apidef/model/guide.aontu"',
        '@"./base-guide.aontu"',
        'guide: entity: ' + owner + ': path: "/keys": op: {',
        '  create: method: "POST"',
        '  list: method: "GET"',
        '}',
        'guide: entity: setting: path: "/keys": active: false',
        '',
      ].join('\n'))

      const build = await ApiDef.makeBuild({ folder })
      const bres = await build(
        { name: 'collection-merge', def },
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
      Fs.rmSync(dir, { recursive: true, force: true })

      assert.ok(bres.ok, owner + ': build failed: ' + bres.err?.message)

      const entities = bres.apimodel.main.kit.entity
      const routes = Object.fromEntries(Object.keys(entities).sort()
        .map((name) => [name, Object.entries(entities[name].op)
          .flatMap(([opname, op]: [string, any]) =>
            op.points.map((pt: any) => opname + ' ' + pt.m + ' ' + pt.o))
          .sort()]))
      assert.deepStrictEqual(routes, {
        [owner]: ['create POST /keys', 'list GET /keys'],
        setting: ['remove DELETE /keys/{key_id}'],
      }, owner)
    }
  })


  // Which entity an item route's methods and a collection's create take
  // from the records they answer with; a list joins its item however its
  // summary differs. go/apidef_test.go reads the base guide this writes.
  test('guide-item-record', async () => {
    const folder = __dirname + '/../test/item-record'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'item-record', def: 'item-record-def.json' },
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

    const routes = Object.fromEntries(Object.keys(bres.guide.entity).sort()
      .map((name) => [name, Object.entries(bres.guide.entity[name].path ?? {})
        .flatMap(([path, pd]: [string, any]) =>
          Object.values(pd.op).map((op: any) => op.method + ' ' + path))
        .sort()]))
    const I = '/clusters/{cluster_name}/instances'
    assert.deepStrictEqual(routes, {
      activity: [
        'DELETE /user/starred/{owner}/{repo}',
        'GET /user/starred',
        'PUT /user/starred/{owner}/{repo}',
      ],
      ci_runner_detail: ['GET /runners', 'GET /runners/{runner_id}'],
      ci_runner_registration: ['POST /runners'],
      ci_worker_detail: ['GET /workers', 'GET /workers/{worker_id}'],
      ci_worker_registration: ['POST /workers'],
      instance: [
        'GET ' + I,
        'GET ' + I + '/{instance_id}',
        'PATCH ' + I + '/{instance_id}',
        'POST ' + I + '/{instance_id}/restart',
      ],
      mail_domain_detail: [
        'GET /mail/v1/domains',
        'GET /mail/v1/domains/{id}',
        'POST /mail/v1/domains',
      ],
      repo: ['GET /repos/{repo_id}', 'POST /repos/{repo_id}/forks'],
      report: ['GET /exports/{export_id}'],
      repository_invitation: [
        'DELETE /user/repository_invitations/{invitation_id}',
        'GET /user/repository_invitations',
        'PATCH /user/repository_invitations/{invitation_id}',
      ],
      simulation_run: [
        'GET /simulation_runs',
        'GET /simulation_runs/{run_id}',
        'POST /simulation_runs',
      ],
      team: ['GET /teams/{team_id}'],
      team_invitation: [
        'DELETE /user/team_invitations/{invitation_id}',
        'GET /user/team_invitations',
        'PATCH /user/team_invitations/{invitation_id}',
      ],
      thing: ['GET /things/{thing_id}', 'PATCH /things/{thing_id}'],
      widget: ['GET /widgets', 'GET /widgets/{widget_id}', 'POST /widgets'],
    })

    const renames = bres.guide.entity.repository_invitation
      .path['/user/repository_invitations/{invitation_id}'].rename.param
    assert.deepStrictEqual({ ...renames }, { invitation_id: 'id' })
    const teamRenames = bres.guide.entity.team_invitation
      .path['/user/team_invitations/{invitation_id}'].rename.param
    assert.deepStrictEqual({ ...teamRenames }, { invitation_id: 'id' })
  })


  // The request each point sends: placeholders beside other text in their
  // element, a parameter declared without `in`, and custom methods beside
  // their trailing-verb spelling. go/apidef_test.go reads the base guide this
  // writes and expects the same points.
  test('guide-request-paths', async () => {
    const folder = __dirname + '/../test/request-paths'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'request-paths', def: 'request-paths-def.json' },
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

    const args = (list: any[] | undefined) =>
      (list ?? []).map((arg: any) => arg.n + ':' + arg.or).join(',')
    const entities = bres.apimodel.main.kit.entity
    const points = Object.keys(entities).sort().flatMap((ename) =>
      Object.keys(entities[ename].op).sort().flatMap((opname) =>
        (entities[ename].op[opname]?.points ?? []).map((pt: any) =>
          ename + '.' + opname + ' ' + pt.m + ' ' + pt.o +
          ' s=' + (pt.s ?? []).map((s: any) => null == s.var ? s.lit : '<' + s.var + '>').join('/') +
          ' params=' + args(pt.g?.params) + ' query=' + args(pt.g?.query) +
          ' exist=' + (pt.q?.exist ?? []).join(',') + ' action=' + (pt.q?.$action ?? ''))))

    assert.deepStrictEqual(points, REQUEST_PATHS_POINTS)
    assert.deepStrictEqual(bres.ctx.warn.history.map((w: any) => w.note),
      REQUEST_PATHS_WARNINGS)
  })


  // Each shape docs/reference/guide.md gives for collection paths: item,
  // composite key, a read before a tag's delete, a verb or composed page on
  // the same record, other records beneath the item, a split list and
  // create, and an item route that only writes, which takes the name the
  // list's record gives. go/apidef_test.go reads the base guide this writes.
  test('guide-collection-owner', async () => {
    const folder = __dirname + '/../test/collection-owner'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'collection-owner', def: 'collection-owner-def.json' },
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

    const routes = Object.fromEntries(Object.keys(bres.guide.entity).sort()
      .map((name) => [name, Object.entries(bres.guide.entity[name].path ?? {})
        .flatMap(([path, pd]: [string, any]) =>
          Object.values(pd.op).map((op: any) => op.method + ' ' + path))
        .sort()]))
    assert.deepStrictEqual(routes, {
      activity: ['DELETE /stars/{owner}/{repo}', 'GET /stars', 'PUT /stars/{owner}/{repo}'],
      admin: ['DELETE /shop/gadgets/{gadget_id}', 'DELETE /teams/{team_id}'],
      catalog_bundle: ['GET /catalog/bundles', 'PUT /catalog/bundles/{bundle_id}'],
      gadget: ['GET /shop/gadgets', 'GET /shop/gadgets/{gadget_id}', 'POST /shop/gadgets'],
      job: ['GET /jobs'],
      job_summary: ['POST /jobs/{job_id}/cancel'],
      org: ['GET /org'],
      plan: ['GET /plans'],
      purchase: ['GET /plans/{plan_id}/accounts'],
      report: ['GET /org/reports', 'POST /org/reports/{report_id}/rerun'],
      shop: ['GET /shop'],
      team: ['GET /teams', 'GET /teams/{team_id}'],
      token: ['GET /user/tokens', 'PUT /user/tokens/{slug}/refresh'],
      user: ['GET /user'],
    })
  })


  // One name for a parameter across an entity's operations: a parent key
  // keeps the specification's name, a name is never called `<parent>_id`, and
  // a path that makes a parameter the entity's `id` keeps it. go/apidef_test.go
  // reads the base guide this writes.
  test('guide-param-names', async () => {
    const folder = __dirname + '/../test/param-names'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'param-names', def: 'param-names-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    const selectors = Object.keys(entities).sort().flatMap((name) =>
      Object.entries(entities[name].op).flatMap(([opname, op]: [string, any]) =>
        op.points.map((pt: any) => name + '.' + opname + ' ' + pt.m + ' ' + pt.o +
          ' [' + pt.q.exist.join(',') + ']')))
      .sort()

    const C = '/orgs/{organization_name}/projects/{project_name}/containers'
    assert.deepStrictEqual(selectors, [
      'container.create POST ' + C + ' [organization_name,project_name]',
      'container.create POST ' + C + '/{container_name}/start' +
      ' [container_name,organization_name,project_name]',
      'container.list GET ' + C + ' [organization_name,project_name]',
      'container.load GET ' + C + '/{container_name} [id,organization_name,project_name]',
      'container.remove DELETE ' + C + '/{container_name} [id,organization_name,project_name]',
      'container.update PATCH ' + C + '/{container_name} [id,organization_name,project_name]',
      'instance.list GET ' + C + '/{container_name}/instances' +
      ' [container_name,organization_name,project_name]',
      'instance.load GET ' + C + '/{container_name}/instances/{instance_id}' +
      ' [container_name,id,organization_name,project_name]',
      'instance.update PATCH ' + C + '/{container_name}/instances/{instance_id}' +
      ' [container_name,id,organization_name,project_name]',
      'member.list GET /v1/teams/{team_slug}/members [team_slug]',
      'member.load GET /v1/teams/{team_slug}/members/{username} [id,team_slug]',
      'member.remove DELETE /v1/teams/{team_slug}/members/{username} [id,team_slug]',
      'repo.load GET /v1/repos/{owner} [id]',
      'repo.load GET /v1/repos/{owner}/{name} [name,owner]',
    ])
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
    for (const f of Object.values(planet.fields) as any[]) { planetFields[f.n] = f }
    assert.strictEqual(planetFields.id.r, true)
    assert.strictEqual(planetFields.name.r, true)
    assert.strictEqual(planetFields.kind.r, true)
    assert.strictEqual(planetFields.diameter.r, true)

    // A property's `description` becomes the field's `short`. Every generated
    // per-entity table has a Description column, and every cell was blank
    // because nothing read this. Only Planet.diameter carries one in the
    // fixture, which is the point: the fields WITHOUT a description must not
    // acquire an invented one.
    assert.strictEqual(planetFields.diameter.sh,
      'Mean equatorial diameter in kilometres.')
    assert.strictEqual(planetFields.id.sh, undefined)
    assert.strictEqual(planetFields.name.sh, undefined)
    assert.strictEqual(planetFields.kind.sh, undefined)

    // Moon schema has required: [id, name, planet_id, kind, diameter]
    const moonFields: Record<string, any> = {}
    for (const f of Object.values(moon.fields) as any[]) { moonFields[f.n] = f }
    assert.strictEqual(moonFields.id.r, true)
    assert.strictEqual(moonFields.name.r, true)
    assert.strictEqual(moonFields.planet_id.r, true)
    assert.strictEqual(moonFields.kind.r, true)
    assert.strictEqual(moonFields.diameter.r, true)
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
    assert.strictEqual(book.op.list.points[0].m, 'QUERY')

    // The Book response schema supplies the entity fields...
    const fieldNames = Object.keys(book.fields).sort()
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

@"@voxgig/apidef/model/apidef.aontu"

def: '${outprefix}def.yaml'
`

    const modelSrc = `
# apidef test: ${outprefix}

@"@voxgig/apidef/model/apidef.aontu"

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

    const model = aontu.generate(`@"test/solar/solar.aontu"`, {
      base: __dirname + '/..'
    })

    assert.deepStrictEqual(model.main.kit, SOLAR_MODEL.main.kit)
  })


  // A FastAPI document: no servers, a version prefix, trailing slashes,
  // fastapi-pagination pages, a list wrapper holding a meta object, and one
  // holding the filters it was read with. Each list joins the record entity
  // its item route names, and reads its one list of records. The base URL
  // becomes a server variable.
  test('guide-fastapi', async () => {
    const folder = __dirname + '/../test/fastapi'

    const build = await ApiDef.makeBuild({ folder })

    const bres = await build(
      { name: 'fastapi', def: 'fastapi-def.json' },
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

    const entities = bres.apimodel.main.kit.entity
    const ops = Object.fromEntries(Object.keys(entities).sort()
      .map((name) => [name, Object.keys(entities[name].op ?? {}).sort()]))
    assert.deepStrictEqual(ops, {
      insight: ['create', 'list', 'load', 'remove'],
      prompt: ['list', 'load'],
      tag: ['list', 'load'],
    })
    assert.strictEqual(entities.insight.op.list.points[0].o, '/api/v1/insights/')
    assert.strictEqual(entities.insight.op.list.points[0].t.res, '`body.items`')
    assert.strictEqual(entities.prompt.op.list.points[0].o, '/api/v1/prompts/')
    assert.strictEqual(entities.prompt.op.list.points[0].t.res, '`body.results`')
    assert.strictEqual(entities.tag.op.list.points[0].o, '/api/v1/tags/')
    assert.strictEqual(entities.tag.op.list.points[0].t.res, '`body.data`')

    const info = bres.apimodel.main.kit.info
    assert.strictEqual(info.servers[0].url, '{base}')
    assert.ok(null != info.servers[0].variables?.base, 'the base variable is declared')
    assert.ok(bres.ctx.warn.history.some((w: any) => /no server URL/.test(w.note)),
      'the missing server is a warning: ' + JSON.stringify(bres.ctx.warn.history))
  })


  test('server-option', async () => {
    const folder = __dirname + '/../test/fastapi'

    const build = await ApiDef.makeBuild({ folder, server: 'https://notebook.example.com/api' })

    const bres = await build(
      { name: 'fastapi', def: 'fastapi-def.json' },
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
    assert.strictEqual(bres.apimodel.main.kit.info.servers[0].url, 'https://notebook.example.com/api')
    assert.ok(!bres.ctx.warn.history.some((w: any) => /no server URL/.test(w.note)),
      'a given server is not a warning')
  })


  // go/apidef_test.go mirrors this case.
  test('postman-server-variable', async () => {
    const Os = require('node:os')
    const Path = require('node:path')
    const def = 'postman-server-def.json'
    const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidef-postman-'))
    const folder = Path.join(dir, 'model')
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
    Fs.mkdirSync(Path.join(dir, 'def'))
    Fs.copyFileSync(Path.join(__dirname, '..', 'test', 'def', def), Path.join(dir, 'def', def))
    Fs.writeFileSync(Path.join(folder, 'guide', 'guide.aontu'),
      '@"@voxgig/apidef/model/guide.aontu"\n@"./base-guide.aontu"\n')

    const build = await ApiDef.makeBuild({ folder })
    const bres = await build(
      { name: 'postman-server', def },
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
    Fs.rmSync(dir, { recursive: true, force: true })

    assert.ok(bres.ok, 'build failed: ' + bres.err?.message)
    assert.deepStrictEqual(bres.apimodel.main.kit.info.servers, [
      { url: 'http://{base_url}', variables: { base_url: { default: '' } } },
    ])
    assert.deepStrictEqual(
      bres.ctx.warn.history.map((w: any) => w.note)
        .filter((note: any) => /double braces/.test(note)),
      ['server URL `http://{{base_url}}` writes its variables in Postman\'s double' +
        ' braces: taken as `http://{base_url}`'])
  })


  describe('guide entity allowlist', () => {
    const PathMod = require('node:path')

    test('`active` has no default, so a project can supply one', () => {
      const src = Fs.readFileSync(
        PathMod.join(__dirname, '..', '..', 'model', 'guide.aontu'), 'utf8')

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
        'voxgig-sdk', 'univec-sdk', '.sdk', 'model', 'guide', 'base-guide.aontu')
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
        'country.aontu': GEN('country'),
        'list_country.aontu': GEN('list_country'),   // orphan
        'entity-index.aontu': '# Entity Models\n',
      })
      const removed = gcEntityFiles(Fs, null, dir, undefined, ['country'])
      assert.deepStrictEqual(removed, ['list_country.aontu'])
      assert.deepStrictEqual(listing(dir), ['country.aontu', 'entity-index.aontu'])
    })

    test('never touches a file apidef did not write', () => {
      const dir = tmpModel({
        'country.aontu': GEN('country'),
        'custom.aontu': '# my hand-written model fragment\nfoo: 1\n',  // no generated header
        'notes.txt': 'not aontu at all',
      })
      const removed = gcEntityFiles(Fs, null, dir, undefined, ['country'])
      assert.deepStrictEqual(removed, [])
      assert.deepStrictEqual(listing(dir), ['country.aontu', 'custom.aontu', 'notes.txt'])
    })

    test('respects outprefix — another def sharing the folder is not collected', () => {
      const dir = tmpModel({
        'solar-planet.aontu': GEN('planet'),
        'solar-moon.aontu': GEN('moon'),             // orphan of the solar def
        'solar-entity-index.aontu': '# Entity Models\n',
        'lunar-crater.aontu': GEN('crater'),         // belongs to a DIFFERENT def
      })
      const removed = gcEntityFiles(Fs, null, dir, 'solar-', ['planet'])
      assert.deepStrictEqual(removed, ['solar-moon.aontu'])
      assert.deepStrictEqual(listing(dir),
        ['lunar-crater.aontu', 'solar-entity-index.aontu', 'solar-planet.aontu'])
    })

    test('collects legacy .aon files, including one named for a kept entity', () => {
      const dir = tmpModel({
        'solar-planet.aontu': GEN('planet'),
        'solar-planet.aon': GEN('planet'),
        'solar-old.aon': GEN('old'),
        'solar-notes.aon': '# my notes\n',
        'solar-entity-index.aontu': '# Entity Models\n',
      })
      const removed = gcEntityFiles(Fs, null, dir, 'solar-', ['planet'])
      assert.deepStrictEqual(removed.sort(), ['solar-old.aon', 'solar-planet.aon'])
      assert.deepStrictEqual(listing(dir),
        ['solar-entity-index.aontu', 'solar-notes.aon', 'solar-planet.aontu'])
    })

    test('keeps the index and the whole current set; missing folder is a no-op', () => {
      const dir = tmpModel({
        'a.aontu': GEN('a'), 'b.aontu': GEN('b'),
        'entity-index.aontu': '# Entity Models\n',
      })
      assert.deepStrictEqual(gcEntityFiles(Fs, null, dir, undefined, ['a', 'b']), [])
      assert.deepStrictEqual(listing(dir), ['a.aontu', 'b.aontu', 'entity-index.aontu'])
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
          fields: {
            diameter: {
              n: 'diameter', h: 'Diameter',
              r: false,
              t: '`$NUMBER`',
              a: true
            },
            id: { n: 'id', h: 'Id', r: false, t: '`$STRING`', a: true },
            kind: {
              n: 'kind', h: 'Kind',
              r: false,
              t: '`$STRING`',
              a: true
            },
            name: {
              n: 'name', h: 'Name',
              r: false,
              t: '`$STRING`',
              a: true
            },
            planet_id: {
              n: 'planet_id', h: 'Planet Id',
              r: false,
              t: '`$STRING`',
              a: true
            }
          },
          id: { field: 'id', name: 'id' },
          name: 'moon',
          op: {
            create: {
              points: [
                {
                  g: {
                    params: [
                      {
                        k: 'param',
                        n: 'planet_id',
                        or: 'planet_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      }
                    ]
                  },
                  m: 'POST',
                  o: '/api/planet/{planet_id}/moon',
                  s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }],
                  q: { exist: ['planet_id'] },
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  rl: []
                }
              ],
              name: 'create'
            },
            list: {
              points: [
                {
                  g: {
                    params: [
                      {
                        k: 'param',
                        n: 'planet_id',
                        or: 'planet_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      }
                    ]
                  },
                  m: 'GET',
                  o: '/api/planet/{planet_id}/moon',
                  s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }],
                  q: { exist: ['planet_id'] },
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  rl: []
                }
              ],
              name: 'list'
            },
            load: {
              points: [
                {
                  g: {
                    params: [
                      {
                        k: 'param',
                        n: 'id',
                        or: 'moon_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      },
                      {
                        k: 'param',
                        n: 'planet_id',
                        or: 'planet_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      }
                    ]
                  },
                  m: 'GET',
                  o: '/api/planet/{planet_id}/moon/{moon_id}',
                  s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                  r: { param: { moon_id: 'id' } },
                  q: { exist: ['id', 'planet_id'] },
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  rl: []
                }
              ],
              name: 'load'
            },
            remove: {
              points: [
                {
                  g: {
                    params: [
                      {
                        k: 'param',
                        n: 'id',
                        or: 'moon_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      },
                      {
                        k: 'param',
                        n: 'planet_id',
                        or: 'planet_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      }
                    ]
                  },
                  m: 'DELETE',
                  o: '/api/planet/{planet_id}/moon/{moon_id}',
                  s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                  q: { exist: ['id', 'planet_id'] },
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  rl: []
                }
              ],
              name: 'remove'
            },
            update: {
              points: [
                {
                  g: {
                    params: [
                      {
                        k: 'param',
                        n: 'id',
                        or: 'moon_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      },
                      {
                        k: 'param',
                        n: 'planet_id',
                        or: 'planet_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      }
                    ]
                  },
                  m: 'PUT',
                  o: '/api/planet/{planet_id}/moon/{moon_id}',
                  s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'planet_id' }, { lit: 'moon' }, { var: 'id' }],
                  q: { exist: ['id', 'planet_id'] },
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  rl: []
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
          fields: {
            diameter: {
              n: 'diameter', h: 'Diameter',
              r: false,
              t: '`$NUMBER`',
              a: true
            },
            forbid: {
              n: 'forbid', h: 'Forbid',
              r: false,
              t: '`$BOOLEAN`',
              a: true
            },
            id: { n: 'id', h: 'Id', r: false, t: '`$STRING`', a: true },
            kind: {
              n: 'kind', h: 'Kind',
              r: false,
              t: '`$STRING`',
              a: true
            },
            name: {
              n: 'name', h: 'Name',
              r: false,
              t: '`$STRING`',
              a: true
            },
            ok: {
              n: 'ok', h: 'Ok',
              r: false,
              t: '`$BOOLEAN`',
              a: true
            },
            start: {
              n: 'start', h: 'Start',
              r: false,
              t: '`$BOOLEAN`',
              a: true
            },
            state: {
              n: 'state', h: 'State',
              r: false,
              t: '`$STRING`',
              a: true
            },
            stop: {
              n: 'stop', h: 'Stop',
              r: false,
              t: '`$BOOLEAN`',
              a: true
            },
            why: {
              n: 'why', h: 'Why',
              r: false,
              t: '`$STRING`',
              a: true
            }
          },
          id: { field: 'id', name: 'id' },
          name: 'planet',
          op: {
            create: {
              points: [
                {
                  g: {
                    params: [
                      {
                        k: 'param',
                        n: 'id',
                        or: 'planet_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      }
                    ]
                  },
                  m: 'POST',
                  o: '/api/planet/{planet_id}/forbid',
                  s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }, { lit: 'forbid' }],
                  r: { param: { planet_id: 'id' } },
                  q: { '$action': 'forbid', exist: ['id'] },
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  rl: []
                },
                {
                  g: {
                    params: [
                      {
                        k: 'param',
                        n: 'id',
                        or: 'planet_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      }
                    ]
                  },
                  m: 'POST',
                  o: '/api/planet/{planet_id}/terraform',
                  s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }, { lit: 'terraform' }],
                  r: { param: { planet_id: 'id' } },
                  q: { '$action': 'terraform', exist: ['id'] },
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  rl: []
                },
                {
                  m: 'POST',
                  o: '/api/planet',
                  s: [{ lit: 'api' }, { lit: 'planet' }],
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  g: { params: [] },
                  rl: [],
                  q: {}
                }
              ],
              name: 'create'
            },
            list: {
              points: [
                {
                  m: 'GET',
                  o: '/api/planet',
                  s: [{ lit: 'api' }, { lit: 'planet' }],
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  g: { params: [] },
                  rl: [],
                  q: {}
                }
              ],
              name: 'list'
            },
            load: {
              points: [
                {
                  g: {
                    params: [
                      {
                        k: 'param',
                        n: 'id',
                        or: 'planet_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      }
                    ]
                  },
                  m: 'GET',
                  o: '/api/planet/{planet_id}',
                  s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                  r: { param: { planet_id: 'id' } },
                  q: { exist: ['id'] },
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  rl: []
                }
              ],
              name: 'load'
            },
            remove: {
              points: [
                {
                  g: {
                    params: [
                      {
                        k: 'param',
                        n: 'id',
                        or: 'planet_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      }
                    ]
                  },
                  m: 'DELETE',
                  o: '/api/planet/{planet_id}',
                  s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                  q: { exist: ['id'] },
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  rl: []
                }
              ],
              name: 'remove'
            },
            update: {
              points: [
                {
                  g: {
                    params: [
                      {
                        k: 'param',
                        n: 'id',
                        or: 'planet_id',
                        r: true,
                        t: '`$STRING`',
                        a: true
                      }
                    ]
                  },
                  m: 'PUT',
                  o: '/api/planet/{planet_id}',
                  s: [{ lit: 'api' }, { lit: 'planet' }, { var: 'id' }],
                  q: { exist: ['id'] },
                  t: { req: '`reqdata`', res: '`body`' },
                  a: true,
                  rl: []
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
              d: { id: 'moon_n01', planet_id: 'planet01' },
              i: { id: 'moon_n01' },
              o: 'create',
              a: true,
              m: {}
            },
            {
              m: { planet_id: 'planet01' },
              o: 'list',
              v: [{ apply: 'ItemExists', spec: { id: 'moon_n01' } }],
              a: true,
              d: {}
            },
            {
              d: { id: 'moon_n01', planet_id: 'planet01' },
              i: { id: 'moon_n01' },
              o: 'update',
              s: [
                {
                  apply: 'TextFieldMark',
                  def: { mark: 'Mark01-moon_n01' }
                }
              ],
              a: true,
              m: {}
            },
            {
              i: { id: 'moon_n01' },
              m: { id: 'moon_n01', planet_id: 'planet01' },
              o: 'load',
              v: [
                {
                  apply: 'TextFieldMark',
                  def: { mark: 'Mark01-moon_n01' }
                }
              ],
              a: true,
              d: {}
            },
            {
              i: { id: 'moon_n01' },
              m: { id: 'moon_n01', planet_id: 'planet01' },
              o: 'remove',
              a: true,
              d: {}
            },
            {
              m: { planet_id: 'planet01' },
              o: 'list',
              v: [{ apply: 'ItemNotExists', def: { id: 'moon_n01' } }],
              a: true,
              d: {}
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
              d: { id: 'planet_n01' },
              i: { id: 'planet_n01' },
              o: 'create',
              a: true,
              m: {}
            },
            {
              o: 'list',
              v: [{ apply: 'ItemExists', spec: { id: 'planet_n01' } }],
              a: true,
              m: {},
              d: {}
            },
            {
              d: { id: 'planet_n01' },
              i: { id: 'planet_n01' },
              o: 'update',
              s: [
                {
                  apply: 'TextFieldMark',
                  def: { mark: 'Mark01-planet_n01' }
                }
              ],
              a: true,
              m: {}
            },
            {
              i: { id: 'planet_n01' },
              m: { id: 'planet_n01' },
              o: 'load',
              v: [
                {
                  apply: 'TextFieldMark',
                  def: { mark: 'Mark01-planet_n01' }
                }
              ],
              a: true,
              d: {}
            },
            {
              i: { id: 'planet_n01' },
              m: { id: 'planet_n01' },
              o: 'remove',
              a: true,
              d: {}
            },
            {
              o: 'list',
              v: [{ apply: 'ItemNotExists', def: { id: 'planet_n01' } }],
              a: true,
              m: {},
              d: {}
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



const REQUEST_PATHS_POINTS = [
  'board.load GET /boards/{boardId} s=boards/<id> params=id:boardId query= exist=id action=',
  'board.update PUT /boards/{boardId}/{fileName}.json s=boards/<id>/{file_name}.json params=file_name:fileName,id:boardId query= exist=file_name,id action=',
  'message.create POST /messages/{messageId}/cancel s=messages/<id>/cancel params=id:messageId query= exist=id action=cancel',
  'message.list GET /messages s=messages params= query= exist= action=',
  'message.load GET /messages/{messageId} s=messages/<id> params=id:messageId query= exist=id action=',
  'message.load GET /messages/count s=messages/count params= query= exist= action=count',
  'permission.list GET /contacts/groups/{groupId}/permissions s=contacts/groups/<group_id>/permissions params=group_id:groupId query= exist=group_id action=',
  'permission.load GET /contacts/groups/{groupId}/permissions/{username} s=contacts/groups/<group_id>/permissions/<id> params=group_id:groupId,id:username query=verbose:verbose exist=group_id,id action=',
  'permission.remove DELETE /contacts/groups/{groupId}/permissions/{username} s=contacts/groups/<group_id>/permissions/<id> params=group_id:groupId,id:username query= exist=group_id,id action=',
  'permission.update PUT /contacts/groups/{groupId}/permissions/{username} s=contacts/groups/<group_id>/permissions/<id> params=group_id:groupId,id:username query= exist=group_id,id action=',
  'schedule.create POST /schedules/{scheduleId}:cancel s=schedules/{id}:cancel params=id:scheduleId query= exist=id action=cancel',
  'schedule.list GET /schedules s=schedules params= query= exist= action=',
  'schedule.load GET /schedules/{scheduleId} s=schedules/<id> params=id:scheduleId query= exist=id action=',
  'schedule.load GET /schedules:count s=schedules:count params= query= exist= action=count',
  'schedule.remove DELETE /schedules s=schedules params= query= exist= action=',
  'state.load GET /states/{stateAbbreviation}.json s=states/{state_abbreviation}.json params=state_abbreviation:stateAbbreviation query= exist=state_abbreviation action=',
  'thread.list GET /{board}/thread/{threadId}.json s=<board>/thread/{thread_id}.json params=board:board,thread_id:threadId query= exist=board,thread_id action=',
  'world.load GET /image/world/{worldTileName}{tileX}-{tileY}-0.png s=image/world/{world_tile_name}{tile_x}-{tile_y}-0.png params=tile_x:tileX,tile_y:tileY,world_tile_name:worldTileName query= exist=tile_x,tile_y,world_tile_name action=',
]


const REQUEST_PATHS_WARNINGS = [
  'Parameter username on entity=permission op=load path=/contacts/groups/{groupId}/permissions/{username} has no `in`; it names the path placeholder {username}, so it is taken as a path parameter. A parameter needs an `in`.',
  'Parameter verbose on entity=permission op=load path=/contacts/groups/{groupId}/permissions/{username} has no `in`, so it is taken as a query parameter. A parameter needs an `in`.',
  'Parameter username on entity=permission op=remove path=/contacts/groups/{groupId}/permissions/{username} has no `in`; it names the path placeholder {username}, so it is taken as a path parameter. A parameter needs an `in`.',
  'Parameter username on entity=permission op=update path=/contacts/groups/{groupId}/permissions/{username} has no `in`; it names the path placeholder {username}, so it is taken as a path parameter. A parameter needs an `in`.',
]
