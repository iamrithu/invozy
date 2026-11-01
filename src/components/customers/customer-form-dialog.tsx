'use client';

import { useState } from 'react';
import {
  Users,
  Store,
  Contact,
  Phone,
  PhoneCall,
  Mail,
  IdCard,
  CalendarClock,
  IndianRupee,
  Home,
  Check,
  Sparkles,
  ShieldCheck,
  MapPin,
  Route,
  ImagePlus,
  Receipt,
  Power,
} from 'lucide-react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetIcon, SheetBody, SheetFooter } from '@/components/ui/sheet';
import { StateSelect, DistrictSelect } from '@/components/ui/location-field';
import { ImagesField, type PendingImages } from '@/components/products/product-images-field';
import { useCreateCustomer, useCustomerRoutes, useUpdateCustomer } from '@/hooks/use-customers';

const TERMS = ['Due on receipt', 'Net 7', 'Net 15', 'Net 30'];
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

/** Same section header as the product form — icon + title. */
function SectionHeading({ icon: Icon, title, description }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; description?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-ink">
        <Icon size={13} className="text-brand" /> {title}
      </div>
      {description && <p className="mt-0.5 text-[11px] text-ink-faint">{description}</p>}
    </div>
  );
}

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
  customer?: CustomerFormCustomer;
  prefillName?: string;
  onSaved?: (customer: CustomerFormCustomer) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedState, setSelectedState] = useState(customer?.state ?? 'Tamil Nadu');
  const [selectedDistrict, setSelectedDistrict] = useState(customer?.district ?? '');
  const [active, setActive] = useState(customer?.active ?? true);
  const [images, setImages] = useState<PendingImages>({ existing: customer?.images ?? [], files: [] });
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer(customer?.id ?? '');
  const { data: routes = [] } = useCustomerRoutes();
  const pending = createCustomer.isPending || updateCustomer.isPending;

  const imagesKnown = mode === 'create' || Array.isArray(customer?.images);
  const routeKnown = mode === 'create' || customer?.route !== undefined;
  const activeKnown = mode === 'edit' && typeof customer?.active === 'boolean';

  function resetForCreate() {
    setSelectedState('Tamil Nadu');
    setSelectedDistrict('');
    setImages({ existing: [], files: [] });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    toast.success(mode === 'create' ? 'Customer added' : activeKnown && active !== customer?.active ? (active ? 'Saved and enabled' : 'Saved and disabled') : 'Changes saved');
    onOpenChange(false);
    if (mode === 'create') resetForCreate();
    onSaved?.(
      result.customer ?? {
        id: customer?.id ?? result.id ?? '',
        name: String(formData.get('name') ?? ''),
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form onSubmit={handleSubmit} className="contents">
          <SheetHeader>
            <SheetIcon>{mode === 'create' ? <Sparkles size={16} /> : <Users size={16} />}</SheetIcon>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-extrabold text-ink">{mode === 'create' ? 'New customer' : customer?.shopName || customer?.name}</div>
              <div className="text-[11.5px] text-ink-faint">{mode === 'create' ? 'Add a customer to bill' : 'Edit customer details'}</div>
            </div>
            {activeKnown && (
              <label className="flex flex-shrink-0 cursor-pointer items-center gap-2" title="Disabled customers don't show in Bill To">
                <Power size={13} className={active ? 'text-green' : 'text-ink-faint'} />
                <span className={`text-[11px] font-bold ${active ? 'text-green' : 'text-ink-faint'}`}>{active ? 'Active' : 'Disabled'}</span>
                <Switch checked={active} onChange={(e) => setActive(e.target.checked)} aria-label="Customer active" />
              </label>
            )}
          </SheetHeader>

          <SheetBody>
            <div className="space-y-6">
              <section>
                <SectionHeading icon={Users} title="Contact" />
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Name" name="name" icon={Users} defaultValue={customer?.name} placeholder={prefillName} error={fieldErrors.name} />
                  <Field label="Shop name (optional)" name="shopName" icon={Store} defaultValue={customer?.shopName ?? ''} />
                  <Field label="Contact person" name="contact" icon={Contact} defaultValue={customer?.contact ?? ''} />
                  <Field label="Phone" name="phone" icon={Phone} defaultValue={customer?.phone ?? ''} />
                  <Field label="Alternative phone (optional)" name="altPhone" icon={PhoneCall} defaultValue={customer?.altPhone ?? ''} />
                  <Field label="Email" name="email" icon={Mail} defaultValue={customer?.email ?? ''} error={fieldErrors.email} />
                </div>
              </section>

              <section className="border-t border-line pt-5">
                <SectionHeading icon={Home} title="Address & delivery" />
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <Field label="Pincode (optional)" name="pincode" icon={MapPin} mono defaultValue={customer?.pincode ?? ''} />
                  {routeKnown && (
                    <div>
                      <Label htmlFor="route" className="flex items-center gap-1.5">
                        <Route size={12} className="flex-shrink-0 text-ink-faint" />
                        Route / beat (optional)
                      </Label>
                      <Input id="route" name="route" list="customer-route-options" defaultValue={customer?.route ?? ''} placeholder="e.g. Ennore" autoComplete="off" />
                      <datalist id="customer-route-options">
                        {routes.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </div>
                  )}
                  <div className="col-span-1 sm:col-span-2">
                    <Field label="Billing address" name="address" as="textarea" icon={Home} defaultValue={customer?.address ?? ''} />
                  </div>
                </div>
              </section>

              <section className="border-t border-line pt-5">
                <SectionHeading icon={Receipt} title="GST & billing" />
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="GSTIN (optional)" name="gstin" icon={IdCard} defaultValue={customer?.gstin ?? ''} mono />
                  <Field label="FSSAI No. (optional)" name="fssaiNo" icon={ShieldCheck} mono defaultValue={customer?.fssaiNo ?? ''} />
                  <Field
                    label="Payment terms"
                    name="terms"
                    as="select"
                    icon={CalendarClock}
                    defaultValue={customer?.terms ?? 'Due on receipt'}
                    options={TERMS.map((t) => ({ value: t }))}
                  />
                  <Field label="Credit limit (₹)" name="creditLimit" type="number" icon={IndianRupee} mono defaultValue={customer?.creditLimit?.toString() ?? '0'} />
                </div>
              </section>

              {imagesKnown && (
                <section className="border-t border-line pt-5">
                  <SectionHeading icon={ImagePlus} title="Photos" description="Shop front, freezer, visiting card — anything that helps the delivery team." />
                  <div className="mt-3">
                    <ImagesField value={images} onChange={setImages} max={MAX_PHOTOS} emptyHint="Optional. JPG, PNG or WEBP, up to 4MB each." />
                  </div>
                </section>
              )}
            </div>
            {error && <p className="mt-4 text-[12.5px] font-bold text-destructive">{error}</p>}
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              <Check size={13} /> {pending ? 'Saving…' : mode === 'create' ? 'Add customer' : 'Save changes'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
