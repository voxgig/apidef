"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const field_1 = require("../../dist/transform/field");
(0, node_test_1.describe)('transform-field', () => {
    (0, node_test_1.test)('inferTypeFromValue', () => {
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)('hello'), 'string');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)(''), 'string');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)(true), 'boolean');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)(false), 'boolean');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)(42), 'integer');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)(0), 'integer');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)(-1), 'integer');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)(3.14), 'number');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)(0.5), 'number');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)([1, 2]), 'array');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)([]), 'array');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)({ a: 1 }), 'object');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)({}), 'object');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)(null), 'string');
        node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)(undefined), 'string');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - OpenAPI 3.x example object', () => {
        const opdef = {
            responses: {
                200: {
                    content: {
                        'application/json': {
                            example: {
                                id: 'abc-123',
                                name: 'Test Item',
                                count: 42,
                                price: 9.99,
                                active: true,
                                tags: ['a', 'b'],
                                meta: { key: 'val' },
                            }
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        node_assert_1.default.deepStrictEqual(fields.length, 7);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        node_assert_1.default.deepStrictEqual(byName.id.type, 'string');
        node_assert_1.default.deepStrictEqual(byName.name.type, 'string');
        node_assert_1.default.deepStrictEqual(byName.count.type, 'integer');
        node_assert_1.default.deepStrictEqual(byName.price.type, 'number');
        node_assert_1.default.deepStrictEqual(byName.active.type, 'boolean');
        node_assert_1.default.deepStrictEqual(byName.tags.type, 'array');
        node_assert_1.default.deepStrictEqual(byName.meta.type, 'object');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - OpenAPI 3.x named examples', () => {
        const opdef = {
            responses: {
                200: {
                    content: {
                        'application/json': {
                            examples: {
                                'example1': {
                                    value: {
                                        id: 'x1',
                                        title: 'First',
                                        score: 88.5,
                                    }
                                },
                                'example2': {
                                    value: {
                                        id: 'x2',
                                        title: 'Second',
                                        score: 91.0,
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        node_assert_1.default.deepStrictEqual(fields.length, 3);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        node_assert_1.default.deepStrictEqual(byName.id.type, 'string');
        node_assert_1.default.deepStrictEqual(byName.title.type, 'string');
        node_assert_1.default.deepStrictEqual(byName.score.type, 'number');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - Swagger 2.0 schema example', () => {
        const opdef = {
            responses: {
                200: {
                    schema: {
                        example: {
                            username: 'admin',
                            email: 'admin@test.com',
                            is_active: true,
                            login_count: 5,
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        node_assert_1.default.deepStrictEqual(fields.length, 4);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        node_assert_1.default.deepStrictEqual(byName.username.type, 'string');
        node_assert_1.default.deepStrictEqual(byName.email.type, 'string');
        node_assert_1.default.deepStrictEqual(byName.is_active.type, 'boolean');
        node_assert_1.default.deepStrictEqual(byName.login_count.type, 'integer');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - array example unwraps to first item', () => {
        const opdef = {
            responses: {
                200: {
                    content: {
                        'application/json': {
                            example: [
                                { id: 1, name: 'first' },
                                { id: 2, name: 'second' },
                            ]
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        node_assert_1.default.deepStrictEqual(fields.length, 2);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        node_assert_1.default.deepStrictEqual(byName.id.type, 'integer');
        node_assert_1.default.deepStrictEqual(byName.name.type, 'string');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - no responses returns empty', () => {
        node_assert_1.default.deepStrictEqual((0, field_1.inferFieldsFromExamples)({}), []);
        node_assert_1.default.deepStrictEqual((0, field_1.inferFieldsFromExamples)({ responses: {} }), []);
        node_assert_1.default.deepStrictEqual((0, field_1.inferFieldsFromExamples)({ responses: { 404: {} } }), []);
    });
    (0, node_test_1.test)('inferFieldsFromExamples - 201 response', () => {
        const opdef = {
            responses: {
                201: {
                    content: {
                        'application/json': {
                            example: {
                                id: 'new-1',
                                created: true,
                            }
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        node_assert_1.default.deepStrictEqual(fields.length, 2);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        node_assert_1.default.deepStrictEqual(byName.id.type, 'string');
        node_assert_1.default.deepStrictEqual(byName.created.type, 'boolean');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - Swagger 2.0 examples with media type', () => {
        const opdef = {
            responses: {
                200: {
                    examples: {
                        'application/json': {
                            status: 'ok',
                            version: 2,
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        node_assert_1.default.deepStrictEqual(fields.length, 2);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        node_assert_1.default.deepStrictEqual(byName.status.type, 'string');
        node_assert_1.default.deepStrictEqual(byName.version.type, 'integer');
    });
});
//# sourceMappingURL=field.test.js.map