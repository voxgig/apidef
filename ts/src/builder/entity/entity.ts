/* Copyright (c) 2025 Voxgig, MIT License */

import Path from 'node:path'

import { each, File, Folder, Content } from 'jostraca'


import type {
  KitModel,
  ApiDefOptions,
} from '../../types'

import {
  KIT
} from '../../types'

import {
  formatJSONIC,
} from '../../utility'



function resolveEntity(
  apimodel: any,
  opts: ApiDefOptions,
) {
  const kit: KitModel = apimodel.main[KIT]

  const barrel = [
    '# Entity Models\n'
  ]

  const entityFiles: { name: string, src: string }[] = []

  each(kit.entity, ((entity: any, entityName: string) => {
    const entityFile = (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.jsonic'

    let entityJSONIC = formatJSONIC(entity).trim()
    entityJSONIC = entityJSONIC.substring(1, entityJSONIC.length - 1)

    const fieldAliasesSrc = fieldAliases(entity)

    const entitySrc =
      `# Entity: ${entity.name}\n\n` +
      `main: ${KIT}: entity: ${entity.name}: {\n\n` +
      `  alias: field: ${fieldAliasesSrc}\n` +
      entityJSONIC +
      '\n\n}\n'

    entityFiles.push({ name: entityFile, src: entitySrc })

    barrel.push(`@"${Path.basename(entityFile)}"`)
  }))

  const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'entity-index.jsonic'

  return function apiEntityBuilder() {
    Folder({ name: 'entity' }, () => {
      each(entityFiles, (entityFile) => {
        File({ name: entityFile.name }, () => Content(entityFile.src))
      })

      File({ name: indexFile }, () => Content(barrel.join('\n')))
    })
  }
}


function fieldAliases(_entity: any): string {
  // Field aliasing (mapping e.g. a `<name>_id` field onto the canonical
  // `id`) is not currently implemented. The original heuristic referenced
  // properties that don't exist on the entity at this stage
  // (`entity.field`, `op.param`, `p.keys` — entities carry `fields`, ops
  // carry `points`, and `each` stamps `key$`), so it always produced `{}`
  // and would have thrown if any branch ran. Emit an empty alias map
  // explicitly until the alias semantics are specified.
  // Parity: go/builder.go buildFieldAliases (also `{}`).
  return '{}'
}



export {
  resolveEntity
}
