export type Garment = {
  id: string;
  category: 'clothing' | 'accessory';
  status: 'active' | 'transformed';
  isUpcycled: boolean;
  tags: string[];
  name: string;
  cutoutPath: string;
  imageKind: 'photo' | 'concept';
};

export type StyleProfile = {
  styles: string[];
  avoidColors: string[];
  occasions: string[];
  climate: string;
};

/** Used until onboarding exists (Tier 3). */
export const DEFAULT_STYLE_PROFILE: StyleProfile = {
  styles: [],
  avoidColors: [],
  occasions: ['everyday'],
  climate: 'temperate',
};
