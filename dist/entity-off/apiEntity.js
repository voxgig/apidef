"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveApiEntity = resolveApiEntity;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
function resolveApiEntity(apimodel, opts) {
    const barrel = [
        '# Entity Models\n'
    ];
    const entityFiles = [];
    (0, jostraca_1.each)(apimodel.main.api.entity, ((entity, entityName) => {
        const entityFile = (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.jsonic';
        const entityJSON = JSON.stringify(entity, null, 2);
        const fieldAliasesSrc = fieldAliases(entity);
        const entitySrc = `# Entity: ${entity.name}\n\n` +
            `main: api: entity: ${entity.name}: {\n\n` +
            `  alias: field: ${fieldAliasesSrc}\n` +
            prettyJSON(entityJSON.substring(1, entityJSON.length - 1)) +
            '\n\n}\n';
        entityFiles.push({ name: entityFile, src: entitySrc });
        barrel.push(`@"${node_path_1.default.basename(entityFile)}"`);
    }));
    const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'api-entity-index.jsonic';
    return function apiEntityBuilder() {
        (0, jostraca_1.Folder)({ name: 'api' }, () => {
            (0, jostraca_1.each)(entityFiles, (entityFile) => {
                (0, jostraca_1.File)({ name: entityFile.name }, () => (0, jostraca_1.Content)(entityFile.src));
            });
            (0, jostraca_1.File)({ name: indexFile }, () => (0, jostraca_1.Content)(barrel.join('\n')));
        });
    };
}
function prettyJSON(jsonsrc) {
    return jsonsrc
        .replace(/"([a-zA-Z_][a-zA-Z_0-9]*)": /g, '$1: ')
        .replace(/},/g, '}\n');
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
//# sourceMappingURL=apiEntity.js.map