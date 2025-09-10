/* Copyright (c) 2025 Voxgig, MIT License */


import {
  resolveEntity
} from './entity/entity'

import {
  resolveInfo
} from './entity/info'


async function makeEntityBuilder(ctx: any) {
  const { apimodel, opts } = ctx

  const entityBuilder = resolveEntity(apimodel, opts)
  const infoBuilder = resolveInfo(apimodel, opts)

  return function fullEntityBuilder() {
    entityBuilder()
    infoBuilder()
  }
}


export {
  makeEntityBuilder
}
