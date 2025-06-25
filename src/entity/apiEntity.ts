/* Copyright (c) 2025 Voxgig, MIT License */

import Path from 'node:path'

import { each, File, Folder, Content } from 'jostraca'


import type {
  ApiDefOptions,
  // Log,
  // FsUtil,
} from '../types'


// import {
//   writeChanged
// } from '../utility'


function resolveApiEntity(
  apimodel: any,
  // spec: any,
  opts: ApiDefOptions,
  // res: { fs: FsUtil, log: Log }
) {
  // const { fs, log } = res

  // const apiFolder = Path.join(opts.folder as string, 'api')
  // fs.mkdirSync(apiFolder, { recursive: true })

  const barrel = [
    '# Entity Models\n'
  ]

  const entityFiles: { name: string, src: string }[] = []

  each(apimodel.main.api.entity, ((entity: any, entityName: string) => {
    // const entityFile = Path.join(
    //   apiFolder, (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.jsonic')
    const entityFile = (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.jsonic'

    const entityJSON =
      JSON.stringify(entity, null, 2)

    const entitySrc =
      '# GENERATED FILE - DO NOT EDIT\n\n' +
      `main: api: entity: ${entity.name}: {\n` +
      entityJSON.substring(1, entityJSON.length - 1).replace(/\n  /g, '\n') +
      '\n\n}\n'

    // writeChanged('api-entity-model:' + entityName, entityFile, entitySrc, fs, log)

    entityFiles.push({ name: entityFile, src: entitySrc })

    barrel.push(`@"${Path.basename(entityFile)}"`)
  }))

  // const indexFile = Path.join(
  //   apiFolder, (null == opts.outprefix ? '' : opts.outprefix) + 'entity-index.jsonic')

  const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'api-entity-index.jsonic'


  // writeChanged('api-entity-index', indexFile, barrel.join('\n'), fs, log)

  return function apiEntityBuilder() {
    Folder({ name: 'api' }, () => {
      each(entityFiles, (entityFile) => {
        File({ name: entityFile.name }, () => Content(entityFile.src))
      })

      File({ name: indexFile }, () => Content(barrel.join('\n')))
    })
  }

}


export {
  resolveApiEntity
}
