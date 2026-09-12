'use client';

import { useSession, signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

export function AdminUserMenu() {
  const { data: session } = useSession();
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/admin/login' })}
      className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-[12px] font-bold text-white/80 hover:bg-white/10 hover:text-white"
    >
      <LogOut size={13} /> Log out{session?.user?.email ? ` (${session.user.email})` : ''}
    </button>
  );
}
