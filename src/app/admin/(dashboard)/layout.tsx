import Image from 'next/image';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { AdminUserMenu } from '@/components/shell/admin-user-menu';
import { ThemeToggle } from '@/components/shell/theme-toggle';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-40 flex h-[61px] flex-shrink-0 items-center gap-3 border-b border-line bg-chrome px-5 text-white">
        <Image src="/brand/logo.png" alt="Invozy" width={994} height={324} className="h-7 w-auto" />
        <span className="text-[13px] font-bold text-white/60">Admin</span>
        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle />
          <AdminUserMenu />
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-[200px] flex-shrink-0 flex-col gap-1 border-r border-line bg-surface p-3 md:flex">
          <Link href="/admin" className="flex items-center gap-2.5 rounded-md2 bg-brand-light px-3 py-2.5 text-[13px] font-bold text-brand">
            <Building2 size={16} /> Companies
          </Link>
        </aside>
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
