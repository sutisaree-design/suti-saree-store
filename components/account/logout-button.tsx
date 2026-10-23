'use client';

import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function LogoutButton() {
  const { signOut } = useAuth();
  return (
    <button
      onClick={() => signOut()}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-destructive hover:bg-destructive/5 transition-colors"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/8">
        <LogOut className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium">Logout</span>
    </button>
  );
}
