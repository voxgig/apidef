/* Copyright (c) 2024 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import { Aontu } from 'aontu'


// import { cmp, each, Project, Folder, File, Code } from 'jostraca'

import {
  ApiDef
} from '../'



describe('apidef', () => {

  test('happy', async () => {
    expect(ApiDef).exist()
  })


  test('api-statuspage', async () => {
    const build = await ApiDef.makeBuild({
      folder: __dirname + '/../test/api',
      debug: 'debug',
      outprefix: 'statuspage-1.0.0-20241218-'
    })

    const model = Aontu(`
@"@voxgig/apidef/model/apidef.jsonic"

def: 'statuspage-1.0.0-20241218-def.json'

main: guide:{

entity: page: {
  path: {
    '/pages/{page_id}': op: {
      load: { method: get, place: foo }
      update: method: put
    }
  }
}

entity: incident: {
  path: {
    '/pages/{page_id}/incidents': op: {
      create: method: post
      list: method: get    
    }
    '/pages/{page_id}/incidents/{incident_id}': op: {
      remove: method: delete
      update: method: put
      load: method: get
    }
  }
}


}

`).gen()

    // console.dir(model, { depth: null })

    const buildspec = {
      spec: {
        base: __dirname + '/../test/api'
      }
    }

    await build(model, buildspec, {})
  })


})
