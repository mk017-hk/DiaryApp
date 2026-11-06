/**
 * An icon for each word in the emotion vocabulary, for the log's mood row.
 *
 * Faces where a face is honest and an object where it is not — there is no
 * face for "nostalgic" that does not look like a cartoon. Unknown slugs (a word
 * added to the vocabulary server-side later) fall back to a plain circle.
 */
const ICONS: Record<string, string> = {
  happy: 'emoticon-happy-outline',
  loved: 'heart-outline',
  grateful: 'hand-heart-outline',
  excited: 'party-popper',
  calm: 'emoticon-outline',
  peaceful: 'leaf',
  confident: 'arm-flex-outline',
  nostalgic: 'image-filter-vintage',
  sad: 'emoticon-sad-outline',
  lonely: 'account-outline',
  overwhelmed: 'weather-lightning-rainy',
  anxious: 'emoticon-confused-outline',
  angry: 'emoticon-angry-outline',
};

export function moodIcon(slug: string): string {
  return ICONS[slug] ?? 'circle-outline';
}
