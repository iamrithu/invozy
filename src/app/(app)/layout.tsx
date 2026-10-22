import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { BottomNav } from '@/components/shell/bottom-nav';
import { OnboardingTour } from '@/components/onboarding/onboarding-tour';
import { WelcomeCard } from '@/components/onboarding/welcome-card';
import { getCompany } from '@/lib/get-company';
import { requireUser } from '@/lib/session';
import { themeStyleTag } from '@/lib/theme-presets';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The proxy only checks that the session cookie is validly signed;
  // requireUser also confirms the user exists. A cookie that fails that goes
  // back to the login screen (which doesn't bounce it here again — see
  // src/app/login/page.tsx).
  const [user, company] = await Promise.all([requireUser().catch(() => null), getCompany().catch(() => null)]);
  if (!user || !company) redirect('/login');
  const isNewUser = !user.onboardedAt;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Per-company theme color override — see src/lib/theme-presets.ts */}
      <style dangerouslySetInnerHTML={{ __html: themeStyleTag(company.themeColor) }} />
      <WelcomeCard show={isNewUser} companyName={company.name} />
      <OnboardingTour />
      <TopBar company={{ name: company.name, logoUrl: company.logoUrl }} />
      <div className="flex flex-1">
        <Sidebar />
        {/* print:max-w-none/p-0 — Sidebar/TopBar/BottomNav already hide
            themselves on print (each has its own print:hidden), so a
            printed page (e.g. the Reports page's Print button) just needs
            this content column freed from its on-screen width cap/padding
            to use the full printed page. */}
        <main className="mx-auto w-full max-w-[1220px] flex-1 px-4 py-5 pb-24 md:px-6 md:pb-5 print:max-w-none print:p-0">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
