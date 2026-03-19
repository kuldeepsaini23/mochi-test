/**
 * Lexical Editor Theme Configuration
 *
 * Custom Tailwind-based theme for the Lexical rich text editor.
 * Designed to feel like Notion with clean, minimal styling.
 *
 * SOURCE OF TRUTH: EditorThemeClasses from 'lexical'
 * Keywords: LEXICAL_EDITOR_THEME, EDITOR_STYLES, TAILWIND_THEME
 */

import type { EditorThemeClasses } from 'lexical'

/**
 * Editor theme with Tailwind CSS classes
 * WHY: Provides consistent styling across the editor that matches our design system
 */
export const editorTheme: EditorThemeClasses = {
  // ============================================================================
  // ROOT & LAYOUT
  // ============================================================================

  /**
   * Root paragraph styling - Notion-like clean look
   */
  paragraph: 'relative m-0 text-foreground leading-relaxed',

  /**
   * Indent configuration for nested content
   */
  indent: '[--lexical-indent-base-value:24px]',

  // ============================================================================
  // HEADINGS - Clean, hierarchical typography
  // ============================================================================

  heading: {
    h1: 'text-3xl font-bold text-foreground mt-6 mb-4 first:mt-0',
    h2: 'text-2xl font-semibold text-foreground mt-5 mb-3 first:mt-0',
    h3: 'text-xl font-semibold text-foreground mt-4 mb-2 first:mt-0',
    h4: 'text-lg font-medium text-foreground mt-3 mb-2 first:mt-0',
    h5: 'text-base font-medium text-foreground mt-2 mb-1 first:mt-0',
    h6: 'text-sm font-medium text-muted-foreground mt-2 mb-1 first:mt-0',
  },

  // ============================================================================
  // TEXT FORMATTING - Inline styles
  // ============================================================================

  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    underlineStrikethrough: '[text-decoration:underline_line-through]',
    code: 'font-mono text-[0.9em] bg-muted px-1.5 py-0.5 rounded-sm text-foreground',
    subscript: 'text-[0.8em] align-sub',
    superscript: 'text-[0.8em] align-super',
    highlight: 'bg-yellow-200 dark:bg-yellow-800/50 rounded-sm px-0.5',
    uppercase: 'uppercase',
    lowercase: 'lowercase',
    capitalize: 'capitalize',
  },

  // ============================================================================
  // LINKS - Clean, subtle styling
  // ============================================================================

  link: 'text-primary underline decoration-primary/30 hover:decoration-primary transition-colors cursor-pointer',

  // ============================================================================
  // HASHTAGS - Tag-like appearance
  // ============================================================================

  hashtag: 'text-primary bg-primary/10 px-1 py-0.5 rounded-sm cursor-pointer hover:bg-primary/20 transition-colors',

  // ============================================================================
  // LISTS - Notion-style lists with proper nesting
  // ============================================================================

  list: {
    ul: 'list-disc list-outside p-0 m-0 ml-5',
    ol: 'list-decimal list-outside p-0 m-0 ml-5',
    listitem: 'my-1 leading-relaxed',
    listitemChecked: [
      'relative mx-0 pl-6 list-none outline-none block min-h-[1.5em] line-through text-muted-foreground',
      'before:w-4 before:h-4 before:top-0.5 before:left-0 before:cursor-pointer before:block before:absolute',
      'before:border before:border-solid before:rounded-sm before:border-primary before:bg-primary',
      "before:content-['✓'] before:text-[10px] before:text-primary-foreground before:flex before:items-center before:justify-center",
      'focus:before:ring-2 focus:before:ring-primary/50',
    ].join(' '),
    listitemUnchecked: [
      'relative mx-0 pl-6 list-none outline-none block min-h-[1.5em]',
      'before:w-4 before:h-4 before:top-0.5 before:left-0 before:cursor-pointer before:block before:absolute',
      'before:border before:border-solid before:rounded-sm before:border-border before:bg-background',
      'hover:before:border-muted-foreground',
      'focus:before:ring-2 focus:before:ring-primary/50',
    ].join(' '),
    nested: {
      listitem: 'list-none before:hidden after:hidden',
    },
    olDepth: [
      'list-decimal p-0 m-0 ml-5',
      'list-[upper-alpha] p-0 m-0 ml-5',
      'list-[lower-alpha] p-0 m-0 ml-5',
      'list-[upper-roman] p-0 m-0 ml-5',
      'list-[lower-roman] p-0 m-0 ml-5',
    ],
    checklist: 'p-0 m-0',
  },

  // ============================================================================
  // BLOCKQUOTE - Elegant quote styling
  // ============================================================================

  quote:
    'relative m-0 ml-0 my-3 pl-4 border-l-4 border-border text-muted-foreground italic',

  // ============================================================================
  // CODE BLOCKS - Developer-friendly with syntax highlighting
  // ============================================================================

  code: 'block bg-muted/50 rounded-lg p-4 font-mono text-sm overflow-x-auto border border-border my-3',

  codeHighlight: {
    atrule: 'text-purple-600 dark:text-purple-400',
    attr: 'text-purple-600 dark:text-purple-400',
    boolean: 'text-orange-600 dark:text-orange-400',
    builtin: 'text-cyan-600 dark:text-cyan-400',
    cdata: 'text-muted-foreground italic',
    char: 'text-cyan-600 dark:text-cyan-400',
    class: 'text-blue-600 dark:text-blue-400',
    'class-name': 'text-blue-600 dark:text-blue-400',
    comment: 'text-muted-foreground italic',
    constant: 'text-orange-600 dark:text-orange-400',
    deleted: 'text-destructive',
    doctype: 'text-muted-foreground italic',
    entity: 'text-yellow-600 dark:text-yellow-400',
    function: 'text-blue-600 dark:text-blue-400',
    important: 'text-red-600 dark:text-red-400 font-bold',
    inserted: 'text-green-600 dark:text-green-400',
    keyword: 'text-purple-600 dark:text-purple-400',
    namespace: 'text-red-600 dark:text-red-400',
    number: 'text-orange-600 dark:text-orange-400',
    operator: 'text-foreground',
    prolog: 'text-muted-foreground italic',
    property: 'text-orange-600 dark:text-orange-400',
    punctuation: 'text-muted-foreground',
    regex: 'text-red-600 dark:text-red-400',
    selector: 'text-cyan-600 dark:text-cyan-400',
    string: 'text-green-600 dark:text-green-400',
    symbol: 'text-orange-600 dark:text-orange-400',
    tag: 'text-red-600 dark:text-red-400',
    url: 'text-blue-600 dark:text-blue-400 underline',
    variable: 'text-red-600 dark:text-red-400',
  },

  // ============================================================================
  // HORIZONTAL RULE
  // ============================================================================

  hr: 'my-6 border-none h-px bg-border cursor-pointer hover:bg-muted-foreground transition-colors',
  hrSelected: 'ring-2 ring-primary ring-offset-2 rounded',

  // ============================================================================
  // TABLES - Clean grid layout
  // ============================================================================

  table: 'border-collapse border-spacing-0 w-full my-4 overflow-x-auto table-fixed',
  tableCell:
    'border border-border min-w-[75px] p-2 align-top text-left relative outline-none',
  tableCellEditing: 'ring-2 ring-primary rounded-sm',
  tableCellHeader: 'bg-muted font-semibold',
  tableSelection: 'selection:bg-primary/20',

  // ============================================================================
  // IMAGE
  // ============================================================================

  image: 'inline-block cursor-default max-w-full',

  // ============================================================================
  // CURSOR & SELECTION
  // ============================================================================

  blockCursor:
    'block pointer-events-none absolute after:block after:absolute after:-top-0.5 after:w-5 after:border-t-2 after:border-foreground after:animate-pulse',

  // ============================================================================
  // EMBEDS
  // ============================================================================

  embedBlock: {
    base: 'inline-block',
    focus: 'outline-2 outline-primary outline-offset-2',
  },

  // ============================================================================
  // MARK / HIGHLIGHT (for comments, etc.)
  // ============================================================================

  mark: 'bg-yellow-200/50 dark:bg-yellow-700/30',
  markOverlap: 'bg-yellow-300/70 dark:bg-yellow-600/50',
}
