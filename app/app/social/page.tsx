import SocialPanel from '@/components/modules/social-panel';

export const metadata = { title: 'Social & Trending' };

export default function SocialPage() {
  // Client-fetched: the rails hit ~20 external feeds plus YouTube, which is
  // too slow to block a server render on.
  return <SocialPanel />;
}
