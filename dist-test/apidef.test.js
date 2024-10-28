"use strict";
/* Copyright (c) 2024 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const memfs_1 = require("memfs");
// import { cmp, each, Project, Folder, File, Code } from 'jostraca'
const __1 = require("../");
(0, node_test_1.describe)('apidef', () => {
    (0, node_test_1.test)('happy', async () => {
        (0, code_1.expect)(__1.ApiDef).exist();
        const { fs, vol } = (0, memfs_1.memfs)({
            '/openapi-3.yml': FILE.openapi_3_yml,
            '/openapi-3.yml-guide.jsonic': FILE.openapi_3_yml_guide_jsonic,
        });
        const apidef = (0, __1.ApiDef)({
            fs,
            debug: 'warn'
        });
        (0, code_1.expect)(apidef).exist();
        const spec = {
            def: '/openapi-3.yml',
            kind: 'openapi-3',
            model: '/openapi-3.api.jsonic',
            meta: {
                name: 'foo'
            },
        };
        const res = await apidef.generate(spec);
        (0, code_1.expect)(res).exist();
        // console.log(JSON.stringify(res.model, null, 2))
        // const finalfs: any = vol.toJSON()
        // console.dir(finalfs, { depth: null })
        // expect(finalfs['/openapi-3.api.jsonic'].substring(0, 111))
        //  .equal(FILE['/openapi-3.api.jsonic'].substring(0, 111))
        // expect(finalfs['/openapi-3.yml'].length).equal(FILE.openapi_3_yml.length)
        // expect(finalfs['/openapi-3.vxg'].length).equal(FILE.openapi_3_vxg.length)
        // expect(vol.toJSON()).equal({
        //   '/openapi-3.yml': FILE.openapi_3_yml,
        //   '/openapi-3.vxg': FILE.openapi_3_vxg,
        // })
    });
});
const FILE = {
    openapi_3_yml_guide_jsonic: `
guide: entity: {
  pet: path: {

    '/pets': {
      op: { list: 'get', create: 'post' }
    },

    '/pets/{petId}': {
      op: { load: 'get', save: 'put', remove: 'delete' },
    }
  }
}

# '/categories/{categoryId}/pets': { method: 'GET:list', param: 'categoryId' },
#          },
# Category: {
#   path: {
#     '/categories': { method: 'GET:list,POST:create' },
#   }
# },
# Order: {
#   path: {
#     '/orders': { method: 'GET:list,POST:create' },
#     '/orders/{orderId}/cancel': { method: 'POST:cmd' },
#   }
# },
#        }
# prepare, modify, etc


guide: control: transform: openapi: order: \`
  top,
  entity,
  operation,
  field,
  manual,
  \`


`,
    openapi_3_yml: `
openapi: 3.0.0
info:
  title: Pet Store API
  version: 1.0.0
  description:
    Pet Store API Description.

paths:
  /pets:
    get:
      summary: List all pets
      parameters:
        - name: categoryId
          in: query
          required: false
          schema:
            type: integer
      responses:
        '200':
          description: A list of pets.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'
    post:
      summary: Create a pet
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/NewPet'
      responses:
        '201':
          description: Pet created.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'

  /pets/{petId}:
    get:
      summary: Get a pet by ID
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: integer
      responses:
        '200':
          description: A pet.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
    put:
      summary: Update a pet by ID
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Pet'
      responses:
        '200':
          description: Pet updated.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
    delete:
      summary: Delete a pet by ID
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: integer
      responses:
        '204':
          description: Pet deleted.

  /categories:
    get:
      summary: List all categories
      responses:
        '200':
          description: A list of categories.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Category'
    post:
      summary: Create a category
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Category'
      responses:
        '201':
          description: Category created.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Category'

  /categories/{categoryId}/pets:
    get:
      summary: List pets by category
      parameters:
        - name: categoryId
          in: path
          required: true
          schema:
            type: integer
      responses:
        '200':
          description: A list of pets by category.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'

  /orders:
    get:
      summary: List all orders
      responses:
        '200':
          description: A list of orders.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Order'
    post:
      summary: Create an order
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/NewOrder'
      responses:
        '201':
          description: Order created.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'

  /orders/{orderId}/cancel:
    post:
      summary: Cancel an order
      parameters:
        - name: orderId
          in: path
          required: true
          schema:
            type: integer
      responses:
        '200':
          description: Order canceled.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'

components:
  schemas:
    Pet:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
        category:
          $ref: '#/components/schemas/Category'
        status:
          type: string
          enum: [available, pending, sold]

    NewPet:
      type: object
      required:
        - name
      properties:
        name:
          type: string
        category:
          $ref: '#/components/schemas/Category'

    Category:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string

    Order:
      type: object
      properties:
        id:
          type: integer
        petId:
          type: integer
        quantity:
          type: integer
        status:
          type: string
          enum: [placed, approved, delivered, cancelled]

    NewOrder:
      type: object
      required:
        - petId
        - quantity
      properties:
        petId:
          type: integer
        quantity:
          type: integer

`,
    '/openapi-3.api.jsonic': `
  "main": {
    "api": {
      "entity": {
        "Category": {
          "field": {
            "id": {
              "name": "id",
              "kind": "Integer"
            },
            "name": {
              "name": "name",
              "kind": "String"
            }
          },
          "cmd": {}
        },
        "Order": {
          "field": {
            "id": {
              "name": "id",
              "kind": "Integer"
            },
            "petId": {
              "name": "petId",
              "kind": "Integer"
            },
            "quantity": {
              "name": "quantity",
              "kind": "Integer"
            },
            "status": {
              "name": "status",
              "kind": "String"
            }
          },
          "cmd": {
            "cancel": {
              "query": [],
              "param": {
                "orderId": {
                  "name": "orderId",
                  "kind": "Integer"
                }
              },
              "response": {
                "field": {
                  "id": {
                    "name": "id",
                    "kind": "Integer"
                  },
                  "petId": {
                    "name": "petId",
                    "kind": "Integer"
                  },
                  "quantity": {
                    "name": "quantity",
                    "kind": "Integer"
                  },
                  "status": {
                    "name": "status",
                    "kind": "String"
                  }
                }
              }
            }
          }
        },
        "Pet": {
          "field": {
            "category": {
              "name": "category",
              "kind": "Object"
            },
            "id": {
              "name": "id",
              "kind": "Integer"
            },
            "name": {
              "name": "name",
              "kind": "String"
            },
            "status": {
              "name": "status",
              "kind": "String"
            }
          },
          "cmd": {}
        }
      },
      "name": "foo"
    }
  }
`
};
//# sourceMappingURL=apidef.test.js.map