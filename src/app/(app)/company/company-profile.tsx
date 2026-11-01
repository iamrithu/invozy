'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { Company } from '@prisma/client';
import {
  Building2,
  Globe,
  Phone,
  PhoneCall,
  Home,
  IdCard,
  Percent,
  Landmark,
  Hash,
  FileText,
  Pencil,
  Check,
  Flag,
  Palette,
  ImagePlus,
  X,
  Mail,
  ShieldCheck,
  MapPin,
  KeyRound,
  PenLine,
  CircleCheck,
  AlertTriangle,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { updateCompany } from '@/actions/company';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ZoomableImage } from '@/components/ui/image-lightbox';
import { StateSelect, DistrictSelect } from '@/components/ui/location-field';
import { isThemePresetKey, THEME_PRESET_KEYS, THEME_PRESETS, themePreviewColor, type ThemePresetKey } from '@/lib/theme-presets';
import type { toPublicCompany } from '@/lib/public-company';
import type { InvoiceTemplateName } from '@/lib/invoice-template';
import { cn } from '@/lib/utils';

/** The Company row as the settings page hands it over: no encrypted NIC
 * credentials, just whether each is saved (src/lib/public-company.ts). */
export type PublicCompany = ReturnType<typeof toPublicCompany<Company>>;

type Errors = Record<string, string | undefined>;

const TEMPLATES: { id: InvoiceTemplateName; name: string; blurb: string }[] = [
  { id: 'MODERN', name: 'Modern', blurb: 'Colour accent, rounded card. Best for simple retail bills.' },
  { id: 'CLASSIC', name: 'Classic', blurb: 'Tally-style GST invoice with IRN/QR, HSN summary and e-Way Bill page.' },
  { id: 'CLEAN', name: 'Clean', blurb: 'Centered letterhead, logo and QR the same size, thin even lines, one font weight.' },
];

const CURRENCIES = [
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'AED', label: 'AED — UAE Dirham' },
];

const SECTIONS = [
  { id: 'business', label: 'Business', icon: Building2 },
  { id: 'address', label: 'Address & registration', icon: MapPin },
  { id: 'brand', label: 'Theme & template', icon: Palette },
  { id: 'tax', label: 'GST & tax', icon: Percent },
  { id: 'bank', label: 'Bank & UPI', icon: Landmark },
  { id: 'invoice', label: 'Numbering & terms', icon: Hash },
  { id: 'signature', label: 'Signature', icon: PenLine },
  { id: 'einvoice', label: 'e-Invoice API', icon: ShieldCheck },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

/** Every company detail on one scrolling page — each section shows its
 * values straight away and edits in place (Edit → fields → Save), saving
 * only that section's fields (see updateCompany's `_fields`). */
export function CompanyProfile({ company: co }: { company: PublicCompany }) {
  const [editing, setEditing] = useState<Set<SectionId>>(new Set());
  const [active, setActive] = useState<SectionId>('business');

  function setSectionEditing(id: SectionId, on: boolean) {
    setEditing((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openSection(id: SectionId) {
    setSectionEditing(id, true);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Highlights the section being read in the jump list.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id as SectionId);
      },
      { rootMargin: '-130px 0px -55% 0px' }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const sectionProps = (id: SectionId) => ({ id, editing: editing.has(id), onEditingChange: (on: boolean) => setSectionEditing(id, on) });

  return (
    <div className="space-y-4">
      <Hero co={co} onOpen={openSection} />

      <div className="lg:grid lg:grid-cols-[196px_minmax(0,1fr)] lg:items-start lg:gap-5">
        <JumpList active={active} />

        <div className="space-y-4">
          <Section
            {...sectionProps('business')}
            icon={Building2}
            title="Business"
            hint="Name and contact details printed at the top of every invoice."
            fields={['name', 'domain', 'phone', 'altPhone']}
            view={
              <Rows>
                <Row label="Business name" value={co.name} />
                <Row label="Website" value={co.domain} />
                <Row label="Phone" value={co.phone} mono />
                <Row label="Alternative phone" value={co.altPhone} mono />
                <Row label="Email" value={co.email} wide />
              </Rows>
            }
            form={(errors) => (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Business name" name="name" icon={Building2} defaultValue={co.name} error={errors.name} />
                <Field label="Website / domain" name="domain" icon={Globe} defaultValue={co.domain ?? ''} error={errors.domain} />
                <Field label="Phone" name="phone" icon={Phone} defaultValue={co.phone ?? ''} error={errors.phone} />
                <Field label="Alternative phone (optional)" name="altPhone" icon={PhoneCall} defaultValue={co.altPhone ?? ''} />
                <div className="sm:col-span-2">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-ink-faint">
                    <Mail size={12} className="flex-shrink-0" /> Email
                  </div>
                  <div className="w-full truncate rounded-sm2 border border-line bg-bg px-3 py-2 text-[13px] text-ink-soft">{co.email ?? '—'}</div>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Same as your login email —{' '}
                    <Link href="/account" className="font-bold text-brand">
                      change it in My Account
                    </Link>
                    .
                  </p>
                </div>
              </div>
            )}
          />

          <Section
            {...sectionProps('address')}
            icon={MapPin}
            title="Address & registration"
            hint="Your state decides CGST + SGST or IGST on every invoice."
            fields={['address', 'state', 'district', 'pincode', 'gstin', 'pan', 'fssaiNo']}
            view={
              <Rows>
                <Row label="Registered address" value={co.address} wide multiline />
                <Row label="State" value={co.state} />
                <Row label="District" value={co.district} />
                <Row label="Pincode" value={co.pincode} mono />
                <Row label="GSTIN" value={co.gstin} mono />
                <Row label="PAN" value={co.pan} mono />
                <Row label="FSSAI license" value={co.fssaiNo} mono />
              </Rows>
            }
            form={(errors) => <AddressFields co={co} errors={errors} />}
          />

          <Section
            {...sectionProps('brand')}
            icon={Palette}
            title="Theme & invoice template"
            hint="The app's colour and how invoice PDFs look. The logo is at the top of this page."
            fields={['themeColor', 'invoiceTemplate']}
            view={<BrandView co={co} />}
            form={() => <BrandFields co={co} />}
          />

          <Section
            {...sectionProps('tax')}
            icon={Percent}
            title="GST & tax"
            hint="Default rates, the HSN/SAC used when an item has none, and the currency."
            fields={['cgstRate', 'sgstRate', 'igstRate', 'cgstEnabled', 'sgstEnabled', 'igstEnabled', 'defaultHsn', 'currency']}
            view={
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <RatePill value={Number(co.cgstRate)} label="CGST" enabled={co.cgstEnabled} />
                  <RatePill value={Number(co.sgstRate)} label="SGST" enabled={co.sgstEnabled} />
                  <RatePill value={Number(co.igstRate)} label="IGST" enabled={co.igstEnabled} />
                </div>
                <Rows>
                  <Row label="Default HSN/SAC" value={co.defaultHsn} mono />
                  <Row label="Currency" value={CURRENCIES.find((c) => c.value === co.currency)?.label ?? co.currency} />
                </Rows>
              </div>
            }
            form={(errors) => (
              <div className="grid grid-cols-1 gap-3">
                <RateRow label="CGST rate (%)" name="cgstRate" enabledName="cgstEnabled" defaultValue={Number(co.cgstRate)} defaultEnabled={co.cgstEnabled} />
                <RateRow label="SGST rate (%)" name="sgstRate" enabledName="sgstEnabled" defaultValue={Number(co.sgstRate)} defaultEnabled={co.sgstEnabled} />
                <RateRow label="IGST rate (%)" name="igstRate" enabledName="igstEnabled" defaultValue={Number(co.igstRate)} defaultEnabled={co.igstEnabled} />
                <Hint>Turn off any tax you don&apos;t charge. With IGST off, every invoice uses CGST + SGST whatever the customer&apos;s state.</Hint>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Default HSN/SAC code" name="defaultHsn" icon={Hash} mono defaultValue={co.defaultHsn} error={errors.defaultHsn} />
                  <Field label="Currency" name="currency" as="select" icon={Landmark} defaultValue={co.currency || 'INR'} options={CURRENCIES} />
                </div>
                <Hint>The HSN/SAC is used on any line without its own — set one on a product or type one on an invoice line to override it.</Hint>
              </div>
            )}
          />

          <Section
            {...sectionProps('bank')}
            icon={Landmark}
            title="Bank & UPI"
            hint="Where customers pay you, and what the invoice PDF shows."
            fields={['bankName', 'bankAcc', 'ifsc', 'branch', 'upi', 'showUpiQr', 'showGpayNumber', 'pdfShowBankDetails']}
            view={
              <div className="space-y-4">
                <Rows>
                  <Row label="Account name" value={co.bankName} />
                  <Row label="Account number" value={co.bankAcc} mono />
                  <Row label="IFSC" value={co.ifsc} mono />
                  <Row label="Bank & branch" value={co.branch} />
                  <Row label="UPI ID" value={co.upi} mono wide />
                </Rows>
                <div className="flex flex-wrap gap-1.5">
                  <OnOff on={co.pdfShowBankDetails} label="Bank details on PDF" />
                  <OnOff on={co.showUpiQr} label="UPI QR on PDF" />
                  <OnOff on={co.showGpayNumber} label="GPay number on PDF" />
                </div>
              </div>
            }
            form={(errors) => (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Account name" name="bankName" icon={Landmark} defaultValue={co.bankName ?? ''} error={errors.bankName} />
                <Field label="Account number" name="bankAcc" icon={Hash} mono defaultValue={co.bankAcc ?? ''} error={errors.bankAcc} />
                <Field label="IFSC" name="ifsc" icon={Landmark} mono defaultValue={co.ifsc ?? ''} error={errors.ifsc} />
                <Field label="Bank & branch" name="branch" icon={Home} defaultValue={co.branch ?? ''} error={errors.branch} />
                <div className="sm:col-span-2">
                  <Field label="UPI ID" name="upi" icon={IdCard} mono defaultValue={co.upi ?? ''} />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:col-span-2">
                  <SwitchRow name="pdfShowBankDetails" label="Show bank details on the invoice PDF" defaultChecked={co.pdfShowBankDetails} />
                  <SwitchRow
                    name="showUpiQr"
                    label="Show a scannable UPI QR"
                    hint="Made from the UPI ID above — turn on once you've checked the ID."
                    defaultChecked={co.showUpiQr}
                  />
                  <SwitchRow
                    name="showGpayNumber"
                    label="Show GPay number"
                    hint="Prints your Phone number (Business section) under the QR."
                    defaultChecked={co.showGpayNumber}
                  />
                </div>
              </div>
            )}
          />

          <Section
            {...sectionProps('invoice')}
            icon={Hash}
            title="Invoice numbering & terms"
            hint="The next number is taken by the next invoice you save."
            fields={['invoicePrefix', 'invoiceFY', 'nextInvoiceNo', 'pdfShowHsnSummary', 'terms']}
            view={
              <div className="space-y-4">
                <div className="rounded-lg2 border border-line bg-bg px-3.5 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Next invoice</div>
                  <div className="mt-0.5 break-all font-mono text-[18px] font-extrabold text-ink sm:text-[20px]">
                    {co.invoicePrefix}/{co.invoiceFY}/{String(co.nextInvoiceNo).padStart(4, '0')}
                  </div>
                </div>
                <Rows>
                  <Row label="Prefix" value={co.invoicePrefix} mono />
                  <Row label="Financial year" value={co.invoiceFY} mono />
                  <Row label="HSN-wise tax summary on PDF" value={co.pdfShowHsnSummary ? 'Shown' : 'Hidden'} />
                  <Row label="Terms on every invoice" value={co.terms} wide multiline />
                </Rows>
              </div>
            }
            form={(errors) => (
              <div className="grid grid-cols-1 gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Prefix" name="invoicePrefix" icon={Hash} mono defaultValue={co.invoicePrefix} error={errors.invoicePrefix} />
                  <Field label="Financial year" name="invoiceFY" icon={Hash} mono defaultValue={co.invoiceFY} error={errors.invoiceFY} />
                  <Field label="Next number" name="nextInvoiceNo" type="number" icon={Hash} mono defaultValue={String(co.nextInvoiceNo)} error={errors.nextInvoiceNo} />
                </div>
                <Hint>Only change the next number when starting a new series — a number already used would print twice.</Hint>
                <Field label="Terms printed on every invoice (unless changed on one)" name="terms" icon={FileText} as="textarea" defaultValue={co.terms ?? ''} />
                <SwitchRow
                  name="pdfShowHsnSummary"
                  label="Show HSN-wise tax summary on the invoice PDF"
                  hint="An optional GST detail — off by default."
                  defaultChecked={co.pdfShowHsnSummary}
                />
              </div>
            )}
          />

          <Section
            {...sectionProps('signature')}
            icon={PenLine}
            title="Authorised signatory"
            hint="Printed on the Classic and Clean templates. Leave blank to sign by hand."
            fields={['signatoryName']}
            view={
              <Rows>
                <Row label="Signatory name" value={co.signatoryName} />
                <Row
                  label="e-Signature"
                  value={
                    co.signatureUrl ? (
                      <span className="mt-1 block h-16 w-36 overflow-hidden rounded-lg2 border border-line bg-white">
                        <ZoomableImage src={co.signatureUrl} alt="Signature" imgClassName="object-contain" />
                      </span>
                    ) : null
                  }
                />
              </Rows>
            }
            form={() => <SignatureFields co={co} />}
          />

          <Section
            {...sectionProps('einvoice')}
            icon={ShieldCheck}
            title="e-Invoice / e-Way Bill API"
            hint="NIC credentials for generating IRNs and e-Way Bills from invoices."
            fields={['nicSandbox', 'nicUsername', 'nicClientId']}
            view={
              <Rows>
                <Row label="Mode" value={co.nicSandbox ? 'Sandbox (testing)' : 'Production'} />
                <Row label="Username" value={co.nicUsername} mono />
                <Row label="Password" value={co.nicPasswordSaved ? 'Saved' : null} />
                <Row label="Client ID" value={co.nicClientId} mono />
                <Row label="Client secret" value={co.nicClientSecretSaved ? 'Saved' : null} />
              </Rows>
            }
            form={() => (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <SwitchRow name="nicSandbox" label="Use the sandbox (testing) API" hint="Turn off once NIC approves you for production." defaultChecked={co.nicSandbox} />
                </div>
                <Field label="Username" name="nicUsername" icon={IdCard} mono defaultValue={co.nicUsername ?? ''} />
                <Field label={co.nicPasswordSaved ? 'Password (saved — blank keeps it)' : 'Password'} name="nicPassword" type="password" icon={KeyRound} mono />
                <Field label="Client ID" name="nicClientId" icon={IdCard} mono defaultValue={co.nicClientId ?? ''} />
                <Field
                  label={co.nicClientSecretSaved ? 'Client secret (saved — blank keeps it)' : 'Client secret'}
                  name="nicClientSecret"
                  type="password"
                  icon={KeyRound}
                  mono
                />
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}

/** Saves one section through updateCompany, listing only the fields that
 * section owns so nothing else on the company is touched. */
function useSectionSave(title: string, fields: readonly string[], onSaved: () => void) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Errors>({});

  function save(formData: FormData) {
    formData.set('_fields', fields.join(','));
    startTransition(async () => {
      const res = await updateCompany({}, formData);
      if (res.error) {
        const fieldErrors: Errors = {};
        for (const [k, v] of Object.entries(res.fieldErrors ?? {})) fieldErrors[k] = Array.isArray(v) ? v[0] : v;
        setErrors(fieldErrors);
        toast.error(res.error);
        return;
      }
      setErrors({});
      toast.success(`${title} saved`);
      onSaved();
    });
  }

  return { pending, errors, save, clearErrors: () => setErrors({}) };
}

function Section({
  id,
  icon: Icon,
  title,
  hint,
  fields,
  view,
  form,
  editing,
  onEditingChange,
}: {
  id: SectionId;
  icon: LucideIcon;
  title: string;
  hint?: string;
  fields: readonly string[];
  view: React.ReactNode;
  form: (errors: Errors) => React.ReactNode;
  editing: boolean;
  onEditingChange: (on: boolean) => void;
}) {
  const { pending, errors, save, clearErrors } = useSectionSave(title, fields, () => onEditingChange(false));

  return (
    <section id={id} className={cn('scroll-mt-[118px] rounded-xl2 border bg-surface shadow-card sm:scroll-mt-[128px] lg:scroll-mt-[80px]', editing ? 'border-brand' : 'border-line')}>
      <header className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-extrabold text-ink sm:text-[15px]">{title}</h2>
          {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">{hint}</p>}
        </div>
        {!editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearErrors();
              onEditingChange(true);
            }}
          >
            <Pencil size={13} /> Edit
          </Button>
        )}
      </header>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(new FormData(e.currentTarget));
          }}
          className="px-4 py-4 sm:px-5"
        >
          {form(errors)}
          <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => onEditingChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              <Check size={13} /> {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="px-4 py-4 sm:px-5">{view}</div>
      )}
    </section>
  );
}

/** Big logo, name and contact line, plus what's still missing from the
 * profile — each gap opens its section ready to fill in. */
function Hero({ co, onOpen }: { co: PublicCompany; onOpen: (id: SectionId) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { pending, save } = useSectionSave('Logo', [], () => {
    setFile(null);
    setRemoved(false);
  });

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const logo = removed ? null : preview ?? co.logoUrl;
  const changed = !!file || removed;

  function saveLogo() {
    const fd = new FormData();
    if (file) fd.set('logo', file);
    if (removed) fd.set('removeLogo', 'true');
    save(fd);
  }

  const missing: { label: string; section: SectionId }[] = [];
  if (!co.phone) missing.push({ label: 'Phone', section: 'business' });
  if (!co.address) missing.push({ label: 'Address', section: 'address' });
  if (!co.gstin) missing.push({ label: 'GSTIN', section: 'address' });
  if (!co.bankAcc) missing.push({ label: 'Bank account', section: 'bank' });
  if (!co.upi) missing.push({ label: 'UPI ID', section: 'bank' });
  if (!co.signatoryName && !co.signatureUrl) missing.push({ label: 'Signatory', section: 'signature' });

  const place = [co.district, co.state].filter(Boolean).join(', ');

  return (
    <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card sm:p-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex flex-shrink-0 flex-col items-center gap-2">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-xl2 border border-line bg-white sm:h-40 sm:w-40">
            {logo ? (
              <ZoomableImage src={logo} alt={co.name} className="p-2" imgClassName="object-contain" />
            ) : (
              <button type="button" onClick={() => inputRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[#9ca3af]">
                <Building2 size={40} />
                <span className="text-[11px] font-bold">Add logo</span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {changed ? (
              <>
                <Button size="sm" disabled={pending} onClick={saveLogo}>
                  <Check size={13} /> {pending ? 'Saving…' : removed ? 'Remove logo' : 'Save logo'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setFile(null);
                    setRemoved(false);
                  }}
                >
                  <Undo2 size={13} /> Undo
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
                  <ImagePlus size={13} /> {co.logoUrl ? 'Change logo' : 'Upload logo'}
                </Button>
                {co.logoUrl && (
                  <Button size="sm" variant="ghost" aria-label="Remove logo" onClick={() => setRemoved(true)}>
                    <X size={13} />
                  </Button>
                )}
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) {
                setFile(picked);
                setRemoved(false);
              }
              e.target.value = '';
            }}
          />
        </div>

        <div className="w-full min-w-0 flex-1 text-center sm:text-left">
          <h2 className="break-words text-[20px] font-extrabold leading-tight text-ink sm:text-[26px]">{co.name}</h2>
          {co.domain && <div className="mt-1 text-[12.5px] text-ink-faint">{co.domain}</div>}
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 sm:justify-start">
            {co.phone && <Meta icon={Phone} text={co.phone} />}
            {co.email && <Meta icon={Mail} text={co.email} />}
            {place && <Meta icon={MapPin} text={place} />}
            {co.gstin && <Meta icon={IdCard} text={`GSTIN ${co.gstin}`} mono />}
          </div>

          <div className="mt-4 border-t border-line pt-3">
            {missing.length === 0 ? (
              <p className="flex items-center justify-center gap-1.5 text-[12px] font-semibold text-green sm:justify-start">
                <CircleCheck size={14} /> Profile complete — every invoice prints in full.
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft">
                  <AlertTriangle size={13} className="text-gold" /> Still to add:
                </span>
                {missing.map((m) => (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => onOpen(m.section)}
                    className="rounded-sm2 border border-line bg-bg px-2 py-0.5 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-brand hover:text-brand"
                  >
                    + {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Section shortcuts — a sticky chip row on phones and tablets, a sticky
 * side list on wide screens. */
function JumpList({ active }: { active: SectionId }) {
  const chipsRef = useRef<HTMLElement>(null);

  // Keeps the chip for the section being read in view as the page scrolls.
  // scrollLeft rather than scrollIntoView, which could also move the page.
  useEffect(() => {
    const nav = chipsRef.current;
    const chip = nav?.querySelector<HTMLElement>(`[href="#${active}"]`);
    if (!nav || !chip) return;
    nav.scrollTo({ left: chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);

  return (
    <>
      <nav
        ref={chipsRef}
        aria-label="Company sections"
        className="sticky top-[52px] z-30 -mx-4 mb-4 flex gap-1.5 overflow-x-auto border-b border-line bg-bg px-4 py-2 sm:top-[61px] md:-mx-6 md:px-6 lg:hidden"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={cn(
              'flex-shrink-0 whitespace-nowrap rounded-sm2 border px-2.5 py-1 text-[12px] font-bold transition-colors',
              active === s.id ? 'border-brand bg-brand-light text-brand-dark' : 'border-line bg-surface text-ink-soft'
            )}
          >
            {s.label}
          </a>
        ))}
      </nav>
      <nav aria-label="Company sections" className="sticky top-[77px] hidden lg:block">
        <ul className="space-y-0.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={cn(
                    'flex items-center gap-2 rounded-sm2 px-2.5 py-2 text-[12.5px] font-bold transition-colors',
                    active === s.id ? 'bg-brand-light text-brand-dark' : 'text-ink-soft hover:bg-surface-alt hover:text-ink'
                  )}
                >
                  <Icon size={14} /> {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function AddressFields({ co, errors }: { co: PublicCompany; errors: Errors }) {
  const [state, setState] = useState(co.state);
  const [district, setDistrict] = useState(co.district ?? '');
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Registered address" name="address" icon={Home} as="textarea" defaultValue={co.address ?? ''} error={errors.address} />
      </div>
      <StateSelect
        label="State (place of supply)"
        name="state"
        value={state}
        onChange={(v) => {
          setState(v);
          setDistrict('');
        }}
      />
      <DistrictSelect name="district" state={state} value={district} onChange={setDistrict} />
      <Field label="Pincode" name="pincode" icon={MapPin} mono defaultValue={co.pincode ?? ''} error={errors.pincode} />
      <Field label="GSTIN" name="gstin" icon={IdCard} mono defaultValue={co.gstin ?? ''} error={errors.gstin} />
      <Field label="PAN" name="pan" icon={IdCard} mono defaultValue={co.pan ?? ''} error={errors.pan} />
      <Field label="FSSAI license no. (optional)" name="fssaiNo" icon={ShieldCheck} mono defaultValue={co.fssaiNo ?? ''} />
      {state !== co.state && (
        <div className="sm:col-span-2">
          <Hint>Changing the state recalculates GST (CGST + SGST or IGST) on saved invoices to match.</Hint>
        </div>
      )}
    </div>
  );
}

function BrandView({ co }: { co: PublicCompany }) {
  const themeLabel = isThemePresetKey(co.themeColor) ? THEME_PRESETS[co.themeColor as ThemePresetKey].label : 'Custom';
  const template = TEMPLATES.find((t) => t.id === co.invoiceTemplate) ?? TEMPLATES[0];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Theme colour</div>
        <div className="mt-1.5 flex items-center gap-2.5">
          <span className="h-8 w-8 flex-shrink-0 rounded-sm2 border border-line" style={{ background: themePreviewColor(co.themeColor) }} />
          <span className="text-[13.5px] font-semibold text-ink">{themeLabel}</span>
        </div>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Invoice template</div>
        <div className="mt-1.5 grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
          <TemplateThumb id={template.id} />
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-ink">{template.name}</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-ink-soft">{template.blurb}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandFields({ co }: { co: PublicCompany }) {
  const [themeColor, setThemeColor] = useState<string>(co.themeColor || 'red');
  // Remembers the last custom hex picked so the swatch keeps showing it if a
  // preset is clicked and then the custom colour is wanted back.
  const [lastCustomColor, setLastCustomColor] = useState<string>(isThemePresetKey(co.themeColor) ? '#ff0000' : co.themeColor || '#ff0000');
  const isCustomActive = !isThemePresetKey(themeColor);
  const [template, setTemplate] = useState<InvoiceTemplateName>(co.invoiceTemplate);

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 text-[11px] font-bold text-ink-faint">Theme colour</div>
        <div className="flex flex-wrap items-center gap-2">
          {THEME_PRESET_KEYS.map((key) => {
            const preset = THEME_PRESETS[key];
            const active = themeColor === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setThemeColor(key)}
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={active}
                className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 border-2 transition-colors', active ? 'border-ink' : 'border-transparent')}
              >
                <span className="h-6 w-6 rounded-sm2" style={{ background: `hsl(${preset.light.brand})` }} />
              </button>
            );
          })}
          <span className="h-6 w-px flex-shrink-0 bg-line" />
          <label
            title="Pick any custom colour"
            className={cn('relative flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-sm2 border-2 transition-colors', isCustomActive ? 'border-ink' : 'border-transparent')}
          >
            <span
              className="h-6 w-6 rounded-sm2"
              style={{ background: isCustomActive ? themeColor : 'conic-gradient(from 90deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)' }}
            />
            <input
              type="color"
              value={isCustomActive ? themeColor : lastCustomColor}
              onChange={(e) => {
                setThemeColor(e.target.value);
                setLastCustomColor(e.target.value);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Custom theme colour"
            />
          </label>
        </div>
        <input type="hidden" name="themeColor" value={themeColor} />
        <p className="mt-2 text-[11px] text-ink-faint">Any colour works — the app keeps it readable in light and dark mode.</p>
      </div>
      <div>
        <div className="mb-1.5 text-[11px] font-bold text-ink-faint">Invoice template</div>
        <div role="radiogroup" aria-label="Invoice template" className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {TEMPLATES.map((t) => {
            const active = template === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTemplate(t.id)}
                // 2px border when picked, padding trimmed by the same 1px so
                // the card doesn't shift.
                className={cn('grid content-start gap-2 rounded-lg2 bg-surface text-left transition-colors', active ? 'border-2 border-brand p-[9px]' : 'border border-line p-2.5 hover:border-ink-faint')}
              >
                <TemplateThumb id={t.id} />
                <span className="flex items-center justify-between gap-2 text-[13px] font-bold text-ink">
                  {t.name}
                  {active && <span className="rounded-sm2 bg-brand-light px-1.5 py-0.5 text-[10.5px] font-bold text-brand-dark">Selected</span>}
                </span>
                <span className="text-[11.5px] leading-snug text-ink-soft">{t.blurb}</span>
              </button>
            );
          })}
        </div>
        <input type="hidden" name="invoiceTemplate" value={template} />
        <p className="mt-2 text-[11px] text-ink-faint">Applies to every invoice PDF, including saved ones — each is redrawn the next time it&apos;s opened.</p>
      </div>
    </div>
  );
}

function SignatureFields({ co }: { co: PublicCompany }) {
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const current = removed ? null : preview ?? co.signatureUrl;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Authorised signatory name" name="signatoryName" icon={PenLine} defaultValue={co.signatoryName ?? ''} />
      <div>
        <div className="mb-1 text-[11px] font-bold text-ink-faint">e-Signature (optional)</div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-16 w-36 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg2 border border-line bg-white">
            {current ? <ZoomableImage src={current} alt="Signature" imgClassName="object-contain" /> : <PenLine size={20} className="text-[#9ca3af]" />}
          </div>
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <ImagePlus size={13} /> {current ? 'Replace' : 'Upload'}
            </Button>
            {current && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null);
                  setRemoved(true);
                  if (inputRef.current) inputRef.current.value = '';
                }}
              >
                <X size={13} /> Remove
              </Button>
            )}
          </div>
        </div>
        {/* Submitted with the section's form; an empty pick sends a 0-byte
            file, which updateCompany ignores. */}
        <input
          ref={inputRef}
          name="signature"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            setFile(picked);
            if (picked) setRemoved(false);
          }}
        />
        {removed && <input type="hidden" name="removeSignature" value="true" />}
        <p className="mt-1.5 text-[11px] text-ink-faint">A scanned signature, shown above the Authorised Signatory line.</p>
      </div>
    </div>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">{children}</dl>;
}

function Row({ label, value, mono, wide, multiline }: { label: string; value: React.ReactNode; mono?: boolean; wide?: boolean; multiline?: boolean }) {
  const empty = value == null || value === '';
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 break-words text-[13.5px] text-ink',
          empty ? 'italic text-ink-faint' : 'font-semibold',
          mono && !empty && 'font-mono',
          multiline && 'whitespace-pre-line'
        )}
      >
        {empty ? 'Not set' : value}
      </dd>
    </div>
  );
}

function Meta({ icon: Icon, text, mono }: { icon: LucideIcon; text: string; mono?: boolean }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-soft', mono && 'font-mono')}>
      <Icon size={13} className="flex-shrink-0 text-ink-faint" />
      <span className="truncate">{text}</span>
    </span>
  );
}

function OnOff({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm2 px-2 py-1 text-[11.5px] font-bold',
        on ? 'bg-green-soft text-green' : 'bg-surface-alt text-ink-faint'
      )}
    >
      {on ? <Check size={12} /> : <X size={12} />} {label}
    </span>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-faint">
      <Flag size={12} className="mt-0.5 flex-shrink-0" /> <span>{children}</span>
    </p>
  );
}

function SwitchRow({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg2 border border-line bg-bg p-3">
      <span className="min-w-0">
        <span className="block text-[12.5px] font-bold text-ink-soft">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">{hint}</span>}
      </span>
      <Switch name={name} defaultChecked={defaultChecked} />
    </label>
  );
}

function RateRow({
  label,
  name,
  enabledName,
  defaultValue,
  defaultEnabled,
}: {
  label: string;
  name: string;
  enabledName: string;
  defaultValue: number;
  defaultEnabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg2 border border-line bg-bg p-3">
      <input
        name={name}
        type="number"
        step="0.01"
        inputMode="decimal"
        aria-label={label}
        defaultValue={defaultValue}
        className="w-20 flex-shrink-0 rounded-sm2 border border-line bg-surface px-2 py-1.5 text-center font-mono text-[15px] font-extrabold text-ink outline-none focus:border-brand"
      />
      <span className="flex-1 text-[12.5px] font-bold text-ink-soft">{label}</span>
      <Switch name={enabledName} defaultChecked={defaultEnabled} aria-label={`Charge ${label.split(' ')[0]}`} />
    </div>
  );
}

function RatePill({ value, label, enabled }: { value: number; label: string; enabled: boolean }) {
  return (
    <div className={cn('rounded-lg2 border border-line bg-bg p-2.5 text-center', !enabled && 'opacity-50')}>
      <div className="font-mono text-[18px] font-extrabold text-ink">{value}%</div>
      <div className="mt-0.5 text-[10.5px] font-bold text-ink-faint">
        {label}
        {enabled ? '' : ' · off'}
      </div>
    </div>
  );
}

/** A tiny schematic of each template's first page — always on white paper,
 * like the invoice itself, whatever the app theme. */
function TemplateThumb({ id }: { id: InvoiceTemplateName }) {
  // tailwind-merge (cn) so a bar's own height/colour reliably replaces the
  // default — plain string concatenation leaves that to CSS order.
  const bar = (cls: string) => cn('block h-1.5 rounded-[2px] bg-[#d1d5db]', cls);
  return (
    <span aria-hidden="true" className="grid h-[84px] content-start gap-1.5 overflow-hidden rounded-md2 border border-line bg-white p-2.5">
      {id === 'MODERN' && (
        <>
          <span className={bar('h-2.5 w-[40%] bg-brand')} />
          <span className={bar('w-[70%]')} />
          <span className={bar('w-[55%]')} />
          <span className={bar('h-[26px] bg-[#f1f5f9]')} />
        </>
      )}
      {id === 'CLASSIC' && (
        <>
          <span className={bar('h-2 bg-[#9ca3af]')} />
          <span className="flex gap-1.5">
            <span className={bar('h-[18px] w-[18px] flex-none')} />
            <span className="grid flex-1 content-start gap-1">
              <span className={bar('w-[60%]')} />
              <span className={bar('w-[90%]')} />
            </span>
          </span>
          <span className={bar('h-[26px] bg-[#e5e7eb]')} />
        </>
      )}
      {id === 'CLEAN' && (
        <>
          <span className={bar('mx-auto w-[40%]')} />
          <span className="grid grid-cols-[22px_1fr_22px] items-center gap-1.5">
            <span className={bar('h-[22px] bg-brand opacity-70')} />
            <span className="grid justify-items-center gap-[3px]">
              <span className={bar('h-[7px] w-[70%] bg-[#6b7280]')} />
              <span className={bar('w-[90%]')} />
              <span className={bar('w-[60%]')} />
            </span>
            <span className={bar('h-[22px] bg-[#1c1c1c]')} />
          </span>
          <span className={bar('h-6 rounded-none border border-[#9ca3af] bg-[#f3f4f6]')} />
        </>
      )}
    </span>
  );
}
