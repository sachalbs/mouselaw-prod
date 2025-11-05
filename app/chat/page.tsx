'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/providers/AuthProvider';
import { Conversation } from '@/types/database.types';
import { Search, User, ArrowRight, BookOpen, Shield, Home } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ChatHomePage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user, loading } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }
    if (user) {
      loadConversations();
    }
  }, [user, loading]);

  const loadConversations = async () => {
    if (!user) return;

    try {

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(8);

      if (error) {
        console.error('Erreur chargement conversations:', error);
        return;
      }

      if (data) setConversations(data);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim() || isLoading) return;

    if (!user) {
      router.push('/auth/login');
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title: searchInput.slice(0, 60)
        })
        .select()
        .single();

      if (error) {
        console.error('Erreur création conversation:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        router.push(`/chat/${data.id}?q=${encodeURIComponent(searchInput)}`);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setIsLoading(false);
    }
  };

  const topics = [
    {
      icon: BookOpen,
      title: 'Contrats',
      description: "Quelles sont les conditions de validité d'un contrat ?",
      color: 'from-blue-500 to-blue-600'
    },
    {
      icon: Shield,
      title: 'Responsabilité',
      description: 'Quelle est la différence entre responsabilité contractuelle et délictuelle ?',
      color: 'from-cyan-500 to-cyan-600'
    },
    {
      icon: Home,
      title: 'Propriété',
      description: "Qu'est-ce que le droit de propriété ?",
      color: 'from-blue-500 to-blue-600'
    }
  ];

  // Show loading state while auth is initializing
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 via-blue-50/40 to-cyan-50/30">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  // Redirect handled by useEffect
  if (!user) {
    return null;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 via-blue-50/40 to-cyan-50/30">
      <div className="max-w-6xl mx-auto px-8 py-16">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 text-blue-700 rounded-full text-sm font-medium mb-6 shadow-sm">
            <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>
            IA juridique spécialisée en droit civil
          </div>

          <h1 className="text-5xl font-bold text-gray-900 mb-4 tracking-tight">
            Votre assistant juridique
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              expert en Code civil
            </span>
          </h1>

          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Posez vos questions juridiques et obtenez des réponses précises basées sur le Code civil français,
            accompagnées de références exactes aux articles de loi.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto mb-12">
          <div className="text-center group">
            <div className="text-4xl font-bold bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform">2500+</div>
            <div className="text-sm text-gray-600">Articles du Code civil</div>
          </div>
          <div className="text-center group">
            <div className="text-4xl font-bold bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform">100%</div>
            <div className="text-sm text-gray-600">Réponses sourcées</div>
          </div>
          <div className="text-center group">
            <div className="text-4xl font-bold bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform">24/7</div>
            <div className="text-sm text-gray-600">Disponible</div>
          </div>
        </div>

        {/* Search Box */}
        <form onSubmit={handleSearch} className="max-w-4xl mx-auto mb-16">
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <Search className="w-6 h-6 text-gray-400 mt-1 flex-shrink-0" />
                <textarea
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Ex: Quelle est la différence entre une SAS et une SARL ?"
                  className="flex-1 text-gray-700 text-base resize-none focus:outline-none min-h-[80px]"
                  rows={3}
                  disabled={isLoading}
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Appuyez sur <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">Entrée</kbd> pour rechercher
              </p>
              <button
                type="submit"
                disabled={!searchInput.trim() || isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105"
              >
                {isLoading ? 'Création...' : 'Rechercher'}
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>

        {/* Topics Grid - FIX: Ajout de pb-8 pour éviter la coupure */}
        <div className="max-w-5xl mx-auto pb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Exemples de questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {topics.map((topic, index) => (
              <button
                key={index}
                onClick={() => setSearchInput(topic.description)}
                className="group relative bg-white rounded-2xl p-6 border-2 border-gray-200 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-100 transition-all duration-300 text-left overflow-hidden hover:-translate-y-1"
              >
                {/* Gradient background on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${topic.color} opacity-0 group-hover:opacity-5 transition-opacity`}></div>

                <div className="relative">
                  <div className={`inline-flex p-3 bg-gradient-to-br ${topic.color} rounded-xl mb-4 shadow-md group-hover:scale-110 transition-transform`}>
                    <topic.icon className="w-6 h-6 text-white" />
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-2 text-lg">
                    {topic.title}
                  </h3>

                  <p className="text-sm text-gray-600 leading-relaxed">
                    {topic.description}
                  </p>

                  <div className="mt-4 flex items-center text-blue-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Poser cette question
                    <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Conversations */}
        {conversations.length > 0 && (
          <div className="max-w-5xl mx-auto mt-16 pb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Vos recherches récentes</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {conversations.map(conv => (
                <Link
                  key={conv.id}
                  href={`/chat/${conv.id}`}
                  className="group bg-white rounded-xl border-2 border-gray-200 hover:border-blue-300 hover:shadow-md hover:shadow-blue-100 transition-all duration-300 p-5 hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg group-hover:scale-110 transition-transform">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <button className="p-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all group-hover:scale-110">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2 leading-relaxed group-hover:text-blue-700 transition-colors">
                    {conv.title}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
