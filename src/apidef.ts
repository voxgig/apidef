/* Copyright (c) 2024 Richard Rodger, MIT License */

import * as Fs from 'node:fs'

import { bundleFromString, createConfig } from '@redocly/openapi-core'

import { FSWatcher } from 'chokidar'

import { getx, each, camelify } from 'jostraca'


type ApiDefOptions = {
  fs?: any
}




function ApiDef(opts: ApiDefOptions = {}) {
  const fs = opts.fs || Fs


  async function watch(spec: any) {
    console.log('APIDEF START', spec.def)
    await generate(spec)
    console.log('APIDEF START GEN', spec.def)

    const fsw = new FSWatcher()

    fsw.on('change', (...args: any[]) => {
      console.log('APIDEF CHANGE', args)
      generate(spec)
    })

    fsw.add(spec.def)
  }


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

    transform(bundle.bundle.parsed, model)

    let vxgsrc = JSON.stringify(model, null, 2)
    vxgsrc = vxgsrc.substring(1, vxgsrc.length - 1)

    fs.writeFileSync(
      spec.model,
      vxgsrc
    )

    return {
      ok: true,
      model,
    }
  }


  return {
    watch,
    generate,
  }
}




function resolveTranform(spec: any, opts: any) {
  return makeOpenAPITransform(spec, opts)
}

function makeOpenAPITransform(spec: any, opts: any) {


  function extractFields(properties: any) {
    const fieldMap = each(properties)
      .reduce((a: any, p: any) => (a[p.key$] =
        { name: p.key$, kind: camelify(p.type) }, a), {})
    return fieldMap
  }


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
        // console.log('PATH', entity.key$, entityPathPrefix, path.key$)

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
          // const field = each(properties)
          //  .reduce((a: any, p: any) => (a[p.key$] =
          //    { kind: camelify(p.type) }, a), {})
          const field = extractFields(properties)
          Object.assign(entityModel.field, field)
        }

        // Entity Commands
        else if (pathdef.post) {
          // console.log('CMD', parts, pathdef.post)

          if (2 < parts.length && parts[0] === entityPathPrefix) {
            const suffix = parts[parts.length - 1]

            let param = getx(pathdef.post, 'parameters?in=path') || []

            let query = getx(pathdef.post, 'parameters?in!=path') || []

            let response = getx(pathdef.post, 'responses 200 content ' +
              'application/json schema properties')

            entityModel.cmd[suffix] = {
              query,
              param: param.reduce((a: any, p: any) =>
                (a[p.name] = { name: p.name, kind: camelify(p.schema.type) }, a), {}),
              response: { field: extractFields(response) }
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
