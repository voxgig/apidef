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
        const entityFile = (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.jsonic';
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
    const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'entity-index.jsonic';
    return function apiEntityBuilder() {
        (0, jostraca_1.Folder)({ name: 'entity' }, () => {
            (0, jostraca_1.each)(entityFiles, (entityFile) => {
                (0, jostraca_1.File)({ name: entityFile.name }, () => (0, jostraca_1.Content)(entityFile.src));
            });
            (0, jostraca_1.File)({ name: indexFile }, () => (0, jostraca_1.Content)(barrel.join('\n')));
        });
    };
}
function fieldAliases(entity) {
    // HEURISTIC: id may be name_id or nameId
    const fieldAliases = (0, jostraca_1.each)(entity.op, (op) => (0, jostraca_1.each)(op.param))
        .flat()
        .reduce((a, p) => (entity.field[p.keys] ? null :
        (p.key$.toLowerCase().includes(entity.name) ?
            (a[p.key$] = 'id', a.id = p.key$) :
            null)
        , a), {});
    const fieldAliasesSrc = JSON.stringify(fieldAliases, null, 2)
        .replace(/\n/g, '\n  ');
    return fieldAliasesSrc;
}
//# sourceMappingURL=entity.js.map