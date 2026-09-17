"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const flow_1 = require("../dist/builder/flow");
// FLOW FILE NAMES ON A CASE-INSENSITIVE FILESYSTEM.
//
// Flow names are camel case built from the entity name, so entities whose
// names differ only in where the underscores fall produce flow names that
// differ only in case. checkly's spec carries `StaticIP` and `StaticIp`,
// which become the entities `static_i_p` and `static_ip` and the flows
// `BasicStaticIPFlow` and `BasicStaticIpFlow`.
//
// APFS and NTFS treat those as ONE file. The second write replaced the
// first, flow-index.aon imported both names into the same content, and the
// model came out with 113 flows for 114 entities — surfacing much later as
// `getModelPath: path not found at 'main.kit.flow.BasicStaticIPFlow'` from
// the go test template, which says nothing about the overwritten file.
(0, node_test_1.describe)('flow-file-case', () => {
    (0, node_test_1.test)('leaves names that do not collide alone', () => {
        const base = (0, flow_1.flowFileBases)(['BasicAccountFlow', 'BasicCheckFlow']);
        node_assert_1.default.deepEqual(base, {
            BasicAccountFlow: 'BasicAccountFlow',
            BasicCheckFlow: 'BasicCheckFlow',
        });
    });
    (0, node_test_1.test)('suffixes every member of a case-colliding group', () => {
        const base = (0, flow_1.flowFileBases)(['BasicStaticIpFlow', 'BasicStaticIPFlow']);
        // Neither keeps the bare name: a bare name is what gets overwritten.
        node_assert_1.default.equal(base.BasicStaticIPFlow, 'BasicStaticIPFlow__1');
        node_assert_1.default.equal(base.BasicStaticIpFlow, 'BasicStaticIpFlow__2');
        const files = Object.values(base).map(f => f.toLowerCase());
        node_assert_1.default.equal(new Set(files).size, files.length);
    });
    (0, node_test_1.test)('is stable whatever order the flows arrive in', () => {
        const one = (0, flow_1.flowFileBases)(['BasicStaticIpFlow', 'BasicStaticIPFlow']);
        const two = (0, flow_1.flowFileBases)(['BasicStaticIPFlow', 'BasicStaticIpFlow']);
        node_assert_1.default.deepEqual(one, two);
    });
    (0, node_test_1.test)('handles a group of more than two', () => {
        const base = (0, flow_1.flowFileBases)(['BasicABFlow', 'BasicAbFlow', 'BasicaBFlow']);
        const files = Object.values(base).map(f => f.toLowerCase());
        node_assert_1.default.equal(new Set(files).size, 3);
        node_assert_1.default.equal(Object.values(base).filter(f => !f.includes('__')).length, 0);
    });
});
//# sourceMappingURL=flow-file-case.test.js.map