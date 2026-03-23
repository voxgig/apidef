/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import { snakify } from 'jostraca'

import {
  pathMatch,
  formatJSONIC,
  depluralize,
  canonize,
  sanitizeSlug,
  transliterate,
  cleanComponentName,
  ensureMinEntityName,
  inferFieldType,
  normalizeFieldName,
  getModelPath,
} from '../dist/utility'




describe('utility', () => {

  test('depluralize', () => {
    expect(depluralize('Dogs')).equal('Dog')
    expect(depluralize('countries')).equal('country')
    expect(depluralize('good_dogs')).equal('good_dog')
    expect(depluralize('many_countries')).equal('many_country')
    expect(depluralize('mice')).equal('mouse')
    expect(depluralize('many_mice')).equal('many_mouse')

    expect(depluralize('api_key')).equal('api_key')
    expect(depluralize('api_keys')).equal('api_key')
    expect(depluralize('ApiKeys')).equal('ApiKey')
    expect(depluralize('API_Keys')).equal('API_Key')

    // Words where -ies is part of the base form, not a plural suffix
    expect(depluralize('species')).equal('species')
    expect(depluralize('series')).equal('series')
    expect(depluralize('movies')).equal('movie')
    expect(depluralize('amiiboseries')).equal('amiiboseries')

    // Words that should not be truncated to <= 2 chars
    expect(depluralize('yes')).equal('yes')
    expect(depluralize('lens')).equal('lens')
    expect(depluralize('phrase')).equal('phrase')
    expect(depluralize('abs')).equal('abs')
  })

  test('canonize', () => {
    // Basic canonization
    expect(canonize('Dogs')).equal('dog')
    expect(canonize('FooBar')).equal('foo_bar')
    expect(canonize('my-thing')).equal('my_thing')

    // File extensions are stripped
    expect(canonize('categories.php')).equal('category')
    expect(canonize('search.php')).equal('search')
    expect(canonize('data.json')).equal('data')
    expect(canonize('region.json')).equal('region')
    expect(canonize('list.txt')).equal('list')
    expect(canonize('height.jpg')).equal('height')
    expect(canonize('location.png')).equal('location')
    expect(canonize('robots.txt')).equal('robot')
    expect(canonize('config.yaml')).equal('config')
    expect(canonize('schema.xml')).equal('schema')

    // Extensions are case-insensitive
    expect(canonize('data.JSON')).equal('data')
    expect(canonize('page.PHP')).equal('page')

    // Non-extension dots are not matched (no known extension)
    expect(canonize('v2.0')).equal('v20')

    // Extension only stripped at end
    expect(canonize('json_data')).equal('json_data')
    expect(canonize('php_version')).equal('php_version')

    // Accented characters are transliterated
    expect(canonize('dólar')).equal('dolar')
    expect(canonize('kölner')).equal('kolner')
    expect(canonize('pokémon')).equal('pokemon')
    expect(canonize('café')).equal('cafe')
    expect(canonize('naïve')).equal('naive')
    expect(canonize('über')).equal('uber')
    expect(canonize('résumé')).equal('resume')
    expect(canonize('señor')).equal('senor')

    // Non-Latin chars are stripped (no transliteration)
    expect(canonize('api検索')).equal('api')
    expect(canonize('会議録')).equal('')
  })

  test('sanitizeSlug', () => {
    // Simple slugs pass through unchanged
    expect(sanitizeSlug('my-api')).equal('my-api')
    expect(sanitizeSlug('cool-service')).equal('cool-service')

    // Accented characters are transliterated
    expect(sanitizeSlug('dólar-api')).equal('dolar-api')
    expect(sanitizeSlug('café-service')).equal('cafe-service')

    // Underscores and dots become hyphens
    expect(sanitizeSlug('my_api')).equal('my-api')
    expect(sanitizeSlug('api.v2')).equal('api-v2')
    expect(sanitizeSlug('my_cool.api')).equal('my-cool-api')

    // Special chars are stripped
    expect(sanitizeSlug("bob's-api")).equal('bobs-api')
    expect(sanitizeSlug('api!(v2)')).equal('apiv2')

    // Standalone number segments merge with preceding word
    expect(sanitizeSlug('ec-2-shop')).equal('ec2-shop')
    expect(sanitizeSlug('advice-slip-api-2')).equal('advice-slip-api2')
    expect(sanitizeSlug('s-3-bucket')).equal('s3-bucket')

    // Leading numbers stay (no preceding word to merge with)
    expect(sanitizeSlug('2-fast')).equal('2-fast')

    // Hyphens are collapsed and trimmed
    expect(sanitizeSlug('--my--api--')).equal('my-api')

    // Empty/null returns 'unknown'
    expect(sanitizeSlug('')).equal('unknown')
    expect(sanitizeSlug('!!!')).equal('unknown')

    // Non-Latin chars are stripped
    expect(sanitizeSlug('api検索')).equal('api')
  })

  test('transliterate', () => {
    // Latin diacritics are decomposed
    expect(transliterate('dólar')).equal('dolar')
    expect(transliterate('kölner')).equal('kolner')
    expect(transliterate('pokémon')).equal('pokemon')
    expect(transliterate('résumé')).equal('resume')
    expect(transliterate('naïve')).equal('naive')
    expect(transliterate('über')).equal('uber')
    expect(transliterate('señor')).equal('senor')
    expect(transliterate('café')).equal('cafe')
    expect(transliterate('Ångström')).equal('Angstrom')

    // ASCII unchanged
    expect(transliterate('hello')).equal('hello')
    expect(transliterate('foo-bar_123')).equal('foo-bar_123')

    // Non-Latin scripts pass through (stripped later by canonize)
    expect(transliterate('会議録')).equal('会議録')
    expect(transliterate('api検索')).equal('api検索')
  })

  test('normalizeFieldName', () => {
    // Bracket notation becomes underscores
    expect(normalizeFieldName('filter[text]')).equal('filter_text')
    expect(normalizeFieldName('page[limit]')).equal('page_limit')
    expect(normalizeFieldName('page[offset]')).equal('page_offset')

    // Nested brackets
    expect(normalizeFieldName('conditions[publication_date][gte]')).equal('conditions_publication_date_gte')

    // Trailing empty brackets are stripped
    expect(normalizeFieldName('fields[]')).equal('fields')
    expect(normalizeFieldName('conditions[agencies][]')).equal('conditions_agencies')
    expect(normalizeFieldName('conditions[type][]')).equal('conditions_type')

    // Dot notation becomes underscores
    expect(normalizeFieldName('facet.field')).equal('facet_field')
    expect(normalizeFieldName('refine.country')).equal('refine_country')

    // Regular names unchanged
    expect(normalizeFieldName('name')).equal('name')
    expect(normalizeFieldName('created_at')).equal('created_at')

    // Empty/null
    expect(normalizeFieldName('')).equal('')

    // No duplicate or leading/trailing underscores
    expect(normalizeFieldName('[foo]')).equal('foo')
    expect(normalizeFieldName('a..b')).equal('a_b')
  })

  test('normalizeFieldName with canonize (field pipeline)', () => {
    // Bracket notation: full field name pipeline as used in resolveOpFields
    expect(canonize(normalizeFieldName('filter[text]'))).equal('filter_text')
    expect(canonize(normalizeFieldName('page[limit]'))).equal('page_limit')
    expect(canonize(normalizeFieldName('page[offset]'))).equal('page_offset')

    // Nested brackets
    expect(canonize(normalizeFieldName('conditions[agencies][]'))).equal('conditions_agency')
    expect(canonize(normalizeFieldName('conditions[publication_date][gte]'))).equal('conditions_publication_date_gte')
    expect(canonize(normalizeFieldName('conditions[type][]'))).equal('conditions_type')
    expect(canonize(normalizeFieldName('fields[]'))).equal('field')

    // Dot notation
    expect(canonize(normalizeFieldName('facet.field'))).equal('facet_field')
    expect(canonize(normalizeFieldName('refine.country'))).equal('refine_country')
    expect(canonize(normalizeFieldName('refine.type'))).equal('refine_type')

    // Regular names pass through normally
    expect(canonize(normalizeFieldName('created_at'))).equal('created_at')
    expect(canonize(normalizeFieldName('UserName'))).equal('user_name')
  })

  test('normalizeFieldName with snakify (arg pipeline)', () => {
    // Bracket notation: arg name pipeline as used in resolveArgs
    const argPipeline = (s: string) => depluralize(snakify(normalizeFieldName(s)))

    expect(argPipeline('filter[text]')).equal('filter_text')
    expect(argPipeline('page[limit]')).equal('page_limit')
    expect(argPipeline('filter[route]')).equal('filter_route')

    // Nested brackets
    expect(argPipeline('conditions[agencies][]')).equal('conditions_agency')
    expect(argPipeline('conditions[publication_date][gte]')).equal('conditions_publication_date_gte')

    // Dot notation
    expect(argPipeline('facet.field')).equal('facet_field')
    expect(argPipeline('refine.country')).equal('refine_country')

    // CamelCase args
    expect(argPipeline('filterText')).equal('filter_text')
    expect(argPipeline('pageLimit')).equal('page_limit')

    // Regular args unchanged
    expect(argPipeline('sort')).equal('sort')
    expect(argPipeline('include')).equal('include')
  })

  test('inferFieldType', () => {
    // Boolean patterns: $ANY -> $BOOLEAN
    expect(inferFieldType('is_blocked', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('has_homepage', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('can_edit', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('should_notify', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('allow_merge', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('enabled', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('disabled', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('active', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('visible', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('deleted', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('verified', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('locked', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('archived', '`$ANY`')).equal('`$BOOLEAN`')
    expect(inferFieldType('blocked', '`$ANY`')).equal('`$BOOLEAN`')

    // Boolean patterns: $STRING -> $BOOLEAN
    expect(inferFieldType('is_blocked', '`$STRING`')).equal('`$BOOLEAN`')
    expect(inferFieldType('has_homepage', '`$STRING`')).equal('`$BOOLEAN`')
    expect(inferFieldType('is_smartlink', '`$STRING`')).equal('`$BOOLEAN`')
    expect(inferFieldType('active', '`$STRING`')).equal('`$BOOLEAN`')

    // $STRING not overridden for non-boolean patterns
    expect(inferFieldType('name', '`$STRING`')).equal('`$STRING`')
    expect(inferFieldType('total_count', '`$STRING`')).equal('`$STRING`')

    // ID patterns: $ANY -> $STRING
    expect(inferFieldType('id', '`$ANY`')).equal('`$STRING`')
    expect(inferFieldType('user_id', '`$ANY`')).equal('`$STRING`')
    expect(inferFieldType('project_id', '`$ANY`')).equal('`$STRING`')

    // Integer patterns: $ANY -> $INTEGER
    expect(inferFieldType('total_count', '`$ANY`')).equal('`$INTEGER`')
    expect(inferFieldType('item_count', '`$ANY`')).equal('`$INTEGER`')
    expect(inferFieldType('page_number', '`$ANY`')).equal('`$INTEGER`')
    expect(inferFieldType('limit', '`$ANY`')).equal('`$INTEGER`')
    expect(inferFieldType('page', '`$ANY`')).equal('`$INTEGER`')
    expect(inferFieldType('offset', '`$ANY`')).equal('`$INTEGER`')
    expect(inferFieldType('per_page', '`$ANY`')).equal('`$INTEGER`')
    expect(inferFieldType('page_size', '`$ANY`')).equal('`$INTEGER`')
    expect(inferFieldType('size', '`$ANY`')).equal('`$INTEGER`')
    expect(inferFieldType('skip', '`$ANY`')).equal('`$INTEGER`')
    expect(inferFieldType('num_item', '`$ANY`')).equal('`$INTEGER`')

    // Number patterns: $ANY -> $NUMBER
    expect(inferFieldType('latitude', '`$ANY`')).equal('`$NUMBER`')
    expect(inferFieldType('longitude', '`$ANY`')).equal('`$NUMBER`')
    expect(inferFieldType('lat', '`$ANY`')).equal('`$NUMBER`')
    expect(inferFieldType('lng', '`$ANY`')).equal('`$NUMBER`')
    expect(inferFieldType('price', '`$ANY`')).equal('`$NUMBER`')
    expect(inferFieldType('amount', '`$ANY`')).equal('`$NUMBER`')
    expect(inferFieldType('score', '`$ANY`')).equal('`$NUMBER`')
    expect(inferFieldType('weight', '`$ANY`')).equal('`$NUMBER`')
    expect(inferFieldType('radius', '`$ANY`')).equal('`$NUMBER`')
    expect(inferFieldType('distance', '`$ANY`')).equal('`$NUMBER`')
    expect(inferFieldType('percentage', '`$ANY`')).equal('`$NUMBER`')

    // String patterns: $ANY -> $STRING
    expect(inferFieldType('url', '`$ANY`')).equal('`$STRING`')
    expect(inferFieldType('href', '`$ANY`')).equal('`$STRING`')
    expect(inferFieldType('email', '`$ANY`')).equal('`$STRING`')
    expect(inferFieldType('name', '`$ANY`')).equal('`$STRING`')
    expect(inferFieldType('title', '`$ANY`')).equal('`$STRING`')
    expect(inferFieldType('description', '`$ANY`')).equal('`$STRING`')
    expect(inferFieldType('slug', '`$ANY`')).equal('`$STRING`')
    expect(inferFieldType('token', '`$ANY`')).equal('`$STRING`')

    // Specific types from spec are not overridden
    expect(inferFieldType('latitude', '`$STRING`')).equal('`$STRING`')
    expect(inferFieldType('limit', '`$INTEGER`')).equal('`$INTEGER`')
    expect(inferFieldType('id', '`$INTEGER`')).equal('`$INTEGER`')
    expect(inferFieldType('price', '`$NUMBER`')).equal('`$NUMBER`')
    expect(inferFieldType('is_active', '`$BOOLEAN`')).equal('`$BOOLEAN`')

    // Unknown field names with $ANY stay $ANY
    expect(inferFieldType('data', '`$ANY`')).equal('`$ANY`')
    expect(inferFieldType('result', '`$ANY`')).equal('`$ANY`')
    expect(inferFieldType('custom_field', '`$ANY`')).equal('`$ANY`')

    // Names that look similar but should not be overridden
    expect(inferFieldType('disable_reason', '`$STRING`')).equal('`$STRING`')
    expect(inferFieldType('disable_reason', '`$ANY`')).equal('`$ANY`')
    expect(inferFieldType('activation_code', '`$ANY`')).equal('`$ANY`')
    expect(inferFieldType('page_title', '`$ANY`')).equal('`$ANY`')
  })

  test('cleanComponentName', () => {
    // Controller suffixes are stripped
    expect(cleanComponentName('nps_controller')).equal('nps')
    expect(cleanComponentName('balance_controller')).equal('balance')
    expect(cleanComponentName('gas_system_controller')).equal('gas_system')

    // Rest controller suffix (two parts) is stripped
    expect(cleanComponentName('donate_rest_controller')).equal('donate')
    expect(cleanComponentName('portfolio_rest_controller')).equal('portfolio')

    // Response/request suffixes are stripped
    expect(cleanComponentName('user_response')).equal('user')
    expect(cleanComponentName('order_request')).equal('order')

    // HTTP verb prefixes are stripped
    expect(cleanComponentName('get_account_lookup')).equal('account_lookup')
    expect(cleanComponentName('post_transfer')).equal('transfer')
    expect(cleanComponentName('put_setting')).equal('setting')
    expect(cleanComponentName('delete_item')).equal('item')
    expect(cleanComponentName('patch_record')).equal('record')

    // Verb prefix not stripped if remainder is too short
    expect(cleanComponentName('get_ab')).equal('get_ab')
    expect(cleanComponentName('post_it')).equal('post_it')

    // No suffix or prefix: unchanged
    expect(cleanComponentName('user')).equal('user')
    expect(cleanComponentName('gas_balance')).equal('gas_balance')

    // Both suffix and prefix: suffix stripped first, then prefix
    expect(cleanComponentName('get_user_response')).equal('user')
    expect(cleanComponentName('get_balance_controller')).equal('balance')
  })

  test('ensureMinEntityName', () => {
    // Names already >= 3 chars are unchanged
    expect(ensureMinEntityName('foo', {})).equal('foo')
    expect(ensureMinEntityName('abcd', {})).equal('abcd')
    expect(ensureMinEntityName('abc', {})).equal('abc')

    // 2-char names get padded with "n"
    expect(ensureMinEntityName('ab', {})).equal('abn')
    expect(ensureMinEntityName('dc', {})).equal('dcn')

    // 1-char names get padded with "nt"
    expect(ensureMinEntityName('d', {})).equal('dnt')
    expect(ensureMinEntityName('x', {})).equal('xnt')

    // Empty string gets padded
    expect(ensureMinEntityName('', {})).equal('nt')

    // No collision: padded name is free
    expect(ensureMinEntityName('ab', { other: {} })).equal('abn')

    // Collision: padded name already taken by a different entity
    expect(ensureMinEntityName('ab', { abn: {} })).equal('abn2')
    expect(ensureMinEntityName('ab', { abn: {}, abn2: {} })).equal('abn3')

    // No collision when original name is already in entmap (same entity, re-entry)
    expect(ensureMinEntityName('foo', { foo: {} })).equal('foo')

    // Short name that doesn't collide after padding
    expect(ensureMinEntityName('d', { other: {} })).equal('dnt')

    // Short name that collides after padding
    expect(ensureMinEntityName('d', { dnt: {} })).equal('dnt2')
    expect(ensureMinEntityName('d', { dnt: {}, dnt2: {} })).equal('dnt3')

    // Names starting with a digit get "n" prefix
    expect(ensureMinEntityName('510k', {})).equal('n510k')
    expect(ensureMinEntityName('3d_model', {})).equal('n3d_model')
    expect(ensureMinEntityName('0day', {})).equal('n0day')

    // Digit prefix also satisfies min-length
    expect(ensureMinEntityName('9', {})).equal('n9n')
    expect(ensureMinEntityName('42', {})).equal('n42')

    // Non-digit names are not prefixed
    expect(ensureMinEntityName('abc', {})).equal('abc')

    // Leading underscores are stripped, then digit prefix applies
    expect(ensureMinEntityName('_123', {})).equal('n123')
    expect(ensureMinEntityName('__foo', {})).equal('foo')

    // Digit prefix with collision
    expect(ensureMinEntityName('510k', { n510k: {} })).equal('n510k2')

    // Non-alphanumeric characters are removed (keeping _)
    expect(ensureMinEntityName('foo-bar', {})).equal('foobar')
    expect(ensureMinEntityName('hello.world', {})).equal('helloworld')
    expect(ensureMinEntityName('a!b@c#d', {})).equal('abcd')
    expect(ensureMinEntityName('foo_bar', {})).equal('foo_bar')
    expect(ensureMinEntityName('a[b]', {})).equal('abn')

    // Names under 67 chars are unchanged
    expect(ensureMinEntityName(
      'this_endpoint_is_tailored_for_searches_based_on_product_name', {}
    )).equal('this_endpoint_is_tailored_for_searches_based_on_product_name')

    // Sentence-length names are truncated to <= 67 chars at word boundaries
    expect(ensureMinEntityName(
      'if_you_have_the_name_of_a_specific_software_product_and_want_to_check', {}
    )).equal('if_you_have_the_name_of_a_specific_software_product_and_want_to')
    expect(ensureMinEntityName(
      'this_is_a_very_long_entity_name_that_goes_well_beyond_the_sixty_seven_character_limit_set', {}
    )).equal('this_is_a_very_long_entity_name_that_goes_well_beyond_the_sixty')

    // Names at exactly 67 chars are unchanged
    expect(ensureMinEntityName('a'.repeat(67), {})).equal('a'.repeat(67))

    // Names at 68 chars get truncated
    expect(ensureMinEntityName('abcde_' + 'x'.repeat(63), {})).equal('abcde')

    // Single long word with no underscores gets hard-truncated at 67
    expect(ensureMinEntityName('a'.repeat(80), {})).equal('a'.repeat(67))

    // Truncation with collision
    const truncated = 'if_you_have_the_name_of_a_specific_software_product_and_want_to'
    expect(ensureMinEntityName(
      'if_you_have_the_name_of_a_specific_software_product_and_want_to_check',
      { [truncated]: {} }
    )).equal(truncated + '2')
  })

  test('pathMatch', async () => {
    const pmf = (p: any, x: any) => {
      const r = pathMatch(p, x)
      return null === r ? r : { i: r.index, m: r.slice(0), x: r.expr }
    }

    expect(pmf('/api/foo0', '/t/t/')).equals({
      i: 0, m: ['api', 'foo0'], x: '/t/t/'
    })

    expect(pmf('/api/foo0n', '/t/')).equals(null)
    expect(pmf('/api/foo0n', '/t/t/t/')).equals(null)
    expect(pmf('/api/foo0n', 'p/')).equals(null)
    expect(pmf('/api/foo0n', 't/p/')).equals(null)
    expect(pmf('/api/foo0n', '/t/p/')).equals(null)


    expect(pmf('/api/foo1/', '/t/t/')).equals({
      m: ['api', 'foo1'], i: 0, x: '/t/t/'
    })

    expect(pmf('api/foo2/', '/t/t/')).equals({
      m: ['api', 'foo2'], i: 0, x: '/t/t/'
    })

    expect(pmf('api/foo3', '/t/t/')).equals({
      m: ['api', 'foo3'], i: 0, x: '/t/t/'
    })


    expect(pmf('/foo4', '/t/')).equals({
      m: ['foo4'], i: 0, x: '/t/'
    })

    expect(pmf('/foo5/', '/t/')).equals({
      m: ['foo5'], i: 0, x: '/t/'
    })

    expect(pmf('foo6/', '/t/')).equals({
      m: ['foo6'], i: 0, x: '/t/'
    })

    expect(pmf('foo7', '/t/')).equals({
      m: ['foo7'], i: 0, x: '/t/'
    })


    expect(pmf('a0/{p0}', '/t/p/')).equals({
      m: ['a0', '{p0}'], i: 0, x: '/t/p/'
    })

    expect(pmf('{p1}/a1/', '/p/t/')).equals({
      m: ['{p1}', 'a1'], i: 0, x: '/p/t/'
    })


    expect(pmf('/a/b/c', '/t')).equals({
      m: ['a'], i: 0, x: '/t'
    })

    expect(pmf('/a/b/c', 't')).equals({
      m: ['a'], i: 0, x: 't'
    })


    expect(pmf('/a/b/c', 't/')).equals({
      m: ['c'], i: 2, x: 't/'
    })

    expect(pmf('/a/b/c', 't/t/')).equals({
      m: ['b', 'c'], i: 1, x: 't/t/'
    })


    expect(pmf('/a/b/{c}', 't/p/')).equals({
      m: ['b', '{c}'], i: 1, x: 't/p/'
    })

    expect(pmf('/a/b/{c}', 'p/')).equals({
      m: ['{c}'], i: 2, x: 'p/'
    })

    expect(pmf('/a/b/{c}', 't/')).equals(null)



    expect(pmf('/a/b/{c}/d', 't/p')).equals({
      m: ['b', '{c}'], i: 1, x: 't/p'
    })

    expect(pmf('/a/b/{c}/d', 'p/t')).equals({
      m: ['{c}', 'd'], i: 2, x: 'p/t'
    })

    expect(pmf('/a/b/{c}/d', 'p/t/')).equals({
      m: ['{c}', 'd'], i: 2, x: 'p/t/'
    })

    expect(pmf('/a/b/{c}/d/e', 'p/t/')).equals(null)
    expect(pmf('/a/b/{c}/d/e', 'p/t')).equals({
      i: 2, m: ['{c}', 'd'], x: 'p/t'
    })


    expect(pmf('/a/b/{c}/d/{e}', 't/p/')).equals({
      i: 3, m: ['d', '{e}'], x: 't/p/'
    })

    expect(pmf('/a/b/{c}/d/{e}', 't/p')).equals({
      i: 1, m: ['b', '{c}'], x: 't/p'
    })

    expect(pmf('/a/b/{c}/d/{e}', '/t/p')).equals(null)

    expect(pmf('/a/b/{c}/d/{e}', 't/p/t/p')).equals({
      i: 1, m: ['b', '{c}', 'd', '{e}'], x: 't/p/t/p'
    })
  })


  test('formatJSONIC', async () => {
    expect(formatJSONIC()).equal('')
    expect(formatJSONIC(undefined)).equal('')
    expect(formatJSONIC(null)).equal('null\n')
    expect(formatJSONIC(true)).equal('true\n')
    expect(formatJSONIC(11)).equal('11\n')
    expect(formatJSONIC("s")).equal('"s"\n')

    expect(formatJSONIC({
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
`)

    const a0: any = [100, 101, 102]
    a0['0_COMMENT'] = 'zero'
    a0['2_COMMENT'] = 'two'

    expect(formatJSONIC({ a: a0, a_COMMENT: 'array' })).equal(`{
  a: [  # array
    100  # zero
    101
    102  # two
  ]

}
`)


    expect(formatJSONIC({ _COMMENT: 'topO' })).equal(`{  # topO
}
`)

    const a1: any = []
    a1._COMMENT = 'topA'
    expect(formatJSONIC(a1)).equal(`[  # topA
]
`)


    expect(formatJSONIC({ a: { b: {}, c: [], d: {} }, e: {} })).equal(`{
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
`)


    expect(formatJSONIC({ a1: { b1: {}, c1: [], d1: {} }, e1: {} }, { hsepd: 2 })).equal(`{
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
`)


  })


  test('getModelPath - basic path traversal', () => {
    const model = {
      a: {
        b: {
          c: 'value'
        }
      }
    }

    expect(getModelPath(model, 'a')).equal(model.a)
    expect(getModelPath(model, 'a.b')).equal(model.a.b)
    expect(getModelPath(model, 'a.b.c')).equal('value')
  })


  test('getModelPath - array indexing', () => {
    const model = {
      items: [
        { name: 'first', value: 1 },
        { name: 'second', value: 2 },
        { name: 'third', value: 3 }
      ]
    }

    expect(getModelPath(model, 'items.0')).equal(model.items[0])
    expect(getModelPath(model, 'items.1')).equal(model.items[1])
    expect(getModelPath(model, 'items.2')).equal(model.items[2])
    expect(getModelPath(model, 'items.0.name')).equal('first')
    expect(getModelPath(model, 'items.1.value')).equal(2)
    expect(getModelPath(model, 'items.2.name')).equal('third')
  })


  test('getModelPath - nested arrays and objects', () => {
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
    }

    expect(getModelPath(model, 'data.nested.0.items.0.id')).equal('a')
    expect(getModelPath(model, 'data.nested.0.items.1.id')).equal('b')
  })


  test('getModelPath - required:true (default) throws on missing path', () => {
    const model = {
      a: {
        b: 'value'
      }
    }

    // Missing intermediate key
    try {
      getModelPath(model, 'a.x.c')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'a.x.c'")
      expect(err.message).contains("Valid path up to: 'a'")
      expect(err.message).contains("Property 'x' does not exist")
      expect(err.message).contains("Available keys: [b]")
    }

    // Missing final key - should show available keys
    try {
      getModelPath(model, 'a.missing')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'a.missing'")
      expect(err.message).contains("Valid path up to: 'a'")
      expect(err.message).contains("Property 'missing' does not exist")
      expect(err.message).contains("Available keys: [b]")
    }

    // Missing root key
    try {
      getModelPath(model, 'missing')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'missing'")
      expect(err.message).contains("Valid path up to: '(root)'")
      expect(err.message).contains("Property 'missing' does not exist")
      expect(err.message).contains("Available keys: [a]")
    }
  })


  test('getModelPath - required:true throws on null/undefined in path', () => {
    const model = {
      a: {
        b: null
      }
    }

    try {
      getModelPath(model, 'a.b.c')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'a.b.c'")
      expect(err.message).contains("Valid path up to: 'a.b'")
      expect(err.message).contains("Cannot access property 'c' of null")
    }

    const model2 = {
      a: {
        b: undefined
      }
    }

    try {
      getModelPath(model2, 'a.b.c')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'a.b.c'")
      expect(err.message).contains("Valid path up to: 'a.b'")
      expect(err.message).contains("Cannot access property 'c' of undefined")
    }
  })


  test('getModelPath - required:true throws on array index out of bounds', () => {
    const model = {
      items: [
        { name: 'first' },
        { name: 'second' }
      ]
    }

    try {
      getModelPath(model, 'items.5')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'items.5'")
      expect(err.message).contains("Valid path up to: 'items'")
      expect(err.message).contains("Property '5' does not exist")
      expect(err.message).contains("Available keys: array indices 0-1")
    }
  })


  test('getModelPath - required:false returns undefined on missing path', () => {
    const model = {
      a: {
        b: 'value'
      }
    }

    expect(getModelPath(model, 'a.x.c', { required: false })).equal(undefined)
    expect(getModelPath(model, 'a.missing', { required: false })).equal(undefined)
    expect(getModelPath(model, 'missing', { required: false })).equal(undefined)
    expect(getModelPath(model, 'a.b.c', { required: false })).equal(undefined)
  })


  test('getModelPath - required:false returns undefined on null/undefined in path', () => {
    const model = {
      a: {
        b: null
      }
    }

    expect(getModelPath(model, 'a.b.c', { required: false })).equal(undefined)

    const model2 = {
      a: {
        b: undefined
      }
    }

    expect(getModelPath(model2, 'a.b.c', { required: false })).equal(undefined)
  })


  test('getModelPath - required:false returns undefined for array out of bounds', () => {
    const model = {
      items: [{ name: 'first' }]
    }

    expect(getModelPath(model, 'items.5', { required: false })).equal(undefined)
    expect(getModelPath(model, 'items.5.name', { required: false })).equal(undefined)
  })


  test('getModelPath - empty path handling', () => {
    const model = { a: 'value' }

    try {
      getModelPath(model, '')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains('empty path provided')
    }

    expect(getModelPath(model, '', { required: false })).equal(undefined)
  })


  test('getModelPath - returns actual values including falsy ones', () => {
    const model = {
      zero: 0,
      empty: '',
      falsy: false,
      nullValue: null
    }

    expect(getModelPath(model, 'zero')).equal(0)
    expect(getModelPath(model, 'empty')).equal('')
    expect(getModelPath(model, 'falsy')).equal(false)
    expect(getModelPath(model, 'nullValue')).equal(null)
  })
})

