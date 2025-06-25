/* Copyright (c) 2025 Voxgig, MIT License */

import Path from 'node:path'

import { each } from 'jostraca'


import type {
  ApiDefOptions,
  Log,
  FsUtil,
} from './types'


import {
  writeChanged
} from './utility'


import {
  resolveApiEntity
} from './entity/apiEntity'

import {
  resolveDef
} from './entity/def'

import {
  resolveSdkEntity
} from './entity/sdkEntity'



function resolveEntity(
  apimodel: any,
  spec: any,
  opts: ApiDefOptions,
  // res: { fs: FsUtil, log: Log }
) {
  const apiEntityBuilder = resolveApiEntity(apimodel, opts)
  const defBuilder = resolveDef(apimodel, opts)
  const sdkEntityBuilder = resolveSdkEntity(apimodel, opts)

  return function modelBuilder() {
    apiEntityBuilder()
    defBuilder()
    sdkEntityBuilder()
  }
}





export {
  resolveEntity
}
