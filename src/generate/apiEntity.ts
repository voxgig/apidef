/* Copyright (c) 2025 Voxgig, MIT License */

import Path from 'node:path'

import { each } from 'jostraca'


import type {
  ApiDefOptions,
  Log,
  FsUtil,
} from '../types'


import {
  writeChanged
} from '../utility'


function generateApiEntity(
  apimodel: any,
  spec: any,
  opts: ApiDefOptions,
  res: { fs: FsUtil, log: Log }
) {
  const { fs, log } = res

  const apiFolder = Path.join(opts.folder as string, 'api')
  fs.mkdirSync(apiFolder, { recursive: true })

  const barrel = [
    '# Entity Models\n'
  ]

  each(apimodel.main.api.entity, ((entity: any, entityName: string) => {
    const entityFile = Path.join(
      apiFolder, (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.jsonic')

    const entityJSON =
      JSON.stringify(entity, null, 2)

    const entitySrc =
      '# GENERATED FILE - DO NOT EDIT\n\n' +
      `main.api.entity.${entity.name}:\n` +
      entityJSON.substring(1, entityJSON.length - 1).replace(/\n  /g, '\n')

    writeChanged('api-entity-model:' + entityName, entityFile, entitySrc, fs, log)

    barrel.push(`@"${Path.basename(entityFile)}"`)
  }))

  const indexFile = Path.join(
    apiFolder, (null == opts.outprefix ? '' : opts.outprefix) + 'entity-index.jsonic')


  writeChanged('api-entity-index', indexFile, barrel.join('\n'), fs, log)
}


export {
  generateApiEntity
}
