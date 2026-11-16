import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { BottomNav } from '@/components/shell/bottom-nav';
import { OnboardingTour } from '@/components/onboarding/onboarding-tour';
import { WelcomeCard } from '@/components/onboarding/welcome-card';
import { CurrentUserProvider } from '@/components/current-user';
import { getCompany } from '@/lib/get-company';
import { requireUser } from '@/lib/session';
import { themeStyleTag } from '@/lib/theme-presets';
import { ModulesProvider } from '@/components/modules/modules-provider';
import { StatusBanners } from '@/components/shell/status-banners';
import { subscriptionView } from '@/lib/entitlements';

// Installed-app look (see src/app/manifest.ts): the phone's status bar takes
// the brand red, and iOS — which ignores most of the manifest — opens a
// home-screen launch full screen under the short "Invozy" name instead of as a
// Safari tab. Set here rather than in the root layout so it only applies
// where the app is actually used (and installed from).
export const viewport: Viewport = {
  themeColor: '#E23645',
};

export const metadata: Metadata = {
  appleWebApp: { capable: true, title: 'Invozy', statusBarStyle: 'default' },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The proxy only checks that the session cookie is validly signed;
  // requireUser also confirms the user exists. A cookie that fails that goes
  // back to the login screen (which doesn't bounce it here again — see
  // src/app/login/page.tsx). Anything else — the company row failing to load
  // — is thrown to src/app/error.tsx: sending a signed-in user to /login for
  // it would loop, since /login sends them straight back here.
  const [userResult, companyResult] = await Promise.allSettled([requireUser(), getCompany()]);
  if (userResult.status === 'rejected') redirect('/login');
  if (companyResult.status === 'rejected') throw companyResult.reason;
  const user = userResult.value;
  const company = companyResult.value;
  const isNewUser = !user.onboardedAt;
  const subscription = subscriptionView(company);

  return (
    // Every client component below can read the signed-in login (name, role)
    // via useCurrentUser() — e.g. to hide owner-only buttons from staff.
    <CurrentUserProvider user={{ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }}>
      {/* Modules the platform admin switched off for this company (src/lib/modules.ts). */}
      <ModulesProvider disabled={company.disabledModules}>
      <div className="flex min-h-screen flex-col">
        {/* Per-company theme color override — see src/lib/theme-presets.ts */}
        <style dangerouslySetInnerHTML={{ __html: themeStyleTag(company.themeColor) }} />
        <StatusBanners
          viewOnly={user.viewOnly ? { companyName: company.name } : null}
          unverifiedEmail={!user.viewOnly && user.email && !user.emailVerifiedAt ? user.email : null}
          billing={{ state: subscription.state, daysLeft: subscription.daysLeft, isOwner: user.role === 'OWNER', planLabel: subscription.plan.label }}
        />
        <WelcomeCard show={isNewUser} companyName={company.name} />
        <OnboardingTour />
        <TopBar company={{ name: company.name, logoUrl: company.logoUrl }} />
        <div className="flex flex-1">
          <Sidebar />
          {/* print:max-w-none/p-0 — Sidebar/TopBar/BottomNav already hide
              themselves on print (each has its own print:hidden), so a
              printed page (e.g. the Reports page's Print button) just needs
              this content column freed from its on-screen width cap/padding
              to use the full printed page. min-w-0 keeps a wide table
              scrolling inside its own box instead of widening the page
              (which made phones zoom out and full-screen sheets overflow). */}
          <main className="mx-auto w-full min-w-0 max-w-[1220px] flex-1 px-4 py-5 pb-24 md:px-6 md:pb-5 print:max-w-none print:p-0">{children}</main>
        </div>
        <BottomNav />
      </div>
      </ModulesProvider>
    </CurrentUserProvider>
  );
}
