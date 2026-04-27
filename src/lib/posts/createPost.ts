/**
 * Post create / update — the ONLY entry point for write paths during
 * Phase 3. Goes through classifyPost so every write populates BOTH
 * the legacy `category` column and all four new columns
 * (newCategory / intent / priority / audience).
 *
 * If the request comes from the new composer, callers pass v2 fields.
 * If it comes from a legacy code path, callers pass `legacyCategory`.
 * Either way, classifyPost normalizes them into a single tuple.
 *
 * After Phase 4 cleanup, this file collapses to a plain create/update
 * — the legacy column is gone.
 */

import { db } from '@/lib/db'
import { classifyPost, type ClassifyInput } from './classifyPost'
import type { Prisma } from '@prisma/client'

interface CommonPostFields {
  title: string
  body: string
  authorId: string
  neighborhoodId: string
  imageUrls?: string[]
  price?: number | null
  locationLat?: number | null
  locationLng?: number | null
  locationName?: string | null
}

export type CreatePostInput = CommonPostFields & {
  classification: ClassifyInput
}

export async function createPost(input: CreatePostInput) {
  const c = classifyPost(input.classification)

  const data: Prisma.PostUncheckedCreateInput = {
    title: input.title,
    body: input.body,
    category:    c.legacyCategory,   // legacy — keeps writing during dual-write
    newCategory: c.newCategory,      // v2 column
    intent:      c.intent,
    priority:    c.priority,
    audience:    c.audience,
    authorId: input.authorId,
    neighborhoodId: input.neighborhoodId,
    imageUrls: input.imageUrls ?? [],
    price: input.price ?? null,
    locationLat: input.locationLat ?? null,
    locationLng: input.locationLng ?? null,
    locationName: input.locationName ?? null,
  }

  return db.post.create({ data })
}

export type UpdatePostInput = Partial<CommonPostFields> & {
  id: string
  /** Optional — only re-classify if the caller is actually changing
   *  the category / intent / priority / audience. */
  classification?: ClassifyInput
}

export async function updatePost(input: UpdatePostInput) {
  const data: Prisma.PostUncheckedUpdateInput = {
    ...(input.title        !== undefined && { title:        input.title }),
    ...(input.body         !== undefined && { body:         input.body }),
    ...(input.imageUrls    !== undefined && { imageUrls:    input.imageUrls }),
    ...(input.price        !== undefined && { price:        input.price }),
    ...(input.locationLat  !== undefined && { locationLat:  input.locationLat }),
    ...(input.locationLng  !== undefined && { locationLng:  input.locationLng }),
    ...(input.locationName !== undefined && { locationName: input.locationName }),
  }

  if (input.classification) {
    const c = classifyPost(input.classification)
    data.category    = c.legacyCategory
    data.newCategory = c.newCategory
    data.intent      = c.intent
    data.priority    = c.priority
    data.audience    = c.audience
  }

  return db.post.update({ where: { id: input.id }, data })
}

/**
 * Convenience for the "Ask Neighbors" / search-style flow. Always
 * classified as REQUEST. Default category falls back to SERVICES
 * unless the caller has a better signal (e.g. ride composer →
 * RIDES). Behind classifyPost, which guarantees the legacy column
 * still gets written until Phase 4.
 */
export async function createAskPost(input: Omit<CommonPostFields, never> & {
  category?: import('@prisma/client').PostCategoryV2
}) {
  return createPost({
    ...input,
    classification: {
      kind: 'v2',
      newCategory: input.category ?? 'SERVICES',
      intent: 'REQUEST',
    },
  })
}
