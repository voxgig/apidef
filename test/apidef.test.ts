/* Copyright (c) 2024 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'

import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import { Aontu } from 'aontu'



import {
  ApiDef
} from '../'


// TODO: remove all sdk refs or rename to api


describe('apidef', () => {

  test('happy', async () => {
    expect(ApiDef).exist()
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
