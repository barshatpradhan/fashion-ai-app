/** Fixed vocabulary: scan tags and knowledge-base entry tags must line up. */
export const NAMED_STYLES = [
  'breton-stripe',
  'paisley',
  'kimono-sleeve',
  'aloha-print',
  'tartan',
  'ikat',
  'houndstooth',
  'peter-pan-collar',
] as const satisfies readonly string[];

export const FABRICS = [
  'cotton', 'linen', 'silk', 'wool', 'denim', 'polyester', 'polyester blend',
  'nylon', 'rayon', 'viscose', 'chiffon', 'satin', 'cashmere', 'leather',
  'knit', 'velvet', 'corduroy', 'fleece', 'jersey', 'tweed',
] as const satisfies readonly string[];

const GARMENT_TYPES = [
  'shirt', 'button-down', 't-shirt', 'blouse', 'sweater', 'cardigan', 'hoodie',
  'tank-top', 'jacket', 'blazer', 'coat', 'vest', 'dress', 'skirt', 'pants',
  'jeans', 'shorts', 'jumpsuit', 'scarf', 'bag', 'belt', 'hat',
] as const;

const PATTERNS = ['stripes', 'checks', 'plaid', 'floral', 'solid', 'polka-dot', 'graphic', 'animal-print'] as const;

const FITS = ['oversized', 'slim', 'relaxed', 'cropped', 'fitted', 'wide-leg'] as const;

const DETAILS = [
  'collar', 'point-collar', 'mandarin-collar', 'long-sleeve', 'short-sleeve',
  'sleeveless', 'buttons', 'zipper', 'pockets', 'pleats', 'ruffles', 'embroidery',
] as const;

export const GENERIC_TAGS: readonly string[] = [
  ...GARMENT_TYPES, ...FABRICS, ...PATTERNS, ...FITS, ...DETAILS,
];
