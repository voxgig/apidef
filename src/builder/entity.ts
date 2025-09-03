/* Copyright (c) 2025 Voxgig, MIT License */


import {
  resolveEntity
} from './entity/entity'

import {
  resolveDef
} from './entity/def'


async function makeEntityBuilder(ctx: any) {
  const { apimodel, opts } = ctx

  const entityBuilder = resolveEntity(apimodel, opts)
  const defBuilder = resolveDef(apimodel, opts)

  return function fullEntityBuilder() {
    entityBuilder()
    defBuilder()
  }
}


export {
  makeEntityBuilder
}
