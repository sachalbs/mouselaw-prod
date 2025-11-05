'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Send } from 'lucide-react';
import { use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChatMessage } from '@/components/chat/ChatMessage';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const hasAutoSubmitted = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Auto-scroll vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    loadMessages();

    // Auto-submit UNIQUEMENT si on vient de créer la conversation
    const query = searchParams.get('q');
    if (query && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      setTimeout(() => {
        sendMessage(query);
        // Supprimer le paramètre q de l'URL
        router.replace(`/chat/${resolvedParams.id}`);
      }, 500);
    }
  }, [resolvedParams.id]);

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', resolvedParams.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Erreur chargement messages:', error);
        return;
      }

      if (data) setMessages(data);
    } catch (err) {
      console.error('Erreur:', err);
    }
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim() || isLoading) return;

    setInput('');
    setIsLoading(true);
    setError('');

    // Optimistic UI: Ajouter message user immédiatement
    const tempUserMsg: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: messageText,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      // Appeler l'API - elle gère TOUT (insertion user + appel Mistral + insertion assistant)
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          conversationId: resolvedParams.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.details || 'Erreur API');
      }

      const data = await response.json();

      // Recharger tous les messages depuis la base pour avoir les vrais IDs
      await loadMessages();

    } catch (err: any) {
      // En cas d'erreur, retirer le message temporaire
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      setError(err.message || 'Une erreur est survenue');
      console.error('Erreur:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-blue-50/30">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {messages.length === 0 && !isLoading && (
            <div className="text-center py-20">
              <p className="text-gray-500">Posez votre première question juridique...</p>
            </div>
          )}

          <div className="space-y-6">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-5 py-3 shadow-sm">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white/80 backdrop-blur-sm p-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez votre question juridique..."
              disabled={isLoading}
              className="w-full pl-5 pr-14 py-4 text-base bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:bg-gray-300 text-white rounded-lg transition-all duration-300 hover:scale-105"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
