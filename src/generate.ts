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
  const { fs, log } = res


  // TODO: remove << 
  const modelPath = Path.normalize(spec.config.model)

  const modelapi = { main: { api: apimodel.main.api } }
  let modelSrc = JSON.stringify(modelapi, null, 2)

  modelSrc =
    '# GENERATED FILE - DO NOT EDIT\n\n' +
    modelSrc.substring(1, modelSrc.length - 1).replace(/\n  /g, '\n')

  writeChanged('api-model', modelPath, modelSrc, fs, log)
  // TODO: remove >> 

  generateApiEntity(apimodel, spec, opts, res)

  generateDef(apimodel, modelPath, opts, res)
  generateSdkEntity(apimodel, modelPath, opts, res)
}





export {
  generateModel
}
