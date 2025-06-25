"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveApiEntity = resolveApiEntity;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
// import {
//   writeChanged
// } from '../utility'
function resolveApiEntity(apimodel, 
// spec: any,
opts) {
    // const { fs, log } = res
    // const apiFolder = Path.join(opts.folder as string, 'api')
    // fs.mkdirSync(apiFolder, { recursive: true })
    const barrel = [
        '# Entity Models\n'
    ];
    const entityFiles = [];
    (0, jostraca_1.each)(apimodel.main.api.entity, ((entity, entityName) => {
        // const entityFile = Path.join(
        //   apiFolder, (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.jsonic')
        const entityFile = (null == opts.outprefix ? '' : opts.outprefix) + entityName + '.jsonic';
        const entityJSON = JSON.stringify(entity, null, 2);
        const entitySrc = '# GENERATED FILE - DO NOT EDIT\n\n' +
            `main: api: entity: ${entity.name}: {\n` +
            entityJSON.substring(1, entityJSON.length - 1).replace(/\n  /g, '\n') +
            '\n\n}\n';
        // writeChanged('api-entity-model:' + entityName, entityFile, entitySrc, fs, log)
        entityFiles.push({ name: entityFile, src: entitySrc });
        barrel.push(`@"${node_path_1.default.basename(entityFile)}"`);
    }));
    // const indexFile = Path.join(
    //   apiFolder, (null == opts.outprefix ? '' : opts.outprefix) + 'entity-index.jsonic')
    const indexFile = (null == opts.outprefix ? '' : opts.outprefix) + 'api-entity-index.jsonic';
    // writeChanged('api-entity-index', indexFile, barrel.join('\n'), fs, log)
    return function apiEntityBuilder() {
        (0, jostraca_1.Folder)({ name: 'api' }, () => {
            (0, jostraca_1.each)(entityFiles, (entityFile) => {
                (0, jostraca_1.File)({ name: entityFile.name }, () => (0, jostraca_1.Content)(entityFile.src));
            });
            (0, jostraca_1.File)({ name: indexFile }, () => (0, jostraca_1.Content)(barrel.join('\n')));
        });
    };
}
//# sourceMappingURL=apiEntity.js.map