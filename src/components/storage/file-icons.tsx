/**
 * FILE TYPE ICONS
 *
 * Clean, minimal SVG icons for different file types.
 * Designed to work seamlessly in both light and dark modes
 * using Tailwind CSS theme colors.
 *
 * DESIGN PRINCIPLES:
 * - Theme-compatible colors (works in light/dark mode)
 * - Minimal and modern aesthetic
 * - Consistent sizing and proportions
 * - Recognizable file type indicators
 */

import { cn } from '@/lib/utils'
import type { FileCategory } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

interface FileIconProps {
  /** The file extension (e.g., "pdf", "mp4") */
  extension?: string
  /** The file category for fallback */
  category?: FileCategory
  /** Size of the icon */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Additional className */
  className?: string
}

// Size mapping for consistent icon dimensions
const sizeMap = {
  sm: 'w-8 h-10',
  md: 'w-12 h-14',
  lg: 'w-16 h-20',
  xl: 'w-24 h-28',
}

// ============================================================================
// BASE FILE ICON (Document Shape)
// ============================================================================

/**
 * Base document shape with a folded corner
 * Uses theme colors via CSS classes for light/dark mode support
 */
function BaseFileIcon({
  children,
  variant = 'default',
  label,
  className,
}: {
  children?: React.ReactNode
  variant?: 'default' | 'red' | 'blue' | 'green' | 'orange'
  label?: string
  className?: string
}) {
  // Color variants - all use muted neutral colors for clean look
  const variants = {
    default: {
      bg: 'fill-muted',
      border: 'stroke-border',
      fold: 'fill-muted-foreground/20',
      accent: 'fill-muted-foreground/50', // Softer label background
    },
    // All colored variants now use the same muted neutral palette
    red: {
      bg: 'fill-muted',
      border: 'stroke-border',
      fold: 'fill-muted-foreground/20',
      accent: 'fill-muted-foreground/50',
    },
    blue: {
      bg: 'fill-muted',
      border: 'stroke-border',
      fold: 'fill-muted-foreground/20',
      accent: 'fill-muted-foreground/50',
    },
    green: {
      bg: 'fill-muted',
      border: 'stroke-border',
      fold: 'fill-muted-foreground/20',
      accent: 'fill-muted-foreground/50',
    },
    orange: {
      bg: 'fill-muted',
      border: 'stroke-border',
      fold: 'fill-muted-foreground/20',
      accent: 'fill-muted-foreground/50',
    },
  }

  const colors = variants[variant]

  return (
    <svg
      viewBox="0 0 40 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Main document body */}
      <path
        d="M2 4C2 2.89543 2.89543 2 4 2H26L38 14V48C38 49.1046 37.1046 50 36 50H4C2.89543 50 2 49.1046 2 48V4Z"
        className={cn(colors.bg, colors.border)}
        strokeWidth="1.5"
      />
      {/* Folded corner */}
      <path
        d="M26 2L38 14H30C27.7909 14 26 12.2091 26 10V2Z"
        className={cn(colors.fold, colors.border)}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Content area for file type indicator */}
      {children}
      {/* Label badge at bottom */}
      {label && (
        <>
          <rect
            x="6"
            y="36"
            width="28"
            height="10"
            rx="2"
            className={colors.accent}
          />
          <text
            x="20"
            y="43.5"
            textAnchor="middle"
            className="fill-white dark:fill-white"
            fontSize="6"
            fontWeight="bold"
            fontFamily="system-ui"
          >
            {label}
          </text>
        </>
      )}
    </svg>
  )
}

// ============================================================================
// SPECIFIC FILE TYPE ICONS
// ============================================================================

/**
 * PDF Icon - Muted theme with "PDF" label
 */
function PdfIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" label="PDF" className={className}>
      {/* Document lines */}
      <rect x="8" y="20" width="18" height="2" rx="1" className="fill-muted-foreground/30" />
      <rect x="8" y="25" width="12" height="2" rx="1" className="fill-muted-foreground/30" />
      <rect x="8" y="30" width="16" height="2" rx="1" className="fill-muted-foreground/30" />
    </BaseFileIcon>
  )
}

/**
 * Image Icon - Shows image placeholder
 * Note: For actual images, the FileCard should render the image directly
 */
function ImageIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" className={className}>
      {/* Image frame */}
      <rect
        x="7"
        y="18"
        width="26"
        height="20"
        rx="2"
        className="fill-muted-foreground/10 stroke-muted-foreground/30"
        strokeWidth="1.5"
      />
      {/* Mountain landscape */}
      <path
        d="M10 34L16 26L20 30L26 22L30 34H10Z"
        className="fill-muted-foreground/30"
      />
      {/* Sun */}
      <circle cx="26" cy="23" r="3" className="fill-muted-foreground/40" />
    </BaseFileIcon>
  )
}

/**
 * Video Icon - Shows play button indicator
 */
function VideoIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" className={className}>
      {/* Video frame */}
      <rect
        x="7"
        y="18"
        width="26"
        height="18"
        rx="2"
        className="fill-muted-foreground/10 stroke-muted-foreground/30"
        strokeWidth="1.5"
      />
      {/* Play button circle */}
      <circle cx="20" cy="27" r="8" className="fill-muted-foreground/20" />
      {/* Play triangle */}
      <path d="M17 23L17 31L25 27L17 23Z" className="fill-muted-foreground/60" />
    </BaseFileIcon>
  )
}

/**
 * Audio Icon - Sound wave visualization
 */
function AudioIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" className={className}>
      {/* Sound wave bars */}
      <rect x="10" y="28" width="3" height="12" rx="1.5" className="fill-muted-foreground/40" />
      <rect x="15" y="22" width="3" height="18" rx="1.5" className="fill-muted-foreground/50" />
      <rect x="20" y="18" width="3" height="26" rx="1.5" className="fill-muted-foreground/40" />
      <rect x="25" y="24" width="3" height="14" rx="1.5" className="fill-muted-foreground/50" />
    </BaseFileIcon>
  )
}

/**
 * Archive/ZIP Icon - Zipper design
 */
function ArchiveIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" label="ZIP" className={className}>
      {/* Zipper track */}
      <rect x="17" y="16" width="6" height="18" className="fill-muted-foreground/10" />
      {/* Zipper teeth */}
      <rect x="18" y="18" width="4" height="2" rx="0.5" className="fill-muted-foreground/40" />
      <rect x="18" y="22" width="4" height="2" rx="0.5" className="fill-muted-foreground/40" />
      <rect x="18" y="26" width="4" height="2" rx="0.5" className="fill-muted-foreground/40" />
      <rect x="18" y="30" width="4" height="2" rx="0.5" className="fill-muted-foreground/40" />
    </BaseFileIcon>
  )
}

/**
 * Document Icon - Generic document with text lines
 */
function DocumentIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" className={className}>
      {/* Text lines */}
      <rect x="8" y="20" width="20" height="2" rx="1" className="fill-muted-foreground/40" />
      <rect x="8" y="25" width="24" height="2" rx="1" className="fill-muted-foreground/30" />
      <rect x="8" y="30" width="16" height="2" rx="1" className="fill-muted-foreground/40" />
      <rect x="8" y="35" width="22" height="2" rx="1" className="fill-muted-foreground/30" />
      <rect x="8" y="40" width="14" height="2" rx="1" className="fill-muted-foreground/40" />
    </BaseFileIcon>
  )
}

/**
 * Word Document Icon - Muted theme with "DOC" label
 */
function WordIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" label="DOC" className={className}>
      {/* Document lines */}
      <rect x="8" y="20" width="18" height="2" rx="1" className="fill-muted-foreground/30" />
      <rect x="8" y="25" width="12" height="2" rx="1" className="fill-muted-foreground/30" />
      <rect x="8" y="30" width="20" height="2" rx="1" className="fill-muted-foreground/30" />
    </BaseFileIcon>
  )
}

/**
 * Excel/Spreadsheet Icon - Muted theme with grid
 */
function ExcelIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" label="XLS" className={className}>
      {/* Spreadsheet grid */}
      <rect
        x="8"
        y="18"
        width="24"
        height="16"
        rx="1"
        className="fill-muted-foreground/10 stroke-muted-foreground/30"
        strokeWidth="1"
      />
      {/* Grid lines */}
      <line x1="16" y1="18" x2="16" y2="34" className="stroke-muted-foreground/30" strokeWidth="1" />
      <line x1="24" y1="18" x2="24" y2="34" className="stroke-muted-foreground/30" strokeWidth="1" />
      <line x1="8" y1="24" x2="32" y2="24" className="stroke-muted-foreground/30" strokeWidth="1" />
      <line x1="8" y1="30" x2="32" y2="30" className="stroke-muted-foreground/30" strokeWidth="1" />
    </BaseFileIcon>
  )
}

/**
 * PowerPoint Icon - Muted theme with slide
 */
function PowerPointIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" label="PPT" className={className}>
      {/* Slide frame */}
      <rect
        x="8"
        y="18"
        width="24"
        height="16"
        rx="1"
        className="fill-muted-foreground/10 stroke-muted-foreground/30"
        strokeWidth="1.5"
      />
      {/* Slide content placeholder */}
      <rect x="11" y="21" width="8" height="4" rx="0.5" className="fill-muted-foreground/30" />
      <rect x="11" y="27" width="18" height="1.5" rx="0.5" className="fill-muted-foreground/20" />
      <rect x="11" y="30" width="14" height="1.5" rx="0.5" className="fill-muted-foreground/20" />
    </BaseFileIcon>
  )
}

/**
 * Code/Text File Icon - Shows code brackets
 */
function CodeIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" className={className}>
      {/* Code brackets */}
      <text
        x="11"
        y="32"
        className="fill-muted-foreground"
        fontSize="14"
        fontWeight="bold"
        fontFamily="monospace"
      >
        {'<'}
      </text>
      <text
        x="25"
        y="32"
        className="fill-muted-foreground"
        fontSize="14"
        fontWeight="bold"
        fontFamily="monospace"
      >
        {'>'}
      </text>
      {/* Code line */}
      <rect x="16" y="27" width="8" height="2" rx="1" className="fill-muted-foreground/60" />
      {/* More code lines */}
      <rect x="10" y="38" width="14" height="1.5" rx="0.5" className="fill-muted-foreground/30" />
      <rect x="10" y="42" width="10" height="1.5" rx="0.5" className="fill-muted-foreground/30" />
    </BaseFileIcon>
  )
}

/**
 * Generic/Unknown File Icon
 */
function GenericIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" className={className}>
      {/* Question mark for unknown */}
      <text
        x="20"
        y="36"
        textAnchor="middle"
        className="fill-muted-foreground/60"
        fontSize="16"
        fontWeight="bold"
        fontFamily="system-ui"
      >
        ?
      </text>
    </BaseFileIcon>
  )
}

/**
 * GIF Icon - Animated image indicator
 */
function GifIcon({ className }: { className?: string }) {
  return (
    <BaseFileIcon variant="default" label="GIF" className={className}>
      {/* Animation indicator dots */}
      <circle cx="14" cy="24" r="2" className="fill-muted-foreground/40" />
      <circle cx="20" cy="24" r="2" className="fill-muted-foreground/50" />
      <circle cx="26" cy="24" r="2" className="fill-muted-foreground/60" />
    </BaseFileIcon>
  )
}

// ============================================================================
// EXTENSION TO ICON MAPPING
// ============================================================================

/**
 * Maps file extensions to their corresponding icon components
 */
const extensionIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  // PDFs
  pdf: PdfIcon,

  // Images - Note: FileCard should render actual images, this is fallback
  jpg: ImageIcon,
  jpeg: ImageIcon,
  png: ImageIcon,
  webp: ImageIcon,
  svg: ImageIcon,
  ico: ImageIcon,
  bmp: ImageIcon,
  tiff: ImageIcon,
  gif: GifIcon,

  // Videos
  mp4: VideoIcon,
  mov: VideoIcon,
  avi: VideoIcon,
  mkv: VideoIcon,
  webm: VideoIcon,
  wmv: VideoIcon,
  flv: VideoIcon,
  m4v: VideoIcon,

  // Audio
  mp3: AudioIcon,
  wav: AudioIcon,
  ogg: AudioIcon,
  flac: AudioIcon,
  aac: AudioIcon,
  m4a: AudioIcon,
  wma: AudioIcon,

  // Archives
  zip: ArchiveIcon,
  rar: ArchiveIcon,
  '7z': ArchiveIcon,
  tar: ArchiveIcon,
  gz: ArchiveIcon,
  bz2: ArchiveIcon,

  // Documents
  doc: WordIcon,
  docx: WordIcon,
  txt: DocumentIcon,
  rtf: DocumentIcon,

  // Spreadsheets
  xls: ExcelIcon,
  xlsx: ExcelIcon,
  csv: ExcelIcon,

  // Presentations
  ppt: PowerPointIcon,
  pptx: PowerPointIcon,

  // Code
  js: CodeIcon,
  ts: CodeIcon,
  jsx: CodeIcon,
  tsx: CodeIcon,
  html: CodeIcon,
  css: CodeIcon,
  json: CodeIcon,
  xml: CodeIcon,
  md: CodeIcon,
  py: CodeIcon,
  rb: CodeIcon,
  go: CodeIcon,
  rs: CodeIcon,
  java: CodeIcon,
  php: CodeIcon,
  sql: CodeIcon,
  yml: CodeIcon,
  yaml: CodeIcon,
}

/**
 * Maps file categories to their fallback icon components
 */
const categoryIconMap: Record<FileCategory, React.ComponentType<{ className?: string }>> = {
  IMAGE: ImageIcon,
  VIDEO: VideoIcon,
  AUDIO: AudioIcon,
  DOCUMENT: DocumentIcon,
  ARCHIVE: ArchiveIcon,
  OTHER: GenericIcon,
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * FileIcon Component
 *
 * Renders the appropriate file type icon based on extension or category.
 * Falls back to category-based icon if extension is not recognized.
 * Uses theme-compatible colors that work in both light and dark modes.
 *
 * @example
 * <FileIcon extension="pdf" size="lg" />
 * <FileIcon category="IMAGE" size="md" />
 */
export function FileIcon({
  extension,
  category,
  size = 'md',
  className,
}: FileIconProps) {
  // Get icon based on extension first, then fall back to category
  const ext = extension?.toLowerCase()
  const IconComponent = ext && extensionIconMap[ext]
    ? extensionIconMap[ext]
    : category
      ? categoryIconMap[category]
      : GenericIcon

  return (
    <div className={cn(sizeMap[size], 'flex-shrink-0', className)}>
      <IconComponent className="w-full h-full" />
    </div>
  )
}

// Export individual icons for direct use if needed
export {
  PdfIcon,
  ImageIcon,
  VideoIcon,
  AudioIcon,
  ArchiveIcon,
  DocumentIcon,
  WordIcon,
  ExcelIcon,
  PowerPointIcon,
  CodeIcon,
  GifIcon,
  GenericIcon,
}
