/* Copyright (c) 2024 Richard Rodger, MIT License */

import * as Fs from 'node:fs'

import { bundleFromString, createConfig } from '@redocly/openapi-core'


import { each, camelify } from 'jostraca'


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
    console.log('DEF', def)

    model.main.api.name = spec.meta.name

    each(spec.entity, (entity: any) => {
      console.log('ENTITY', entity)

      each(entity.path, (path: any) => {
        console.log('PATH', path.key$)

        // console.dir(def.paths[path.key$], { depth: null })
        const pathdef = def.paths[path.key$]
        const getdef = pathdef.get

        if (getdef) {
          const params = getdef.parameters

          if (params && 1 === params.length) {
            const responses = getdef.responses

            if (responses) {
              const res200 = responses['200']

              if (res200) {
                const content = res200.content

                if (content) {
                  const json = content['application/json']

                  if (json) {
                    const schema = json.schema

                    if (schema) {
                      const properties = schema.properties

                      const field = each(properties)
                        .reduce((a: any, p: any) => (a[p.key$] =
                          { kind: camelify(p.type) }, a), {})
                      model.main.api.entity[entity.key$] = { field }
                    }
                  }
                }
              }
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
