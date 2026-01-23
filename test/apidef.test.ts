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


const aontu = new Aontu({ fs: Fs })


describe('apidef', () => {

  test('exist', async () => {
    expect(ApiDef).exist()
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

    expect(bres.guide).contains(SOLAR_GUIDE)
  })



  test('full-solar', async () => {
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

@"@voxgig/apidef/model/apidef.jsonic"

def: '${outprefix}def.yaml'
`

    const modelSrc = `
# apidef test: ${outprefix}

@"@voxgig/apidef/model/apidef.jsonic"

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
    expect(bres.ok).true()

    const model = aontu.generate(`@"test/solar/solar.jsonic"`, {
      base: __dirname + '/..'
    })

    expect(model).includes(SOLAR_MODEL)
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
              alts: [
                {
                  args: {
                    param: [
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
                  parts: ['api', 'planet', '{planet_id}', 'moon'],
                  select: { exist: ['planet_id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'create'
            },
            list: {
              alts: [
                {
                  args: {
                    param: [
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
                  parts: ['api', 'planet', '{planet_id}', 'moon'],
                  select: { exist: ['planet_id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'list'
            },
            load: {
              alts: [
                {
                  args: {
                    param: [
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
                  parts: ['api', 'planet', '{planet_id}', 'moon', '{id}'],
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
              alts: [
                {
                  args: {
                    param: [
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
                  parts: ['api', 'planet', '{planet_id}', 'moon', '{id}'],
                  select: { exist: ['id', 'planet_id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'remove'
            },
            update: {
              alts: [
                {
                  args: {
                    param: [
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
                  parts: ['api', 'planet', '{planet_id}', 'moon', '{id}'],
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
              alts: [
                {
                  args: {
                    param: [
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
                  parts: ['api', 'planet', '{id}', 'forbid'],
                  rename: { param: { planet_id: 'id' } },
                  select: { '$action': 'forbid', exist: ['id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                },
                {
                  args: {
                    param: [
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
                  parts: ['api', 'planet', '{id}', 'terraform'],
                  rename: { param: { planet_id: 'id' } },
                  select: { '$action': 'terraform', exist: ['id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                },
                {
                  method: 'POST',
                  orig: '/api/planet',
                  parts: ['api', 'planet'],
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  args: { param: [] },
                  relations: [],
                  select: {}
                }
              ],
              name: 'create'
            },
            list: {
              alts: [
                {
                  method: 'GET',
                  orig: '/api/planet',
                  parts: ['api', 'planet'],
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  args: { param: [] },
                  relations: [],
                  select: {}
                }
              ],
              name: 'list'
            },
            load: {
              alts: [
                {
                  args: {
                    param: [
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
                  parts: ['api', 'planet', '{id}'],
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
              alts: [
                {
                  args: {
                    param: [
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
                  parts: ['api', 'planet', '{id}'],
                  select: { exist: ['id'] },
                  transform: { req: '`reqdata`', res: '`body`' },
                  active: true,
                  relations: []
                }
              ],
              name: 'remove'
            },
            update: {
              alts: [
                {
                  args: {
                    param: [
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
                  parts: ['api', 'planet', '{id}'],
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

