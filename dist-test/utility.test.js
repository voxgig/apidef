"use strict";
/* Copyright (c) 2024 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const utility_1 = require("../dist/utility");
// TODO: remove all sdk refs or rename to api
(0, node_test_1.describe)('utilit', () => {
    (0, node_test_1.test)('pathMatch', async () => {
        const pmf = (p, x) => {
            const r = (0, utility_1.pathMatch)(p, x);
            return null === r ? r : { i: r.index, m: r.slice(0), x: r.expr };
        };
        (0, code_1.expect)(pmf('/api/foo0', '/t/t/')).equals({
            i: 0, m: ['api', 'foo0'], x: '/t/t/'
        });
        (0, code_1.expect)(pmf('/api/foo0n', '/t/')).equals(null);
        (0, code_1.expect)(pmf('/api/foo0n', '/t/t/t/')).equals(null);
        (0, code_1.expect)(pmf('/api/foo0n', 'p/')).equals(null);
        (0, code_1.expect)(pmf('/api/foo0n', 't/p/')).equals(null);
        (0, code_1.expect)(pmf('/api/foo0n', '/t/p/')).equals(null);
        (0, code_1.expect)(pmf('/api/foo1/', '/t/t/')).equals({
            m: ['api', 'foo1'], i: 0, x: '/t/t/'
        });
        (0, code_1.expect)(pmf('api/foo2/', '/t/t/')).equals({
            m: ['api', 'foo2'], i: 0, x: '/t/t/'
        });
        (0, code_1.expect)(pmf('api/foo3', '/t/t/')).equals({
            m: ['api', 'foo3'], i: 0, x: '/t/t/'
        });
        (0, code_1.expect)(pmf('/foo4', '/t/')).equals({
            m: ['foo4'], i: 0, x: '/t/'
        });
        (0, code_1.expect)(pmf('/foo5/', '/t/')).equals({
            m: ['foo5'], i: 0, x: '/t/'
        });
        (0, code_1.expect)(pmf('foo6/', '/t/')).equals({
            m: ['foo6'], i: 0, x: '/t/'
        });
        (0, code_1.expect)(pmf('foo7', '/t/')).equals({
            m: ['foo7'], i: 0, x: '/t/'
        });
        (0, code_1.expect)(pmf('a0/{p0}', '/t/p/')).equals({
            m: ['a0', '{p0}'], i: 0, x: '/t/p/'
        });
        (0, code_1.expect)(pmf('{p1}/a1/', '/p/t/')).equals({
            m: ['{p1}', 'a1'], i: 0, x: '/p/t/'
        });
        (0, code_1.expect)(pmf('/a/b/c', '/t')).equals({
            m: ['a'], i: 0, x: '/t'
        });
        (0, code_1.expect)(pmf('/a/b/c', 't')).equals({
            m: ['a'], i: 0, x: 't'
        });
        (0, code_1.expect)(pmf('/a/b/c', 't/')).equals({
            m: ['c'], i: 2, x: 't/'
        });
        (0, code_1.expect)(pmf('/a/b/c', 't/t/')).equals({
            m: ['b', 'c'], i: 1, x: 't/t/'
        });
        (0, code_1.expect)(pmf('/a/b/{c}', 't/p/')).equals({
            m: ['b', '{c}'], i: 1, x: 't/p/'
        });
        (0, code_1.expect)(pmf('/a/b/{c}', 'p/')).equals({
            m: ['{c}'], i: 2, x: 'p/'
        });
        (0, code_1.expect)(pmf('/a/b/{c}', 't/')).equals(null);
        (0, code_1.expect)(pmf('/a/b/{c}/d', 't/p')).equals({
            m: ['b', '{c}'], i: 1, x: 't/p'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d', 'p/t')).equals({
            m: ['{c}', 'd'], i: 2, x: 'p/t'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d', 'p/t/')).equals({
            m: ['{c}', 'd'], i: 2, x: 'p/t/'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d/e', 'p/t/')).equals(null);
        (0, code_1.expect)(pmf('/a/b/{c}/d/e', 'p/t')).equals({
            i: 2, m: ['{c}', 'd'], x: 'p/t'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d/{e}', 't/p/')).equals({
            i: 3, m: ['d', '{e}'], x: 't/p/'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d/{e}', 't/p')).equals({
            i: 1, m: ['b', '{c}'], x: 't/p'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d/{e}', '/t/p')).equals(null);
        (0, code_1.expect)(pmf('/a/b/{c}/d/{e}', 't/p/t/p')).equals({
            i: 1, m: ['b', '{c}', 'd', '{e}'], x: 't/p/t/p'
        });
    });
});
//# sourceMappingURL=utility.test.js.map