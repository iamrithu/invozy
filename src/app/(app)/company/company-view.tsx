import type { Company } from '@prisma/client';
import { Building2, Phone, Mail, MapPin, IdCard, Percent, Landmark, Hash, AlertTriangle } from 'lucide-react';
import { ZoomableImage } from '@/components/ui/image-lightbox';
import { isThemePresetKey, THEME_PRESETS, themePreviewColor, type ThemePresetKey } from '@/lib/theme-presets';

export function CompanyView({ company: co }: { company: Company }) {
  const themeLabel = isThemePresetKey(co.themeColor) ? THEME_PRESETS[co.themeColor as ThemePresetKey].label : 'Custom';
  const profileIncomplete = !co.gstin || !co.bankAcc;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl2 border border-line bg-surface p-5 shadow-card lg:col-span-12">
        <div className="flex items-center gap-4">
          <span className="flex h-[64px] w-[64px] flex-shrink-0 items-center justify-center overflow-hidden rounded-xl2 bg-brand text-white shadow-brand">
            {co.logoUrl ? <ZoomableImage src={co.logoUrl} alt={co.name} /> : <Building2 size={26} />}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[19px] font-extrabold text-ink">{co.name}</span>
              <span
                className="h-3 w-3 flex-shrink-0 rounded-sm2 ring-2 ring-surface"
                style={{ background: themePreviewColor(co.themeColor) }}
                title={`Theme: ${themeLabel}`}
              />
            </div>
            {co.domain && <div className="mt-0.5 text-[12px] text-ink-faint">{co.domain}</div>}
            <div className="mt-2 flex flex-wrap gap-3.5">
              {co.phone && (
                <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                  <Phone size={12} /> {co.phone}
                </span>
              )}
              {co.email && (
                <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                  <Mail size={12} /> {co.email}
                </span>
              )}
              <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                <MapPin size={12} /> {co.state}
              </span>
            </div>
          </div>
        </div>
      </div>

      {profileIncomplete && (
        <div className="flex items-center gap-3 rounded-lg2 border border-gold bg-gold-soft p-3 lg:col-span-12">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 bg-gold text-white">
            <AlertTriangle size={16} />
          </span>
          <div className="flex-1">
            <div className="text-[13px] font-extrabold text-ink">Your profile isn&apos;t fully set up yet</div>
            <div className="mt-0.5 text-[12px] text-ink-soft">
              Add your {!co.gstin && 'GSTIN'}
              {!co.gstin && !co.bankAcc && ' and '}
              {!co.bankAcc && 'bank details'} from <b>Edit details</b> above so invoices print complete.
            </div>
          </div>
        </div>
      )}

      <InfoCard icon={<IdCard size={13} />} title="Registration" className="lg:col-span-7">
        <InfoRow k="GSTIN" v={co.gstin ?? 'Not set'} mono />
        <InfoRow k="PAN" v={co.pan ?? 'Not set'} mono />
        <InfoRow k="Registered address" v={co.address ?? 'Not set'} align="right" />
      </InfoCard>

      <InfoCard icon={<Percent size={13} />} title="GST rates" className="lg:col-span-5">
        <div className="flex gap-2">
          <RatePill value={Number(co.cgstRate)} label="CGST" enabled={co.cgstEnabled} />
          <RatePill value={Number(co.sgstRate)} label="SGST" enabled={co.sgstEnabled} />
          <RatePill value={Number(co.igstRate)} label="IGST" enabled={co.igstEnabled} />
        </div>
      </InfoCard>

      <InfoCard icon={<Landmark size={13} />} title="Banking" className="lg:col-span-7">
        <InfoRow k="Account name" v={co.bankName ?? 'Not set'} />
        <InfoRow k="Account number" v={co.bankAcc ? `•••• ${co.bankAcc.slice(-4)}` : 'Not set'} mono />
        <InfoRow k="IFSC" v={co.ifsc ?? 'Not set'} mono />
        {co.upi && <InfoRow k="UPI" v={co.upi} mono />}
      </InfoCard>

      <InfoCard icon={<Hash size={13} />} title="Invoice numbering" className="lg:col-span-5">
        <InfoRow k="Next invoice" v={`${co.invoicePrefix}/${co.invoiceFY}/${String(co.nextInvoiceNo).padStart(4, '0')}`} mono />
      </InfoCard>
    </div>
  );
}

function InfoCard({ icon, title, children, className }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl2 border border-line bg-surface p-4 shadow-card transition-colors hover:border-brand/50 ${className ?? ''}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">{icon}</span>
        <span className="text-[11.5px] font-extrabold uppercase tracking-wide text-ink-soft">{title}</span>
      </div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

function InfoRow({ k, v, mono, align }: { k: string; v: string; mono?: boolean; align?: 'right' }) {
  return (
    <div className="flex justify-between gap-2.5 border-b border-dashed border-line py-1.5 text-[12.5px] last:border-0">
      <span className="flex-shrink-0 text-ink-faint">{k}</span>
      <span className={`font-semibold text-ink-body ${align === 'right' ? 'max-w-[220px] text-right' : ''} ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  );
}

function RatePill({ value, label, enabled }: { value: number; label: string; enabled: boolean }) {
  return (
    <div className={`flex-1 rounded-lg2 border border-line bg-bg p-2.5 text-center ${enabled ? '' : 'opacity-40'}`}>
      <div className="font-mono text-[18px] font-extrabold text-brand-dark">{value}%</div>
      <div className="mt-0.5 text-[10px] font-bold text-ink-faint">
        {label}
        {enabled ? '' : ' · off'}
      </div>
    </div>
  );
}
