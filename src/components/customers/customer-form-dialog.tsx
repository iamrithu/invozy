'use client';

import { useState } from 'react';
import { Power, Sparkles, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { AffixInput, FormField, FormGrid, FormSection, FormSheet, Initials, Segmented, Tag, invalidClass, selectClass, submitIntent, type FormValues } from '@/components/ui/form-sheet';
import { GstinStatus, STATE_NAMES, checkGstin, districtsFor } from '@/components/ui/location-field';
import { ImagesField, type PendingImages } from '@/components/products/product-images-field';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { useCreateCustomer, useCustomerRoutes, useUpdateCustomer } from '@/hooks/use-customers';

const TERMS = ['Due on receipt', 'Net 7', 'Net 15', 'Net 30'];
const TERM_LABEL: Record<string, string> = { 'Due on receipt': 'On receipt', 'Net 7': '7 days', 'Net 15': '15 days', 'Net 30': '30 days' };
const MAX_PHOTOS = 6;

export type CustomerFormCustomer = {
  id: string;
  name: string;
  shopName?: string | null;
  contact?: string | null;
  phone?: string | null;
  altPhone?: string | null;
  email?: string | null;
  state: string;
  district?: string | null;
  gstin?: string | null;
  address?: string | null;
  terms?: string;
  creditLimit?: string | number;
  guest?: boolean;
  fssaiNo?: string | null;
  pincode?: string | null;
  // Undefined when the caller never loaded them (e.g. a customer object the
  // invoice builder assembled itself) — the form then leaves them alone
  // instead of saving them as blank.
  active?: boolean;
  images?: string[];
  route?: string | null;
};

// Which section each server-side field error belongs to, and its label in
// the footer's "to fix" summary.
const FIELDS: Record<string, { section: string; label: string }> = {
  name: { section: 'contact', label: 'Name' },
  shopName: { section: 'contact', label: 'Shop name' },
  contact: { section: 'contact', label: 'Contact person' },
  phone: { section: 'contact', label: 'Phone' },
  altPhone: { section: 'contact', label: 'Alt. phone' },
  email: { section: 'contact', label: 'Email' },
  address: { section: 'address', label: 'Address' },
  state: { section: 'address', label: 'State' },
  district: { section: 'address', label: 'District' },
  pincode: { section: 'address', label: 'Pincode' },
  route: { section: 'address', label: 'Route' },
  gstin: { section: 'gst', label: 'GSTIN' },
  fssaiNo: { section: 'gst', label: 'FSSAI No.' },
  terms: { section: 'gst', label: 'Payment terms' },
  creditLimit: { section: 'gst', label: 'Credit limit' },
};

export function CustomerFormDialog({
  open,
  onOpenChange,
  mode,
  customer,
  prefillName,
  onSaved,
  addAnother = !onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  customer?: CustomerFormCustomer;
  prefillName?: string;
  onSaved?: (customer: CustomerFormCustomer) => void;
  /** Show "Save & add another" (create only). A save that way skips onSaved. */
  addAnother?: boolean;
}) {
  const [formKey, setFormKey] = useState(0);
  const [values, setValues] = useState<FormValues>({});
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | string[]>>({});
  const [selectedState, setSelectedState] = useState(customer?.state ?? 'Tamil Nadu');
  const [selectedDistrict, setSelectedDistrict] = useState(customer?.district ?? '');
  const [gstin, setGstin] = useState(customer?.gstin ?? '');
  const [terms, setTerms] = useState(customer?.terms ?? 'Due on receipt');
  const [route, setRoute] = useState(customer?.route ?? '');
  const [active, setActive] = useState(customer?.active ?? true);
  const [images, setImages] = useState<PendingImages>({ existing: customer?.images ?? [], files: [] });
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer(customer?.id ?? '');
  const { data: routes = [] } = useCustomerRoutes();
  const pending = createCustomer.isPending || updateCustomer.isPending;

  const imagesKnown = mode === 'create' || Array.isArray(customer?.images);
  const routeKnown = mode === 'create' || customer?.route !== undefined;
  const activeKnown = mode === 'edit' && typeof customer?.active === 'boolean';
  const termOptions = TERMS.includes(terms) ? TERMS : [terms, ...TERMS];

  const fe = (k: string) => {
    const v = fieldErrors[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const issuesIn = (section: string) => Object.keys(fieldErrors).filter((k) => FIELDS[k]?.section === section).length;

  function resetForCreate() {
    setSelectedState('Tamil Nadu');
    setSelectedDistrict('');
    setGstin('');
    setTerms('Due on receipt');
    setRoute('');
    setImages({ existing: [], files: [] });
    setFieldErrors({});
    setError(undefined);
    setFormKey((k) => k + 1);
  }

  function onGstinChange(next: string) {
    setGstin(next);
    // A complete GSTIN names the customer's state — fill it in, since the
    // state is what decides CGST+SGST vs IGST on their bills.
    const { valid, state } = checkGstin(next);
    if (valid && state && state !== selectedState) {
      setSelectedState(state);
      setSelectedDistrict('');
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const intent = submitIntent(e);
    const formData = new FormData(e.currentTarget);
    if (imagesKnown) {
      formData.set('imagesManaged', '1');
      images.existing.forEach((url) => formData.append('images', url));
      images.files.forEach((file) => formData.append('newImages', file));
    }
    if (activeKnown) formData.set('active', String(active));
    setError(undefined);
    setFieldErrors({});
    const result = mode === 'create' ? await createCustomer.mutateAsync({ guest: false, formData }) : await updateCustomer.mutateAsync(formData);
    if (result.error) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    const name = String(formData.get('name') ?? '');
    toast.success(mode === 'create' ? `Added ${name}` : activeKnown && active !== customer?.active ? (active ? 'Saved and enabled' : 'Saved and disabled') : 'Changes saved');
    if (mode === 'create' && intent === 'another') {
      resetForCreate();
      return;
    }
    onOpenChange(false);
    if (mode === 'create') resetForCreate();
    onSaved?.(
      result.customer ?? {
        id: customer?.id ?? result.id ?? '',
        name,
        shopName: (formData.get('shopName') as string) || null,
        contact: (formData.get('contact') as string) || null,
        phone: (formData.get('phone') as string) || null,
        altPhone: (formData.get('altPhone') as string) || null,
        email: (formData.get('email') as string) || null,
        state: selectedState,
        district: selectedDistrict || null,
        gstin: (formData.get('gstin') as string) || null,
        address: (formData.get('address') as string) || null,
        terms: (formData.get('terms') as string) || 'Due on receipt',
        creditLimit: (formData.get('creditLimit') as string) || '0',
        guest: customer?.guest ?? false,
        fssaiNo: (formData.get('fssaiNo') as string) || null,
        pincode: (formData.get('pincode') as string) || null,
      }
    );
  }

  const name = values.name?.trim() ?? '';
  const shop = values.shopName?.trim() ?? '';
  const gst = checkGstin(gstin);
  const limit = Number(values.creditLimit) || 0;
  const photoCount = images.existing.length + images.files.length;

  const sections = [
    { id: 'contact', label: 'Contact', done: !!name && !issuesIn('contact'), issues: issuesIn('contact') },
    { id: 'address', label: 'Address & route', done: !!selectedState && !!values.address?.trim() && !issuesIn('address'), issues: issuesIn('address') },
    { id: 'gst', label: 'GST & billing', done: (!gstin.trim() || gst.valid) && !issuesIn('gst'), issues: issuesIn('gst') },
    ...(imagesKnown ? [{ id: 'photos', label: 'Photos', done: photoCount > 0 }] : []),
  ];

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      icon={mode === 'create' ? <Sparkles size={18} /> : <Users size={18} />}
      title={mode === 'create' ? 'New customer' : 'Edit customer'}
      subtitle={mode === 'create' ? 'Customers · someone you bill' : `Customers · ${customer?.shopName || customer?.name}`}
      headerAside={
        activeKnown && (
          <label className="flex flex-shrink-0 cursor-pointer items-center gap-2" title="Disabled customers don't show in Bill To">
            <Power size={13} className={active ? 'text-green' : 'text-ink-faint'} />
            <span className={cn('hidden text-[12px] font-semibold sm:inline', active ? 'text-green' : 'text-ink-faint')}>{active ? 'Active' : 'Disabled'}</span>
            <Switch checked={active} onChange={(e) => setActive(e.target.checked)} aria-label="Customer active" />
          </label>
        )
      }
      formKey={formKey}
      onValues={setValues}
      onSubmit={handleSubmit}
      sections={sections}
      preview={{
        caption: 'how it shows in Bill to',
        content: (
          <div className="flex gap-3">
            <Initials name={shop || name || '?'} className="bg-gold-soft text-ink" />
            <div className="min-w-0">
              <div className={cn('truncate text-[14px] font-bold', shop || name ? 'text-ink' : 'text-ink-faint')}>{shop || name || 'Customer name'}</div>
              <div className="mt-0.5 truncate text-[12px] text-ink-soft">
                {[shop && name !== shop ? name : null, values.contact?.trim(), values.phone?.trim(), [selectedDistrict, selectedState].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {gst.valid ? <Tag tone="green">GST registered</Tag> : <Tag>Unregistered</Tag>}
                <Tag>{TERM_LABEL[terms] ?? terms}</Tag>
                {route.trim() && <Tag tone="gold">{route.trim()}</Tag>}
                {limit > 0 && <Tag>Limit {fmtInr(limit)}</Tag>}
              </div>
            </div>
          </div>
        ),
      }}
      submitLabel={mode === 'create' ? 'Save customer' : 'Save changes'}
      pending={pending}
      addAnother={mode === 'create' && addAnother}
      issues={Object.keys(fieldErrors).map((k) => FIELDS[k]?.label ?? k)}
      error={error}
    >
      <FormSection id="contact" n={1} title="Contact" aside="Only the name is required" done={sections[0].done}>
        <FormGrid>
          <FormField label="Name" required htmlFor="cust-name" span={3} error={fe('name')}>
            <Input id="cust-name" name="name" defaultValue={customer?.name} placeholder={prefillName || 'Person or business'} className={cn(fe('name') && invalidClass)} autoComplete="off" />
          </FormField>
          <FormField label="Shop name" optional htmlFor="cust-shop" span={3} help="Printed on bills when filled.">
            <Input id="cust-shop" name="shopName" defaultValue={customer?.shopName ?? ''} placeholder="If different from the name" autoComplete="off" />
          </FormField>
          <FormField label="Contact person" optional htmlFor="cust-contact" span={3}>
            <Input id="cust-contact" name="contact" defaultValue={customer?.contact ?? ''} autoComplete="off" />
          </FormField>
          <FormField label="Email" optional htmlFor="cust-email" span={3} error={fe('email')}>
            <Input id="cust-email" name="email" type="email" inputMode="email" defaultValue={customer?.email ?? ''} placeholder="name@shop.com" className={cn(fe('email') && invalidClass)} />
          </FormField>
          <FormField label="Phone" optional htmlFor="cust-phone" span={3} error={fe('phone')}>
            <Input id="cust-phone" name="phone" type="tel" inputMode="tel" defaultValue={customer?.phone ?? ''} placeholder="98400 12345" className={cn('font-mono', fe('phone') && invalidClass)} />
          </FormField>
          <FormField label="Alt. phone" optional htmlFor="cust-alt" span={3}>
            <Input id="cust-alt" name="altPhone" type="tel" inputMode="tel" defaultValue={customer?.altPhone ?? ''} className="font-mono" />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection id="address" n={2} title="Address & route" aside="State decides the GST type" done={sections[1].done}>
        <FormGrid>
          <FormField label="Billing address" htmlFor="cust-address" span={6}>
            <Textarea id="cust-address" name="address" rows={2} defaultValue={customer?.address ?? ''} placeholder="Door no., street, area, city" className="min-h-[64px] resize-none" />
          </FormField>
          <FormField label="State" required htmlFor="cust-state" span={2} half error={fe('state')} help={gst.valid && gst.state === selectedState ? 'Filled from the GSTIN.' : undefined}>
            <select
              id="cust-state"
              name="state"
              value={selectedState}
              onChange={(e) => {
                setSelectedState(e.target.value);
                setSelectedDistrict('');
              }}
              className={cn(selectClass, fe('state') && invalidClass)}
            >
              {STATE_NAMES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="District" optional htmlFor="cust-district" span={2} half>
            <select id="cust-district" name="district" value={selectedDistrict} onChange={(e) => setSelectedDistrict(e.target.value)} disabled={!selectedState} className={selectClass}>
              <option value="">—</option>
              {districtsFor(selectedState).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Pincode" optional htmlFor="cust-pin" span={2} half>
            <Input id="cust-pin" name="pincode" inputMode="numeric" maxLength={6} defaultValue={customer?.pincode ?? ''} placeholder="600001" className="font-mono" />
          </FormField>
          {routeKnown && (
            <FormField label="Delivery route" optional htmlFor="cust-route" span={6} help="Groups customers on the loading sheet.">
              <Input id="cust-route" name="route" list="customer-route-options" value={route} onChange={(e) => setRoute(e.target.value)} placeholder="e.g. Ennore line" autoComplete="off" />
              <datalist id="customer-route-options">
                {routes.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              {routes.length > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  {routes.slice(0, 8).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRoute(route === r ? '' : r)}
                      className={cn(
                        'h-8 flex-shrink-0 rounded-sm2 border px-2.5 text-[12.5px] font-semibold transition-colors sm:h-6 sm:px-2 sm:text-[11.5px]',
                        route === r ? 'border-brand bg-brand-light text-brand-dark' : 'border-line bg-surface text-ink-soft hover:text-ink'
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </FormField>
          )}
        </FormGrid>
      </FormSection>

      <FormSection id="gst" n={3} title="GST & billing" aside="Leave GSTIN blank for an unregistered buyer" done={sections[2].done}>
        <FormGrid>
          <FormField label="GSTIN" optional htmlFor="cust-gstin" span={3} error={fe('gstin')} help={<GstinStatus gstin={gstin} blank="Billed as unregistered until added." />}>
            <Input
              id="cust-gstin"
              name="gstin"
              value={gstin}
              onChange={(e) => onGstinChange(e.target.value.toUpperCase())}
              maxLength={15}
              placeholder="33AAAAA0000A1Z5"
              autoComplete="off"
              className={cn('font-mono uppercase', fe('gstin') && invalidClass)}
            />
          </FormField>
          <FormField label="FSSAI No." optional htmlFor="cust-fssai" span={3}>
            <Input id="cust-fssai" name="fssaiNo" inputMode="numeric" defaultValue={customer?.fssaiNo ?? ''} className="font-mono" />
          </FormField>
          <FormField label="Payment terms" span={4} help="Sets the due date on their invoices.">
            <input type="hidden" name="terms" value={terms} />
            <Segmented label="Payment terms" value={terms} onChange={setTerms} options={termOptions.map((t) => ({ value: t, label: TERM_LABEL[t] ?? t }))} className="max-sm:!grid-cols-2" />
          </FormField>
          <FormField label="Credit limit" htmlFor="cust-limit" span={2} error={fe('creditLimit')} help="0 means no limit.">
            <AffixInput id="cust-limit" name="creditLimit" type="number" min="0" step="any" inputMode="decimal" before="₹" defaultValue={customer?.creditLimit?.toString() ?? '0'} invalid={!!fe('creditLimit')} className="font-mono" />
          </FormField>
        </FormGrid>
      </FormSection>

      {imagesKnown && (
        <FormSection id="photos" n={4} title="Shop photos" aside="Helps the delivery team · up to 6" done={photoCount > 0}>
          <ImagesField value={images} onChange={setImages} max={MAX_PHOTOS} emptyHint="Shop front, freezer, visiting card. JPG, PNG or WEBP, up to 4MB each." />
        </FormSection>
      )}
    </FormSheet>
  );
}
