"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const aontu_1 = require("aontu");
const entity_1 = require("../dist/builder/entity/entity");
const entity_2 = require("../dist/transform/entity");
const root = node_path_1.default.resolve(__dirname, '../..');
const schema = (0, node_fs_1.readFileSync)(node_path_1.default.join(root, 'model/apidef.aontu'), 'utf8');
(0, node_test_1.test)('inferred ancestors retain only existing other entities', () => {
    const row = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(root, 'ts/test/ancestor-targets.json'), 'utf8'));
    (0, entity_2.filterEntityAncestors)(row.entities);
    strict_1.default.deepEqual(row.entities, row.expected);
});
(0, node_test_1.test)('ancestor source preserves chains and does not mutate the model', () => {
    const cases = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(root, 'ts/test/ancestor-relations.json'), 'utf8'));
    for (const row of cases) {
        const before = JSON.stringify(row.entity);
        strict_1.default.deepEqual((0, entity_1.entityAncestorSource)(row.entity), { model: row.model, relations: row.relations });
        strict_1.default.equal(JSON.stringify(row.entity), before);
    }
    const { relations } = (0, entity_1.entityAncestorSource)(cases[0].entity);
    const model = new aontu_1.Aontu().generate(schema + '\nmain:kit:entity:{galaxy:{} planet:{} moon:{' + relations + '}}');
    strict_1.default.deepEqual(model.main.kit.entity.moon.relations.ancestors, [['$.main.kit.entity.planet'], ['$.main.kit.entity.galaxy', '$.main.kit.entity.planet']]);
});
(0, node_test_1.test)('ancestors must link to existing other entities', () => {
    for (const target of ['missing', 'moon', 'planet.fields']) {
        const src = schema + '\nmain:kit:entity:{planet:{} moon:relations:ancestors:[[path($.main.kit.entity.' + target + ')]]}';
        strict_1.default.throws(() => new aontu_1.Aontu().generate(src), /aontu\/(rel_unresolved|constraint)/);
    }
    for (const value of ['path($.main.kit.flow.other)', '"planet"', '"$.main.kit.entity.planet"']) {
        const src = schema + '\nmain:kit:flow:other:{}\nmain:kit:entity:{planet:{} moon:relations:ancestors:[[' + value + ']]}';
        strict_1.default.throws(() => new aontu_1.Aontu().generate(src), /aontu\/(rel_address|scalar_value)/);
    }
});
//# sourceMappingURL=ancestor-relations.test.js.map