'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PdfDownloadButton } from '@/components/print/pdf-download-button';
import { pdfFileName } from '@/components/print/format';
import { useCurrentUser } from '@/components/current-user';
import { useDeleteCreditNote } from '@/hooks/use-credit-notes';
import { DeleteCreditNoteDialog } from './delete-credit-note-dialog';

/** The credit note page's toolbar: Download PDF, and Delete for the owner. */
export function CreditNoteActions({
  id,
  number,
  invoiceNumber,
  applied,
  restock,
}: {
  id: string;
  number: string;
  invoiceNumber: string | null;
  applied: number;
  restock: boolean;
}) {
  const router = useRouter();
  const { isOwner } = useCurrentUser();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteNote = useDeleteCreditNote();

  async function handleDelete() {
    try {
      await deleteNote.mutateAsync(id);
      toast.success(`Credit note ${number} deleted`);
      setConfirmOpen(false);
      router.push('/credit-notes');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not delete this credit note');
      setConfirmOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <PdfDownloadButton href={`/api/pdf/credit-notes/${id}`} fileName={pdfFileName(number)} />
      {isOwner && (
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmOpen(true)} className="border-red-soft text-red hover:bg-red-soft">
          <Trash2 size={13} /> Delete
        </Button>
      )}
      <DeleteCreditNoteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        number={number}
        invoiceNumber={invoiceNumber}
        applied={applied}
        restock={restock}
        pending={deleteNote.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
