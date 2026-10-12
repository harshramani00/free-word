import { AlignmentType, BorderStyle, LevelFormat, UnderlineType } from 'docx'
import type { ILevelsOptions, INumberingOptions, IStylesOptions } from 'docx'

/** Default document font (bundled in the app) and body size in half-points (11 pt). */
export const DOC_FONT = 'Source Serif 4'
export const BODY_SIZE_HALF_PT = 22

export const TABLE_BORDER_COLOR = 'CFCFD4'
export const TABLE_HEAD_FILL = 'F4F4F6'
export const LINK_COLOR = '1F5FD6'
export const QUOTE_COLOR = '5E5E63'
export const RULE_COLOR = 'D6D6DA'

/** Word's built-in style ids, so Word, Pages and Google Docs recognise them (navigation pane, TOC). */
export const STYLE_IDS = {
  normal: 'Normal',
  title: 'Title',
  h1: 'Heading1',
  h2: 'Heading2',
  h3: 'Heading3',
  quote: 'Quote',
  hr: 'HorizontalRule',
  hyperlink: 'Hyperlink'
} as const

/** Style display names as written to styles.xml (what mammoth reports as style-name). */
export const STYLE_NAMES = {
  title: 'Title',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  quote: 'Quote',
  hr: 'Horizontal Rule'
} as const

export function documentStyles(): IStylesOptions {
  return {
    default: {
      document: {
        run: { font: DOC_FONT, size: BODY_SIZE_HALF_PT },
        paragraph: { spacing: { after: 160, line: 276 } }
      }
    },
    paragraphStyles: [
      {
        id: STYLE_IDS.title,
        name: STYLE_NAMES.title,
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 56, bold: true },
        paragraph: { spacing: { before: 0, after: 120, line: 264 } }
      },
      {
        id: STYLE_IDS.h1,
        name: STYLE_NAMES.h1,
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 36, bold: true },
        paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0, keepNext: true }
      },
      {
        id: STYLE_IDS.h2,
        name: STYLE_NAMES.h2,
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 28, bold: true },
        paragraph: { spacing: { before: 280, after: 80 }, outlineLevel: 1, keepNext: true }
      },
      {
        id: STYLE_IDS.h3,
        name: STYLE_NAMES.h3,
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 24, bold: true },
        paragraph: { spacing: { before: 240, after: 60 }, outlineLevel: 2, keepNext: true }
      },
      {
        id: STYLE_IDS.quote,
        name: STYLE_NAMES.quote,
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { italics: true, color: QUOTE_COLOR },
        paragraph: {
          indent: { left: 720 },
          spacing: { before: 200, after: 200 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: RULE_COLOR, space: 10 } }
        }
      },
      {
        id: STYLE_IDS.hr,
        name: STYLE_NAMES.hr,
        basedOn: 'Normal',
        next: 'Normal',
        paragraph: {
          spacing: { before: 120, after: 120, line: 240 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_COLOR, space: 1 } }
        },
        run: { size: 4 }
      }
    ],
    characterStyles: [
      {
        id: STYLE_IDS.hyperlink,
        name: 'Hyperlink',
        basedOn: 'DefaultParagraphFont',
        run: { color: LINK_COLOR, underline: { type: UnderlineType.SINGLE } }
      }
    ]
  }
}

const BULLETS = ['•', '◦', '▪']
const NUMBER_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN]

function levelIndent(level: number): { left: number; hanging: number } {
  return { left: 720 * (level + 1), hanging: 360 }
}

export function bulletLevels(): ILevelsOptions[] {
  return Array.from({ length: 9 }, (_, level) => ({
    level,
    format: LevelFormat.BULLET,
    text: BULLETS[level % 3],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: levelIndent(level) } }
  }))
}

export function numberLevels(): ILevelsOptions[] {
  return Array.from({ length: 9 }, (_, level) => ({
    level,
    format: NUMBER_FORMATS[level % 3],
    text: `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: levelIndent(level) } }
  }))
}

export const BULLET_REFERENCE = 'bullets'
export const numberReference = (instance: number): string => `numbers-${instance}`

/** One bullet definition plus one numbering instance per top-level ordered list (so each restarts at 1). */
export function numberingConfig(orderedInstances: number): INumberingOptions {
  const config: { reference: string; levels: ILevelsOptions[] }[] = [{ reference: BULLET_REFERENCE, levels: bulletLevels() }]
  for (let i = 0; i < Math.max(1, orderedInstances); i++) {
    config.push({ reference: numberReference(i), levels: numberLevels() })
  }
  return { config }
}
