/**
 * Built-in cover photo options — gradient backgrounds with subtle textures.
 */

export interface CoverOption {
  id: string
  nameAr: string
  nameEn: string
  css: string  // CSS background value
}

// Subtle dot pattern overlay
const dots = `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='1' fill='white' opacity='.07'/%3E%3C/svg%3E")`

// Geometric pattern
const geo = `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 5l15 15-15 15L5 20z' fill='none' stroke='white' stroke-width='.3' opacity='.08'/%3E%3C/svg%3E")`

// Wave pattern
const wave = `url("data:image/svg+xml,%3Csvg width='100' height='20' viewBox='0 0 100 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10c25-10 25 10 50 0s25-10 50 0' fill='none' stroke='white' stroke-width='.5' opacity='.06'/%3E%3C/svg%3E")`

// Stars pattern
const stars = `url("data:image/svg+xml,%3Csvg width='50' height='50' viewBox='0 0 50 50' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M25 8l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z' fill='white' opacity='.06'/%3E%3C/svg%3E")`

// Mosque silhouette pattern
const mosque = `url("data:image/svg+xml,%3Csvg width='80' height='60' viewBox='0 0 80 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M40 10c0 0-6 8-6 14s6 8 6 8 6-2 6-8-6-14-6-14z' fill='none' stroke='white' stroke-width='.4' opacity='.07'/%3E%3Crect x='20' y='32' width='40' height='20' rx='1' fill='none' stroke='white' stroke-width='.3' opacity='.05'/%3E%3C/svg%3E")`

// Palm pattern
const palm = `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cline x1='30' y1='20' x2='30' y2='55' stroke='white' stroke-width='.4' opacity='.06'/%3E%3Cpath d='M30 22c-10-6-16 0-16 0s10-1 16 4' fill='none' stroke='white' stroke-width='.4' opacity='.06'/%3E%3Cpath d='M30 22c10-6 16 0 16 0s-10-1-16 4' fill='none' stroke='white' stroke-width='.4' opacity='.06'/%3E%3C/svg%3E")`

export const DEFAULT_COVERS: CoverOption[] = [
  {
    id: 'green-gradient',
    nameAr: 'أخضر',
    nameEn: 'Green',
    css: `${mosque}, linear-gradient(135deg, #16a34a 0%, #065f46 100%)`,
  },
  {
    id: 'emerald-wave',
    nameAr: 'زمردي',
    nameEn: 'Emerald',
    css: `${wave}, linear-gradient(135deg, #059669 0%, #0d9488 50%, #14b8a6 100%)`,
  },
  {
    id: 'night-sky',
    nameAr: 'سماء الليل',
    nameEn: 'Night Sky',
    css: `${stars}, linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)`,
  },
  {
    id: 'sunset',
    nameAr: 'غروب',
    nameEn: 'Sunset',
    css: `${wave}, linear-gradient(135deg, #f59e0b 0%, #ef4444 50%, #ec4899 100%)`,
  },
  {
    id: 'ocean',
    nameAr: 'محيط',
    nameEn: 'Ocean',
    css: `${wave}, linear-gradient(135deg, #0ea5e9 0%, #2563eb 50%, #4f46e5 100%)`,
  },
  {
    id: 'desert',
    nameAr: 'صحراء',
    nameEn: 'Desert',
    css: `${dots}, ${palm}, linear-gradient(135deg, #d97706 0%, #b45309 50%, #92400e 100%)`,
  },
  {
    id: 'rose',
    nameAr: 'وردي',
    nameEn: 'Rose',
    css: `${geo}, linear-gradient(135deg, #e11d48 0%, #be185d 50%, #9d174d 100%)`,
  },
  {
    id: 'slate',
    nameAr: 'رمادي',
    nameEn: 'Slate',
    css: `${geo}, linear-gradient(135deg, #334155 0%, #475569 50%, #64748b 100%)`,
  },
  {
    id: 'aurora',
    nameAr: 'فجر',
    nameEn: 'Aurora',
    css: `${dots}, linear-gradient(135deg, #4ade80 0%, #2dd4bf 30%, #818cf8 70%, #c084fc 100%)`,
  },
  {
    id: 'purple',
    nameAr: 'بنفسجي',
    nameEn: 'Purple',
    css: `${mosque}, linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)`,
  },
]
