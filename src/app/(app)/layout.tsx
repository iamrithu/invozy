import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { BottomNav } from '@/components/shell/bottom-nav';
import { OnboardingTour } from '@/components/onboarding/onboarding-tour';
import { WelcomeCard } from '@/components/onboarding/welcome-card';
import { getCompany } from '@/lib/get-company';
import { themeStyleTag } from '@/lib/theme-presets';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [company, session] = await Promise.all([getCompany(), auth()]);
  const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { onboardedAt: true } }) : null;
  const isNewUser = !!user && !user.onboardedAt;

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
