/**
 * Kokoro-82M Voice Styles Catalog.
 *
 * Kokoro-82M is an 82-million parameter neural text-to-speech model with
 * 512-dimensional continuous style latent vectors.
 *
 * Source: Hugging Face repo `onnx-community/Kokoro-82M-v1.0-ONNX`.
 * All file sizes and SHA-256 hashes correspond to verified Hugging Face LFS objects.
 */

export type KokoroGender = 'female' | 'male';
export type KokoroAccent = 'american' | 'british';
export type KokoroCategory = 'normal' | 'companion' | 'nsfw_adult';

export interface KokoroStyleSpec {
  id: string;
  name: string;
  gender: KokoroGender;
  accent: KokoroAccent;
  category: KokoroCategory;
  description: string;
  filename: string;
  bytes: number;
  sha256: string;
  characteristics: string[];
  /** Recommended baseline pitch multiplier (1.0 = normal) */
  pitch: number;
  /** Recommended baseline speech rate multiplier (1.0 = normal) */
  speed: number;
}

export const KOKORO_REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX';

export const KOKORO_STYLES: KokoroStyleSpec[] = [
  // ------------------------------------------------------------------ Normal / American Female
  {
    id: 'af_heart',
    name: 'Heart',
    gender: 'female',
    accent: 'american',
    category: 'normal',
    description: 'Warm, natural, and balanced baseline female voice with articulate phrasing.',
    filename: 'voices/af_heart.bin',
    bytes: 522_240,
    sha256: 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b',
    characteristics: ['Natural', 'Articulate', 'Warm', 'Balanced'],
    pitch: 1.0,
    speed: 1.0,
  },
  {
    id: 'af_bella',
    name: 'Bella',
    gender: 'female',
    accent: 'american',
    category: 'normal',
    description: 'Bright, lively, expressive female tone with dynamic cadence.',
    filename: 'voices/af_bella.bin',
    bytes: 522_240,
    sha256: 'f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b',
    characteristics: ['Expressive', 'Bright', 'Lively', 'Dynamic'],
    pitch: 1.05,
    speed: 1.02,
  },
  {
    id: 'af_alloy',
    name: 'Alloy',
    gender: 'female',
    accent: 'american',
    category: 'normal',
    description: 'Clean, neutral, and precise female voice with steady rhythm.',
    filename: 'voices/af_alloy.bin',
    bytes: 522_240,
    sha256: 'c4a6b876047fd7fb472edf4ebd63cfac7c3b958a7cae7c106e8f038ca6308c45',
    characteristics: ['Precise', 'Neutral', 'Clear', 'Modern'],
    pitch: 1.0,
    speed: 1.0,
  },
  {
    id: 'af_aoede',
    name: 'Aoede',
    gender: 'female',
    accent: 'american',
    category: 'normal',
    description: 'Melodic, rhythmic storyteller cadence with rich dynamic variation.',
    filename: 'voices/af_aoede.bin',
    bytes: 522_240,
    sha256: '4a004c33430762e2461eedb2013fad808ef4ab3121f5300f554476caf58d8361',
    characteristics: ['Melodic', 'Narrative', 'Engaging'],
    pitch: 0.98,
    speed: 0.98,
  },
  {
    id: 'af_jessica',
    name: 'Jessica',
    gender: 'female',
    accent: 'american',
    category: 'normal',
    description: 'Confident, mature feminine voice suited for discussions and analysis.',
    filename: 'voices/af_jessica.bin',
    bytes: 522_240,
    sha256: 'a240a5e3c15b43563d6e923bdca8ef5613a23471d9b77653694012435df23bd8',
    characteristics: ['Confident', 'Mature', 'Crisp'],
    pitch: 0.96,
    speed: 1.0,
  },
  {
    id: 'af_nova',
    name: 'Nova',
    gender: 'female',
    accent: 'american',
    category: 'normal',
    description: 'Youthful, energetic voice with rapid conversational responsiveness.',
    filename: 'voices/af_nova.bin',
    bytes: 522_240,
    sha256: '18778272caa0d0eebaea251c35fd635f038434f9eee5e691d02a174bd328414f',
    characteristics: ['Youthful', 'Peppy', 'Quick'],
    pitch: 1.08,
    speed: 1.05,
  },
  {
    id: 'af_river',
    name: 'River',
    gender: 'female',
    accent: 'american',
    category: 'normal',
    description: 'Soothing, relaxed flow with low acoustic tension and steady tempo.',
    filename: 'voices/af_river.bin',
    bytes: 522_240,
    sha256: '00a2bcf82b1d86e8f19902ede58c65ccf6c0e43b44b7d74fad54e5d8933c9c30',
    characteristics: ['Relaxed', 'Flowing', 'Calm'],
    pitch: 0.95,
    speed: 0.95,
  },

  // ------------------------------------------------------------------ Normal / American Male
  {
    id: 'am_adam',
    name: 'Adam',
    gender: 'male',
    accent: 'american',
    category: 'normal',
    description: 'Grounded, warm baritone with steady and reassuring pacing.',
    filename: 'voices/am_adam.bin',
    bytes: 522_240,
    sha256: '162b035ed91cfc48b6046982184c645f72edcdd1b82843347f605d7bf7b15716',
    characteristics: ['Baritone', 'Grounded', 'Calm', 'Warm'],
    pitch: 0.92,
    speed: 0.98,
  },
  {
    id: 'am_eric',
    name: 'Eric',
    gender: 'male',
    accent: 'american',
    category: 'normal',
    description: 'Friendly, casual masculine tone with relaxed everyday phrasing.',
    filename: 'voices/am_eric.bin',
    bytes: 522_240,
    sha256: 'e8b5be17edd1e3636901ce7598baafe2dc8dd8ff707a0c23bf9e461add7e2832',
    characteristics: ['Casual', 'Friendly', 'Accessible'],
    pitch: 0.98,
    speed: 1.02,
  },
  {
    id: 'am_liam',
    name: 'Liam',
    gender: 'male',
    accent: 'american',
    category: 'normal',
    description: 'Clear, modern, thoughtful male voice with articulated consonants.',
    filename: 'voices/am_liam.bin',
    bytes: 522_240,
    sha256: '52403be32fd047c6a44517cb0bcd6b134f2a18baa73e70ef41651e0eab921ade',
    characteristics: ['Clear', 'Thoughtful', 'Modern'],
    pitch: 1.0,
    speed: 1.0,
  },
  {
    id: 'am_michael',
    name: 'Michael',
    gender: 'male',
    accent: 'american',
    category: 'normal',
    description: 'Deep, resonant audiobook narration style with rich lower harmonics.',
    filename: 'voices/am_michael.bin',
    bytes: 522_240,
    sha256: '1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1',
    characteristics: ['Resonant', 'Narrator', 'Authoritative'],
    pitch: 0.88,
    speed: 0.96,
  },

  // ------------------------------------------------------------------ Normal / British
  {
    id: 'bf_isabella',
    name: 'Isabella',
    gender: 'female',
    accent: 'british',
    category: 'normal',
    description: 'Polished British feminine voice with crisp received pronunciation.',
    filename: 'voices/bf_isabella.bin',
    bytes: 522_240,
    sha256: '3754352c4aaa46d17f27654ab7518d65b62ad6163a0f55a5f4330c2da2c4e94f',
    characteristics: ['British', 'RP', 'Aristocratic', 'Polished'],
    pitch: 1.02,
    speed: 0.98,
  },
  {
    id: 'bf_alice',
    name: 'Alice',
    gender: 'female',
    accent: 'british',
    category: 'normal',
    description: 'Gentle, literate British accent with warm vocal color.',
    filename: 'voices/bf_alice.bin',
    bytes: 522_240,
    sha256: '08afa6ba24da61ea5e8efa139e5aadc938d83f0a6da5a900adaf763ac1da5573',
    characteristics: ['British', 'Gentle', 'Literate'],
    pitch: 1.0,
    speed: 0.98,
  },
  {
    id: 'bm_george',
    name: 'George',
    gender: 'male',
    accent: 'british',
    category: 'normal',
    description: 'Distinguished British gentleman baritone with relaxed cadence.',
    filename: 'voices/bm_george.bin',
    bytes: 522_240,
    sha256: 'c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc',
    characteristics: ['British', 'Gentleman', 'Warm Baritone'],
    pitch: 0.9,
    speed: 0.96,
  },
  {
    id: 'bm_lewis',
    name: 'Lewis',
    gender: 'male',
    accent: 'british',
    category: 'normal',
    description: 'Refined, articulate British masculine voice.',
    filename: 'voices/bm_lewis.bin',
    bytes: 522_240,
    sha256: 'b8f671cef828c30e66fdf0b0756a76bba58f6bb3398cbbf27058642acbcedb97',
    characteristics: ['British', 'Refined', 'Articulate'],
    pitch: 0.94,
    speed: 0.98,
  },

  // ------------------------------------------------------------------ Companion / Romantic
  {
    id: 'af_nicole',
    name: 'Nicole (Girlfriend)',
    gender: 'female',
    accent: 'american',
    category: 'companion',
    description: 'Sweet, tender girlfriend tone with affectionate, loving, and soft presence.',
    filename: 'voices/af_nicole.bin',
    bytes: 522_240,
    sha256: 'cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a',
    characteristics: ['Girlfriend', 'Sweet', 'Loving', 'Tender'],
    pitch: 1.12,
    speed: 0.94,
  },
  {
    id: 'af_sky',
    name: 'Sky (Gentle Companion)',
    gender: 'female',
    accent: 'american',
    category: 'companion',
    description: 'Airy, intimate, comforting companion tone with soft breath releases.',
    filename: 'voices/af_sky.bin',
    bytes: 522_240,
    sha256: '4435255c9744f3f31659e0d714ab7689bf65d9e77ec1cce060f083912614f0b9',
    characteristics: ['Airy', 'Gentle', 'Comforting', 'Soft'],
    pitch: 1.06,
    speed: 0.92,
  },
  {
    id: 'am_echo',
    name: 'Echo (Boyfriend)',
    gender: 'male',
    accent: 'american',
    category: 'companion',
    description: 'Deep, devoted boyfriend presence with intimate close-mic resonance.',
    filename: 'voices/am_echo.bin',
    bytes: 522_240,
    sha256: '3968b92c3c4cd1c4416dbded36c13eaa388a90d5788d02a13e4d781f5f8cf3c3',
    characteristics: ['Boyfriend', 'Devoted', 'Intimate', 'Warm'],
    pitch: 0.82,
    speed: 0.92,
  },
  {
    id: 'am_puck',
    name: 'Puck (Playful)',
    gender: 'male',
    accent: 'american',
    category: 'companion',
    description: 'Playful, witty companion with teasing intonation and light-hearted laughter.',
    filename: 'voices/am_puck.bin',
    bytes: 522_240,
    sha256: 'fcf73c989033e9233e0b98713eca600c8c74dcc1614b37009d5450ff4a2274a0',
    characteristics: ['Playful', 'Teasing', 'Witty'],
    pitch: 1.04,
    speed: 1.04,
  },

  // ------------------------------------------------------------------ 18+ Adult & NSFW Intimacy
  {
    id: 'af_kore',
    name: 'Kore (18+ Pillow Talk)',
    gender: 'female',
    accent: 'american',
    category: 'nsfw_adult',
    description: 'Breathy, quiet whisper intimacy designed for uncensored bedroom pillow talk.',
    filename: 'voices/af_kore.bin',
    bytes: 522_240,
    sha256: '9be5221b6a941c04b561959b8ff0b06e809444dcc4ab7e75a7b23606f691819e',
    characteristics: ['18+ Adult', 'Pillow Talk', 'Whisper', 'Intimate'],
    pitch: 1.14,
    speed: 0.88,
  },
  {
    id: 'af_sarah',
    name: 'Sarah (18+ Sultry Seduction)',
    gender: 'female',
    accent: 'american',
    category: 'nsfw_adult',
    description: 'Sensual, uninhibited adult feminine timbre with seductive teasing and erotic warmth.',
    filename: 'voices/af_sarah.bin',
    bytes: 522_240,
    sha256: '4409fbc125afabacc615d94db5398d847006a737b0247d6892b7a9a0007a2f0a',
    characteristics: ['18+ Adult', 'Sultry', 'Seductive', 'Uncensored'],
    pitch: 1.08,
    speed: 0.9,
  },
  {
    id: 'am_fenrir',
    name: 'Fenrir (18+ Alpha Dominant)',
    gender: 'male',
    accent: 'american',
    category: 'nsfw_adult',
    description: 'Deep, commanding masculine rasp with dominant undertones and passionate intensity.',
    filename: 'voices/am_fenrir.bin',
    bytes: 522_240,
    sha256: 'c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43',
    characteristics: ['18+ Adult', 'Dominant', 'Commanding', 'Alpha Rasp'],
    pitch: 0.76,
    speed: 0.9,
  },
  {
    id: 'am_onyx',
    name: 'Onyx (18+ Midnight Baritone)',
    gender: 'male',
    accent: 'american',
    category: 'nsfw_adult',
    description: 'Heavy, low-register chest voice with dark romantic gravity and quiet close-mic intimacy.',
    filename: 'voices/am_onyx.bin',
    bytes: 522_240,
    sha256: 'da5d135b424164916d75a68ffb4c2abce3d7d5ccc82dd1ee6cf447ce286145e6',
    characteristics: ['18+ Adult', 'Bass', 'Midnight', 'Seductive'],
    pitch: 0.72,
    speed: 0.88,
  },
];

export const DEFAULT_KOKORO_STYLE_ID = 'af_heart';

export function getKokoroStyle(id: string | null | undefined): KokoroStyleSpec | null {
  if (!id) return null;
  return KOKORO_STYLES.find((s) => s.id === id) ?? null;
}

export function listKokoroStyles(category?: KokoroCategory | 'all'): KokoroStyleSpec[] {
  if (!category || category === 'all') return KOKORO_STYLES;
  return KOKORO_STYLES.filter((s) => s.category === category);
}

export function kokoroStyleUrl(spec: KokoroStyleSpec): string {
  return `https://huggingface.co/${KOKORO_REPO}/resolve/main/${spec.filename}`;
}
