/** All user-facing error copy in one place. */
export const MESSAGES = {
  notAGarment: "We couldn't find a garment in this photo. Try another.",
  aiBusy: 'Our stylist is busy right now. Please try again in a moment.',
  dailyCap: "You've reached today's scan limit. Come back tomorrow.",
  uploadFailed: 'Something went wrong uploading your photo. Please try again.',
  unsupportedFormat: "This photo format isn't supported. Try a JPG or PNG.",
} as const;

/** Map an API error code (see SCAN_ERRORS) to copy; unknown codes fall back to the generic upload message. */
export function messageForError(code: string | null | undefined): string {
  switch (code) {
    case 'not_a_garment':
      return MESSAGES.notAGarment;
    case 'ai_busy':
      return MESSAGES.aiBusy;
    case 'daily_cap':
      return MESSAGES.dailyCap;
    case 'unsupported_format':
      return MESSAGES.unsupportedFormat;
    case 'image_not_found':
    case 'server_error':
    default:
      return MESSAGES.uploadFailed;
  }
}
