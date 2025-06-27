/* Copyright (c) 2025 Voxgig, MIT License */

import Path from 'node:path'

import { each, File, Folder, Content } from 'jostraca'


import type {
  ApiDefOptions,
} from '../../types'


function resolveApiEntity(
  apimodel: any,
  opts: ApiDefOptions,
) {
  const barrel = [
    '# Entity Models\n'
  ]

  const entityFiles: { name: string, src: string }[] = []

  each(apimodel.main.api.entity, ((entity: any, entityName: string) => {
    const entityFile = (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.jsonic'

    const entityJSON =
      JSON.stringify(entity, null, 2)

    const fieldAliasesSrc = fieldAliases(entity)

    const entitySrc =
      `# Entity: ${entity.name}\n\n` +
      `main: api: entity: ${entity.name}: {\n\n` +
      `  alias: field: ${fieldAliasesSrc}\n` +
      prettyJSON(entityJSON.substring(1, entityJSON.length - 1)) +
      '\n\n}\n'

    entityFiles.push({ name: entityFile, src: entitySrc })

    barrel.push(`@"${Path.basename(entityFile)}"`)
  }))

  const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'api-entity-index.jsonic'

  return function apiEntityBuilder() {
    Folder({ name: 'api' }, () => {
      each(entityFiles, (entityFile) => {
        File({ name: entityFile.name }, () => Content(entityFile.src))
      })

      File({ name: indexFile }, () => Content(barrel.join('\n')))
    })
  }

}

function prettyJSON(jsonsrc: string) {
  return jsonsrc
    .replace(/"([a-zA-Z_][a-zA-Z_0-9]*)": /g, '$1: ')
    .replace(/},/g, '}\n')
}


function fieldAliases(entity: any) {
  // HEURISTIC: id may be name_id or nameId
  const fieldAliases =
    each(entity.op, (op: any) =>
      each(op.param))
      .flat()
      .reduce((a: any, p: any) =>

      (entity.field[p.keys] ? null :
        (p.key$.toLowerCase().includes(entity.name) ?
          (a[p.key$] = 'id', a.id = p.key$) :
          null)

        , a), {})

  const fieldAliasesSrc =
    JSON.stringify(fieldAliases, null, 2)
      .replace(/\n/g, '\n  ')

  return fieldAliasesSrc
}



export {
  resolveApiEntity
}
