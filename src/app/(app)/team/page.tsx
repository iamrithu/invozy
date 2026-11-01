import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { listLogins } from '@/actions/team';
import { OwnerOnlyNotice } from '@/components/current-user';
import { APP_NAME } from '@/lib/brand';
import { TeamClient } from './team-client';

export const metadata: Metadata = { title: `Team — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const me = await requireUser().catch(() => null);
  if (!me) redirect('/login');
  if (me.role !== 'OWNER') {
    return <OwnerOnlyNotice title="Team" message="Only the owner can manage logins. Ask the owner to add someone or reset a password." />;
  }

  const { users, error } = await listLogins();
  if (error) throw new Error(error);
  return <TeamClient initialUsers={users ?? []} />;
}
