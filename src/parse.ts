/* Copyright (c) 2024 Voxgig, MIT License */

import { bundleFromString, createConfig } from '@redocly/openapi-core'

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







export {
  parse,
}
