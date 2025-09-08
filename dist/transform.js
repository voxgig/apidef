"use strict";
/* Copyright (c) 2024 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuideShape = exports.OPKIND = void 0;
exports.fixName = fixName;
const jostraca_1 = require("jostraca");
const gubu_1 = require("gubu");
const top_1 = require("./transform/top");
const entity_1 = require("./transform/entity");
const operation_1 = require("./transform/operation");
const args_1 = require("./transform/args");
const field_1 = require("./transform/field");
const TRANSFORM = {
    top: top_1.topTransform,
    entity: entity_1.entityTransform,
    operation: operation_1.operationTransform,
    args: args_1.argsTransform,
    field: field_1.fieldTransform,
    // manual: manualTransform,
};
const OPKIND = {
    list: 'res',
    load: 'res',
    remove: 'res',
    create: 'req',
    update: 'req',
};
exports.OPKIND = OPKIND;
const GuideShape = (0, gubu_1.Gubu)({
    entity: {},
    control: {},
    transform: {},
    manual: {},
});
exports.GuideShape = GuideShape;
function fixName(base, name, prop = 'name') {
    if (null != base && 'object' === typeof base && 'string' === typeof name) {
        base[prop.toLowerCase()] = name.toLowerCase();
        base[(0, jostraca_1.camelify)(prop)] = (0, jostraca_1.camelify)(name);
        base[prop.toUpperCase()] = name.toUpperCase();
    }
    else {
        // record to a "wierds" log
    }
}
//# sourceMappingURL=transform.js.map