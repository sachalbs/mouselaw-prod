export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  mode: 'cas_pratique' | 'dissertation' | 'commentaire' | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}
