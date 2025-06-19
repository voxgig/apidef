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


async function generateModel(
  apimodel: any,
  spec: any,
  opts: ApiDefOptions,
  res: { fs: FsUtil, log: Log }
) {
  const { fs, log } = res

  const modelPath = Path.normalize(spec.config.model)

  const modelapi = { main: { api: apimodel.main.api } }
  let modelSrc = JSON.stringify(modelapi, null, 2)

  modelSrc =
    '# GENERATED FILE - DO NOT EDIT\n\n' +
    modelSrc.substring(1, modelSrc.length - 1).replace(/\n  /g, '\n')

  writeChanged('api-model', modelPath, modelSrc, fs, log)


  const apiFolder = Path.join(opts.folder as string, 'api')
  fs.mkdirSync(apiFolder, { recursive: true })

  each(apimodel.main.api.entity, ((entity: any, entityName: string) => {
    const entityFile = Path.join(
      apiFolder, (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.jsonic')

    const entityJSON =
      JSON.stringify(entity, null, 2)

    const entitySrc =
      '# GENERATED FILE - DO NOT EDIT\n\n' +
      '# Entity API\n\n' +
      `main.api.entity.${entity.name}:\n` +
      entityJSON.substring(1, modelSrc.length - 1).replace(/\n  /g, '\n')

    writeChanged('api-entity-model:' + entityName, entityFile, entitySrc, fs, log)
  }))

  return modelPath
}



export {
  generateModel
}
