/**
 * Chat wallpaper patterns — subtle SVG backgrounds themed for a neighborhood app.
 * Each pattern is a CSS background value (inline SVG or gradient).
 */

export interface ChatWallpaper {
  id: string
  nameAr: string
  nameEn: string
  light: string  // CSS background for light mode
  dark: string   // CSS background for dark mode
}

export const CHAT_WALLPAPERS: ChatWallpaper[] = [
  {
    id: 'default',
    nameAr: 'افتراضي',
    nameEn: 'Default',
    light: '#f3f4f6',
    dark: '#030712',
  },
  {
    id: 'neighborhood',
    nameAr: 'حي',
    nameEn: 'Neighborhood',
    light: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M30 10l8 12H22l8-12z' stroke='%2316a34a' stroke-width='.8' opacity='.15'/%3E%3Crect x='10' y='35' width='12' height='15' rx='1' stroke='%2316a34a' stroke-width='.8' opacity='.12'/%3E%3Crect x='38' y='35' width='12' height='15' rx='1' stroke='%2316a34a' stroke-width='.8' opacity='.12'/%3E%3C/g%3E%3C/svg%3E") #e8f5e9`,
    dark: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M30 10l8 12H22l8-12z' stroke='%234ade80' stroke-width='.8' opacity='.1'/%3E%3Crect x='10' y='35' width='12' height='15' rx='1' stroke='%234ade80' stroke-width='.8' opacity='.08'/%3E%3Crect x='38' y='35' width='12' height='15' rx='1' stroke='%234ade80' stroke-width='.8' opacity='.08'/%3E%3C/g%3E%3C/svg%3E") #0a1a0f`,
  },
  {
    id: 'mosque',
    nameAr: 'مسجد',
    nameEn: 'Mosque',
    light: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cpath d='M40 15c0 0-8 10-8 18s8 10 8 10 8-2 8-10-8-18-8-18z' stroke='%2316a34a' stroke-width='.7' opacity='.14'/%3E%3Cline x1='40' y1='8' x2='40' y2='15' stroke='%2316a34a' stroke-width='.7' opacity='.14'/%3E%3Ccircle cx='40' cy='7' r='2' stroke='%2316a34a' stroke-width='.7' opacity='.14'/%3E%3Crect x='20' y='43' width='40' height='25' rx='1' stroke='%2316a34a' stroke-width='.5' opacity='.1'/%3E%3C/g%3E%3C/svg%3E") #f0fdf4`,
    dark: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cpath d='M40 15c0 0-8 10-8 18s8 10 8 10 8-2 8-10-8-18-8-18z' stroke='%234ade80' stroke-width='.7' opacity='.08'/%3E%3Cline x1='40' y1='8' x2='40' y2='15' stroke='%234ade80' stroke-width='.7' opacity='.08'/%3E%3Ccircle cx='40' cy='7' r='2' stroke='%234ade80' stroke-width='.7' opacity='.08'/%3E%3Crect x='20' y='43' width='40' height='25' rx='1' stroke='%234ade80' stroke-width='.5' opacity='.06'/%3E%3C/g%3E%3C/svg%3E") #071210`,
  },
  {
    id: 'dots',
    nameAr: 'نقاط',
    nameEn: 'Dots',
    light: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='1.2' fill='%2316a34a' opacity='.15'/%3E%3C/svg%3E") #f5f5f5`,
    dark: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='1.2' fill='%234ade80' opacity='.1'/%3E%3C/svg%3E") #0a0f1a`,
  },
  {
    id: 'palm',
    nameAr: 'نخيل',
    nameEn: 'Palm',
    light: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%2316a34a' stroke-width='.7' opacity='.13'%3E%3Cline x1='50' y1='30' x2='50' y2='90'/%3E%3Cpath d='M50 35c-15-8-25 0-25 0s15-2 25 5'/%3E%3Cpath d='M50 35c15-8 25 0 25 0s-15-2-25 5'/%3E%3Cpath d='M50 30c-10-12-22-5-22-5s12 0 22 8'/%3E%3Cpath d='M50 30c10-12 22-5 22-5s-12 0-22 8'/%3E%3Cellipse cx='50' cy='28' rx='3' ry='5'/%3E%3C/g%3E%3C/svg%3E") #fef9e7`,
    dark: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%234ade80' stroke-width='.7' opacity='.07'%3E%3Cline x1='50' y1='30' x2='50' y2='90'/%3E%3Cpath d='M50 35c-15-8-25 0-25 0s15-2 25 5'/%3E%3Cpath d='M50 35c15-8 25 0 25 0s-15-2-25 5'/%3E%3Cpath d='M50 30c-10-12-22-5-22-5s12 0 22 8'/%3E%3Cpath d='M50 30c10-12 22-5 22-5s-12 0-22 8'/%3E%3Cellipse cx='50' cy='28' rx='3' ry='5'/%3E%3C/g%3E%3C/svg%3E") #0f1510`,
  },
  {
    id: 'geometric',
    nameAr: 'هندسي',
    nameEn: 'Geometric',
    light: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%2316a34a' stroke-width='.5' opacity='.12'%3E%3Crect x='5' y='5' width='30' height='30' rx='2'/%3E%3Cline x1='20' y1='5' x2='20' y2='35'/%3E%3Cline x1='5' y1='20' x2='35' y2='20'/%3E%3C/g%3E%3C/svg%3E") #f0f4f8`,
    dark: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%234ade80' stroke-width='.5' opacity='.07'%3E%3Crect x='5' y='5' width='30' height='30' rx='2'/%3E%3Cline x1='20' y1='5' x2='20' y2='35'/%3E%3Cline x1='5' y1='20' x2='35' y2='20'/%3E%3C/g%3E%3C/svg%3E") #0a0f1a`,
  },
  {
    id: 'stars',
    nameAr: 'نجوم',
    nameEn: 'Stars',
    light: `url("data:image/svg+xml,%3Csvg width='50' height='50' viewBox='0 0 50 50' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M25 5l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z' fill='%23f59e0b' opacity='.1'/%3E%3C/svg%3E") #fffbeb`,
    dark: `url("data:image/svg+xml,%3Csvg width='50' height='50' viewBox='0 0 50 50' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M25 5l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z' fill='%23fbbf24' opacity='.08'/%3E%3C/svg%3E") #1a150a`,
  },
  {
    id: 'waves',
    nameAr: 'أمواج',
    nameEn: 'Waves',
    light: `url("data:image/svg+xml,%3Csvg width='100' height='20' viewBox='0 0 100 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10c25-10 25 10 50 0s25-10 50 0' fill='none' stroke='%230ea5e9' stroke-width='.8' opacity='.12'/%3E%3C/svg%3E") #eff6ff`,
    dark: `url("data:image/svg+xml,%3Csvg width='100' height='20' viewBox='0 0 100 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10c25-10 25 10 50 0s25-10 50 0' fill='none' stroke='%2338bdf8' stroke-width='.8' opacity='.08'/%3E%3C/svg%3E") #0a1020`,
  },
]

export function getWallpaper(id: string): ChatWallpaper {
  return CHAT_WALLPAPERS.find(w => w.id === id) || CHAT_WALLPAPERS[0]
}
