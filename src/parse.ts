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
  const config = await createConfig(meta?.config || {})
  let bundle

  bundle = await bundleFromString({
    source,
    config,
    dereference: true,
  })

  const def = bundle.bundle.parsed

  return def
}


export {
  parse
}
