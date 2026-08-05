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
    const entityFile = (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.aontu'

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

  const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'entity-index.aontu'

  return function apiEntityBuilder() {
    Folder({ name: 'entity' }, () => {
      each(entityFiles, (entityFile) => {
        File({ name: entityFile.name }, () => Content(entityFile.src))
      })

      File({ name: indexFile }, () => Content(barrel.join('\n')))
    })
  }
}


// Garbage-collect orphaned entity model files.
//
// The builder above EMITS one <outprefix><name>.aontu per derived entity but
// never removes anything, so an entity that disappears from the def — a spec
// rename, a dropped path, a schema rename that changes the derived entity
// name — leaves its old file behind on every regen. The orphan is not in the
// regenerated entity-index barrel, so it is silently dead weight at best; at
// worst a later hand-include resurrects a stale surface.
//
// Deletion is guarded three ways, so nothing a user could own is touched:
//   1. only `<outprefix>*.aontu` files inside the entity folder are candidates
//      (a different outprefix belongs to a different def sharing the folder);
//   2. the current entity set and the index barrel are always kept;
//   3. the file must START with the generated header (`# Entity: `) — a file
//      apidef did not write is left alone.
//
// GC failure must never fail a build: errors are logged and swallowed.
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
    entityNames.map((name) => prefix + name + '.aontu'))
  keep.add(prefix + 'entity-index.aontu')

  let entries: string[] = []
  try {
    entries = fs.readdirSync(entityFolder)
  }
  catch (_err: any) {
    return removed // no entity folder yet — nothing to collect
  }

  for (const entry of entries) {
    if (!entry.endsWith('.aontu')) { continue }
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
  resolveEntity,
  gcEntityFiles,
}
