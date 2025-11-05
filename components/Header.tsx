'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/providers/AuthProvider';
import { LogOut, User } from 'lucide-react';

export function Header() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Title */}
          <Link href="/chat" className="flex items-center gap-3 hover:opacity-80 transition">
            <div className="text-2xl">⚖️</div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">MouseLaw</h1>
              <p className="text-xs text-gray-500">Assistant juridique IA</p>
            </div>
          </Link>

          {/* User Menu */}
          {user && (
            <div className="flex items-center gap-4">
              {/* User Info */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                <User className="w-4 h-4 text-gray-600" />
                <span className="text-sm text-gray-700 max-w-[200px] truncate">
                  {user.email}
                </span>
              </div>

              {/* Logout Button */}
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Se déconnecter"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
