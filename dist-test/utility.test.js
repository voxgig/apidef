"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const utility_1 = require("../dist/utility");
(0, node_test_1.describe)('utility', () => {
    (0, node_test_1.test)('depluralize', () => {
        (0, code_1.expect)((0, utility_1.depluralize)('Dogs')).equal('Dog');
        (0, code_1.expect)((0, utility_1.depluralize)('countries')).equal('country');
        (0, code_1.expect)((0, utility_1.depluralize)('good_dogs')).equal('good_dog');
        (0, code_1.expect)((0, utility_1.depluralize)('many_countries')).equal('many_country');
        (0, code_1.expect)((0, utility_1.depluralize)('mice')).equal('mouse');
        (0, code_1.expect)((0, utility_1.depluralize)('many_mice')).equal('many_mouse');
        (0, code_1.expect)((0, utility_1.depluralize)('api_key')).equal('api_key');
        (0, code_1.expect)((0, utility_1.depluralize)('api_keys')).equal('api_key');
        (0, code_1.expect)((0, utility_1.depluralize)('ApiKeys')).equal('ApiKey');
        (0, code_1.expect)((0, utility_1.depluralize)('API_Keys')).equal('API_Key');
    });
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
    (0, node_test_1.test)('formatJSONIC', async () => {
        (0, code_1.expect)((0, utility_1.formatJSONIC)()).equal('');
        (0, code_1.expect)((0, utility_1.formatJSONIC)(undefined)).equal('');
        (0, code_1.expect)((0, utility_1.formatJSONIC)(null)).equal('null\n');
        (0, code_1.expect)((0, utility_1.formatJSONIC)(true)).equal('true\n');
        (0, code_1.expect)((0, utility_1.formatJSONIC)(11)).equal('11\n');
        (0, code_1.expect)((0, utility_1.formatJSONIC)("s")).equal('"s"\n');
        (0, code_1.expect)((0, utility_1.formatJSONIC)({
            "a": 1,
            "a_COMMENT": "note about a",
            "0b_COMMENT": "0b notes",
            "0b": {
                "$": "not printed",
                "_CUR": "dollar",
                "_CUR_COMMENT": [
                    "x",
                    "y"
                ]
            }
        })).equal(`{
  a: 1  # note about a
  "0b": {  # 0b notes
    _CUR: "dollar"  # x; y
  }

}
`);
        const a0 = [100, 101, 102];
        a0['0_COMMENT'] = 'zero';
        a0['2_COMMENT'] = 'two';
        (0, code_1.expect)((0, utility_1.formatJSONIC)({ a: a0, a_COMMENT: 'array' })).equal(`{
  a: [  # array
    100  # zero
    101
    102  # two
  ]

}
`);
        (0, code_1.expect)((0, utility_1.formatJSONIC)({ _COMMENT: 'topO' })).equal(`{  # topO
}
`);
        const a1 = [];
        a1._COMMENT = 'topA';
        (0, code_1.expect)((0, utility_1.formatJSONIC)(a1)).equal(`[  # topA
]
`);
        (0, code_1.expect)((0, utility_1.formatJSONIC)({ a: { b: {}, c: [], d: {} }, e: {} })).equal(`{
  a: {
    b: {
    }
    c: [
    ]
    d: {
    }
  }

  e: {
  }

}
`);
        (0, code_1.expect)((0, utility_1.formatJSONIC)({ a1: { b1: {}, c1: [], d1: {} }, e1: {} }, { hsepd: 2 })).equal(`{
  a1: {
    b1: {
    }

    c1: [
    ]

    d1: {
    }

  }

  e1: {
  }

}
`);
    });
    (0, node_test_1.test)('getModelPath - basic path traversal', () => {
        const model = {
            a: {
                b: {
                    c: 'value'
                }
            }
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a')).equal(model.a);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.b')).equal(model.a.b);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.b.c')).equal('value');
    });
    (0, node_test_1.test)('getModelPath - array indexing', () => {
        const model = {
            items: [
                { name: 'first', value: 1 },
                { name: 'second', value: 2 },
                { name: 'third', value: 3 }
            ]
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.0')).equal(model.items[0]);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.1')).equal(model.items[1]);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.2')).equal(model.items[2]);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.0.name')).equal('first');
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.1.value')).equal(2);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.2.name')).equal('third');
    });
    (0, node_test_1.test)('getModelPath - nested arrays and objects', () => {
        const model = {
            data: {
                nested: [
                    {
                        items: [
                            { id: 'a' },
                            { id: 'b' }
                        ]
                    }
                ]
            }
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'data.nested.0.items.0.id')).equal('a');
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'data.nested.0.items.1.id')).equal('b');
    });
    (0, node_test_1.test)('getModelPath - required:true (default) throws on missing path', () => {
        const model = {
            a: {
                b: 'value'
            }
        };
        // Missing intermediate key
        try {
            (0, utility_1.getModelPath)(model, 'a.x.c');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'a.x.c'");
            (0, code_1.expect)(err.message).contains("Valid path up to: 'a'");
            (0, code_1.expect)(err.message).contains("Property 'x' does not exist");
            (0, code_1.expect)(err.message).contains("Available keys: [b]");
        }
        // Missing final key - should show available keys
        try {
            (0, utility_1.getModelPath)(model, 'a.missing');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'a.missing'");
            (0, code_1.expect)(err.message).contains("Valid path up to: 'a'");
            (0, code_1.expect)(err.message).contains("Property 'missing' does not exist");
            (0, code_1.expect)(err.message).contains("Available keys: [b]");
        }
        // Missing root key
        try {
            (0, utility_1.getModelPath)(model, 'missing');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'missing'");
            (0, code_1.expect)(err.message).contains("Valid path up to: '(root)'");
            (0, code_1.expect)(err.message).contains("Property 'missing' does not exist");
            (0, code_1.expect)(err.message).contains("Available keys: [a]");
        }
    });
    (0, node_test_1.test)('getModelPath - required:true throws on null/undefined in path', () => {
        const model = {
            a: {
                b: null
            }
        };
        try {
            (0, utility_1.getModelPath)(model, 'a.b.c');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'a.b.c'");
            (0, code_1.expect)(err.message).contains("Valid path up to: 'a.b'");
            (0, code_1.expect)(err.message).contains("Cannot access property 'c' of null");
        }
        const model2 = {
            a: {
                b: undefined
            }
        };
        try {
            (0, utility_1.getModelPath)(model2, 'a.b.c');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'a.b.c'");
            (0, code_1.expect)(err.message).contains("Valid path up to: 'a.b'");
            (0, code_1.expect)(err.message).contains("Cannot access property 'c' of undefined");
        }
    });
    (0, node_test_1.test)('getModelPath - required:true throws on array index out of bounds', () => {
        const model = {
            items: [
                { name: 'first' },
                { name: 'second' }
            ]
        };
        try {
            (0, utility_1.getModelPath)(model, 'items.5');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'items.5'");
            (0, code_1.expect)(err.message).contains("Valid path up to: 'items'");
            (0, code_1.expect)(err.message).contains("Property '5' does not exist");
            (0, code_1.expect)(err.message).contains("Available keys: array indices 0-1");
        }
    });
    (0, node_test_1.test)('getModelPath - required:false returns undefined on missing path', () => {
        const model = {
            a: {
                b: 'value'
            }
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.x.c', { required: false })).equal(undefined);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.missing', { required: false })).equal(undefined);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'missing', { required: false })).equal(undefined);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.b.c', { required: false })).equal(undefined);
    });
    (0, node_test_1.test)('getModelPath - required:false returns undefined on null/undefined in path', () => {
        const model = {
            a: {
                b: null
            }
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.b.c', { required: false })).equal(undefined);
        const model2 = {
            a: {
                b: undefined
            }
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model2, 'a.b.c', { required: false })).equal(undefined);
    });
    (0, node_test_1.test)('getModelPath - required:false returns undefined for array out of bounds', () => {
        const model = {
            items: [{ name: 'first' }]
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.5', { required: false })).equal(undefined);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.5.name', { required: false })).equal(undefined);
    });
    (0, node_test_1.test)('getModelPath - empty path handling', () => {
        const model = { a: 'value' };
        try {
            (0, utility_1.getModelPath)(model, '');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains('empty path provided');
        }
        (0, code_1.expect)((0, utility_1.getModelPath)(model, '', { required: false })).equal(undefined);
    });
    (0, node_test_1.test)('getModelPath - returns actual values including falsy ones', () => {
        const model = {
            zero: 0,
            empty: '',
            falsy: false,
            nullValue: null
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'zero')).equal(0);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'empty')).equal('');
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'falsy')).equal(false);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'nullValue')).equal(null);
    });
});
//# sourceMappingURL=utility.test.js.map