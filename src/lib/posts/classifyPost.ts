import type {
  PostCategory,
  PostIntent,
  PostPriority,
  PostAudience,
} from '@prisma/client'

export interface ClassifiedWrite {
  category: PostCategory
  intent: PostIntent
  priority: PostPriority
  audience: PostAudience
}

export interface ClassifyInput {
  category: PostCategory
  intent?: PostIntent
  priority?: PostPriority
  audience?: PostAudience
}

export function classifyPost(input: ClassifyInput): ClassifiedWrite {
  const d = defaultsForCategory(input.category)
  return {
    category: input.category,
    intent:   input.intent   ?? d.intent,
    priority: input.priority ?? d.priority,
    audience: input.audience ?? d.audience,
  }
}

function defaultsForCategory(category: PostCategory): {
  intent: PostIntent
  priority: PostPriority
  audience: PostAudience
} {
  switch (category) {
    case 'LOST_FOUND':
    case 'NEIGHBORHOOD_REPORTS':
      return { intent: 'NORMAL', priority: 'HIGH', audience: 'ALL' }
    default:
      return { intent: 'NORMAL', priority: 'NORMAL', audience: 'ALL' }
  }
}
