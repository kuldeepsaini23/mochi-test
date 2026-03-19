/**
 * ============================================================================
 * ICON LIBRARY - Dynamic Icon Getter
 * ============================================================================
 *
 * Utility to get icon components by name at runtime.
 * This is useful when you need to render icons based on a string identifier
 * (e.g., from database or user selection).
 *
 * NOTE: This imports all icons, so use sparingly.
 * For static usage, import icons directly for better tree-shaking.
 *
 * ============================================================================
 */

import * as Icons from './icons'
import type { IconComponent } from './types'

/**
 * Map of icon names to their components.
 * This allows runtime lookup of icons by string name.
 */
const iconMap: Record<string, IconComponent> = {
  // Navigation
  home: Icons.HomeIcon,
  menu: Icons.MenuIcon,
  x: Icons.XIcon,
  'chevron-left': Icons.ChevronLeftIcon,
  'chevron-right': Icons.ChevronRightIcon,
  'chevron-up': Icons.ChevronUpIcon,
  'chevron-down': Icons.ChevronDownIcon,
  'arrow-left': Icons.ArrowLeftIcon,
  'arrow-right': Icons.ArrowRightIcon,
  'arrow-up': Icons.ArrowUpIcon,
  'arrow-down': Icons.ArrowDownIcon,
  'external-link': Icons.ExternalLinkIcon,
  link: Icons.LinkIcon,
  'layout-dashboard': Icons.LayoutDashboardIcon,
  'layout-grid': Icons.LayoutGridIcon,
  'layout-list': Icons.LayoutListIcon,
  sidebar: Icons.SidebarIcon,

  // Actions
  plus: Icons.PlusIcon,
  minus: Icons.MinusIcon,
  check: Icons.CheckIcon,
  edit: Icons.EditIcon,
  pencil: Icons.PencilIcon,
  trash: Icons.TrashIcon,
  copy: Icons.CopyIcon,
  clipboard: Icons.ClipboardIcon,
  save: Icons.SaveIcon,
  download: Icons.DownloadIcon,
  upload: Icons.UploadIcon,
  refresh: Icons.RefreshIcon,
  rotate: Icons.RotateIcon,
  undo: Icons.UndoIcon,
  redo: Icons.RedoIcon,
  search: Icons.SearchIcon,
  filter: Icons.FilterIcon,
  sort: Icons.SortIcon,
  'more-horizontal': Icons.MoreHorizontalIcon,
  'more-vertical': Icons.MoreVerticalIcon,
  'grip-vertical': Icons.GripVerticalIcon,
  maximize: Icons.MaximizeIcon,
  minimize: Icons.MinimizeIcon,

  // Communication
  mail: Icons.MailIcon,
  inbox: Icons.InboxIcon,
  send: Icons.SendIcon,
  'message-square': Icons.MessageSquareIcon,
  'message-circle': Icons.MessageCircleIcon,
  phone: Icons.PhoneIcon,
  video: Icons.VideoIcon,
  bell: Icons.BellIcon,
  'bell-off': Icons.BellOffIcon,

  // Media
  play: Icons.PlayIcon,
  pause: Icons.PauseIcon,
  stop: Icons.StopIcon,
  'skip-back': Icons.SkipBackIcon,
  'skip-forward': Icons.SkipForwardIcon,
  volume: Icons.VolumeIcon,
  'volume-off': Icons.VolumeOffIcon,
  image: Icons.ImageIcon,
  camera: Icons.CameraIcon,
  mic: Icons.MicIcon,
  'mic-off': Icons.MicOffIcon,

  // Files
  file: Icons.FileIcon,
  'file-text': Icons.FileTextIcon,
  'file-plus': Icons.FilePlusIcon,
  folder: Icons.FolderIcon,
  'folder-open': Icons.FolderOpenIcon,
  'folder-plus': Icons.FolderPlusIcon,
  archive: Icons.ArchiveIcon,

  // Commerce
  'shopping-cart': Icons.ShoppingCartIcon,
  'shopping-bag': Icons.ShoppingBagIcon,
  'credit-card': Icons.CreditCardIcon,
  'dollar-sign': Icons.DollarSignIcon,
  tag: Icons.TagIcon,
  gift: Icons.GiftIcon,
  package: Icons.PackageIcon,

  // Social
  user: Icons.UserIcon,
  users: Icons.UsersIcon,
  'user-plus': Icons.UserPlusIcon,
  'user-minus': Icons.UserMinusIcon,
  share: Icons.ShareIcon,
  heart: Icons.HeartIcon,
  star: Icons.StarIcon,
  'thumbs-up': Icons.ThumbsUpIcon,
  'thumbs-down': Icons.ThumbsDownIcon,

  // Misc
  settings: Icons.SettingsIcon,
  sliders: Icons.SlidersIcon,
  tool: Icons.ToolIcon,
  zap: Icons.ZapIcon,
  info: Icons.InfoIcon,
  'alert-circle': Icons.AlertCircleIcon,
  'alert-triangle': Icons.AlertTriangleIcon,
  'help-circle': Icons.HelpCircleIcon,
  'check-circle': Icons.CheckCircleIcon,
  'x-circle': Icons.XCircleIcon,
  lock: Icons.LockIcon,
  unlock: Icons.UnlockIcon,
  eye: Icons.EyeIcon,
  'eye-off': Icons.EyeOffIcon,
  calendar: Icons.CalendarIcon,
  clock: Icons.ClockIcon,
  globe: Icons.GlobeIcon,
  'map-pin': Icons.MapPinIcon,
  compass: Icons.CompassIcon,
  'bar-chart': Icons.BarChartIcon,
  'pie-chart': Icons.PieChartIcon,
  'trending-up': Icons.TrendingUpIcon,
  'trending-down': Icons.TrendingDownIcon,
  book: Icons.BookIcon,
  bookmark: Icons.BookmarkIcon,
  hash: Icons.HashIcon,
  'at-sign': Icons.AtSignIcon,
  code: Icons.CodeIcon,
  terminal: Icons.TerminalIcon,
  database: Icons.DatabaseIcon,
  server: Icons.ServerIcon,
  cloud: Icons.CloudIcon,
  wifi: Icons.WifiIcon,
  loader: Icons.LoaderIcon,
  layers: Icons.LayersIcon,
  box: Icons.BoxIcon,
  grid: Icons.GridIcon,
  square: Icons.SquareIcon,
  circle: Icons.CircleIcon,
  triangle: Icons.TriangleIcon,
  octagon: Icons.OctagonIcon,
  hexagon: Icons.HexagonIcon,

  // Weather
  sun: Icons.SunIcon,
  moon: Icons.MoonIcon,
  'cloud-rain': Icons.CloudRainIcon,
  wind: Icons.WindIcon,
  thermometer: Icons.ThermometerIcon,
}

/**
 * Get an icon component by its name.
 * Returns undefined if the icon is not found.
 *
 * @param name - The icon name (e.g., 'home', 'settings')
 * @returns The icon component or undefined
 *
 * @example
 * const Icon = getIcon('home')
 * if (Icon) {
 *   return <Icon size={24} />
 * }
 */
export function getIcon(name: string): IconComponent | undefined {
  return iconMap[name]
}

/**
 * Get an icon component by name with a fallback.
 * If the icon is not found, returns the fallback icon.
 *
 * @param name - The icon name
 * @param fallback - Fallback icon name (default: 'circle')
 * @returns The icon component (never undefined)
 *
 * @example
 * const Icon = getIconOrFallback(userSelectedIcon, 'help-circle')
 * return <Icon size={24} />
 */
export function getIconOrFallback(
  name: string,
  fallback: string = 'circle'
): IconComponent {
  return iconMap[name] || iconMap[fallback] || Icons.CircleIcon
}

/**
 * Check if an icon exists by name.
 *
 * @param name - The icon name to check
 * @returns true if the icon exists
 */
export function hasIcon(name: string): boolean {
  return name in iconMap
}

/**
 * Export the icon map for advanced use cases.
 */
export { iconMap }
