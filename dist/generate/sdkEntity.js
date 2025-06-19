"use strict";
/* Copyright (c) 2025 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSdkEntity = generateSdkEntity;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
function generateSdkEntity(apimodel, modelPath, opts, res) {
    const { fs, log } = res;
    const modelBasePath = node_path_1.default.dirname(modelPath);
    const entityIncludes = [];
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
        const entityFilePath = node_path_1.default.join(modelBasePath, 'entity', (null == opts.outprefix ? '' : opts.outprefix) + entity.name + '.jsonic');
        fs.mkdirSync(node_path_1.default.dirname(entityFilePath), { recursive: true });
        // TODO: diff merge
        (0, utility_1.writeChanged)('entity-model', entityFilePath, entityFileSrc, fs, log, { update: false });
    }));
    modifyModel(fs, opts, node_path_1.default.join(modelBasePath, (null == opts.outprefix ? '' : opts.outprefix) + 'sdk.jsonic'), entityIncludes);
}
async function modifyModel(fs, opts, path, entityIncludes) {
    // TODO: This is a kludge.
    // Aontu should provide option for as-is AST so that can be used
    // to find injection point more reliably
    let src = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') :
        `
@"api/${null == opts.outprefix ? '' : opts.outprefix}entity-index.jsonic"

main: sdk: entity: {}\n

`;
    let newsrc = '' + src;
    // Inject target file references into model
    entityIncludes.sort().map((entname) => {
        const lineRE = new RegExp(`@"entity/${entname}.jsonic"`);
        if (!src.match(lineRE)) {
            newsrc = newsrc.replace(/(main:\s+sdk:\s+entity:\s+\{\s*\}\n)/, '$1' +
                `@"entity/${entname}.jsonic"\n`);
        }
    });
    if (newsrc.length !== src.length) {
        fs.writeFileSync(path, newsrc);
    }
}
//# sourceMappingURL=sdkEntity.js.map