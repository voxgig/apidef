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


describe('apidef', () => {

  test('happy', async () => {
    expect(ApiDef).exist()
  })


  test('api-solar', async () => {
    try {
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

      const model = Aontu(modelSrc).gen()

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

      const result = Aontu(rootSrc, {
        path: rootFile,
        // base: folder
      }).gen()

      Fs.writeFileSync(folder + `/${outprefix}root.json`, JSON.stringify(result, null, 2))



    }
    catch (err: any) {
      console.log(err)
      throw err
    }
  })



  test('api-statuspage', async () => {
    try {
      const outprefix = 'statuspage-1.0.0-20241218-'
      const folder = __dirname + '/../test/api'

      const build = await ApiDef.makeBuild({
        folder,
        debug: 'debug',
        outprefix,
      })

      const modelSrc = `
# apidef test: ${outprefix}

name: statuspage

@"@voxgig/apidef/model/apidef.jsonic"

def: '${outprefix}def.json'
`

      const model = Aontu(modelSrc).gen()

      const buildspec = {
        spec: {
          base: __dirname + '/../test/api'
        }
      }

      await build(model, buildspec, {})


      const rootSrc = `
@"@voxgig/apidef/model/apidef.jsonic"

@"${outprefix}guide.jsonic"

@"api/${outprefix}api-def.jsonic"
@"api/${outprefix}api-entity-index.jsonic"
@"flow/${outprefix}flow-index.jsonic"

`

      const rootFile = folder + `/${outprefix}root.jsonic`
      Fs.writeFileSync(rootFile, rootSrc)

      const result = Aontu(rootSrc, {
        path: rootFile,
        // base: folder
      }).gen()

      Fs.writeFileSync(folder + `/${outprefix}root.json`, JSON.stringify(result, null, 2))
    }
    catch (err: any) {
      console.log(err)
      throw err
    }
  })

})



const SOLAR_GUIDE_BASE = `# Guide

main: api: guide: {

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


}`
