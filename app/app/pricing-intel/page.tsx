import { redirect } from 'next/navigation';

/**
 * Moved into the Intelligence hub as a tab. Kept as a redirect rather than
 * deleted: bookmarks and any link already in the wild should land somewhere
 * useful instead of a 404.
 */
export default function Moved() {
  redirect('/app/intelligence?tab=pricing');
}
