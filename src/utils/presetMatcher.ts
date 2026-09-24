/**
 * Preset matching.
 *
 * Extracted from AddItemModal so it can be tested. It previously lived inline
 * as a find() whose conditions tested only the typed title and never the
 * candidate preset, making them constant with respect to the item being
 * examined -- so any title containing "ugly stik gx2" matched whichever preset
 * happened to be first in the array, and the new item inherited that preset's
 * brand, model and category. An Ugly Stik rod came out branded Jackery.
 *
 * The rule here: an alias only counts when it appears in BOTH the typed title
 * and the preset's own title, so a match is always evidence about that preset.
 */

export interface PresetLike {
  title: string;
  brand?: string;
  model?: string;
  category?: string;
  [key: string]: any;
}

/**
 * Token groups that identify a product even when the user types a shortened
 * name. Every token in a group must appear in both titles for the group to
 * match.
 */
export const PRESET_ALIASES: string[][] = [
  ['jackery', '1500'],
  ['jackery', 'solar generator'],
  ['ugly stik', 'gx2'],
  ['copper spur', 'ul2'],
  ['pocketrocket'],
  ['airpods', 'pro'],
  ['neoair', 'xlite'],
  ['artisan', 'stand mixer'],
  ['ultragear', 'oled'],
  ['roborock', 's8'],
  ['a7 iv']
];

export function findMatchingPreset<T extends PresetLike>(rawTitle: string, presets: T[]): T | undefined {
  const title = (rawTitle || '').trim().toLowerCase();
  if (!title) return undefined;

  return (presets || []).find(preset => {
    const presetTitle = (preset.title || '').toLowerCase();
    if (!presetTitle) return false;
    if (presetTitle === title) return true;
    return PRESET_ALIASES.some(tokens =>
      tokens.every(token => title.includes(token) && presetTitle.includes(token))
    );
  });
}
