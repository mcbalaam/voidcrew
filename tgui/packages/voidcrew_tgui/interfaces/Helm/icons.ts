/**
 * Chart art for overmap contacts.
 *
 * The helm draws every contact from one world DMI (`overmap.dmi`), addressed by
 * icon_state. DM already bakes terrain/storm/gas identity into `variant` (see
 * get_contact_variant() in ship/sensors.dm) and severity into `severity`, so the
 * client only has to pick a state and, where the sprite is monochrome, a tint.
 *
 * The DmIcon protocol carries no colour, so `tint` is applied by the chart as a
 * CSS mask over the same sprite (see Chart.tsx). Keep the semantic tints in the
 * palette below rather than scattered through the chart.
 */
import type { BooleanLike } from 'tgui-core/react';

import type { Contact, ContactKind } from './data';

/** World sprite sheet all chart contacts come from. */
export const OVERMAP_DMI = 'voidcrew/modules/overmap/icons/effects/overmap.dmi';

/**
 * Semantic colours, matching the native tgui theme accents. "ours" is amber,
 * "hostile" red, "unknown" slate, "sos" pink.
 */
export const CONTACT_TINTS = {
  own: '#e0a72c',
  friendly: '#59b871',
  hostile: '#cf4a38',
  unknown: '#8c9ea2',
  sos: '#e0538c',
  neutral: '#d9a230',
} as const;

/** Planet terrain tints, keyed by planet chart_variant (behaviour/planets.dm). */
const TERRAIN_TINTS: Record<string, string> = {
  rock: '#9a8f7d',
  lava: '#cf4a38',
  ice: '#bfe3f2',
  ocean: '#4a90cf',
  jungle: '#4fb06a',
  wasteland: '#c2a15c',
};

/** Nebula tints, keyed by the carried gas `id` (events.dm get_contact_variant). */
const NEBULA_TINTS: Record<string, string> = {
  tritium: '#7fd6a6',
  plasma: '#c96bd6',
  n2o: '#9fb8ff',
  no2: '#b07a4a',
  co2: '#8c9ea2',
  o2: '#6fb7e6',
  n2: '#a9c4d6',
  bz: '#b06bd6',
  freon: '#8fe0e0',
  healium: '#8fe0a0',
  nitrium: '#d6b06b',
  pluoxium: '#8fa8e0',
  halon: '#e0c36b',
  water_vapor: '#bcd6e6',
  hydrogen: '#d6d6d6',
  miasma: '#7d8a5a',
};

const NEBULA_DEFAULT_TINT = '#8f7fd6';

export type ContactArt = {
  dmi: string;
  /** icon_state in `dmi`. */
  state: string;
  /** CSS colour for a mask tint, or null for the sprite's own colours. */
  tint: string | null;
  /** Multiplier on the base glyph size (storms scale by severity). */
  scale: number;
  /** Clockwise pointer in degrees, set for vessels under way. */
  direction?: number;
};

const asBool = (value: BooleanLike | undefined) => !!value;

const clampSeverity = (severity: number | undefined) =>
  Math.min(4, Math.max(1, Math.round(severity || 2)));

/** Terrain/storm/nebula identity for a vessel, planet, ruin or outpost. */
function variantArt(
  kind: ContactKind,
  variant: string | null | undefined,
  severity: number | undefined,
): ContactArt {
  switch (kind) {
    case 'planet':
      switch (variant) {
        case 'asteroid':
          return { ...base('asteroid'), scale: 1 };
        case 'signal':
          return { ...base('strange_event'), scale: 1 };
        case 'wreck':
          return { ...base('object'), scale: 1 };
        default:
          return {
            ...base('globe'),
            tint: variant ? (TERRAIN_TINTS[variant] ?? null) : null,
            scale: 1,
          };
      }
    case 'hazard': {
      const level = clampSeverity(severity);
      const scale = 1 + (level - 1) * 0.25;
      switch (variant) {
        case 'ion':
          return { ...base(`ion${level}`), scale };
        case 'electrical':
          return { ...base(`electrical${level}`), scale };
        default:
          return { ...base(`meteor${level}`), scale };
      }
    }
    case 'nebula':
      return {
        ...base('nebula'),
        tint: variant ? (NEBULA_TINTS[variant] ?? NEBULA_DEFAULT_TINT) : null,
        scale: 1,
      };
    case 'ruin':
      switch (variant) {
        case 'encrypted':
          return { ...base('strange_event'), tint: CONTACT_TINTS.neutral, scale: 1 };
        case 'station':
          return { ...base('station'), scale: 1 };
        case 'ship':
          return { ...base('ship'), scale: 1 };
        default:
          return { ...base('object'), scale: 1 };
      }
    case 'outpost':
      return { ...base('station'), scale: 1 };
    default:
      return { ...base('object'), scale: 1 };
  }
}

function base(state: string): ContactArt {
  return { dmi: OVERMAP_DMI, state, tint: null, scale: 1 };
}

/**
 * The sprite, tint and size for one contact.
 *
 * Vessels are the only contacts whose colour is not in the sprite: an
 * unidentified hull is slate, a hostile one red, our own is amber. They also
 * carry a facing so the pointer matches the helm rose.
 */
export function contactArt(contact: Contact): ContactArt {
  switch (contact.kind) {
    case 'ship': {
      const tint = asBool(contact.hostile)
        ? CONTACT_TINTS.hostile
        : asBool(contact.identified)
          ? CONTACT_TINTS.neutral
          : CONTACT_TINTS.unknown;
      return { ...base('ship'), tint, scale: 1 };
    }
    case 'distress':
      return { ...base('ship'), tint: CONTACT_TINTS.sos, scale: 1.1 };
    case 'marker':
      return { ...base('sector'), tint: CONTACT_TINTS.own, scale: 1 };
    case 'mission':
      return { ...base('sector'), tint: CONTACT_TINTS.own, scale: 1 };
    case 'rumor':
      return { ...base('event'), tint: CONTACT_TINTS.neutral, scale: 1 };
    case 'bounty':
      return { ...base('object'), tint: CONTACT_TINTS.hostile, scale: 1 };
    case 'event':
      return { ...base('event'), scale: 1 };
    case 'planet':
    case 'hazard':
    case 'nebula':
    case 'ruin':
    case 'outpost':
      return variantArt(contact.kind, contact.variant, contact.severity);
    default:
      return { ...base('sector'), tint: CONTACT_TINTS.unknown, scale: 1 };
  }
}
