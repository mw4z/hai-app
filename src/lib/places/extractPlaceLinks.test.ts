/**
 * Smoke tests for the directory link extractor.
 *
 *   npx tsx --test src/lib/places/extractPlaceLinks.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractPlaceLinks, MAX_PLACE_PREVIEWS_PER_BLOCK } from './extractPlaceLinks'

test('relative /directory/<id> link', () => {
  const ids = extractPlaceLinks('check this out /directory/clxabc123def456ghi789jklmn')
  assert.deepEqual(ids, ['clxabc123def456ghi789jklmn'])
})

test('absolute production link', () => {
  const ids = extractPlaceLinks('https://app.hai-app.net/directory/clxabc123def456ghi789jklmn please')
  assert.deepEqual(ids, ['clxabc123def456ghi789jklmn'])
})

test('absolute link, any host', () => {
  const ids = extractPlaceLinks('https://staging.example.com/directory/clxxyz12345xyz12345xyz123 hey')
  assert.deepEqual(ids, ['clxxyz12345xyz12345xyz123'])
})

test('multiple links dedup + cap', () => {
  const text = `
    one /directory/clxxxxxxxxxxxxxxxxxxxxxxxxx
    two /directory/clyyyyyyyyyyyyyyyyyyyyyyyyy
    three /directory/clzzzzzzzzzzzzzzzzzzzzzzzzz
    dup /directory/clxxxxxxxxxxxxxxxxxxxxxxxxx
  `
  const ids = extractPlaceLinks(text)
  // Cap at MAX_PLACE_PREVIEWS_PER_BLOCK; dedupes the repeat.
  assert.equal(ids.length, MAX_PLACE_PREVIEWS_PER_BLOCK)
  assert.equal(ids[0], 'clxxxxxxxxxxxxxxxxxxxxxxxxx')
  assert.equal(ids[1], 'clyyyyyyyyyyyyyyyyyyyyyyyyy')
})

test('ignores too-short ids', () => {
  // 7 chars — below the 8-char floor.
  const ids = extractPlaceLinks('look /directory/abc1234')
  assert.deepEqual(ids, [])
})

test('ignores trailing path segments', () => {
  // The extractor stops at the id boundary; anything after a "/" is
  // a different route (sub-routes like /directory/<id>/edit shouldn't
  // false-match).
  const ids = extractPlaceLinks('/directory/clxabc12345xyz67890/edit')
  assert.deepEqual(ids, [])
})

test('plain text returns empty', () => {
  assert.deepEqual(extractPlaceLinks('no link here at all'), [])
  assert.deepEqual(extractPlaceLinks(''), [])
  assert.deepEqual(extractPlaceLinks(null), [])
})
