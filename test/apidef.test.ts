/* Copyright (c) 2024 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'

import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import { Aontu } from 'aontu'

import * as Diff from 'diff'


import {
  ApiDef
} from '../'


// TODO: remove all sdk refs or rename to api


const aontu = new Aontu()


describe('apidef', () => {

  test('exist', async () => {
    expect(ApiDef).exist()
  })


  test('guide-solar', async () => {
    const outprefix = 'solar-1.0.0-openapi-3.0.0-'
    const folder = __dirname + '/../test/api'

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
          base: __dirname + '/../test/api',
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

    // console.dir(bres.guide, { depth: null })

    const matchGuide = {
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
            }
          },
          name: 'planet'
        }
      },
      metrics: { count: { entity: 2, path: 4, method: 10 } }
    }


    expect(bres.guide).contains(matchGuide)
  })



  test('full-solar', async () => {
    const outprefix = 'solar-1.0.0-openapi-3.0.0-'
    const folder = __dirname + '/../test/api'

    const build = await ApiDef.makeBuild({
      folder,
      debug: 'debug',
      outprefix,
    })

    const modelSrc = `
# apidef test: ${outprefix}

name: solar

@"@voxgig/apidef/model/apidef.jsonic"

def: '${outprefix}def.yaml'
`

    // const model = Aontu(modelSrc).gen()
    const model = aontu.generate(modelSrc)

    const buildspec = {
      spec: {
        base: __dirname + '/../test/api'
      }
    }

    const bres = await build(model, buildspec, {})

    const baseGuideSrc = bres.ctx.note.guide.base

    if (baseGuideSrc !== SOLAR_GUIDE_BASE) {
      const difflines = Diff.diffLines(baseGuideSrc, SOLAR_GUIDE_BASE)
      console.log(difflines)
      expect(bres.ctx.note.guide.base).equal(SOLAR_GUIDE_BASE)
    }



    const rootSrc = `
@"@voxgig/apidef/model/apidef.jsonic"

# @"${outprefix}guide.jsonic"

@"api/${outprefix}api-def.jsonic"
@"api/${outprefix}api-entity-index.jsonic"
@"flow/${outprefix}flow-index.jsonic"

`

    const rootFile = folder + `/${outprefix}root.jsonic`
    Fs.writeFileSync(rootFile, rootSrc)

    //const result = Aontu(rootSrc, {
    const result = aontu.generate(rootSrc, {
      path: rootFile,
      // base: folder
    }).gen()

    Fs.writeFileSync(folder + `/${outprefix}root.json`, JSON.stringify(result, null, 2))

  })


})



const SOLAR_GUIDE_BASE = `# Guide

guide: {

  entity: moon: { # name:cmp
    path: '/api/planet/{planet_id}/moon': op: { # ent:cmp:moon
      'create': method: post # not-load
      'list': method: get # array
    }
    path: '/api/planet/{planet_id}/moon/{moon_id}': op: { # ent:cmp:moon
      'load': method: get # not-list
      'remove': method: delete # not-load
      'update': method: put # not-load
    }
  }

  entity: planet: { # name:cmp
    path: '/api/planet': op: { # ent:cmp:planet
      'create': method: post # not-load
      'list': method: get # array
    }
    path: '/api/planet/{planet_id}': op: { # ent:cmp:planet
      'load': method: get # not-list
      'remove': method: delete # not-load
      'update': method: put # not-load
    }
  }

}`

