/* Copyright (c) 2024 Voxgig, MIT License */

import { bundleFromString, createConfig } from '@redocly/openapi-core'

import { each, snakify } from 'jostraca'


import { depluralize } from './utility'


// Parse an API definition source into a JSON sructure.
async function parse(kind: string, source: any, meta?: any) {
  if ('OpenAPI' === kind) {
    return parseOpenAPI(source, meta)
  }
  else {
    throw new Error('@voxgig/apidef-parse: unknown kind: ' + kind)
  }
}


async function parseOpenAPI(source: any, meta?: any) {
  const base = meta?.config || {}
  const config: any = await createConfig(base)

  // First pass: parse without dereferencing to preserve $refs
  const bundleWithRefs = await bundleFromString({
    source,
    config,
    dereference: false,
  })

  // Walk the tree and add x-ref properties
  const seen = new WeakSet()
  let refCount = 0

  function addXRefs(obj: any, path: string = '') {
    if (!obj || typeof obj !== 'object' || seen.has(obj)) return
    seen.add(obj)

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => addXRefs(item, `${path}[${index}]`))
    } else {
      // Check for $ref property
      if (obj.$ref && typeof obj.$ref === 'string') {
        obj['x-ref'] = obj.$ref
        refCount++
      }

      // Recursively process all properties
      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object') {
          addXRefs(value, path ? `${path}.${key}` : key)
        }
      }
    }
  }

  addXRefs(bundleWithRefs.bundle.parsed)

  // Serialize back to string with x-refs preserved
  const sourceWithXRefs = JSON.stringify(bundleWithRefs.bundle.parsed)

  // Second pass: parse with dereferencing
  const bundle = await bundleFromString({
    source: sourceWithXRefs,
    config,
    dereference: true,
  })

  const def = bundle.bundle.parsed

  return def
}







// Make consistent changes to support semantic entities.
function rewrite(def: any) {
  const paths = def.paths
  each(paths, (path) => {
    each(path.parameters, (param: any) => {

      let new_param = param.name
      let new_path = path.key$

      // Rename param if nane is "id", and not the final param.
      // Rewrite /foo/{id}/bar as /foo/{foo_id}/bar.
      // Avoids ambiguity with bar id.
      if (param.name.match(/^id$/i)) {
        let m = path.key$.match(/\/([^\/]+)\/{id\}\/[^\/]/)

        if (m) {
          const parent = depluralize(snakify(m[1]))
          new_param = `${parent}_id`
          new_path = path.key$.replace('{id}', '{' + new_param + '}')
        }
      }
      else {
        new_param = depluralize(snakify(param.name))
        new_path = path.key$.replace('{' + param.name + '}', '{' + new_param + '}')
      }

      let pathdef = paths[path.key$]
      delete paths[path.key$]

      paths[new_path] = pathdef
      path.key$ = new_path

      param.name = new_param
    })
  })


  sortkeys(def, 'paths')
  sortkeys(def, 'components')

  return def
}


function sortkeys(obj: any, prop: string) {
  const sorted: any = {}
  const sorted_keys = Object.keys(obj[prop]).sort()
  for (let sk of sorted_keys) {
    sorted[sk] = obj[prop][sk]
  }
  obj[prop] = sorted
}

export {
  parse,
  rewrite,
}
