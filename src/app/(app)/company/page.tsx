import { Building2 } from 'lucide-react';
import { getCompanyProfile } from '@/actions/company';
import { getAppSettings } from '@/lib/settings';
import { CompanyProfile } from './company-profile';

export const dynamic = 'force-dynamic';

export default async function CompanyPage() {
  // Without the encrypted NIC credentials — the page only needs to know
  // whether each one is saved (see src/lib/public-company.ts).
  const [company, settings] = await Promise.all([getCompanyProfile(), getAppSettings()]);
  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[18px] font-extrabold text-ink sm:text-[20px]">
          <Building2 size={18} className="text-brand" /> Company profile
        </h1>
        <p className="mt-1 text-[12px] text-ink-faint">Everything here prints on your invoices. Tap Edit on any section to change it in place.</p>
      </div>
      <CompanyProfile company={JSON.parse(JSON.stringify(company))} pdfItemRows={settings.pdfItemRows} pdfLayout={settings.pdfLayout} />
    </div>
  );
}
