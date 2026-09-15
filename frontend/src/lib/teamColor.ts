/* Team colors are real data, so they get used as data -- but they are also
   uncontrolled input. Two teams in one game can ship the same hex (Seattle
   and New England are both #002244), and several teams' primaries are dark
   enough that white text on them is the only readable option while others
   are bright enough that it isn't.

   These helpers answer the two questions a team-colored component has to ask
   before it paints anything: can I read text on this, and can I tell these
   two apart. */

const FALLBACK = "#6b6259"; // --color-muted

function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
function luminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** A safe team color, or a neutral when the value is missing or malformed. */
export function safeTeamColor(hex: string | null | undefined): string {
  return hex && parseHex(hex) ? hex : FALLBACK;
}

/** Text color that stays legible on the given fill. */
export function readableOn(hex: string | null | undefined): string {
  const l = luminance(safeTeamColor(hex));
  if (l === null) return "#ffffff";
  // Compare against both candidates rather than picking a fixed midpoint --
  // mid-tone team colors sit close enough to the threshold that the naive
  // version flips the wrong way.
  return contrast(l, 0) > contrast(l, 1) ? "#1a1410" : "#ffffff";
}

/** Two colors that can actually be told apart side by side. When a matchup's
 *  own colors are too close, the second one is replaced rather than drawn --
 *  a two-tone bar in one tone communicates nothing. */
export function distinguishPair(
  a: string | null | undefined,
  b: string | null | undefined,
): [string, string] {
  const first = safeTeamColor(a);
  const second = safeTeamColor(b);
  const la = luminance(first);
  const lb = luminance(second);
  if (la === null || lb === null) return [first, FALLBACK];

  // 1.6:1 is well below a text threshold on purpose: these are large solid
  // areas sitting next to each other, not type.
  if (contrast(la, lb) >= 1.6) return [first, second];
  return [first, la > 0.4 ? "#1a1410" : "#d6cbba"];
}
