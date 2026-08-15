import LoginForm from '@/components/chrome/login-form';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

/**
 * The gate.
 *
 * Deliberately outside /app: the app layout renders navigation to eight
 * destinations the visitor cannot reach, and a nav bar above a password field
 * both looks broken and tells an unauthenticated visitor the shape of what is
 * behind it.
 *
 * ⚠️ IT REPORTS ITS OWN MISCONFIGURATION. When APP_PASSWORD is unset the whole
 * deployment refuses every request, and a login form that silently rejects a
 * correct password is indistinguishable from a wrong one. That message is safe
 * HERE because reaching this page means you already have the URL — and the
 * login ENDPOINT still gives a probe the identical answer either way.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return <LoginForm configured={Boolean(process.env.APP_PASSWORD)} nextParam={searchParams} />;
}
