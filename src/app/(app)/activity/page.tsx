import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { listActivity } from '@/actions/activity';
import { listLogins } from '@/actions/team';
import { OwnerOnlyNotice } from '@/components/current-user';
import { APP_NAME } from '@/lib/brand';
import { ActivityClient } from './activity-client';

export const metadata: Metadata = { title: `Activity log — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

// Passed down rather than duplicated in the client, so the server-rendered
// first page and every later client fetch always agree on the page size.
const PAGE_SIZE = 25;

export default async function ActivityPage() {
  const me = await requireUser().catch(() => null);
  if (!me) redirect('/login');
  if (me.role !== 'OWNER') {
    return <OwnerOnlyNotice title="Activity log" message="Only the owner can see the activity log. Ask the owner if you need to check who changed something." />;
  }

  const [initial, team] = await Promise.all([listActivity({ page: 1, pageSize: PAGE_SIZE }), listLogins()]);
  return <ActivityClient initialData={initial} people={team.users ?? []} pageSize={PAGE_SIZE} />;
}
