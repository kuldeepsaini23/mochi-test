/**
 * ============================================================================
 * ICON LIBRARY - Icon Registry
 * ============================================================================
 *
 * Central registry of all icons with their metadata.
 * Used by the IconPicker component for search and display.
 *
 * WHY: Separating metadata from components allows tree-shaking to work.
 * Only icons that are actually imported will be bundled.
 *
 * ============================================================================
 */

import type { IconMeta, IconCategory } from './types'

/**
 * Icon metadata registry - contains searchable info for all icons.
 * The actual components are imported separately to enable tree-shaking.
 */
export const iconRegistry: Record<string, IconMeta> = {
  // =========================================================================
  // NAVIGATION
  // =========================================================================
  home: {
    name: 'home',
    label: 'Home',
    category: 'navigation',
    keywords: ['house', 'main', 'start', 'dashboard'],
  },
  menu: {
    name: 'menu',
    label: 'Menu',
    category: 'navigation',
    keywords: ['hamburger', 'navigation', 'sidebar', 'bars'],
  },
  x: {
    name: 'x',
    label: 'Close',
    category: 'navigation',
    keywords: ['close', 'remove', 'cancel', 'times', 'cross'],
  },
  'chevron-left': {
    name: 'chevron-left',
    label: 'Chevron Left',
    category: 'arrows',
    keywords: ['arrow', 'back', 'previous', 'left'],
  },
  'chevron-right': {
    name: 'chevron-right',
    label: 'Chevron Right',
    category: 'arrows',
    keywords: ['arrow', 'forward', 'next', 'right'],
  },
  'chevron-up': {
    name: 'chevron-up',
    label: 'Chevron Up',
    category: 'arrows',
    keywords: ['arrow', 'up', 'expand'],
  },
  'chevron-down': {
    name: 'chevron-down',
    label: 'Chevron Down',
    category: 'arrows',
    keywords: ['arrow', 'down', 'collapse', 'dropdown'],
  },
  'arrow-left': {
    name: 'arrow-left',
    label: 'Arrow Left',
    category: 'arrows',
    keywords: ['back', 'previous', 'return'],
  },
  'arrow-right': {
    name: 'arrow-right',
    label: 'Arrow Right',
    category: 'arrows',
    keywords: ['forward', 'next', 'continue'],
  },
  'arrow-up': {
    name: 'arrow-up',
    label: 'Arrow Up',
    category: 'arrows',
    keywords: ['up', 'top', 'upload'],
  },
  'arrow-down': {
    name: 'arrow-down',
    label: 'Arrow Down',
    category: 'arrows',
    keywords: ['down', 'bottom', 'download'],
  },
  'external-link': {
    name: 'external-link',
    label: 'External Link',
    category: 'navigation',
    keywords: ['open', 'new tab', 'external', 'url'],
  },
  link: {
    name: 'link',
    label: 'Link',
    category: 'navigation',
    keywords: ['url', 'chain', 'connect', 'hyperlink'],
  },
  'layout-dashboard': {
    name: 'layout-dashboard',
    label: 'Dashboard',
    category: 'navigation',
    keywords: ['layout', 'grid', 'overview', 'admin'],
  },
  'layout-grid': {
    name: 'layout-grid',
    label: 'Grid Layout',
    category: 'navigation',
    keywords: ['layout', 'tiles', 'gallery'],
  },
  'layout-list': {
    name: 'layout-list',
    label: 'List Layout',
    category: 'navigation',
    keywords: ['layout', 'rows', 'table'],
  },
  sidebar: {
    name: 'sidebar',
    label: 'Sidebar',
    category: 'navigation',
    keywords: ['panel', 'navigation', 'menu', 'drawer'],
  },

  // =========================================================================
  // ACTIONS
  // =========================================================================
  plus: {
    name: 'plus',
    label: 'Plus',
    category: 'actions',
    keywords: ['add', 'new', 'create', 'insert'],
  },
  minus: {
    name: 'minus',
    label: 'Minus',
    category: 'actions',
    keywords: ['remove', 'subtract', 'decrease'],
  },
  check: {
    name: 'check',
    label: 'Check',
    category: 'actions',
    keywords: ['done', 'complete', 'success', 'tick', 'yes'],
  },
  edit: {
    name: 'edit',
    label: 'Edit',
    category: 'actions',
    keywords: ['modify', 'change', 'update', 'write'],
  },
  pencil: {
    name: 'pencil',
    label: 'Pencil',
    category: 'actions',
    keywords: ['write', 'edit', 'draw', 'compose'],
  },
  trash: {
    name: 'trash',
    label: 'Trash',
    category: 'actions',
    keywords: ['delete', 'remove', 'bin', 'garbage'],
  },
  copy: {
    name: 'copy',
    label: 'Copy',
    category: 'actions',
    keywords: ['duplicate', 'clone', 'clipboard'],
  },
  clipboard: {
    name: 'clipboard',
    label: 'Clipboard',
    category: 'actions',
    keywords: ['paste', 'copy', 'tasks'],
  },
  save: {
    name: 'save',
    label: 'Save',
    category: 'actions',
    keywords: ['disk', 'store', 'floppy'],
  },
  download: {
    name: 'download',
    label: 'Download',
    category: 'actions',
    keywords: ['save', 'export', 'get'],
  },
  upload: {
    name: 'upload',
    label: 'Upload',
    category: 'actions',
    keywords: ['import', 'send', 'share'],
  },
  refresh: {
    name: 'refresh',
    label: 'Refresh',
    category: 'actions',
    keywords: ['reload', 'sync', 'update'],
  },
  rotate: {
    name: 'rotate',
    label: 'Rotate',
    category: 'actions',
    keywords: ['turn', 'spin', 'flip'],
  },
  undo: {
    name: 'undo',
    label: 'Undo',
    category: 'actions',
    keywords: ['back', 'revert', 'cancel'],
  },
  redo: {
    name: 'redo',
    label: 'Redo',
    category: 'actions',
    keywords: ['forward', 'repeat'],
  },
  search: {
    name: 'search',
    label: 'Search',
    category: 'actions',
    keywords: ['find', 'lookup', 'magnify', 'query'],
  },
  filter: {
    name: 'filter',
    label: 'Filter',
    category: 'actions',
    keywords: ['sort', 'funnel', 'refine'],
  },
  sort: {
    name: 'sort',
    label: 'Sort',
    category: 'actions',
    keywords: ['order', 'arrange', 'organize'],
  },
  'more-horizontal': {
    name: 'more-horizontal',
    label: 'More Horizontal',
    category: 'actions',
    keywords: ['menu', 'options', 'dots', 'ellipsis'],
  },
  'more-vertical': {
    name: 'more-vertical',
    label: 'More Vertical',
    category: 'actions',
    keywords: ['menu', 'options', 'dots', 'ellipsis'],
  },
  'grip-vertical': {
    name: 'grip-vertical',
    label: 'Grip Vertical',
    category: 'actions',
    keywords: ['drag', 'handle', 'move', 'reorder'],
  },
  maximize: {
    name: 'maximize',
    label: 'Maximize',
    category: 'actions',
    keywords: ['expand', 'fullscreen', 'enlarge'],
  },
  minimize: {
    name: 'minimize',
    label: 'Minimize',
    category: 'actions',
    keywords: ['shrink', 'reduce', 'collapse'],
  },

  // =========================================================================
  // COMMUNICATION
  // =========================================================================
  mail: {
    name: 'mail',
    label: 'Mail',
    category: 'communication',
    keywords: ['email', 'message', 'envelope', 'letter'],
  },
  inbox: {
    name: 'inbox',
    label: 'Inbox',
    category: 'communication',
    keywords: ['messages', 'mail', 'receive'],
  },
  send: {
    name: 'send',
    label: 'Send',
    category: 'communication',
    keywords: ['submit', 'share', 'post'],
  },
  'message-square': {
    name: 'message-square',
    label: 'Message Square',
    category: 'communication',
    keywords: ['chat', 'comment', 'talk', 'bubble'],
  },
  'message-circle': {
    name: 'message-circle',
    label: 'Message Circle',
    category: 'communication',
    keywords: ['chat', 'comment', 'talk', 'bubble'],
  },
  phone: {
    name: 'phone',
    label: 'Phone',
    category: 'communication',
    keywords: ['call', 'telephone', 'contact'],
  },
  video: {
    name: 'video',
    label: 'Video',
    category: 'communication',
    keywords: ['camera', 'call', 'meeting', 'record'],
  },
  bell: {
    name: 'bell',
    label: 'Bell',
    category: 'communication',
    keywords: ['notification', 'alert', 'alarm', 'ring'],
  },
  'bell-off': {
    name: 'bell-off',
    label: 'Bell Off',
    category: 'communication',
    keywords: ['mute', 'silent', 'notification'],
  },

  // =========================================================================
  // MEDIA
  // =========================================================================
  play: {
    name: 'play',
    label: 'Play',
    category: 'media',
    keywords: ['start', 'video', 'audio', 'music'],
  },
  pause: {
    name: 'pause',
    label: 'Pause',
    category: 'media',
    keywords: ['stop', 'hold', 'wait'],
  },
  stop: {
    name: 'stop',
    label: 'Stop',
    category: 'media',
    keywords: ['end', 'halt', 'square'],
  },
  'skip-back': {
    name: 'skip-back',
    label: 'Skip Back',
    category: 'media',
    keywords: ['previous', 'rewind', 'back'],
  },
  'skip-forward': {
    name: 'skip-forward',
    label: 'Skip Forward',
    category: 'media',
    keywords: ['next', 'forward', 'ahead'],
  },
  volume: {
    name: 'volume',
    label: 'Volume',
    category: 'media',
    keywords: ['sound', 'audio', 'speaker'],
  },
  'volume-off': {
    name: 'volume-off',
    label: 'Volume Off',
    category: 'media',
    keywords: ['mute', 'silent', 'sound'],
  },
  image: {
    name: 'image',
    label: 'Image',
    category: 'media',
    keywords: ['picture', 'photo', 'gallery'],
  },
  camera: {
    name: 'camera',
    label: 'Camera',
    category: 'media',
    keywords: ['photo', 'picture', 'snap'],
  },
  mic: {
    name: 'mic',
    label: 'Microphone',
    category: 'media',
    keywords: ['record', 'audio', 'voice', 'podcast'],
  },
  'mic-off': {
    name: 'mic-off',
    label: 'Microphone Off',
    category: 'media',
    keywords: ['mute', 'silent', 'audio'],
  },

  // =========================================================================
  // FILES
  // =========================================================================
  file: {
    name: 'file',
    label: 'File',
    category: 'files',
    keywords: ['document', 'page', 'paper'],
  },
  'file-text': {
    name: 'file-text',
    label: 'File Text',
    category: 'files',
    keywords: ['document', 'text', 'page', 'article'],
  },
  'file-plus': {
    name: 'file-plus',
    label: 'File Plus',
    category: 'files',
    keywords: ['new', 'create', 'add', 'document'],
  },
  folder: {
    name: 'folder',
    label: 'Folder',
    category: 'files',
    keywords: ['directory', 'organize', 'category'],
  },
  'folder-open': {
    name: 'folder-open',
    label: 'Folder Open',
    category: 'files',
    keywords: ['directory', 'browse', 'open'],
  },
  'folder-plus': {
    name: 'folder-plus',
    label: 'Folder Plus',
    category: 'files',
    keywords: ['new', 'create', 'directory'],
  },
  archive: {
    name: 'archive',
    label: 'Archive',
    category: 'files',
    keywords: ['box', 'storage', 'compress'],
  },

  // =========================================================================
  // COMMERCE
  // =========================================================================
  'shopping-cart': {
    name: 'shopping-cart',
    label: 'Shopping Cart',
    category: 'commerce',
    keywords: ['cart', 'buy', 'purchase', 'store'],
  },
  'shopping-bag': {
    name: 'shopping-bag',
    label: 'Shopping Bag',
    category: 'commerce',
    keywords: ['bag', 'buy', 'purchase', 'store'],
  },
  'credit-card': {
    name: 'credit-card',
    label: 'Credit Card',
    category: 'commerce',
    keywords: ['payment', 'card', 'money', 'pay'],
  },
  'dollar-sign': {
    name: 'dollar-sign',
    label: 'Dollar Sign',
    category: 'commerce',
    keywords: ['money', 'currency', 'price', 'cost'],
  },
  tag: {
    name: 'tag',
    label: 'Tag',
    category: 'commerce',
    keywords: ['label', 'price', 'category'],
  },
  gift: {
    name: 'gift',
    label: 'Gift',
    category: 'commerce',
    keywords: ['present', 'reward', 'bonus'],
  },
  package: {
    name: 'package',
    label: 'Package',
    category: 'commerce',
    keywords: ['box', 'delivery', 'shipping', 'product'],
  },

  // =========================================================================
  // SOCIAL
  // =========================================================================
  user: {
    name: 'user',
    label: 'User',
    category: 'social',
    keywords: ['person', 'account', 'profile'],
  },
  users: {
    name: 'users',
    label: 'Users',
    category: 'social',
    keywords: ['people', 'team', 'group'],
  },
  'user-plus': {
    name: 'user-plus',
    label: 'User Plus',
    category: 'social',
    keywords: ['add', 'invite', 'new user'],
  },
  'user-minus': {
    name: 'user-minus',
    label: 'User Minus',
    category: 'social',
    keywords: ['remove', 'delete', 'kick'],
  },
  share: {
    name: 'share',
    label: 'Share',
    category: 'social',
    keywords: ['send', 'forward', 'social'],
  },
  heart: {
    name: 'heart',
    label: 'Heart',
    category: 'social',
    keywords: ['love', 'like', 'favorite'],
  },
  star: {
    name: 'star',
    label: 'Star',
    category: 'social',
    keywords: ['favorite', 'rating', 'bookmark'],
  },
  'thumbs-up': {
    name: 'thumbs-up',
    label: 'Thumbs Up',
    category: 'social',
    keywords: ['like', 'approve', 'good'],
  },
  'thumbs-down': {
    name: 'thumbs-down',
    label: 'Thumbs Down',
    category: 'social',
    keywords: ['dislike', 'reject', 'bad'],
  },

  // =========================================================================
  // MISC
  // =========================================================================
  settings: {
    name: 'settings',
    label: 'Settings',
    category: 'misc',
    keywords: ['gear', 'cog', 'options', 'preferences', 'config'],
  },
  sliders: {
    name: 'sliders',
    label: 'Sliders',
    category: 'misc',
    keywords: ['settings', 'adjust', 'preferences', 'controls'],
  },
  tool: {
    name: 'tool',
    label: 'Tool',
    category: 'misc',
    keywords: ['wrench', 'settings', 'fix', 'repair'],
  },
  zap: {
    name: 'zap',
    label: 'Zap',
    category: 'misc',
    keywords: ['lightning', 'fast', 'power', 'electric'],
  },
  info: {
    name: 'info',
    label: 'Info',
    category: 'misc',
    keywords: ['information', 'help', 'about'],
  },
  'alert-circle': {
    name: 'alert-circle',
    label: 'Alert Circle',
    category: 'misc',
    keywords: ['warning', 'error', 'danger'],
  },
  'alert-triangle': {
    name: 'alert-triangle',
    label: 'Alert Triangle',
    category: 'misc',
    keywords: ['warning', 'caution', 'danger'],
  },
  'help-circle': {
    name: 'help-circle',
    label: 'Help Circle',
    category: 'misc',
    keywords: ['question', 'support', 'faq'],
  },
  'check-circle': {
    name: 'check-circle',
    label: 'Check Circle',
    category: 'misc',
    keywords: ['success', 'done', 'complete', 'verified'],
  },
  'x-circle': {
    name: 'x-circle',
    label: 'X Circle',
    category: 'misc',
    keywords: ['error', 'close', 'cancel', 'failed'],
  },
  lock: {
    name: 'lock',
    label: 'Lock',
    category: 'misc',
    keywords: ['secure', 'password', 'private', 'protected'],
  },
  unlock: {
    name: 'unlock',
    label: 'Unlock',
    category: 'misc',
    keywords: ['open', 'unsecure', 'access'],
  },
  eye: {
    name: 'eye',
    label: 'Eye',
    category: 'misc',
    keywords: ['view', 'visible', 'show', 'watch'],
  },
  'eye-off': {
    name: 'eye-off',
    label: 'Eye Off',
    category: 'misc',
    keywords: ['hide', 'invisible', 'hidden'],
  },
  calendar: {
    name: 'calendar',
    label: 'Calendar',
    category: 'misc',
    keywords: ['date', 'schedule', 'event', 'time'],
  },
  clock: {
    name: 'clock',
    label: 'Clock',
    category: 'misc',
    keywords: ['time', 'schedule', 'hour'],
  },
  globe: {
    name: 'globe',
    label: 'Globe',
    category: 'misc',
    keywords: ['world', 'earth', 'international', 'web'],
  },
  'map-pin': {
    name: 'map-pin',
    label: 'Map Pin',
    category: 'misc',
    keywords: ['location', 'place', 'marker', 'gps'],
  },
  compass: {
    name: 'compass',
    label: 'Compass',
    category: 'misc',
    keywords: ['navigation', 'direction', 'explore'],
  },
  'bar-chart': {
    name: 'bar-chart',
    label: 'Bar Chart',
    category: 'misc',
    keywords: ['analytics', 'statistics', 'graph', 'data'],
  },
  'pie-chart': {
    name: 'pie-chart',
    label: 'Pie Chart',
    category: 'misc',
    keywords: ['analytics', 'statistics', 'graph', 'data'],
  },
  'trending-up': {
    name: 'trending-up',
    label: 'Trending Up',
    category: 'misc',
    keywords: ['growth', 'increase', 'rising', 'analytics'],
  },
  'trending-down': {
    name: 'trending-down',
    label: 'Trending Down',
    category: 'misc',
    keywords: ['decline', 'decrease', 'falling', 'analytics'],
  },
  book: {
    name: 'book',
    label: 'Book',
    category: 'misc',
    keywords: ['read', 'documentation', 'library'],
  },
  bookmark: {
    name: 'bookmark',
    label: 'Bookmark',
    category: 'misc',
    keywords: ['save', 'favorite', 'mark'],
  },
  hash: {
    name: 'hash',
    label: 'Hash',
    category: 'misc',
    keywords: ['hashtag', 'number', 'tag'],
  },
  'at-sign': {
    name: 'at-sign',
    label: 'At Sign',
    category: 'misc',
    keywords: ['email', 'mention', 'contact'],
  },
  code: {
    name: 'code',
    label: 'Code',
    category: 'misc',
    keywords: ['programming', 'developer', 'html', 'brackets'],
  },
  terminal: {
    name: 'terminal',
    label: 'Terminal',
    category: 'misc',
    keywords: ['command', 'console', 'shell', 'cli'],
  },
  database: {
    name: 'database',
    label: 'Database',
    category: 'misc',
    keywords: ['storage', 'server', 'data', 'sql'],
  },
  server: {
    name: 'server',
    label: 'Server',
    category: 'misc',
    keywords: ['hosting', 'backend', 'computer'],
  },
  cloud: {
    name: 'cloud',
    label: 'Cloud',
    category: 'misc',
    keywords: ['storage', 'sync', 'online'],
  },
  wifi: {
    name: 'wifi',
    label: 'WiFi',
    category: 'misc',
    keywords: ['internet', 'wireless', 'connection', 'network'],
  },
  loader: {
    name: 'loader',
    label: 'Loader',
    category: 'misc',
    keywords: ['loading', 'spinner', 'wait'],
  },
  layers: {
    name: 'layers',
    label: 'Layers',
    category: 'misc',
    keywords: ['stack', 'design', 'overlap'],
  },
  box: {
    name: 'box',
    label: 'Box',
    category: 'misc',
    keywords: ['cube', '3d', 'package'],
  },
  grid: {
    name: 'grid',
    label: 'Grid',
    category: 'shapes',
    keywords: ['layout', 'squares', 'table'],
  },
  square: {
    name: 'square',
    label: 'Square',
    category: 'shapes',
    keywords: ['rectangle', 'shape', 'box'],
  },
  circle: {
    name: 'circle',
    label: 'Circle',
    category: 'shapes',
    keywords: ['round', 'shape', 'dot'],
  },
  triangle: {
    name: 'triangle',
    label: 'Triangle',
    category: 'shapes',
    keywords: ['shape', 'warning', 'alert'],
  },
  octagon: {
    name: 'octagon',
    label: 'Octagon',
    category: 'shapes',
    keywords: ['stop', 'shape', 'polygon'],
  },
  hexagon: {
    name: 'hexagon',
    label: 'Hexagon',
    category: 'shapes',
    keywords: ['shape', 'polygon', 'honey'],
  },

  // =========================================================================
  // WEATHER
  // =========================================================================
  sun: {
    name: 'sun',
    label: 'Sun',
    category: 'weather',
    keywords: ['light', 'day', 'bright', 'sunny'],
  },
  moon: {
    name: 'moon',
    label: 'Moon',
    category: 'weather',
    keywords: ['night', 'dark', 'sleep'],
  },
  'cloud-rain': {
    name: 'cloud-rain',
    label: 'Cloud Rain',
    category: 'weather',
    keywords: ['rain', 'weather', 'storm'],
  },
  wind: {
    name: 'wind',
    label: 'Wind',
    category: 'weather',
    keywords: ['air', 'weather', 'breeze'],
  },
  thermometer: {
    name: 'thermometer',
    label: 'Thermometer',
    category: 'weather',
    keywords: ['temperature', 'heat', 'cold'],
  },
}

/**
 * Get all unique categories from the registry.
 */
export const iconCategories: IconCategory[] = [
  'navigation',
  'actions',
  'communication',
  'media',
  'files',
  'commerce',
  'social',
  'arrows',
  'shapes',
  'weather',
  'misc',
]

/**
 * Get icons filtered by category.
 */
export function getIconsByCategory(category: IconCategory): IconMeta[] {
  return Object.values(iconRegistry).filter((icon) => icon.category === category)
}

/**
 * Search icons by name, label, or keywords.
 */
export function searchIcons(query: string): IconMeta[] {
  const lowerQuery = query.toLowerCase().trim()
  if (!lowerQuery) {
    return Object.values(iconRegistry)
  }

  return Object.values(iconRegistry).filter((icon) => {
    // Match name
    if (icon.name.toLowerCase().includes(lowerQuery)) return true
    // Match label
    if (icon.label.toLowerCase().includes(lowerQuery)) return true
    // Match keywords
    if (icon.keywords.some((kw) => kw.toLowerCase().includes(lowerQuery))) return true
    return false
  })
}

/**
 * Get all icon names as an array.
 */
export function getAllIconNames(): string[] {
  return Object.keys(iconRegistry)
}
