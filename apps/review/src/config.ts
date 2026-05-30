export const SITE_TITLE = 'ReView';

// Always ends with '/'
export const BASE = import.meta.env.BASE_URL.replace(/([^/])$/, '$1/');
// dev: Live Server が 5500 でポータルを配信している前提
// prod: GitHub Pages の /mysite/
export const PORTAL_HREF = import.meta.env.DEV ? 'http://127.0.0.1:5500/' : '/mysite/';

export const CATEGORIES = [
  { id: 'manga',      label: '漫画',   emoji: '📚', color: '#e84393' },
  { id: 'game',       label: 'ゲーム', emoji: '🎮', color: '#7c3aed' },
  { id: 'exhibition', label: '展示',   emoji: '🏛️', color: '#10b981' },
] as const;

export const EXHIBITION_TYPES = [
  { id: 'museum',     label: '博物館', emoji: '🏛️', color: '#10b981' },
  { id: 'art_museum', label: '美術館', emoji: '🎨', color: '#f59e0b' },
  { id: 'science',    label: '科学館', emoji: '🔬', color: '#3b82f6' },
  { id: 'tech',       label: '技術館', emoji: '⚙️',  color: '#8b5cf6' },
  { id: 'archive',    label: '資料館', emoji: '📜', color: '#78716c' },
  { id: 'other',      label: 'その他', emoji: '🏟️', color: '#ec4899' },
] as const;

export type ExhibitionTypeId = typeof EXHIBITION_TYPES[number]['id'];
