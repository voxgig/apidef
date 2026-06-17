"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const entity_1 = require("../../dist/transform/entity");
(0, node_test_1.describe)('transform-entity', () => {
    // test('resolvePathList', () => {
    //   expect(resolvePathList).exist()
    //   expect(resolvePathList({
    //     path: {
    //       '/foo': {},
    //       '/bar/{bar}': {},
    //       '/zed/{f0}/dez/{f1}': {
    //         rename: {
    //           param: {
    //             f0: 't0',
    //             f1: 't1',
    //           }
    //         }
    //       },
    //     }
    //   })).equals([
    //     { orig: '/foo', parts: ['foo'], rename: {} },
    //     { orig: '/bar/{bar}', parts: ['bar', '{bar}'], rename: {} },
    //     {
    //       orig: '/zed/{f0}/dez/{f1}',
    //       parts: ['zed', '{t0}', 'dez', '{t1}'],
    //       rename: {
    //         param: {
    //           f0: 't0',
    //           f1: 't1',
    //         }
    //       }
    //     }
    //   ])
    // })
    (0, node_test_1.test)('buildRelations', () => {
        node_assert_1.default.ok(entity_1.buildRelations);
        const r0 = (0, entity_1.buildRelations)({}, [
            { parts: ['a'] },
            { parts: ['b', '{id}'] },
            { parts: ['d', 'c', '{id}'] },
            { parts: ['f', '{f_id}', 'e', '{id}'] },
            { parts: ['i', 'h', '{h_id}', 'g', '{id}'] },
            { parts: ['ii', 'h', '{h_id}', 'g', '{id}'] },
            { parts: ['l', '{l_id}', 'k', '{k_id}', 'j', '{id}'] },
            { parts: ['p', '{p_id}', 'n', '{n_id}', 'm', '{id}'] },
            { parts: ['q', '{q_id}', 'o', '{o_id}', 'n', '{n_id}', 'm', '{id}'] },
            { parts: ['oo', 'o', '{o_id}', 'n', '{n_id}', 'm', '{id}'] },
        ]);
        // console.dir(r0, { depth: null })
        node_assert_1.default.deepStrictEqual(r0, {
            ancestors: [['f'], ['h'], ['l', 'k'], ['p', 'n'], ['q', 'o', 'n']]
        });
    });
});
//# sourceMappingURL=entity.test.js.map