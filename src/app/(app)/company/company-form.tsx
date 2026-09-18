'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import type { Company } from '@prisma/client';
import { Building2, Globe, Phone, PhoneCall, Home, IdCard, Percent, Landmark, Hash, FileText, Pencil, Check, Flag, Palette, ImagePlus, X, Mail, ShieldCheck, MapPin, KeyRound, LayoutTemplate, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { updateCompany, type CompanyFormState } from '@/actions/company';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogFormContent, DialogFormHeader, DialogFormIcon, DialogFormBody, DialogFormFooter } from '@/components/ui/dialog';
import { ZoomableImage } from '@/components/ui/image-lightbox';
import { StateSelect, DistrictSelect } from '@/components/ui/location-field';
import { isThemePresetKey, THEME_PRESET_KEYS, THEME_PRESETS } from '@/lib/theme-presets';

const TABS = [
  { id: 'identity', label: 'Identity', icon: Building2 },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'gst', label: 'GST & tax', icon: Percent },
  { id: 'banking', label: 'Banking', icon: Landmark },
  { id: 'numbering', label: 'Numbering', icon: Hash },
  { id: 'terms', label: 'Terms', icon: FileText },
  { id: 'compliance', label: 'e-Invoice / e-Way Bill', icon: ShieldCheck },
  { id: 'signatures', label: 'Signatures', icon: PenLine },
] as const;

export function CompanyForm({ company }: { company: Company }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('identity');
  const [state, formAction, actionPending] = useActionState<CompanyFormState, FormData>(updateCompany, {});
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;
  const submittedRef = useRef(false);
  const [themeColor, setThemeColor] = useState<string>(company.themeColor || 'red');
  // Remembers the last custom hex picked so the swatch keeps showing it (instead
  // of reverting to the rainbow placeholder) if the user clicks a preset and
  // then wants to come back to their custom color.
  const [lastCustomColor, setLastCustomColor] = useState<string>(isThemePresetKey(company.themeColor) ? '#ff0000' : company.themeColor || '#ff0000');
  const isCustomActive = !isThemePresetKey(themeColor);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signatureRemoved, setSignatureRemoved] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [selectedState, setSelectedState] = useState(company.state);
  const [selectedDistrict, setSelectedDistrict] = useState(company.district ?? '');
  const [invoiceTemplate, setInvoiceTemplate] = useState<'MODERN' | 'CLASSIC'>(company.invoiceTemplate);

  useEffect(() => {
    if (!submittedRef.current) return;
    submittedRef.current = false;
    if (!state.error) {
      setOpen(false);
      toast.success('Company profile saved');
    } else {
      toast.error(state.error);
    }
  }, [state]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  useEffect(() => {
    if (!signatureFile) {
      setSignaturePreview(null);
      return;
    }
    const url = URL.createObjectURL(signatureFile);
    setSignaturePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [signatureFile]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submittedRef.current = true;
    const formData = new FormData(e.currentTarget);
    formData.set('themeColor', themeColor);
    if (logoFile) formData.set('logo', logoFile);
    if (logoRemoved) formData.set('removeLogo', 'true');
    if (signatureFile) formData.set('signature', signatureFile);
    if (signatureRemoved) formData.set('removeSignature', 'true');
    startTransition(() => formAction(formData));
  }

  const currentLogo = logoRemoved ? null : logoPreview ?? company.logoUrl;
  const currentSignature = signatureRemoved ? null : signaturePreview ?? company.signatureUrl;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil size={13} /> Edit details
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setTab('identity');
        }}
      >
        <DialogFormContent wide>
          <form onSubmit={handleSubmit} className="contents">
            <DialogFormHeader>
              <DialogFormIcon>
                <Building2 size={16} />
              </DialogFormIcon>
              <div className="text-[15px] font-extrabold text-ink">Edit company profile</div>
            </DialogFormHeader>

            <div className="flex flex-shrink-0 gap-4 overflow-x-auto border-b border-line px-[22px]">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 whitespace-nowrap border-b-[2.5px] py-2.5 text-[12.5px] font-bold transition-colors ${
                      active ? 'border-brand text-brand' : 'border-transparent text-ink-faint hover:text-ink-soft'
                    }`}
                  >
                    <Icon size={13} /> {t.label}
                  </button>
                );
              })}
            </div>

            <DialogFormBody>
              <div className={tab === 'identity' ? 'grid grid-cols-2 gap-3' : 'hidden'}>
                <Field label="Business name" name="name" icon={Building2} defaultValue={company.name} error={state.fieldErrors?.name} />
                <Field label="Website / domain" name="domain" icon={Globe} defaultValue={company.domain ?? ''} />
                <Field label="Phone" name="phone" icon={Phone} defaultValue={company.phone ?? ''} error={state.fieldErrors?.phone} />
                <Field label="Alternative phone (optional)" name="altPhone" icon={PhoneCall} defaultValue={company.altPhone ?? ''} />
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-ink-faint">
                    <Mail size={12} className="flex-shrink-0" /> Email
                  </label>
                  <div className="w-full truncate rounded-sm2 border border-line bg-bg px-3 py-2 text-[13px] text-ink-soft">{session?.user?.email ?? '—'}</div>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Same as your account email —{' '}
                    <Link href="/account" className="font-bold text-brand" onClick={() => setOpen(false)}>
                      change it in My Account
                    </Link>
                    .
                  </p>
                </div>
                <div className="col-span-2">
                  <Field label="Registered address" name="address" icon={Home} defaultValue={company.address ?? ''} as="textarea" error={state.fieldErrors?.address} />
                </div>
                <Field label="GSTIN" name="gstin" icon={IdCard} defaultValue={company.gstin ?? ''} mono error={state.fieldErrors?.gstin} />
                <Field label="PAN" name="pan" icon={IdCard} defaultValue={company.pan ?? ''} mono error={state.fieldErrors?.pan} />
                <StateSelect
                  label="State (place of supply)"
                  name="state"
                  value={selectedState}
                  onChange={(v) => {
                    setSelectedState(v);
                    setSelectedDistrict('');
                  }}
                />
                <DistrictSelect name="district" state={selectedState} value={selectedDistrict} onChange={setSelectedDistrict} />
              </div>

              <div className={tab === 'branding' ? 'space-y-5' : 'hidden'}>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold text-ink-faint">Logo</label>
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg2 border border-line bg-bg">
                      {currentLogo ? <ZoomableImage src={currentLogo} alt={company.name} /> : <Building2 size={22} className="text-ink-faint" />}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                        <ImagePlus size={13} /> {currentLogo ? 'Replace' : 'Upload'}
                      </Button>
                      {currentLogo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setLogoFile(null);
                            setLogoRemoved(true);
                          }}
                        >
                          <X size={13} /> Remove
                        </Button>
                      )}
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setLogoFile(file);
                          setLogoRemoved(false);
                        }
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold text-ink-faint">Theme color</label>
                  <div className="flex flex-wrap items-center gap-2.5">
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
                          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${active ? 'border-ink' : 'border-transparent'}`}
                        >
                          <span className="h-6 w-6 rounded-full" style={{ background: `hsl(${preset.light.brand})` }} />
                        </button>
                      );
                    })}
                    <span className="h-6 w-px flex-shrink-0 bg-line" />
                    <label
                      title="Pick any custom color"
                      className={`relative flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors ${isCustomActive ? 'border-ink' : 'border-transparent'}`}
                    >
                      <span
                        className="h-6 w-6 rounded-full"
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
                        aria-label="Custom theme color"
                      />
                    </label>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-faint">Pick any color from the wheel — the app keeps it readable in both light and dark mode.</p>
                </div>
              </div>

              <div className={tab === 'gst' ? 'grid grid-cols-1 gap-3' : 'hidden'}>
                <RateRow label="CGST rate (%)" name="cgstRate" enabledName="cgstEnabled" defaultValue={Number(company.cgstRate)} defaultEnabled={company.cgstEnabled} />
                <RateRow label="SGST rate (%)" name="sgstRate" enabledName="sgstEnabled" defaultValue={Number(company.sgstRate)} defaultEnabled={company.sgstEnabled} />
                <RateRow label="IGST rate (%)" name="igstRate" enabledName="igstEnabled" defaultValue={Number(company.igstRate)} defaultEnabled={company.igstEnabled} />
                <p className="mt-1 flex items-start gap-1.5 text-[11px] text-ink-faint">
                  <Flag size={12} className="mt-0.5 flex-shrink-0" /> Toggle off any tax you don&apos;t charge. With IGST off, every invoice uses CGST + SGST regardless of the customer&apos;s
                  state.
                </p>
              </div>

              <div className={tab === 'banking' ? 'grid grid-cols-2 gap-3' : 'hidden'}>
                <Field label="Account name" name="bankName" icon={Landmark} defaultValue={company.bankName ?? ''} error={state.fieldErrors?.bankName} />
                <Field label="Account number" name="bankAcc" icon={Hash} defaultValue={company.bankAcc ?? ''} mono error={state.fieldErrors?.bankAcc} />
                <Field label="IFSC" name="ifsc" icon={Landmark} defaultValue={company.ifsc ?? ''} mono error={state.fieldErrors?.ifsc} />
                <Field label="Bank & branch" name="branch" icon={Home} defaultValue={company.branch ?? ''} error={state.fieldErrors?.branch} />
                <Field label="UPI ID" name="upi" icon={IdCard} defaultValue={company.upi ?? ''} mono />
              </div>

              <div className={tab === 'numbering' ? 'grid grid-cols-3 gap-3' : 'hidden'}>
                <Field label="Prefix" name="invoicePrefix" icon={Hash} defaultValue={company.invoicePrefix} mono />
                <Field label="Financial year" name="invoiceFY" icon={Hash} defaultValue={company.invoiceFY} mono />
                <Field label="Next number" name="nextInvoiceNo" type="number" icon={Hash} defaultValue={String(company.nextInvoiceNo)} mono />
              </div>

              <div className={tab === 'terms' ? 'grid grid-cols-1 gap-3' : 'hidden'}>
                <Field label="Printed on every invoice unless overridden" name="terms" icon={FileText} defaultValue={company.terms ?? ''} as="textarea" />
              </div>

              <div className={tab === 'compliance' ? 'space-y-5' : 'hidden'}>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold text-ink-faint">Invoice template</label>
                  <div className="flex gap-2.5">
                    {(['MODERN', 'CLASSIC'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setInvoiceTemplate(t)}
                        className={`flex flex-1 items-center gap-2 rounded-lg2 border-[1.5px] px-3.5 py-2.5 text-left text-[12.5px] font-bold transition-colors ${
                          invoiceTemplate === t ? 'border-brand bg-brand-light text-brand-dark' : 'border-line text-ink-soft'
                        }`}
                      >
                        <LayoutTemplate size={14} className="flex-shrink-0" />
                        {t === 'MODERN' ? 'Modern' : 'Classic (GST/Tally)'}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="invoiceTemplate" value={invoiceTemplate} />
                  <p className="mt-1.5 text-[11px] text-ink-faint">Classic mirrors a standard Tally-style GST tax invoice — IRN/QR, HSN-wise tax summary, and (when generated) an e-Way Bill page.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="FSSAI license no. (optional)" name="fssaiNo" icon={ShieldCheck} mono defaultValue={company.fssaiNo ?? ''} />
                  <Field label="Pincode" name="pincode" icon={MapPin} mono defaultValue={company.pincode ?? ''} />
                </div>

                <div className="rounded-lg2 border border-line bg-bg p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">
                      <KeyRound size={13} className="text-brand" /> NIC e-Invoice / e-Way Bill API
                    </div>
                    <label className="flex items-center gap-2 text-[11.5px] font-bold text-ink-soft">
                      Sandbox
                      <Switch name="nicSandbox" defaultChecked={company.nicSandbox} />
                    </label>
                  </div>
                  <p className="mb-3 text-[11px] leading-relaxed text-ink-faint">
                    Register on the NIC e-Invoice/e-Way Bill sandbox (or production, once approved) to generate real IRNs and e-Way Bill numbers from your invoices. Leave the password/client secret
                    blank to keep the value already saved.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Username" name="nicUsername" icon={IdCard} mono defaultValue={company.nicUsername ?? ''} />
                    <Field label={company.nicPasswordEnc ? 'Password (•••• saved — leave blank to keep)' : 'Password'} name="nicPassword" type="password" icon={KeyRound} mono />
                    <Field label="Client ID" name="nicClientId" icon={IdCard} mono defaultValue={company.nicClientId ?? ''} />
                    <Field
                      label={company.nicClientSecretEnc ? 'Client secret (•••• saved — leave blank to keep)' : 'Client secret'}
                      name="nicClientSecret"
                      type="password"
                      icon={KeyRound}
                      mono
                    />
                  </div>
                </div>
              </div>

              <div className={tab === 'signatures' ? 'space-y-5' : 'hidden'}>
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  Printed on the CLASSIC template&apos;s Authorised Signatory row, on the bottom-right of the invoice. Leave blank to keep that side blank for physical signing.
                </p>
                <Field label="Authorised signatory name" name="signatoryName" icon={PenLine} defaultValue={company.signatoryName ?? ''} />

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold text-ink-faint">Authorised signatory e-signature (optional)</label>
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg2 border border-line bg-bg">
                      {currentSignature ? <ZoomableImage src={currentSignature} alt="Signature" /> : <PenLine size={20} className="text-ink-faint" />}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => signatureInputRef.current?.click()}>
                        <ImagePlus size={13} /> {currentSignature ? 'Replace' : 'Upload'}
                      </Button>
                      {currentSignature && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSignatureFile(null);
                            setSignatureRemoved(true);
                          }}
                        >
                          <X size={13} /> Remove
                        </Button>
                      )}
                    </div>
                    <input
                      ref={signatureInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSignatureFile(file);
                          setSignatureRemoved(false);
                        }
                        e.target.value = '';
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-ink-faint">A scanned signature image, shown above the Authorised Signatory line instead of a blank space.</p>
                </div>
              </div>

              {state.error && <p className="mt-3 text-[12.5px] font-bold text-destructive">{state.error}</p>}
            </DialogFormBody>
            <DialogFormFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                <Check size={13} /> {pending ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFormFooter>
          </form>
        </DialogFormContent>
      </Dialog>
    </>
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
      <input name={name} type="number" step="0.01" defaultValue={defaultValue} className="w-20 flex-shrink-0 rounded-sm2 border border-line bg-surface px-2 py-1.5 text-center font-mono text-[15px] font-extrabold text-ink outline-none focus:border-brand" />
      <span className="flex-1 text-[12.5px] font-bold text-ink-soft">{label}</span>
      <Switch name={enabledName} defaultChecked={defaultEnabled} />
    </div>
  );
}
