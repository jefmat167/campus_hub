import * as crypto from 'crypto';

/**
 * Generates a deterministic anonymous ID for a user within a specific context (post thread).
 * The same user will always get the same anonymous ID within the same thread,
 * but different anonymous IDs in different threads.
 *
 * Format: "Anon-XXXX" where XXXX is a 4-character alphanumeric string
 */
export function generateAnonymousId(
  userId: string,
  contextId: string, // postId for comments, or universityId+timestamp for posts
  secret: string,
): string {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(`${userId}:${contextId}`)
    .digest('hex');

  // Take first 4 characters and convert to alphanumeric
  const shortHash = hash.substring(0, 4).toUpperCase();

  return `Anon-${shortHash}`;
}

/**
 * Generates a unique context ID for a new post.
 * This ensures each post thread has unique anonymous IDs.
 */
export function generatePostContextId(
  universityId: string,
  timestamp: number = Date.now(),
): string {
  return `${universityId}:${timestamp}:${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Array of fun anonymous names for variety (optional alternative to Anon-XXXX)
 */
export const ANONYMOUS_NAMES = [
  'Anonymous Antelope',
  'Anonymous Badger',
  'Anonymous Capybara',
  'Anonymous Dolphin',
  'Anonymous Eagle',
  'Anonymous Fox',
  'Anonymous Giraffe',
  'Anonymous Hedgehog',
  'Anonymous Iguana',
  'Anonymous Jaguar',
  'Anonymous Koala',
  'Anonymous Lemur',
  'Anonymous Mongoose',
  'Anonymous Narwhal',
  'Anonymous Otter',
  'Anonymous Penguin',
  'Anonymous Quokka',
  'Anonymous Raccoon',
  'Anonymous Sloth',
  'Anonymous Tiger',
  'Anonymous Unicorn',
  'Anonymous Vulture',
  'Anonymous Walrus',
  'Anonymous Xerus',
  'Anonymous Yak',
  'Anonymous Zebra',
];

/**
 * Generates a fun anonymous name for a user within a context.
 * Same user + context = same name
 */
export function generateAnonymousName(
  userId: string,
  contextId: string,
  secret: string,
): string {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(`${userId}:${contextId}`)
    .digest('hex');

  // Use hash to deterministically select a name
  const index = parseInt(hash.substring(0, 8), 16) % ANONYMOUS_NAMES.length;

  // Add a number suffix for uniqueness within same name
  const suffix = parseInt(hash.substring(8, 12), 16) % 1000;

  return `${ANONYMOUS_NAMES[index]} #${suffix}`;
}

/**
 * Check if the user is the original poster (OP) based on anonymous ID match
 */
export function isOriginalPoster(
  currentAnonymousId: string,
  originalPosterAnonymousId: string,
): boolean {
  return currentAnonymousId === originalPosterAnonymousId;
}
