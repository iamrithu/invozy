import Link from 'next/link';
import { Lock } from 'lucide-react';
import { getCompany } from '@/lib/get-company';
import { isModuleEnabled, moduleInfo, type ModuleKey } from '@/lib/modules';

/** Server-side gate for a module's pages (used by each module's layout.tsx):
 * the page itself when the company has the module, otherwise a notice. The
 * company's data stays untouched either way. */
export async function ModuleGate({ module, children }: { module: ModuleKey; children: React.ReactNode }) {
  const company = await getCompany();
  if (isModuleEnabled(company.disabledModules, module)) return <>{children}</>;
  const info = moduleInfo(module);
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl2 border border-line bg-surface p-7 text-center shadow-card">
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-alt text-ink-faint">
        <Lock size={18} />
      </span>
      <h1 className="text-[17px] font-extrabold text-ink">{info.label} isn’t enabled</h1>
      <p className="mt-1.5 text-[12.5px] text-ink-soft">{info.description}</p>
      <p className="mt-3 text-[12.5px] text-ink-faint">This module is switched off for your company. Contact support to turn it on.</p>
      <Link href="/dashboard" className="mt-5 inline-block text-[12.5px] font-bold text-brand">
        Back to dashboard
      </Link>
    </div>
  );
}
