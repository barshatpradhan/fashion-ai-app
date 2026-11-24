/** All user-facing error copy in one place. */
export const MESSAGES = {
  notAGarment: "We couldn't find a garment in this photo. Try another.",
  photoUnclear: 'This photo is too blurry or dark to read. Retake it in good light and hold the camera steady.',
  photoTooLarge: 'This photo is too large (over 25 MB). Try a smaller one.',
  aiBusy: 'Our stylist is busy right now. Please try again in a moment.',
  dailyCap: "You've reached today's scan limit. Come back tomorrow.",
  uploadFailed: 'Something went wrong uploading your photo. Please try again.',
  unsupportedFormat: "This photo format isn't supported. Try a JPG or PNG.",
  guideNotFound: 'This guide changed after your edit — go back to the result.',
  notFound: "We couldn't find that piece any more. Go back and try again.",
  premiumRequired: 'This is part of Premium. Upgrade to open it.',
  noUploads: "You're out of uploads for now. A new one arrives soon.",
  noLooks: "You're out of looks for now. A new one arrives soon.",
  tryAgain: 'Please try again.',
  invalidStyle: 'That question has changed. Go back to your result and answer the current one.',
  alreadySaved: 'This piece is already in your closet.',
  notActive: 'This piece has already been transformed.',
  scanInUse: 'This scan is still used by a piece in your closet.',
  unauthorized: 'Your session ended. Reload the page to continue.',
} as const;

/**
 * Map an API error code to copy. `context` refines codes whose meaning depends on the screen
 * (a guide's not_found means its Recipe no longer matches after an edit). Unknown codes, server
 * errors and missing images fall back to the generic upload message.
 */
export function messageForError(code: string | null | undefined, context?: 'guide'): string {
  switch (code) {
    case 'not_a_garment':
      return MESSAGES.notAGarment;
    case 'photo_unclear':
      return MESSAGES.photoUnclear;
    case 'ai_busy':
      return MESSAGES.aiBusy;
    case 'daily_cap':
      return MESSAGES.dailyCap;
    case 'unsupported_format':
      return MESSAGES.unsupportedFormat;
    case 'not_found':
      return context === 'guide' ? MESSAGES.guideNotFound : MESSAGES.notFound;
    case 'premium_required':
      return MESSAGES.premiumRequired;
    case 'no_uploads':
      return MESSAGES.noUploads;
    case 'no_looks':
      return MESSAGES.noLooks;
    case 'concurrent_spend':
      return MESSAGES.tryAgain;
    case 'invalid_style':
      return MESSAGES.invalidStyle;
    case 'already_saved':
      return MESSAGES.alreadySaved;
    case 'not_active':
      return MESSAGES.notActive;
    case 'scan_in_use':
      return MESSAGES.scanInUse;
    case 'unauthorized':
      return MESSAGES.unauthorized;
    case 'image_not_found':
    case 'server_error':
    default:
      return MESSAGES.uploadFailed;
  }
}
