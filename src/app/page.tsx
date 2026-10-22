import { redirect } from 'next/navigation';
import { auth } from '@/auth';

/** No public landing page — this deployment serves one company, so the root
 * URL goes straight to the app (or the login screen). */
export default async function RootPage() {
  const session = await auth();
  redirect(session?.user?.id ? '/dashboard' : '/login');
}
