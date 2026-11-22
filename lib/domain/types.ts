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

export type KbEntry = {
  id: string;
  kind: 'history' | 'redesign' | 'fabric';
  title: string;
  body: string;
  tags: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  tools?: string[];
  steps?: string[];
  sources?: { citation: string; url: string; accessed: string }[];
  status: 'draft' | 'reviewed';
};

/** User-confirmed values from Corrections. */
export type Confirmed = {
  fabric?: string;
  garmentType?: string;
  namedStyles: string[];
  /** Styles the user said "no" to: never produce history, never asked again. */
  rejectedStyles?: string[];
};

export type MatchResult = {
  history: KbEntry[];
  recipes: KbEntry[];
  fabricNotes: KbEntry[];
  freeRecipeId: string | null;
  styleQuestions: { style: string; confidence: number }[];
};
