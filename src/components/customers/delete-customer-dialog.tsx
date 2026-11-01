'use client';

import { useEffect, useState } from 'react';
import { Power, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDeleteCustomer, useToggleCustomerActive, type CustomerDeleteError } from '@/hooks/use-customers';
import { customerDisplayName } from '@/lib/customer';

export type DeleteCustomerTarget = {
  id: string;
  name: string;
  shopName?: string | null;
  active: boolean;
  images?: string[];
  /** From the list row — when known and > 0, the dialog opens straight
   * into its "can't be deleted, disable instead" form. */
  invoiceCount?: number;
};

type Blocked = { message: string; canDisable: boolean };

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Safe delete for customers. One with invoices on file can't be deleted
 * (GST records must keep them), so instead of a dead-end error the same
 * dialog turns into "Disable customer" — they leave Bill To and the active
 * list, history intact. If the server refuses a delete the list didn't see
 * coming (an invoice raced in), the dialog swaps the same way; any other
 * failure closes it with the reason in a toast. */
export function DeleteCustomerDialog({
  customer,
  onOpenChange,
  onDeleted,
}: {
  customer: DeleteCustomerTarget | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (id: string) => void;
}) {
  const deleteCustomer = useDeleteCustomer();
  const toggleActive = useToggleCustomerActive();
  const [serverBlocked, setServerBlocked] = useState<Blocked | null>(null);

  useEffect(() => setServerBlocked(null), [customer?.id]);

  const name = customer ? customerDisplayName(customer) : '';
  const invoices = customer?.invoiceCount ?? 0;
  const knownBlocked: Blocked | null =
    customer && invoices > 0
      ? {
          message: customer.active
            ? `This customer has ${plural(invoices, 'invoice')} on file, and GST records must keep them. Disable the customer instead: they'll disappear from Bill To and the active list, and you can turn them back on any time.`
            : `This customer has ${plural(invoices, 'invoice')} on file, and GST records must keep them. They're already disabled, so they won't appear in Bill To.`,
          canDisable: customer.active,
        }
      : null;
  const blocked = serverBlocked ?? knownBlocked;

  async function handleDelete() {
    if (!customer) return;
    try {
      await deleteCustomer.mutateAsync(customer.id);
      toast.success(`${name} deleted`);
      onDeleted?.(customer.id);
      onOpenChange(false);
    } catch (e) {
      const err = e as CustomerDeleteError;
      if (err.canDisable) {
        setServerBlocked({ message: err.message, canDisable: true });
        return;
      }
      toast.error(err.message);
      onOpenChange(false);
    }
  }

  async function handleDisable() {
    if (!customer) return;
    try {
      await toggleActive.mutateAsync({ id: customer.id, active: false });
      toast.success(`${name} disabled. They won't show in Bill To.`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      onOpenChange(false);
    }
  }

  const photos = customer?.images?.length ?? 0;

  if (blocked) {
    return (
      <ConfirmDialog
        open={customer !== null}
        onOpenChange={onOpenChange}
        title={`${name} can't be deleted`}
        description={blocked.message}
        destructive={false}
        icon={Power}
        confirmIcon={blocked.canDisable ? Power : undefined}
        confirmLabel={blocked.canDisable ? 'Disable customer' : 'OK'}
        pending={toggleActive.isPending}
        onConfirm={blocked.canDisable ? handleDisable : () => onOpenChange(false)}
      />
    );
  }

  return (
    <ConfirmDialog
      open={customer !== null}
      onOpenChange={onOpenChange}
      title={`Delete ${name}?`}
      description={
        customer?.invoiceCount === 0
          ? `No invoices are linked to this customer, so they${photos ? ` and their ${plural(photos, 'photo')}` : ''} will be removed permanently.`
          : `${name}${photos ? ` and their ${plural(photos, 'photo')}` : ''} will be removed permanently.`
      }
      icon={Trash2}
      confirmIcon={Trash2}
      confirmLabel="Delete customer"
      pending={deleteCustomer.isPending}
      onConfirm={handleDelete}
    />
  );
}
