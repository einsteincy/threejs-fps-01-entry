// DUSKLINE palette: dusk-lit fuel depot at night. Six named colours, used by the
// game and the CSS alike; no other colour appears in code. Matches DESIGN.md §2.
export const PALETTE = {
  canvas: '#101d1f',
  surface: '#1a2320',
  ground: '#161d1a',
  teal: '#1f5f5b',
  rust: '#b4552a',
  amber: '#f0a830',
  hazard: '#e8c832',
  ink: '#e9e6df',
  muted: '#98a0a8',
};

export function paletteColor(name) {
  return PALETTE[name];
}
