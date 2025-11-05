'use client';

import { useAuth } from '@/lib/providers/AuthProvider';
import { User } from 'lucide-react';

export function UserInfo() {
  const { user, loading } = useAuth();

  if (loading || !user) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
      <User className="w-4 h-4 text-blue-600" />
      <span className="text-sm text-blue-900 font-medium">{user.email}</span>
    </div>
  );
}
