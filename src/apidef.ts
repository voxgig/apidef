/* Copyright (c) 2024 Richard Rodger, MIT License */

import * as Fs from 'node:fs'

import { bundleFromString, createConfig } from '@redocly/openapi-core'


import { getx, each, camelify } from 'jostraca'


type ApiDefOptions = {
  fs: any
}




function ApiDef(opts: ApiDefOptions) {
  const fs = opts.fs || Fs
  // const jostraca = Jostraca()


  async function generate(spec: any) {
    const transform = resolveTranform(spec, opts)

    const source = fs.readFileSync(spec.def, 'utf8')

    const config = await createConfig({})
    const bundle = await bundleFromString({
      source,
      config,
      dereference: true,
    })

    const model = {
      main: { api: { entity: {} } }
    }

    // console.log('BUNDLE', bundle.bundle)
    transform(bundle.bundle.parsed, model)

    fs.writeFileSync(
      spec.model,
      JSON.stringify(model, null, 2)
    )

    return {
      ok: true,
      model,
    }
  }


  return {
    generate
  }
}




function resolveTranform(spec: any, opts: any) {
  return makeOpenAPITransform(spec, opts)
}

function makeOpenAPITransform(spec: any, opts: any) {
  return function OpenAPITransform(def: any, model: any) {
    // console.log('DEF', def)

    model.main.api.name = spec.meta.name

    each(spec.entity, (entity: any) => {
      // console.log('ENTITY', entity)

      const entityModel: any = model.main.api.entity[entity.key$] = {
        field: {},
        cmd: {},
      }

      const firstPath: any = Object.keys(entity.path)[0]
      const firstParts = firstPath.split('/')
      const entityPathPrefix = firstParts[0]

      each(entity.path, (path: any) => {
        console.log('PATH', entity.key$, entityPathPrefix, path.key$)

        // console.dir(def.paths[path.key$], { depth: null })
        const pathdef = def.paths[path.key$]

        const parts = path.key$.split('/')

        // TODO: use method prop in model!!!

        // Entity Fields
        if (pathdef.get) {
          // GET foo/{id} -> single item
          let properties = getx(pathdef.get, 'parameters=1 ^1 responses 200 content ' +
            'application/json schema properties')

          // GET foo -> item list
          if (null == properties) {
            properties = getx(pathdef.get, 'parameters=null ^1 responses 200 content ' +
              'application/json schema items properties')
          }
          // console.log('properties', properties)

          // TODO: refactor to util function
          const field = each(properties)
            .reduce((a: any, p: any) => (a[p.key$] =
              { kind: camelify(p.type) }, a), {})
          Object.assign(entityModel.field, field)
        }

        // Entity Commands
        else if (pathdef.post) {
          console.log('CMD', parts, pathdef.post)

          if (2 < parts.length && parts[0] === entityPathPrefix) {
            const suffix = parts[parts.length - 1]

            let params = getx(pathdef.post, 'parameters')

            let response = getx(pathdef.post, 'responses 200 content ' +
              'application/json schema properties')

            entityModel.cmd[suffix] = {
              params,
              response
            }
          }
        }
      })
    })
  }
}


export type {
  ApiDefOptions,
}


export {
  ApiDef,
}
