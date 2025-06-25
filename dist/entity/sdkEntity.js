"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSdkEntity = resolveSdkEntity;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
// import {
//   writeChanged
// } from '../utility'
// TODO: merge into apiEntity
function resolveSdkEntity(apimodel, opts) {
    // const { fs, log } = res
    // const folder = opts.folder as string
    const entityIncludes = [];
    const barrel = [
        '# Entity Models\n'
    ];
    const entityFiles = [];
    (0, jostraca_1.each)(apimodel.main.api.entity, ((entity) => {
        entityIncludes.push(entity.name);
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
        const entityFileSrc = `
# Entity ${entity.name}

main: sdk: entity: ${entity.name}: {
  alias: field: ${fieldAliasesSrc}
}

`;
        // const entityFilePath = Path.join(folder, 'entity',
        //   (null == opts.outprefix ? '' : opts.outprefix) + entity.name + '.jsonic')
        const entityFile = (null == opts.outprefix ? '' : opts.outprefix) + entity.name + '.jsonic';
        entityFiles.push({ name: entityFile, src: entityFileSrc });
        barrel.push(`@"${node_path_1.default.basename(entityFile)}"`);
        // fs.mkdirSync(Path.dirname(entityFilePath), { recursive: true })
        // TODO: diff merge
        // writeChanged('entity-model', entityFilePath, entityFileSrc, fs, log, { update: false })
    }));
    const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'entity-index.jsonic';
    // writeChanged('api-entity-index', indexFile, barrel.join('\n'), fs, log)
    return function sdkEntityBuilder() {
        (0, jostraca_1.Folder)({ name: 'entity' }, () => {
            (0, jostraca_1.each)(entityFiles, (entityFile) => {
                (0, jostraca_1.File)({ name: entityFile.name }, () => (0, jostraca_1.Content)(entityFile.src));
            });
            (0, jostraca_1.File)({ name: indexFile }, () => (0, jostraca_1.Content)(barrel.join('\n')));
        });
    };
    // modifyModel(
    //   fs,
    //   opts,
    //   Path.join(
    //     folder,
    //     (null == opts.outprefix ? '' : opts.outprefix) + 'sdk.jsonic'),
    //   entityIncludes
    // )
}
//# sourceMappingURL=sdkEntity.js.map