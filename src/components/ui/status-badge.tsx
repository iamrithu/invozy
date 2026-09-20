import { Badge, type BadgeProps } from '@/components/ui/badge';

const VARIANTS: Record<string, BadgeProps['variant']> = {
  DRAFT: 'default',
  SENT: 'gold',
  PARTIALLY_PAID: 'gold',
  PAID: 'green',
};

const LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
};

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={VARIANTS[status] ?? 'default'}>{LABELS[status] ?? status}</Badge>
      {overdue && <Badge variant="red">Overdue</Badge>}
    </span>
  );
}
