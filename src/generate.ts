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
  generateApiEntity
} from './generate/apiEntity'

import {
  generateDef
} from './generate/def'

import {
  generateSdkEntity
} from './generate/sdkEntity'



function generateModel(
  apimodel: any,
  spec: any,
  opts: ApiDefOptions,
  res: { fs: FsUtil, log: Log }
) {
  generateApiEntity(apimodel, spec, opts, res)
  generateDef(apimodel, opts, res)
  generateSdkEntity(apimodel, opts, res)
}





export {
  generateModel
}
