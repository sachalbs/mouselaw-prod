'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/providers/AuthProvider';
import { Conversation } from '@/types/database.types';
import { Plus, MessageCircle, Trash2, Search, User, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function ConversationSidebar() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: authLoading, signOut } = useAuth();
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || !user) {
      setIsLoading(false);
      return;
    }

    loadConversations();
  }, [user, authLoading]);

  const loadConversations = async () => {
    if (!user) {
      console.log('⚠️  [SIDEBAR] No user, skipping conversations load');
      setIsLoading(false);
      return;
    }

    try {
      console.log('📂 [SIDEBAR] Loading conversations for user:', user.id);

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('❌ [SIDEBAR] Error loading conversations:', error);
        return;
      }

      console.log(`✅ [SIDEBAR] Loaded ${data?.length || 0} conversations`);
      if (data) setConversations(data);
    } catch (err) {
      console.error('❌ [SIDEBAR] Unexpected error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewConversation = async () => {
    if (!user) {
      console.log('⚠️  [SIDEBAR] No user, cannot create conversation');
      return;
    }

    try {
      console.log('📝 [SIDEBAR] Creating new conversation for user:', user.id);

      const { data, error } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title: 'Nouvelle conversation'
        })
        .select()
        .single();

      if (error) {
        console.error('❌ [SIDEBAR] Error creating conversation:', error);
        return;
      }

      if (data) {
        console.log('✅ [SIDEBAR] Conversation created:', data.id);
        router.push(`/chat/${data.id}`);
        loadConversations();
      }
    } catch (err) {
      console.error('❌ [SIDEBAR] Unexpected error creating conversation:', err);
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) return;

    try {
      console.log('🗑️  [SIDEBAR] Deleting conversation:', id);

      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ [SIDEBAR] Error deleting conversation:', error);
        return;
      }

      console.log('✅ [SIDEBAR] Conversation deleted');
      loadConversations();

      if (pathname.includes(id)) {
        router.push('/chat');
      }
    } catch (err) {
      console.error('❌ [SIDEBAR] Unexpected error deleting:', err);
    }
  };

  const handleLogout = async () => {
    console.log('👋 [SIDEBAR] Logging out...');
    await signOut();
  };

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupByPeriod = () => {
    const now = new Date();
    const today: Conversation[] = [];
    const yesterday: Conversation[] = [];
    const week: Conversation[] = [];
    const older: Conversation[] = [];

    filteredConversations.forEach(conv => {
      const date = new Date(conv.updated_at);
      const diff = now.getTime() - date.getTime();
      const days = diff / (1000 * 60 * 60 * 24);

      if (days < 1) today.push(conv);
      else if (days < 2) yesterday.push(conv);
      else if (days < 7) week.push(conv);
      else older.push(conv);
    });

    return { today, yesterday, week, older };
  };

  const groups = groupByPeriod();

  const ConversationGroup = ({ title, items }: { title: string; items: Conversation[] }) => {
    if (items.length === 0) return null;

    return (
      <div className="mb-6">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-3 mb-2">
          {title}
        </h3>
        <div className="space-y-0.5">
          {items.map(conv => {
            const isActive = pathname.includes(conv.id);

            return (
              <Link
                key={conv.id}
                href={`/chat/${conv.id}`}
                className={`
                  group relative flex items-center gap-3 px-3 py-2.5 rounded-xl
                  transition-all duration-200
                  ${isActive
                    ? 'bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700 shadow-sm border border-blue-100'
                    : 'text-gray-600 hover:bg-gray-50 hover:scale-[1.02]'
                  }
                `}
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <MessageCircle className={`w-4 h-4 flex-shrink-0 transition-transform ${
                  isActive ? 'text-blue-600 scale-110' : 'text-gray-400 group-hover:scale-110'
                }`} />
                <span className="flex-1 text-sm font-medium truncate">
                  {conv.title}
                </span>

                {hoveredId === conv.id && !isActive && (
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <aside className="w-72 bg-white border-r border-gray-200 flex flex-col shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="mb-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
            MouseLaw
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-medium">Assistant juridique IA</p>
        </div>

        <button
          onClick={createNewConversation}
          className="group w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm font-semibold rounded-xl transition-all duration-300 shadow-sm shadow-blue-500/20 hover:shadow-md hover:shadow-blue-500/30 hover:scale-105"
        >
          <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
          Nouvelle conversation
        </button>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">Chargement...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {searchQuery ? 'Aucune conversation trouvée' : 'Aucune conversation'}
            </p>
            {!searchQuery && (
              <p className="text-xs text-gray-400 mt-2">
                Créez votre première conversation
              </p>
            )}
          </div>
        ) : (
          <>
            <ConversationGroup title="Aujourd'hui" items={groups.today} />
            <ConversationGroup title="Hier" items={groups.yesterday} />
            <ConversationGroup title="Cette semaine" items={groups.week} />
            <ConversationGroup title="Plus ancien" items={groups.older} />
          </>
        )}
      </div>

      {/* Footer avec profil */}
      <div className="p-4 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            {user ? (
              <>
                <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                <p className="text-xs text-gray-500">{conversations.length} conversation{conversations.length > 1 ? 's' : ''}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-900 truncate">Utilisateur</p>
                <p className="text-xs text-gray-500">Account</p>
              </>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            title="Se déconnecter"
          >
            <LogOut className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
      `}</style>
    </aside>
  );
}
