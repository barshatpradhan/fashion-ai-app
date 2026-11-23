/** The nine "second lives" shown on the home ring. Illustrative content, not user data. */
export type SecondLife = {
  name: string;
  d: string;
  fill: string;
  detail: string;
  from: string;
  fromD: string;
  fromFill: string;
  recipe: string;
  time: string;
};

const SHAPES = {
  shirt: 'M72 28 L128 28 L172 54 L156 92 L140 84 L140 178 L60 178 L60 84 L44 92 L28 54 Z',
  crop: 'M72 28 L128 28 L172 54 L156 92 L140 84 L140 130 L112 144 L100 134 L88 144 L60 130 L60 84 L44 92 L28 54 Z',
  jeans: 'M62 22 L138 22 L148 182 L110 182 L100 84 L90 182 L52 182 Z',
  tote: 'M50 80 L150 80 L142 180 L58 180 Z M78 80 C78 36 122 36 122 80 L112 80 C112 50 88 50 88 80 Z',
  skirt: 'M64 40 L136 40 L168 170 L32 170 Z',
  tee: 'M66 34 L134 34 L170 60 L154 92 L138 84 L138 176 L62 176 L62 84 L46 92 L30 60 Z',
  scarf: 'M44 26 L86 26 L86 150 L66 176 L44 150 Z M114 26 L156 26 L156 150 L134 176 L114 150 Z M86 40 L114 40 L114 70 L86 70 Z',
  blazer: 'M66 26 L134 26 L176 56 L162 104 L146 96 L146 180 L54 180 L54 96 L38 104 L24 56 Z',
  jacket: 'M70 32 L130 32 L174 60 L160 100 L144 92 L144 150 L56 150 L56 92 L40 100 L26 60 Z',
  shorts: 'M58 50 L142 50 L152 144 L108 144 L100 100 L92 144 L48 144 Z',
  chinos: 'M64 22 L136 22 L146 182 L108 182 L100 86 L92 182 L54 182 Z',
  apron: 'M84 20 L92 20 L96 60 L104 60 L108 20 L116 20 L124 70 L160 182 L40 182 L76 70 Z',
  hat: 'M60 112 Q60 62 100 62 Q140 62 140 112 L172 122 Q100 152 28 122 Z',
  tank: 'M78 30 L92 30 Q100 54 108 30 L122 30 L130 70 L140 178 L60 178 L70 70 Z',
} as const;

type Raw = {
  name: string; shape: keyof typeof SHAPES; fill: string; detail: string;
  from: string; fromShape: keyof typeof SHAPES; fromFill: string; recipe: string; time: string;
};

const RAW: Raw[] = [
  { name: 'Tie-front crop', shape: 'crop', fill: '#4A6FA5', detail: 'M60 100 H140 M60 116 H140', from: 'Striped shirt', fromShape: 'shirt', fromFill: '#4A6FA5', recipe: 'No sew', time: '20 min' },
  { name: 'Denim tote', shape: 'tote', fill: '#3E5F86', detail: 'M60 120 H140', from: 'Old jeans', fromShape: 'jeans', fromFill: '#3E5F86', recipe: 'Sewing', time: '2 h' },
  { name: 'Wrap skirt', shape: 'skirt', fill: '#B9A6D9', detail: 'M100 40 L120 170', from: 'Linen shirt', fromShape: 'shirt', fromFill: '#B9A6D9', recipe: 'Sewing', time: '1.5 h' },
  { name: 'Patchwork scarf', shape: 'scarf', fill: '#D4A72C', detail: 'M44 80 H86 M114 80 H156 M44 120 H86 M114 120 H156', from: 'Three old tees', fromShape: 'tee', fromFill: '#D4A72C', recipe: 'Sewing', time: '1 h' },
  { name: 'Cropped jacket', shape: 'jacket', fill: '#4A4F57', detail: 'M100 32 V150', from: 'Long blazer', fromShape: 'blazer', fromFill: '#4A4F57', recipe: 'Sewing', time: '2 h' },
  { name: 'Cut-off shorts', shape: 'shorts', fill: '#C9A27E', detail: 'M58 62 H142', from: 'Worn chinos', fromShape: 'chinos', fromFill: '#C9A27E', recipe: 'No sew', time: '15 min' },
  { name: 'Apron dress', shape: 'apron', fill: '#9DB5A0', detail: 'M76 100 H124', from: 'Oversized shirt', fromShape: 'shirt', fromFill: '#9DB5A0', recipe: 'Sewing', time: '2.5 h' },
  { name: 'Bucket hat', shape: 'hat', fill: '#5C7487', detail: 'M60 104 Q100 114 140 104', from: 'Denim jacket', fromShape: 'jacket', fromFill: '#5C7487', recipe: 'Sewing', time: '1.5 h' },
  { name: 'Racer tank', shape: 'tank', fill: '#B5651D', detail: 'M70 110 H130', from: 'Faded tee', fromShape: 'tee', fromFill: '#B5651D', recipe: 'No sew', time: '10 min' },
];

export const SECOND_LIVES: SecondLife[] = RAW.map((r) => ({
  name: r.name, d: SHAPES[r.shape], fill: r.fill, detail: r.detail,
  from: r.from, fromD: SHAPES[r.fromShape], fromFill: r.fromFill, recipe: r.recipe, time: r.time,
}));

/** Position of item i on an n-item ring rotated to rot. x and y are percentages inside the stage. */
export function ringPose(i: number, rot: number, n: number) {
  const k = (((i - rot) % n) + n) % n;
  const a = ((90 + (k * 360) / n) * Math.PI) / 180;
  const depth = (Math.sin(a) + 1) / 2;
  return {
    x: 50 + 38 * Math.cos(a),
    y: 50 + 30 * Math.sin(a),
    scale: 0.62 + 0.38 * depth,
    z: Math.round(depth * 30),
    opacity: 0.55 + 0.45 * depth,
  };
}
