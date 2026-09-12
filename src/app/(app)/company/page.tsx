import { Building2 } from 'lucide-react';
import { getCompanyProfile } from '@/actions/company';
import { CompanyForm } from './company-form';
import { CompanyView } from './company-view';

export const dynamic = 'force-dynamic';

export default async function CompanyPage() {
  const company = await getCompanyProfile();
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-extrabold text-ink">
            <Building2 size={18} className="text-brand" /> Company profile
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">These details print on every invoice. GST rates below decide what shows as CGST/SGST vs IGST.</p>
        </div>
        <CompanyForm company={JSON.parse(JSON.stringify(company))} />
      </div>
      <CompanyView company={company} />
    </div>
  );
}
