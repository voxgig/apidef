/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import assert from 'node:assert'

import { snakify } from 'jostraca'

import {
  pathMatch,
  formatJSONIC,
  depluralize,
  canonize,
  sanitizeSlug,
  slugToPascalCase,
  transliterate,
  cleanComponentName,
  ensureMinEntityName,
  inferFieldType,
  normalizeFieldName,
  getModelPath,
} from '../dist/utility'




describe('utility', () => {

  test('depluralize', () => {
    assert.deepStrictEqual(depluralize('Dogs'),'Dog')
    assert.deepStrictEqual(depluralize('countries'),'country')
    assert.deepStrictEqual(depluralize('good_dogs'),'good_dog')
    assert.deepStrictEqual(depluralize('many_countries'),'many_country')
    assert.deepStrictEqual(depluralize('mice'),'mouse')
    assert.deepStrictEqual(depluralize('many_mice'),'many_mouse')

    assert.deepStrictEqual(depluralize('api_key'),'api_key')
    assert.deepStrictEqual(depluralize('api_keys'),'api_key')
    assert.deepStrictEqual(depluralize('ApiKeys'),'ApiKey')
    assert.deepStrictEqual(depluralize('API_Keys'),'API_Key')

    // Words where -ies is part of the base form, not a plural suffix
    assert.deepStrictEqual(depluralize('species'),'species')
    assert.deepStrictEqual(depluralize('series'),'series')
    assert.deepStrictEqual(depluralize('movies'),'movie')
    assert.deepStrictEqual(depluralize('amiiboseries'),'amiiboseries')

    // Words that should not be truncated to <= 2 chars
    assert.deepStrictEqual(depluralize('yes'),'yes')
    assert.deepStrictEqual(depluralize('lens'),'lens')
    assert.deepStrictEqual(depluralize('phrase'),'phrase')
    assert.deepStrictEqual(depluralize('abs'),'abs')
  })

  test('canonize', () => {
    // Basic canonization
    assert.deepStrictEqual(canonize('Dogs'),'dog')
    assert.deepStrictEqual(canonize('FooBar'),'foo_bar')
    assert.deepStrictEqual(canonize('my-thing'),'my_thing')

    // File extensions are stripped
    assert.deepStrictEqual(canonize('categories.php'),'category')
    assert.deepStrictEqual(canonize('search.php'),'search')
    assert.deepStrictEqual(canonize('data.json'),'data')
    assert.deepStrictEqual(canonize('region.json'),'region')
    assert.deepStrictEqual(canonize('list.txt'),'list')
    assert.deepStrictEqual(canonize('height.jpg'),'height')
    assert.deepStrictEqual(canonize('location.png'),'location')
    assert.deepStrictEqual(canonize('robots.txt'),'robot')
    assert.deepStrictEqual(canonize('config.yaml'),'config')
    assert.deepStrictEqual(canonize('schema.xml'),'schema')

    // Extensions are case-insensitive
    assert.deepStrictEqual(canonize('data.JSON'),'data')
    assert.deepStrictEqual(canonize('page.PHP'),'page')

    // Non-extension dots are not matched (no known extension)
    assert.deepStrictEqual(canonize('v2.0'),'v20')

    // Extension only stripped at end
    assert.deepStrictEqual(canonize('json_data'),'json_data')
    assert.deepStrictEqual(canonize('php_version'),'php_version')

    // Accented characters are transliterated
    assert.deepStrictEqual(canonize('dólar'),'dolar')
    assert.deepStrictEqual(canonize('kölner'),'kolner')
    assert.deepStrictEqual(canonize('pokémon'),'pokemon')
    assert.deepStrictEqual(canonize('café'),'cafe')
    assert.deepStrictEqual(canonize('naïve'),'naive')
    assert.deepStrictEqual(canonize('über'),'uber')
    assert.deepStrictEqual(canonize('résumé'),'resume')
    assert.deepStrictEqual(canonize('señor'),'senor')

    // Non-Latin chars are stripped (no transliteration)
    assert.deepStrictEqual(canonize('api検索'),'api')
    assert.deepStrictEqual(canonize('会議録'),'')
  })

  test('sanitizeSlug', () => {
    // Simple slugs pass through unchanged
    assert.deepStrictEqual(sanitizeSlug('my-api'),'my-api')
    assert.deepStrictEqual(sanitizeSlug('cool-service'),'cool-service')

    // Accented characters are transliterated
    assert.deepStrictEqual(sanitizeSlug('dólar-api'),'dolar-api')
    assert.deepStrictEqual(sanitizeSlug('café-service'),'cafe-service')

    // Underscores and dots become hyphens
    assert.deepStrictEqual(sanitizeSlug('my_api'),'my-api')
    assert.deepStrictEqual(sanitizeSlug('api.v2'),'api-v2')
    assert.deepStrictEqual(sanitizeSlug('my_cool.api'),'my-cool-api')

    // Special chars are stripped
    assert.deepStrictEqual(sanitizeSlug("bob's-api"),'bobs-api')
    assert.deepStrictEqual(sanitizeSlug('api!(v2)'),'apiv2')

    // Standalone number segments merge with preceding word
    assert.deepStrictEqual(sanitizeSlug('ec-2-shop'),'ec2-shop')
    assert.deepStrictEqual(sanitizeSlug('advice-slip-api-2'),'advice-slip-api2')
    assert.deepStrictEqual(sanitizeSlug('s-3-bucket'),'s3-bucket')

    // Leading numbers get 'n' prefix (must be valid JS identifier)
    assert.deepStrictEqual(sanitizeSlug('2-fast'),'n2-fast')
    assert.deepStrictEqual(sanitizeSlug('404-error-handler'),'n404-error-handler')
    assert.deepStrictEqual(sanitizeSlug('4chan-api'),'n4chan-api')
    assert.deepStrictEqual(sanitizeSlug('7timer-weather-api'),'n7timer-weather-api')

    // Hyphens are collapsed and trimmed
    assert.deepStrictEqual(sanitizeSlug('--my--api--'),'my-api')

    // Empty/null returns 'unknown'
    assert.deepStrictEqual(sanitizeSlug(''),'unknown')
    assert.deepStrictEqual(sanitizeSlug('!!!'),'unknown')

    // Non-Latin chars are stripped
    assert.deepStrictEqual(sanitizeSlug('api検索'),'api')
  })

  test('slugToPascalCase', () => {
    // Simple slugs
    assert.deepStrictEqual(slugToPascalCase('my-api'),'MyApi')
    assert.deepStrictEqual(slugToPascalCase('cool-service'),'CoolService')

    // Accented characters are transliterated
    assert.deepStrictEqual(slugToPascalCase('dólar-y-monedas-api'),'DolarYMonedasApi')

    // Special characters are stripped
    assert.deepStrictEqual(slugToPascalCase('data.gov.au-api'),'DataGovAuApi')
    assert.deepStrictEqual(slugToPascalCase('osu!-beatmap-api'),'OsuBeatmapApi')
    assert.deepStrictEqual(slugToPascalCase('healthcare.gov-content-api'),'HealthcareGovContentApi')
    assert.deepStrictEqual(slugToPascalCase('phish.in-api'),'PhishInApi')
    assert.deepStrictEqual(slugToPascalCase('v.gd-api'),'VGdApi')
    assert.deepStrictEqual(slugToPascalCase('swiss-federal-railways-(sbb)'),'SwissFederalRailwaysSbb')
    assert.deepStrictEqual(slugToPascalCase('yu-gi-oh!-api'),'YuGiOhApi')

    // Leading numbers get 'n' prefix
    assert.deepStrictEqual(slugToPascalCase('404-error-handler'),'N404ErrorHandler')
    assert.deepStrictEqual(slugToPascalCase('4chan-api'),'N4chanApi')
    assert.deepStrictEqual(slugToPascalCase('7timer-weather-api'),'N7timerWeatherApi')

    // Embedded numbers merge with preceding word
    assert.deepStrictEqual(slugToPascalCase('ec-2-shop'),'Ec2Shop')
    assert.deepStrictEqual(slugToPascalCase('guild-wars-2-api'),'GuildWars2Api')
    assert.deepStrictEqual(slugToPascalCase('magic-8-ball-api'),'Magic8BallApi')

    // Normal slugs
    assert.deepStrictEqual(slugToPascalCase('no-as-a-service'),'NoAsAService')
    assert.deepStrictEqual(slugToPascalCase('yes-as-a-service'),'YesAsAService')
    assert.deepStrictEqual(slugToPascalCase('shame-as-a-service'),'ShameAsAService')
    assert.deepStrictEqual(slugToPascalCase('api'),'Api')

    // Edge cases
    assert.deepStrictEqual(slugToPascalCase(''),'Unknown')
    assert.deepStrictEqual(slugToPascalCase('!!!'),'Unknown')
  })

  test('transliterate', () => {
    // Latin diacritics are decomposed
    assert.deepStrictEqual(transliterate('dólar'),'dolar')
    assert.deepStrictEqual(transliterate('kölner'),'kolner')
    assert.deepStrictEqual(transliterate('pokémon'),'pokemon')
    assert.deepStrictEqual(transliterate('résumé'),'resume')
    assert.deepStrictEqual(transliterate('naïve'),'naive')
    assert.deepStrictEqual(transliterate('über'),'uber')
    assert.deepStrictEqual(transliterate('señor'),'senor')
    assert.deepStrictEqual(transliterate('café'),'cafe')
    assert.deepStrictEqual(transliterate('Ångström'),'Angstrom')

    // ASCII unchanged
    assert.deepStrictEqual(transliterate('hello'),'hello')
    assert.deepStrictEqual(transliterate('foo-bar_123'),'foo-bar_123')

    // Non-Latin scripts pass through (stripped later by canonize)
    assert.deepStrictEqual(transliterate('会議録'),'会議録')
    assert.deepStrictEqual(transliterate('api検索'),'api検索')
  })

  test('normalizeFieldName', () => {
    // Bracket notation becomes underscores
    assert.deepStrictEqual(normalizeFieldName('filter[text]'),'filter_text')
    assert.deepStrictEqual(normalizeFieldName('page[limit]'),'page_limit')
    assert.deepStrictEqual(normalizeFieldName('page[offset]'),'page_offset')

    // Nested brackets
    assert.deepStrictEqual(normalizeFieldName('conditions[publication_date][gte]'),'conditions_publication_date_gte')

    // Trailing empty brackets are stripped
    assert.deepStrictEqual(normalizeFieldName('fields[]'),'fields')
    assert.deepStrictEqual(normalizeFieldName('conditions[agencies][]'),'conditions_agencies')
    assert.deepStrictEqual(normalizeFieldName('conditions[type][]'),'conditions_type')

    // Dot notation becomes underscores
    assert.deepStrictEqual(normalizeFieldName('facet.field'),'facet_field')
    assert.deepStrictEqual(normalizeFieldName('refine.country'),'refine_country')

    // Regular names unchanged
    assert.deepStrictEqual(normalizeFieldName('name'),'name')
    assert.deepStrictEqual(normalizeFieldName('created_at'),'created_at')

    // Empty/null
    assert.deepStrictEqual(normalizeFieldName(''),'')

    // No duplicate or leading/trailing underscores
    assert.deepStrictEqual(normalizeFieldName('[foo]'),'foo')
    assert.deepStrictEqual(normalizeFieldName('a..b'),'a_b')
  })

  test('normalizeFieldName with canonize (field pipeline)', () => {
    // Bracket notation: full field name pipeline as used in resolveOpFields
    assert.deepStrictEqual(canonize(normalizeFieldName('filter[text]')),'filter_text')
    assert.deepStrictEqual(canonize(normalizeFieldName('page[limit]')),'page_limit')
    assert.deepStrictEqual(canonize(normalizeFieldName('page[offset]')),'page_offset')

    // Nested brackets
    assert.deepStrictEqual(canonize(normalizeFieldName('conditions[agencies][]')),'conditions_agency')
    assert.deepStrictEqual(canonize(normalizeFieldName('conditions[publication_date][gte]')),'conditions_publication_date_gte')
    assert.deepStrictEqual(canonize(normalizeFieldName('conditions[type][]')),'conditions_type')
    assert.deepStrictEqual(canonize(normalizeFieldName('fields[]')),'field')

    // Dot notation
    assert.deepStrictEqual(canonize(normalizeFieldName('facet.field')),'facet_field')
    assert.deepStrictEqual(canonize(normalizeFieldName('refine.country')),'refine_country')
    assert.deepStrictEqual(canonize(normalizeFieldName('refine.type')),'refine_type')

    // Regular names pass through normally
    assert.deepStrictEqual(canonize(normalizeFieldName('created_at')),'created_at')
    assert.deepStrictEqual(canonize(normalizeFieldName('UserName')),'user_name')
  })

  test('normalizeFieldName with snakify (arg pipeline)', () => {
    // Bracket notation: arg name pipeline as used in resolveArgs
    const argPipeline = (s: string) => depluralize(snakify(normalizeFieldName(s)))

    assert.deepStrictEqual(argPipeline('filter[text]'),'filter_text')
    assert.deepStrictEqual(argPipeline('page[limit]'),'page_limit')
    assert.deepStrictEqual(argPipeline('filter[route]'),'filter_route')

    // Nested brackets
    assert.deepStrictEqual(argPipeline('conditions[agencies][]'),'conditions_agency')
    assert.deepStrictEqual(argPipeline('conditions[publication_date][gte]'),'conditions_publication_date_gte')

    // Dot notation
    assert.deepStrictEqual(argPipeline('facet.field'),'facet_field')
    assert.deepStrictEqual(argPipeline('refine.country'),'refine_country')

    // CamelCase args
    assert.deepStrictEqual(argPipeline('filterText'),'filter_text')
    assert.deepStrictEqual(argPipeline('pageLimit'),'page_limit')

    // Regular args unchanged
    assert.deepStrictEqual(argPipeline('sort'),'sort')
    assert.deepStrictEqual(argPipeline('include'),'include')
  })

  test('inferFieldType', () => {
    // Boolean patterns: $ANY -> $BOOLEAN
    assert.deepStrictEqual(inferFieldType('is_blocked', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('has_homepage', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('can_edit', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('should_notify', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('allow_merge', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('enabled', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('disabled', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('active', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('visible', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('deleted', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('verified', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('locked', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('archived', '`$ANY`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('blocked', '`$ANY`'),'`$BOOLEAN`')

    // Boolean patterns: $STRING -> $BOOLEAN
    assert.deepStrictEqual(inferFieldType('is_blocked', '`$STRING`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('has_homepage', '`$STRING`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('is_smartlink', '`$STRING`'),'`$BOOLEAN`')
    assert.deepStrictEqual(inferFieldType('active', '`$STRING`'),'`$BOOLEAN`')

    // $STRING not overridden for non-boolean patterns
    assert.deepStrictEqual(inferFieldType('name', '`$STRING`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('total_count', '`$STRING`'),'`$STRING`')

    // ID patterns: $ANY -> $STRING
    assert.deepStrictEqual(inferFieldType('id', '`$ANY`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('user_id', '`$ANY`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('project_id', '`$ANY`'),'`$STRING`')

    // Integer patterns: $ANY -> $INTEGER
    assert.deepStrictEqual(inferFieldType('total_count', '`$ANY`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('item_count', '`$ANY`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('page_number', '`$ANY`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('limit', '`$ANY`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('page', '`$ANY`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('offset', '`$ANY`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('per_page', '`$ANY`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('page_size', '`$ANY`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('size', '`$ANY`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('skip', '`$ANY`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('num_item', '`$ANY`'),'`$INTEGER`')

    // Number patterns: $ANY -> $NUMBER
    assert.deepStrictEqual(inferFieldType('latitude', '`$ANY`'),'`$NUMBER`')
    assert.deepStrictEqual(inferFieldType('longitude', '`$ANY`'),'`$NUMBER`')
    assert.deepStrictEqual(inferFieldType('lat', '`$ANY`'),'`$NUMBER`')
    assert.deepStrictEqual(inferFieldType('lng', '`$ANY`'),'`$NUMBER`')
    assert.deepStrictEqual(inferFieldType('price', '`$ANY`'),'`$NUMBER`')
    assert.deepStrictEqual(inferFieldType('amount', '`$ANY`'),'`$NUMBER`')
    assert.deepStrictEqual(inferFieldType('score', '`$ANY`'),'`$NUMBER`')
    assert.deepStrictEqual(inferFieldType('weight', '`$ANY`'),'`$NUMBER`')
    assert.deepStrictEqual(inferFieldType('radius', '`$ANY`'),'`$NUMBER`')
    assert.deepStrictEqual(inferFieldType('distance', '`$ANY`'),'`$NUMBER`')
    assert.deepStrictEqual(inferFieldType('percentage', '`$ANY`'),'`$NUMBER`')

    // String patterns: $ANY -> $STRING
    assert.deepStrictEqual(inferFieldType('url', '`$ANY`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('href', '`$ANY`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('email', '`$ANY`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('name', '`$ANY`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('title', '`$ANY`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('description', '`$ANY`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('slug', '`$ANY`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('token', '`$ANY`'),'`$STRING`')

    // Specific types from spec are not overridden
    assert.deepStrictEqual(inferFieldType('latitude', '`$STRING`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('limit', '`$INTEGER`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('id', '`$INTEGER`'),'`$INTEGER`')
    assert.deepStrictEqual(inferFieldType('price', '`$NUMBER`'),'`$NUMBER`')
    assert.deepStrictEqual(inferFieldType('is_active', '`$BOOLEAN`'),'`$BOOLEAN`')

    // Unknown field names with $ANY stay $ANY
    assert.deepStrictEqual(inferFieldType('data', '`$ANY`'),'`$ANY`')
    assert.deepStrictEqual(inferFieldType('result', '`$ANY`'),'`$ANY`')
    assert.deepStrictEqual(inferFieldType('custom_field', '`$ANY`'),'`$ANY`')

    // Names that look similar but should not be overridden
    assert.deepStrictEqual(inferFieldType('disable_reason', '`$STRING`'),'`$STRING`')
    assert.deepStrictEqual(inferFieldType('disable_reason', '`$ANY`'),'`$ANY`')
    assert.deepStrictEqual(inferFieldType('activation_code', '`$ANY`'),'`$ANY`')
    assert.deepStrictEqual(inferFieldType('page_title', '`$ANY`'),'`$ANY`')
  })

  test('cleanComponentName', () => {
    // Controller suffixes are stripped
    assert.deepStrictEqual(cleanComponentName('nps_controller'),'nps')
    assert.deepStrictEqual(cleanComponentName('balance_controller'),'balance')
    assert.deepStrictEqual(cleanComponentName('gas_system_controller'),'gas_system')

    // Rest controller suffix (two parts) is stripped
    assert.deepStrictEqual(cleanComponentName('donate_rest_controller'),'donate')
    assert.deepStrictEqual(cleanComponentName('portfolio_rest_controller'),'portfolio')

    // Response/request suffixes are stripped
    assert.deepStrictEqual(cleanComponentName('user_response'),'user')
    assert.deepStrictEqual(cleanComponentName('order_request'),'order')

    // HTTP verb prefixes are stripped
    assert.deepStrictEqual(cleanComponentName('get_account_lookup'),'account_lookup')
    assert.deepStrictEqual(cleanComponentName('post_transfer'),'transfer')
    assert.deepStrictEqual(cleanComponentName('put_setting'),'setting')
    assert.deepStrictEqual(cleanComponentName('delete_item'),'item')
    assert.deepStrictEqual(cleanComponentName('patch_record'),'record')

    // Verb prefix not stripped if remainder is too short
    assert.deepStrictEqual(cleanComponentName('get_ab'),'get_ab')
    assert.deepStrictEqual(cleanComponentName('post_it'),'post_it')

    // No suffix or prefix: unchanged
    assert.deepStrictEqual(cleanComponentName('user'),'user')
    assert.deepStrictEqual(cleanComponentName('gas_balance'),'gas_balance')

    // Both suffix and prefix: suffix stripped first, then prefix
    assert.deepStrictEqual(cleanComponentName('get_user_response'),'user')
    assert.deepStrictEqual(cleanComponentName('get_balance_controller'),'balance')
  })

  test('ensureMinEntityName', () => {
    // Names already >= 3 chars are unchanged
    assert.deepStrictEqual(ensureMinEntityName('foo', {}),'foo')
    assert.deepStrictEqual(ensureMinEntityName('abcd', {}),'abcd')
    assert.deepStrictEqual(ensureMinEntityName('abc', {}),'abc')

    // 2-char names get padded with "n"
    assert.deepStrictEqual(ensureMinEntityName('ab', {}),'abn')
    assert.deepStrictEqual(ensureMinEntityName('dc', {}),'dcn')

    // 1-char names get padded with "nt"
    assert.deepStrictEqual(ensureMinEntityName('d', {}),'dnt')
    assert.deepStrictEqual(ensureMinEntityName('x', {}),'xnt')

    // Empty string gets padded
    assert.deepStrictEqual(ensureMinEntityName('', {}),'nt')

    // No collision: padded name is free
    assert.deepStrictEqual(ensureMinEntityName('ab', { other: {} }),'abn')

    // Collision: padded name already taken by a different entity
    assert.deepStrictEqual(ensureMinEntityName('ab', { abn: {} }),'abn2')
    assert.deepStrictEqual(ensureMinEntityName('ab', { abn: {}, abn2: {} }),'abn3')

    // No collision when original name is already in entmap (same entity, re-entry)
    assert.deepStrictEqual(ensureMinEntityName('foo', { foo: {} }),'foo')

    // Short name that doesn't collide after padding
    assert.deepStrictEqual(ensureMinEntityName('d', { other: {} }),'dnt')

    // Short name that collides after padding
    assert.deepStrictEqual(ensureMinEntityName('d', { dnt: {} }),'dnt2')
    assert.deepStrictEqual(ensureMinEntityName('d', { dnt: {}, dnt2: {} }),'dnt3')

    // Names starting with a digit get "n" prefix
    assert.deepStrictEqual(ensureMinEntityName('510k', {}),'n510k')
    assert.deepStrictEqual(ensureMinEntityName('3d_model', {}),'n3d_model')
    assert.deepStrictEqual(ensureMinEntityName('0day', {}),'n0day')

    // Digit prefix also satisfies min-length
    assert.deepStrictEqual(ensureMinEntityName('9', {}),'n9n')
    assert.deepStrictEqual(ensureMinEntityName('42', {}),'n42')

    // Non-digit names are not prefixed
    assert.deepStrictEqual(ensureMinEntityName('abc', {}),'abc')

    // Leading underscores are stripped, then digit prefix applies
    assert.deepStrictEqual(ensureMinEntityName('_123', {}),'n123')
    assert.deepStrictEqual(ensureMinEntityName('__foo', {}),'foo')

    // Digit prefix with collision
    assert.deepStrictEqual(ensureMinEntityName('510k', { n510k: {} }),'n510k2')

    // Non-alphanumeric characters are removed (keeping _)
    assert.deepStrictEqual(ensureMinEntityName('foo-bar', {}),'foobar')
    assert.deepStrictEqual(ensureMinEntityName('hello.world', {}),'helloworld')
    assert.deepStrictEqual(ensureMinEntityName('a!b@c#d', {}),'abcd')
    assert.deepStrictEqual(ensureMinEntityName('foo_bar', {}),'foo_bar')
    assert.deepStrictEqual(ensureMinEntityName('a[b]', {}),'abn')

    // Names under 67 chars are unchanged
    assert.deepStrictEqual(ensureMinEntityName(
      'this_endpoint_is_tailored_for_searches_based_on_product_name', {}
    ),'this_endpoint_is_tailored_for_searches_based_on_product_name')

    // Sentence-length names are truncated to <= 67 chars at word boundaries
    assert.deepStrictEqual(ensureMinEntityName(
      'if_you_have_the_name_of_a_specific_software_product_and_want_to_check', {}
    ),'if_you_have_the_name_of_a_specific_software_product_and_want_to')
    assert.deepStrictEqual(ensureMinEntityName(
      'this_is_a_very_long_entity_name_that_goes_well_beyond_the_sixty_seven_character_limit_set', {}
    ),'this_is_a_very_long_entity_name_that_goes_well_beyond_the_sixty')

    // Names at exactly 67 chars are unchanged
    assert.deepStrictEqual(ensureMinEntityName('a'.repeat(67), {}),'a'.repeat(67))

    // Names at 68 chars get truncated
    assert.deepStrictEqual(ensureMinEntityName('abcde_' + 'x'.repeat(63), {}),'abcde')

    // Single long word with no underscores gets hard-truncated at 67
    assert.deepStrictEqual(ensureMinEntityName('a'.repeat(80), {}),'a'.repeat(67))

    // Truncation with collision
    const truncated = 'if_you_have_the_name_of_a_specific_software_product_and_want_to'
    assert.deepStrictEqual(ensureMinEntityName(
      'if_you_have_the_name_of_a_specific_software_product_and_want_to_check',
      { [truncated]: {} }
    ),truncated + '2')
  })

  test('pathMatch', async () => {
    const pmf = (p: any, x: any) => {
      const r = pathMatch(p, x)
      return null === r ? r : { i: r.index, m: r.slice(0), x: r.expr }
    }

    assert.deepStrictEqual(pmf('/api/foo0', '/t/t/'),{
      i: 0, m: ['api', 'foo0'], x: '/t/t/'
    })

    assert.deepStrictEqual(pmf('/api/foo0n', '/t/'),null)
    assert.deepStrictEqual(pmf('/api/foo0n', '/t/t/t/'),null)
    assert.deepStrictEqual(pmf('/api/foo0n', 'p/'),null)
    assert.deepStrictEqual(pmf('/api/foo0n', 't/p/'),null)
    assert.deepStrictEqual(pmf('/api/foo0n', '/t/p/'),null)


    assert.deepStrictEqual(pmf('/api/foo1/', '/t/t/'),{
      m: ['api', 'foo1'], i: 0, x: '/t/t/'
    })

    assert.deepStrictEqual(pmf('api/foo2/', '/t/t/'),{
      m: ['api', 'foo2'], i: 0, x: '/t/t/'
    })

    assert.deepStrictEqual(pmf('api/foo3', '/t/t/'),{
      m: ['api', 'foo3'], i: 0, x: '/t/t/'
    })


    assert.deepStrictEqual(pmf('/foo4', '/t/'),{
      m: ['foo4'], i: 0, x: '/t/'
    })

    assert.deepStrictEqual(pmf('/foo5/', '/t/'),{
      m: ['foo5'], i: 0, x: '/t/'
    })

    assert.deepStrictEqual(pmf('foo6/', '/t/'),{
      m: ['foo6'], i: 0, x: '/t/'
    })

    assert.deepStrictEqual(pmf('foo7', '/t/'),{
      m: ['foo7'], i: 0, x: '/t/'
    })


    assert.deepStrictEqual(pmf('a0/{p0}', '/t/p/'),{
      m: ['a0', '{p0}'], i: 0, x: '/t/p/'
    })

    assert.deepStrictEqual(pmf('{p1}/a1/', '/p/t/'),{
      m: ['{p1}', 'a1'], i: 0, x: '/p/t/'
    })


    assert.deepStrictEqual(pmf('/a/b/c', '/t'),{
      m: ['a'], i: 0, x: '/t'
    })

    assert.deepStrictEqual(pmf('/a/b/c', 't'),{
      m: ['a'], i: 0, x: 't'
    })


    assert.deepStrictEqual(pmf('/a/b/c', 't/'),{
      m: ['c'], i: 2, x: 't/'
    })

    assert.deepStrictEqual(pmf('/a/b/c', 't/t/'),{
      m: ['b', 'c'], i: 1, x: 't/t/'
    })


    assert.deepStrictEqual(pmf('/a/b/{c}', 't/p/'),{
      m: ['b', '{c}'], i: 1, x: 't/p/'
    })

    assert.deepStrictEqual(pmf('/a/b/{c}', 'p/'),{
      m: ['{c}'], i: 2, x: 'p/'
    })

    assert.deepStrictEqual(pmf('/a/b/{c}', 't/'),null)



    assert.deepStrictEqual(pmf('/a/b/{c}/d', 't/p'),{
      m: ['b', '{c}'], i: 1, x: 't/p'
    })

    assert.deepStrictEqual(pmf('/a/b/{c}/d', 'p/t'),{
      m: ['{c}', 'd'], i: 2, x: 'p/t'
    })

    assert.deepStrictEqual(pmf('/a/b/{c}/d', 'p/t/'),{
      m: ['{c}', 'd'], i: 2, x: 'p/t/'
    })

    assert.deepStrictEqual(pmf('/a/b/{c}/d/e', 'p/t/'),null)
    assert.deepStrictEqual(pmf('/a/b/{c}/d/e', 'p/t'),{
      i: 2, m: ['{c}', 'd'], x: 'p/t'
    })


    assert.deepStrictEqual(pmf('/a/b/{c}/d/{e}', 't/p/'),{
      i: 3, m: ['d', '{e}'], x: 't/p/'
    })

    assert.deepStrictEqual(pmf('/a/b/{c}/d/{e}', 't/p'),{
      i: 1, m: ['b', '{c}'], x: 't/p'
    })

    assert.deepStrictEqual(pmf('/a/b/{c}/d/{e}', '/t/p'),null)

    assert.deepStrictEqual(pmf('/a/b/{c}/d/{e}', 't/p/t/p'),{
      i: 1, m: ['b', '{c}', 'd', '{e}'], x: 't/p/t/p'
    })
  })


  test('formatJSONIC', async () => {
    assert.deepStrictEqual(formatJSONIC(),'')
    assert.deepStrictEqual(formatJSONIC(undefined),'')
    assert.deepStrictEqual(formatJSONIC(null),'null\n')
    assert.deepStrictEqual(formatJSONIC(true),'true\n')
    assert.deepStrictEqual(formatJSONIC(11),'11\n')
    assert.deepStrictEqual(formatJSONIC("s"),'"s"\n')

    assert.deepStrictEqual(formatJSONIC({
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
    }),`{
  a: 1  # note about a
  "0b": {  # 0b notes
    _CUR: "dollar"  # x; y
  }

}
`)

    const a0: any = [100, 101, 102]
    a0['0_COMMENT'] = 'zero'
    a0['2_COMMENT'] = 'two'

    assert.deepStrictEqual(formatJSONIC({ a: a0, a_COMMENT: 'array' }),`{
  a: [  # array
    100  # zero
    101
    102  # two
  ]

}
`)


    assert.deepStrictEqual(formatJSONIC({ _COMMENT: 'topO' }),`{  # topO
}
`)

    const a1: any = []
    a1._COMMENT = 'topA'
    assert.deepStrictEqual(formatJSONIC(a1),`[  # topA
]
`)


    assert.deepStrictEqual(formatJSONIC({ a: { b: {}, c: [], d: {} }, e: {} }),`{
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


    assert.deepStrictEqual(formatJSONIC({ a1: { b1: {}, c1: [], d1: {} }, e1: {} }, { hsepd: 2 }),`{
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

    assert.deepStrictEqual(getModelPath(model, 'a'),model.a)
    assert.deepStrictEqual(getModelPath(model, 'a.b'),model.a.b)
    assert.deepStrictEqual(getModelPath(model, 'a.b.c'),'value')
  })


  test('getModelPath - array indexing', () => {
    const model = {
      items: [
        { name: 'first', value: 1 },
        { name: 'second', value: 2 },
        { name: 'third', value: 3 }
      ]
    }

    assert.deepStrictEqual(getModelPath(model, 'items.0'),model.items[0])
    assert.deepStrictEqual(getModelPath(model, 'items.1'),model.items[1])
    assert.deepStrictEqual(getModelPath(model, 'items.2'),model.items[2])
    assert.deepStrictEqual(getModelPath(model, 'items.0.name'),'first')
    assert.deepStrictEqual(getModelPath(model, 'items.1.value'),2)
    assert.deepStrictEqual(getModelPath(model, 'items.2.name'),'third')
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

    assert.deepStrictEqual(getModelPath(model, 'data.nested.0.items.0.id'),'a')
    assert.deepStrictEqual(getModelPath(model, 'data.nested.0.items.1.id'),'b')
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
      assert.fail('Should not reach here')
    } catch (err: any) {
      assert.match(err.message, new RegExp("path not found at 'a.x.c'"))
      assert.match(err.message, new RegExp("Valid path up to: 'a'"))
      assert.match(err.message, new RegExp("Property 'x' does not exist"))
      assert.match(err.message, new RegExp("Available keys: \\[b\\]"))
    }

    // Missing final key - should show available keys
    try {
      getModelPath(model, 'a.missing')
      assert.fail('Should not reach here')
    } catch (err: any) {
      assert.match(err.message, new RegExp("path not found at 'a.missing'"))
      assert.match(err.message, new RegExp("Valid path up to: 'a'"))
      assert.match(err.message, new RegExp("Property 'missing' does not exist"))
      assert.match(err.message, new RegExp("Available keys: \\[b\\]"))
    }

    // Missing root key
    try {
      getModelPath(model, 'missing')
      assert.fail('Should not reach here')
    } catch (err: any) {
      assert.match(err.message, new RegExp("path not found at 'missing'"))
      assert.match(err.message, new RegExp("Valid path up to: '\\(root\\)'"))
      assert.match(err.message, new RegExp("Property 'missing' does not exist"))
      assert.match(err.message, new RegExp("Available keys: \\[a\\]"))
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
      assert.fail('Should not reach here')
    } catch (err: any) {
      assert.match(err.message, new RegExp("path not found at 'a.b.c'"))
      assert.match(err.message, new RegExp("Valid path up to: 'a.b'"))
      assert.match(err.message, new RegExp("Cannot access property 'c' of null"))
    }

    const model2 = {
      a: {
        b: undefined
      }
    }

    try {
      getModelPath(model2, 'a.b.c')
      assert.fail('Should not reach here')
    } catch (err: any) {
      assert.match(err.message, new RegExp("path not found at 'a.b.c'"))
      assert.match(err.message, new RegExp("Valid path up to: 'a.b'"))
      assert.match(err.message, new RegExp("Cannot access property 'c' of undefined"))
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
      assert.fail('Should not reach here')
    } catch (err: any) {
      assert.match(err.message, new RegExp("path not found at 'items.5'"))
      assert.match(err.message, new RegExp("Valid path up to: 'items'"))
      assert.match(err.message, new RegExp("Property '5' does not exist"))
      assert.match(err.message, new RegExp("Available keys: array indices 0-1"))
    }
  })


  test('getModelPath - required:false returns undefined on missing path', () => {
    const model = {
      a: {
        b: 'value'
      }
    }

    assert.deepStrictEqual(getModelPath(model, 'a.x.c', { required: false }),undefined)
    assert.deepStrictEqual(getModelPath(model, 'a.missing', { required: false }),undefined)
    assert.deepStrictEqual(getModelPath(model, 'missing', { required: false }),undefined)
    assert.deepStrictEqual(getModelPath(model, 'a.b.c', { required: false }),undefined)
  })


  test('getModelPath - required:false returns undefined on null/undefined in path', () => {
    const model = {
      a: {
        b: null
      }
    }

    assert.deepStrictEqual(getModelPath(model, 'a.b.c', { required: false }),undefined)

    const model2 = {
      a: {
        b: undefined
      }
    }

    assert.deepStrictEqual(getModelPath(model2, 'a.b.c', { required: false }),undefined)
  })


  test('getModelPath - required:false returns undefined for array out of bounds', () => {
    const model = {
      items: [{ name: 'first' }]
    }

    assert.deepStrictEqual(getModelPath(model, 'items.5', { required: false }),undefined)
    assert.deepStrictEqual(getModelPath(model, 'items.5.name', { required: false }),undefined)
  })


  test('getModelPath - empty path handling', () => {
    const model = { a: 'value' }

    try {
      getModelPath(model, '')
      assert.fail('Should not reach here')
    } catch (err: any) {
      assert.match(err.message, new RegExp('empty path provided'))
    }

    assert.deepStrictEqual(getModelPath(model, '', { required: false }),undefined)
  })


  test('getModelPath - returns actual values including falsy ones', () => {
    const model = {
      zero: 0,
      empty: '',
      falsy: false,
      nullValue: null
    }

    assert.deepStrictEqual(getModelPath(model, 'zero'),0)
    assert.deepStrictEqual(getModelPath(model, 'empty'),'')
    assert.deepStrictEqual(getModelPath(model, 'falsy'),false)
    assert.deepStrictEqual(getModelPath(model, 'nullValue'),null)
  })
})

