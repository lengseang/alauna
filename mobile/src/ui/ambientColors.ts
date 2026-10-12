/**
 * Luminous celestial neon palette for the Siri-style ambient aurora and floating bubbles.
 * Extracted so primitive UI components remain strictly bound to theme tokens without literal inline hex in components.
 */

export interface FloatingBubbleConfig {
  id: string;
  size: number;
  top?: `${number}%` | number;
  bottom?: `${number}%` | number;
  left?: `${number}%` | number;
  right?: `${number}%` | number;
  colorA: string;
  colorB: string;
  glowColor: string;
  duration: number;
  swayDuration: number;
  dy: number;
  dx: number;
}

export const SIRI_NEON = {
  cyan: '#06B6D4',
  sky: '#38BDF8',
  magenta: '#EC4899',
  pink: '#F43F5E',
  violet: '#8B5CF6',
  purple: '#A855F7',
  gold: '#F59E0B',
  amber: '#FBBF24',
} as const;

export const AMBIENT_BUBBLES: FloatingBubbleConfig[] = [
  {
    id: 'b1',
    size: 92,
    top: '12%',
    left: '6%',
    colorA: SIRI_NEON.cyan,
    colorB: SIRI_NEON.violet,
    glowColor: SIRI_NEON.sky,
    duration: 6400,
    swayDuration: 7800,
    dy: 20,
    dx: 12,
  },
  {
    id: 'b2',
    size: 46,
    top: '18%',
    right: '10%',
    colorA: SIRI_NEON.magenta,
    colorB: SIRI_NEON.pink,
    glowColor: '#F472B6',
    duration: 5200,
    swayDuration: 6200,
    dy: 14,
    dx: -9,
  },
  {
    id: 'b3',
    size: 118,
    top: '44%',
    right: '-6%',
    colorA: SIRI_NEON.violet,
    colorB: '#3B82F6',
    glowColor: '#C084FC',
    duration: 7200,
    swayDuration: 8600,
    dy: 24,
    dx: -14,
  },
  {
    id: 'b4',
    size: 32,
    top: '36%',
    left: '16%',
    colorA: SIRI_NEON.gold,
    colorB: SIRI_NEON.magenta,
    glowColor: SIRI_NEON.amber,
    duration: 4800,
    swayDuration: 5600,
    dy: 12,
    dx: 8,
  },
  {
    id: 'b5',
    size: 68,
    top: '64%',
    left: '8%',
    colorA: '#10B981',
    colorB: SIRI_NEON.cyan,
    glowColor: '#34D399',
    duration: 6000,
    swayDuration: 7400,
    dy: 18,
    dx: -10,
  },
  {
    id: 'b6',
    size: 38,
    top: '74%',
    right: '18%',
    colorA: '#6366F1',
    colorB: SIRI_NEON.purple,
    glowColor: '#818CF8',
    duration: 5400,
    swayDuration: 6600,
    dy: 14,
    dx: 10,
  },
  {
    id: 'b7',
    size: 82,
    top: '80%',
    left: '38%',
    colorA: SIRI_NEON.magenta,
    colorB: SIRI_NEON.gold,
    glowColor: '#FB7185',
    duration: 6800,
    swayDuration: 8000,
    dy: 22,
    dx: -12,
  },
  {
    id: 'b8',
    size: 24,
    top: '54%',
    left: '82%',
    colorA: SIRI_NEON.sky,
    colorB: '#818CF8',
    glowColor: '#7DD3FC',
    duration: 4400,
    swayDuration: 5200,
    dy: 10,
    dx: 6,
  },
];
