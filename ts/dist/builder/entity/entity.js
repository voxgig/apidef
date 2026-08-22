"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEntity = resolveEntity;
exports.gcEntityFiles = gcEntityFiles;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const types_1 = require("../../types");
const utility_1 = require("../../utility");
function resolveEntity(apimodel, opts) {
    const kit = apimodel.main[types_1.KIT];
    const barrel = [
        '# Entity Models\n'
    ];
    const entityFiles = [];
    (0, jostraca_1.each)(kit.entity, ((entity, entityName) => {
        const entityFile = (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.aon';
        let entityJSONIC = (0, utility_1.formatJSONIC)(entity).trim();
        entityJSONIC = entityJSONIC.substring(1, entityJSONIC.length - 1);
        const fieldAliasesSrc = fieldAliases(entity);
        const entitySrc = `# Entity: ${entity.name}\n\n` +
            `main: ${types_1.KIT}: entity: ${entity.name}: {\n\n` +
            `  alias: field: ${fieldAliasesSrc}\n` +
            entityJSONIC +
            '\n\n}\n';
        entityFiles.push({ name: entityFile, src: entitySrc });
        barrel.push(`@"${node_path_1.default.basename(entityFile)}"`);
    }));
    const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'entity-index.aon';
    return function apiEntityBuilder() {
        (0, jostraca_1.Folder)({ name: 'entity' }, () => {
            (0, jostraca_1.each)(entityFiles, (entityFile) => {
                (0, jostraca_1.File)({ name: entityFile.name }, () => (0, jostraca_1.Content)(entityFile.src));
            });
            (0, jostraca_1.File)({ name: indexFile }, () => (0, jostraca_1.Content)(barrel.join('\n')));
        });
    };
}
// Garbage-collect orphaned entity model files.
//
// The builder above EMITS one <outprefix><name>.aon per derived entity but
// never removes anything, so an entity that disappears from the def — a spec
// rename, a dropped path, a schema rename that changes the derived entity
// name — leaves its old file behind on every regen. The orphan is not in the
// regenerated entity-index barrel, so it is silently dead weight at best; at
// worst a later hand-include resurrects a stale surface.
//
// Deletion is guarded three ways, so nothing a user could own is touched:
//   1. only `<outprefix>*.aon` / `*.aontu` files in the entity folder
//      (a different outprefix belongs to a different def sharing the folder);
//   2. the current entity set and the index barrel are always kept;
//   3. the file must START with the generated header (`# Entity: `) — a file
//      apidef did not write is left alone.
//
// GC failure must never fail a build: errors are logged and swallowed.
function gcEntityFiles(fs, log, modelFolder, outprefix, entityNames) {
    const removed = [];
    const prefix = null == outprefix ? '' : outprefix;
    const entityFolder = node_path_1.default.join(modelFolder, 'entity');
    const keep = new Set(entityNames.map((name) => prefix + name + '.aon'));
    keep.add(prefix + 'entity-index.aon');
    let entries = [];
    try {
        entries = fs.readdirSync(entityFolder);
    }
    catch (_err) {
        return removed; // no entity folder yet — nothing to collect
    }
    for (const entry of entries) {
        // BOTH extensions are candidates. `.aon` is what the builder emits
        // now; `.aontu` is what it emitted before the rename, and such files
        // are orphaned by definition — the regenerated index barrel no longer
        // includes them. The `# Entity: ` header guard below still applies, so
        // only a file apidef itself wrote is ever removed.
        if (!entry.endsWith('.aon') && !entry.endsWith('.aontu')) {
            continue;
        }
        if (!entry.startsWith(prefix)) {
            continue;
        }
        if (keep.has(entry)) {
            continue;
        }
        const file = node_path_1.default.join(entityFolder, entry);
        try {
            const head = String(fs.readFileSync(file)).slice(0, 64);
            if (!head.startsWith('# Entity: ')) {
                continue;
            }
            fs.unlinkSync(file);
            removed.push(entry);
            log?.info?.({
                point: 'entity-gc', file: entry,
                note: `removed orphaned entity model file ${entry} (no longer derived from the def)`,
            });
        }
        catch (err) {
            log?.warn?.({
                point: 'entity-gc-failed', file: entry, err,
                note: `could not gc ${entry}: ${err?.message}`,
            });
        }
    }
    return removed;
}
function fieldAliases(_entity) {
    // Field aliasing (mapping e.g. a `<name>_id` field onto the canonical
    // `id`) is not currently implemented. The original heuristic referenced
    // properties that don't exist on the entity at this stage
    // (`entity.field`, `op.param`, `p.keys` — entities carry `fields`, ops
    // carry `points`, and `each` stamps `key$`), so it always produced `{}`
    // and would have thrown if any branch ran. Emit an empty alias map
    // explicitly until the alias semantics are specified.
    // Parity: go/builder.go buildFieldAliases (also `{}`).
    return '{}';
}
//# sourceMappingURL=entity.js.map