/**
 * Post create / update — entry point for write paths. Routes the
 * classification through classifyPost so defaults (intent / priority /
 * audience) stay consistent with the rest of the app.
 */

import { db } from '@/lib/db'
import { classifyPost, type ClassifyInput } from './classifyPost'
import type { Prisma, PostCategory } from '@prisma/client'

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
    category: c.category,
    intent:   c.intent,
    priority: c.priority,
    audience: c.audience,
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
    data.category = c.category
    data.intent   = c.intent
    data.priority = c.priority
    data.audience = c.audience
  }

  return db.post.update({ where: { id: input.id }, data })
}

/**
 * Convenience for the "Ask Neighbors" / search-style flow. Always
 * classified as REQUEST. Default category is SERVICES unless the caller
 * has a better signal (e.g. ride composer → RIDES).
 */
export async function createAskPost(input: CommonPostFields & {
  category?: PostCategory
}) {
  return createPost({
    ...input,
    classification: {
      category: input.category ?? 'SERVICES',
      intent: 'REQUEST',
    },
  })
}
