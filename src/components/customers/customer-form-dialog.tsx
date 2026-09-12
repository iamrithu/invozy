'use client';

import { useState } from 'react';
import { Users, Contact, Phone, Mail, IdCard, CalendarClock, IndianRupee, Home, Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFormContent, DialogFormHeader, DialogFormIcon, DialogFormBody, DialogFormFooter } from '@/components/ui/dialog';
import { StateSelect, DistrictSelect } from '@/components/ui/location-field';
import { useCreateCustomer, useUpdateCustomer } from '@/hooks/use-customers';

const TERMS = ['Due on receipt', 'Net 7', 'Net 15', 'Net 30'];

type Customer = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  state: string;
  district?: string | null;
  gstin: string | null;
  address: string | null;
  terms: string;
  creditLimit: string | number;
  guest: boolean;
};

export function CustomerFormDialog({
  open,
  onOpenChange,
  mode,
  customer,
  prefillName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  customer?: Customer;
  prefillName?: string;
  onSaved?: (id: string) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedState, setSelectedState] = useState(customer?.state ?? 'Tamil Nadu');
  const [selectedDistrict, setSelectedDistrict] = useState(customer?.district ?? '');
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer(customer?.id ?? '');
  const pending = createCustomer.isPending || updateCustomer.isPending;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(undefined);
    setFieldErrors({});
    const result = mode === 'create' ? await createCustomer.mutateAsync({ guest: false, formData }) : await updateCustomer.mutateAsync(formData);
    if (result.error) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    toast.success(mode === 'create' ? 'Customer added' : 'Changes saved');
    onOpenChange(false);
    onSaved?.(customer?.id ?? result.id ?? '');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogFormContent>
        <form onSubmit={handleSubmit} className="contents">
          <DialogFormHeader>
            <DialogFormIcon>{mode === 'create' ? <Sparkles size={16} /> : <Users size={16} />}</DialogFormIcon>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-extrabold text-ink">{mode === 'create' ? 'New customer' : customer?.name}</div>
              <div className="text-[11.5px] text-ink-faint">{mode === 'create' ? 'Add a customer to bill' : 'Edit customer details'}</div>
            </div>
          </DialogFormHeader>

          <DialogFormBody>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" name="name" icon={Users} defaultValue={customer?.name} placeholder={prefillName} error={fieldErrors.name} />
              <Field label="Contact person" name="contact" icon={Contact} defaultValue={customer?.contact ?? ''} />
              <Field label="Phone" name="phone" icon={Phone} defaultValue={customer?.phone ?? ''} />
              <Field label="Email" name="email" icon={Mail} defaultValue={customer?.email ?? ''} error={fieldErrors.email} />
              <StateSelect
                name="state"
                value={selectedState}
                onChange={(v) => {
                  setSelectedState(v);
                  setSelectedDistrict('');
                }}
                error={fieldErrors.state}
              />
              <DistrictSelect name="district" state={selectedState} value={selectedDistrict} onChange={setSelectedDistrict} />
              <Field label="GSTIN (optional)" name="gstin" icon={IdCard} defaultValue={customer?.gstin ?? ''} mono />
              <Field
                label="Payment terms"
                name="terms"
                as="select"
                icon={CalendarClock}
                defaultValue={customer?.terms ?? 'Due on receipt'}
                options={TERMS.map((t) => ({ value: t }))}
              />
              <Field label="Credit limit (₹)" name="creditLimit" type="number" icon={IndianRupee} mono defaultValue={customer?.creditLimit?.toString() ?? '0'} />
              <div className="col-span-2">
                <Field label="Billing address" name="address" as="textarea" icon={Home} defaultValue={customer?.address ?? ''} />
              </div>
            </div>
            {error && <p className="mt-3 text-[12.5px] font-bold text-destructive">{error}</p>}
          </DialogFormBody>

          <DialogFormFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              <Check size={13} /> {pending ? 'Saving…' : mode === 'create' ? 'Add customer' : 'Save changes'}
            </Button>
          </DialogFormFooter>
        </form>
      </DialogFormContent>
    </Dialog>
  );
}
