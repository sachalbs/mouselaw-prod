'use client';

import { useAuth } from '@/lib/providers/AuthProvider';
import { LogOut } from 'lucide-react';

export function LogoutButton() {
  const { signOut, user } = useAuth();

  if (!user) return null;

  return (
    <button
      onClick={signOut}
      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <LogOut className="w-4 h-4" />
      Se déconnecter
    </button>
  );
}
