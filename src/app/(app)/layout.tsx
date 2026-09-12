import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { BottomNav } from '@/components/shell/bottom-nav';
import { getCompany } from '@/lib/get-company';
import { themeStyleTag } from '@/lib/theme-presets';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const company = await getCompany();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Per-company theme color override — see src/lib/theme-presets.ts */}
      <style dangerouslySetInnerHTML={{ __html: themeStyleTag(company.themeColor) }} />
      <TopBar company={{ name: company.name, logoUrl: company.logoUrl }} />
      <div className="flex flex-1">
        <Sidebar />
        <main className="mx-auto w-full max-w-[1220px] flex-1 px-4 py-5 pb-24 md:px-6 md:pb-5">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
