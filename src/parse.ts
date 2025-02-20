/* Copyright (c) 2024 Voxgig, MIT License */

import { bundleFromString, createConfig } from '@redocly/openapi-core'


async function parse(kind: string, source: any) {
  if ('OpenAPI' === kind) {
    return parseOpenAPI(source)
  }
  else {
    throw new Error('@voxgig/apidef-parse: unknown kind: ' + kind)
  }
}


async function parseOpenAPI(source: any) {
  const config = await createConfig({})
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
