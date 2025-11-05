'use client';

import { useState } from 'react';
import { Plus, MessageSquare, Menu, X, ChevronLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Conversation {
  id: string;
  title: string;
  mode: string;
  created_at: string;
  updated_at: string;
}

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

export function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const toggleMobileSidebar = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  const handleSelectConversation = (id: string) => {
    onSelectConversation(id);
    setIsMobileOpen(false);
  };

  const handleNewConversation = () => {
    onNewConversation();
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={toggleMobileSidebar}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white p-2 rounded-lg shadow-md border border-slate-200 hover:bg-slate-50 transition-colors"
        aria-label="Toggle menu"
      >
        {isMobileOpen ? (
          <X className="w-5 h-5 text-slate-700" />
        ) : (
          <Menu className="w-5 h-5 text-slate-700" />
        )}
      </button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={toggleMobileSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 h-screen bg-white border-r border-slate-200 z-40
          transition-all duration-300 ease-in-out flex flex-col
          ${
            isOpen
              ? 'w-80'
              : 'w-16 lg:flex hidden'
          }
          ${
            isMobileOpen
              ? 'translate-x-0'
              : '-translate-x-full lg:translate-x-0'
          }
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          {isOpen ? (
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Conversations</h2>
              <button
                onClick={toggleSidebar}
                className="hidden lg:block p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Réduire"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          ) : (
            <button
              onClick={toggleSidebar}
              className="w-full p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Agrandir"
            >
              <Menu className="w-5 h-5 text-slate-600 mx-auto" />
            </button>
          )}
        </div>

        {/* New Conversation Button */}
        {isOpen && (
          <div className="p-4">
            <button
              onClick={handleNewConversation}
              className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-200 font-medium shadow-sm hover:shadow-md"
            >
              <Plus className="w-5 h-5" />
              Nouvelle conversation
            </button>
          </div>
        )}

        {!isOpen && (
          <div className="p-2">
            <button
              onClick={handleNewConversation}
              className="w-full p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              aria-label="Nouvelle conversation"
            >
              <Plus className="w-5 h-5 mx-auto" />
            </button>
          </div>
        )}

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {isOpen ? (
            <div className="px-2 pb-4 space-y-1">
              {conversations.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  Aucune conversation
                </div>
              ) : (
                conversations.map((conversation) => {
                  const isActive = currentConversationId === conversation.id;
                  return (
                    <button
                      key={conversation.id}
                      onClick={() => handleSelectConversation(conversation.id)}
                      className={`
                        w-full text-left px-3 py-3 rounded-lg transition-all duration-200
                        ${
                          isActive
                            ? 'bg-blue-50 border border-blue-200'
                            : 'hover:bg-slate-50 border border-transparent'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <MessageSquare
                          className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                            isActive ? 'text-blue-600' : 'text-slate-400'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className={`font-medium text-sm truncate ${
                              isActive ? 'text-blue-900' : 'text-slate-900'
                            }`}
                          >
                            {conversation.title}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {formatDistanceToNow(
                              new Date(conversation.updated_at),
                              {
                                addSuffix: true,
                                locale: fr,
                              }
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div className="px-2 pb-4 space-y-2">
              {conversations.slice(0, 5).map((conversation) => {
                const isActive = currentConversationId === conversation.id;
                return (
                  <button
                    key={conversation.id}
                    onClick={() => handleSelectConversation(conversation.id)}
                    className={`
                      w-full p-2.5 rounded-lg transition-colors
                      ${
                        isActive
                          ? 'bg-blue-50 text-blue-600'
                          : 'hover:bg-slate-50 text-slate-400'
                      }
                    `}
                    aria-label={conversation.title}
                  >
                    <MessageSquare className="w-5 h-5 mx-auto" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
