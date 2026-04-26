'use client'

import { useState } from 'react'

const QUICK_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🙏']

const CATEGORIES: { label: string; labelEn: string; emojis: string[] }[] = [
  {
    label: 'مشاعر', labelEn: 'Feelings',
    emojis: ['🥰', '😍', '🤩', '😎', '🤗', '😅', '😭', '😡', '🤔', '😳', '🥺', '🫠', '😤', '🙄', '🤣', '💀'],
  },
  {
    label: 'إيجابي', labelEn: 'Positive',
    emojis: ['💪', '🔥', '✅', '👏', '🎉', '⭐', '✨', '💯', '🤝', '🫡', '❤️‍🔥', '💐', '🌹', '☕', '🤲', '🫶'],
  },
  {
    label: 'الحي', labelEn: 'Neighborhood',
    emojis: ['📢', '⚠️', '🚨', '💡', '🛠️', '🏠', '🚗', '📍', '🕌', '🛒', '🍽️', '🍕', '🧃', '📦', '🔑', '🌿'],
  },
  {
    label: 'أشخاص', labelEn: 'People',
    emojis: ['👋', '👨‍👩‍👧', '🧑‍🤝‍🧑', '👴', '👵', '🫂', '💬', '📞', '💰', '🎁', '🌙', '🤷', '👀', '🙈', '💔', '😘'],
  },
]

export default function EmojiPickerWrapper({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [activeCategory, setActiveCategory] = useState(0)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden w-72">
      {/* Quick row */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-gray-100 dark:border-gray-700">
        {QUICK_EMOJIS.map(emoji => (
          <button
            key={emoji}
            type="button"
            // Was onPointerDown — closing the picker on pointerdown
            // (which onSelect does) meant the synthesized click event
            // fired on whatever was beneath the popover (the post
            // image's lightbox handler), looking like a 'tap-through'
            // bug. onClick only fires after the tap resolves on this
            // exact button, so closing the picker afterward is safe.
            onClick={(e) => { e.stopPropagation(); onSelect(emoji) }}
            className="text-2xl w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-125 transition-transform"
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all ${
            expanded ? 'bg-gray-200 dark:bg-gray-600' : ''
          }`}
        >
          <span className="text-gray-400 font-bold text-lg">+</span>
        </button>
      </div>

      {/* Expanded grid */}
      {expanded && (
        <div>
          {/* Category tabs */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-50 dark:border-gray-700 overflow-x-auto">
            {CATEGORIES.map((cat, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveCategory(i)}
                className={`text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-colors ${
                  activeCategory === i
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Emoji grid */}
          <div className="grid grid-cols-8 gap-0.5 p-2 max-h-44 overflow-y-auto">
            {CATEGORIES[activeCategory].emojis.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(emoji) }}
                className="w-8 h-8 flex items-center justify-center text-xl rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
