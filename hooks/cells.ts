// Terminal cells: how wide a character is, a text cut or padded to a width, and a name made safe to draw.

const ELLIPSIS = '…'
// A name or a subject is cut at this many characters. The engine refuses a tree with more than 100000 characters of text.
const SUBJECT_MAX = 200
export const LIST_MAX = 60

// Emoji drawn two cells wide that lie outside the wide blocks below (Unicode Emoji_Presentation, as ranges): ✅ and ⭐ are two cells.
const WIDE_EMOJI: [number, number][] = [
  [0x231a, 0x231b],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1],
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x1f004, 0x1f004],
  [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f200, 0x1f202],
  [0x1f210, 0x1f23b],
  [0x1f240, 0x1f248],
  [0x1f250, 0x1f251],
  [0x1f260, 0x1f265],
]

// Terminal cells one character takes: none for a combining mark or joiner, two for a wide one (CJK, emoji), else one.
export function cellsOf(char: string): number {
  const code = char.codePointAt(0) ?? 0
  if (code < 0x20 || (code >= 0x7f && code < 0xa0)) return 0
  if ((code >= 0x300 && code <= 0x36f) || code === 0x200d || (code >= 0xfe00 && code <= 0xfe0f)) return 0
  const isWide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd) ||
    WIDE_EMOJI.some(([first, last]) => code >= first && code <= last)
  return isWide ? 2 : 1
}

export const width = (text: string) => [...text].reduce((sum, char) => sum + cellsOf(char), 0)

// The text in exactly `cells` cells: cut with an ellipsis when it is longer, padded with spaces when it is shorter.
export function fit(text: string, cells: number): string {
  if (cells <= 0) return ''
  if (width(text) <= cells) return text + ' '.repeat(cells - width(text))
  let out = ''
  let used = 0
  for (const char of text) {
    if (used + cellsOf(char) > cells - 1) break
    out += char
    used += cellsOf(char)
  }
  return out + ELLIPSIS + ' '.repeat(cells - used - 1)
}

// Escape sequences go first, so that nothing of them is left behind when their control character goes. Then the characters that draw
// nothing but can break a row or hide text (bidi controls, zero width spaces, tag characters, the private-use planes that hold
// the Kitty placeholder U+10EEEE), and every other control character becomes a space. The zero width joiner of an emoji, the
// variation selector, a zero width non-joiner and the private use area of the BMP (icon fonts) stay.
const ESCAPES = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-_]/g
const INVISIBLE = /[\u001b\u061c\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufff9-\ufffb\u{e0000}-\u{e007f}\u{f0000}-\u{10ffff}]/gu
const BREAKS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g

// What the person or Claude wrote as a name or a subject, made safe to draw: one line, nothing invisible, at most `max` characters.
// The engine unmounts a tree with a control character in a text node and says so only in the debug log.
export function plain(text: unknown, max = SUBJECT_MAX): string {
  if (max <= 0) return ''
  const clean = String(text ?? '')
    .replace(ESCAPES, '')
    .replace(INVISIBLE, '')
    .replace(BREAKS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = [...clean]
  return chars.length > max ? chars.slice(0, max - 1).join('') + ELLIPSIS : clean
}
