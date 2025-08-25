/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import { expect } from '@hapi/code'



import {
  parse,
  // rewrite,
} from '../dist/parse'


describe('parse', () => {

  test('happy', async () => {
    expect(parse).exist()

    await expect(parse('not-a-kind', '')).reject(/unknown/)
    await expect(parse('OpenAPI', 'bad')).reject(/JSON/)
    await expect(parse('OpenAPI', undefined)).reject(/JSON/)
    await expect(parse('OpenAPI', '{}')).reject(/Unsupported/)

    const p0 = await parse(
      'OpenAPI', '{"openapi":"3.0.0", "info": {"title": "T0","version": "1.0.0"},"paths":{}}')
    expect(p0).equal({
      openapi: '3.0.0',
      info: { title: 'T0', version: '1.0.0' },
      paths: {},
      components: {}
    })

    const p1 = await parse('OpenAPI', `
openapi: 3.0.0
info:
  title: T1
  version: 1.0.0
paths: {}
`)

    expect(p1).equal({
      openapi: '3.0.0',
      info: { title: 'T1', version: '1.0.0' },
      paths: {},
      components: {}
    })

  })


  /*
  test('rewrite', () => {
    expect(rewrite({})).equal({ paths: {}, components: {} })

    expect(rewrite({ paths: {} })).equal({ paths: {}, components: {} })
    expect(rewrite({ components: {} })).equal({ paths: {}, components: {} })

    expect(rewrite({
      paths: { b: {}, a: {} },
      components: { d: {}, c: {} }
    })).equal({
      paths: { a: { key$: 'a' }, b: { key$: 'b' } },
      components: { c: {}, d: {} }
    })

    expect(rewrite({
      paths: {
        '/api0/foo/{id}/end': {}
      }
    })).equal({
      paths: {
        '/api0/foo/{id}/end': { key$: '/api0/foo/{id}/end' }
      }, components: {}
    })

    expect(rewrite({
      paths: {
        '/api1/foo/{id}/end': {
          parameters: { id: { name: 'id' } }
        }
      }
    })).equal({
      paths: {
        '/api1/foo/{id}/end': {
          parameters: { id: { name: 'id', key$: 'id' } },
          key$: '/api1/foo/{id}/end',
        }
      }, components: {}
    })

    expect(rewrite({
      paths: {
        '/api2/foo/{fid}/end': {
          parameters: { fid: { name: 'fid' } }
        },
      }
    })).equal({
      paths: {
        '/api2/foo/{id}/end': {
          parameters: { id: { name: 'id', key$: 'id' } },
          key$: '/api2/foo/{id}/end',
        }
      }, components: {}
    })

    expect(rewrite({
      paths: {
        '/api3/foo/{fid}/bar/{id}/end': {
          parameters: { fid: { name: 'fid' }, id: { name: 'id' } }
        },
      }
    })).equal({
      paths: {
        '/api3/foo/{foo_id}/bar/{id}/end': {
          parameters: {
            foo_id: { name: 'foo_id', key$: 'foo_id' },
            id: { name: 'id', key$: 'id' },
          },
          key$: '/api3/foo/{foo_id}/bar/{id}/end',
        }
      }, components: {}
    })

    expect(rewrite({
      paths: {
        '/api4/foo/{id}/bar/{bid}/end': {
          parameters: { bid: { name: 'bid' }, id: { name: 'id' } }
        },
      }
    })).equal({
      paths: {
        '/api4/foo/{foo_id}/bar/{id}/end': {
          parameters: {
            foo_id: { name: 'foo_id', key$: 'foo_id' },
            id: { name: 'id', key$: 'id' },
          },
          key$: '/api4/foo/{foo_id}/bar/{id}/end',
        }
      }, components: {}
    })


    expect(rewrite({
      paths: {
        '/api5/foo/{fid}/bar/{id}/end': {
          parameters: { fid: { name: 'fid' }, id: { name: 'id' } }
        },
        '/api5/aaa': {},
        '/api5/bbb/{id}': {
          parameters: { id: { name: 'id' } }
        },
      }
    })).equal({
      paths: {
        '/api5/aaa': { key$: '/api5/aaa' },
        '/api5/bbb/{id}': {
          parameters: { id: { name: 'id', key$: 'id' } },
          key$: '/api5/bbb/{id}'
        },
        '/api5/foo/{foo_id}/bar/{id}/end': {
          parameters: {
            foo_id: { name: 'foo_id', key$: 'foo_id' },
            id: { name: 'id', key$: 'id' },
          },
          key$: '/api5/foo/{foo_id}/bar/{id}/end',
        }
      }, components: {}
    })

    expect(rewrite({
      paths: {
        '/api6/foo/{fid}': {
          parameters: { fid: { name: 'fid' } }
        },
      }
    })).equal({
      paths: {
        '/api6/foo/{id}': {
          parameters: { id: { name: 'id', key$: 'id' } },
          key$: '/api6/foo/{id}',
        }
      }, components: {}
    })

    expect(rewrite({
      paths: {
        '/api7/bar/{id}/zed/{zid}/foo/{fid}': {
          parameters: { fid: { name: 'fid' }, zid: { name: 'zid' }, id: { name: 'id' } }
        },
      }
    })).equal({
      paths: {
        '/api7/bar/{bar_id}/zed/{zed_id}/foo/{id}': {
          parameters: {
            id: { name: 'id', key$: 'id' },
            bar_id: { name: 'bar_id', key$: 'bar_id' },
            zed_id: { name: 'zed_id', key$: 'zed_id' },
          },
          key$: '/api7/bar/{bar_id}/zed/{zed_id}/foo/{id}',
        }
      }, components: {}
    })


  })
  */


})

