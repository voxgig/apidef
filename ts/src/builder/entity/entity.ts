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
    const entityFile = (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.aon'

    const { model, relations } = entityAncestorSource(entity)
    let entityJSONIC = formatJSONIC(model).trim()
    entityJSONIC = entityJSONIC.substring(1, entityJSONIC.length - 1)

    const fieldAliasesSrc = fieldAliases(entity)

    const entitySrc =
      `# Entity: ${entity.name}\n\n` +
      `main: ${KIT}: entity: ${entity.name}: {\n\n` +
      `  alias: field: ${fieldAliasesSrc}\n` +
      entityJSONIC +
      relations +
      '\n\n}\n'

    entityFiles.push({ name: entityFile, src: entitySrc })

    barrel.push(`@"./${Path.basename(entityFile)}"`)
  }))

  const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'entity-index.aon'

  return function apiEntityBuilder() {
    Folder({ name: 'entity' }, () => {
      each(entityFiles, (entityFile) => {
        File({ name: entityFile.name }, () => Content(entityFile.src))
      })

      File({ name: indexFile }, () => Content(barrel.join('\n')))
    })
  }
}

function entityAncestorSource(entity: any): { model: any, relations: string } {
  const model = { ...entity }
  const ancestors: string[][] = entity.relations?.ancestors ?? []
  if (null != entity.relations) {
    model.relations = { ...entity.relations }
    delete model.relations.ancestors
    if (0 === Object.keys(model.relations).length) delete model.relations
  }
  const chains = ancestors.map(chain => '    [' + chain.map(name =>
    'path(' + JSON.stringify('$.main.kit.entity.' + name) + ')').join(' ') + ']')
  return { model, relations: 0 === chains.length ? '' :
    '\n  relations: ancestors: [\n' + chains.join('\n') + '\n  ]' }
}


function gcEntityFiles(
  fs: any,
  log: any,
  modelFolder: string,
  outprefix: string | undefined,
  entityNames: string[],
): string[] {
  const removed: string[] = []
  const prefix = null == outprefix ? '' : outprefix
  const entityFolder = Path.join(modelFolder, 'entity')

  const keep = new Set<string>(
    entityNames.map((name) => prefix + name + '.aon'))
  keep.add(prefix + 'entity-index.aon')

  let entries: string[] = []
  try {
    entries = fs.readdirSync(entityFolder)
  }
  catch (_err: any) {
    return removed // no entity folder yet — nothing to collect
  }

  for (const entry of entries) {
    if (!entry.endsWith('.aon') && !entry.endsWith('.aontu')) { continue }
    if (!entry.startsWith(prefix)) { continue }
    if (keep.has(entry)) { continue }

    const file = Path.join(entityFolder, entry)
    try {
      const head = String(fs.readFileSync(file)).slice(0, 64)
      if (!head.startsWith('# Entity: ')) { continue }
      fs.unlinkSync(file)
      removed.push(entry)
      log?.info?.({
        point: 'entity-gc', file: entry,
        note: `removed orphaned entity model file ${entry} (no longer derived from the def)`,
      })
    }
    catch (err: any) {
      log?.warn?.({
        point: 'entity-gc-failed', file: entry, err,
        note: `could not gc ${entry}: ${err?.message}`,
      })
    }
  }

  return removed
}


function fieldAliases(_entity: any): string {
  return '{}'
}



export {
  resolveEntity,
  gcEntityFiles,
  entityAncestorSource,
}
