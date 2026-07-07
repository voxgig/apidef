"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEntity = resolveEntity;
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
        const entityFile = (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.aontu';
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
    const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'entity-index.aontu';
    return function apiEntityBuilder() {
        (0, jostraca_1.Folder)({ name: 'entity' }, () => {
            (0, jostraca_1.each)(entityFiles, (entityFile) => {
                (0, jostraca_1.File)({ name: entityFile.name }, () => (0, jostraca_1.Content)(entityFile.src));
            });
            (0, jostraca_1.File)({ name: indexFile }, () => (0, jostraca_1.Content)(barrel.join('\n')));
        });
    };
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