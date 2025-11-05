-- Mouse Law - Complete Database Schema
-- This schema creates all tables, RLS policies, and seed data for the Mouse Law platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. USERS PROFILES TABLE
-- ============================================================================
-- Complements Supabase auth.users with additional profile information
CREATE TABLE IF NOT EXISTS public.users_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  university TEXT,
  year_of_study TEXT CHECK (year_of_study IN ('L1', 'L2', 'L3', 'M1', 'M2', 'Autre')),

  -- Subscription management
  subscription_status TEXT NOT NULL DEFAULT 'free' CHECK (subscription_status IN ('free', 'active', 'cancelled')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,

  -- Usage tracking
  monthly_quota INTEGER NOT NULL DEFAULT 50, -- Free users: 50 messages/month
  messages_used INTEGER NOT NULL DEFAULT 0,
  quota_reset_date TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 month'),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_profiles_email ON public.users_profiles(email);
CREATE INDEX IF NOT EXISTS idx_users_profiles_stripe_customer ON public.users_profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_profiles_subscription_status ON public.users_profiles(subscription_status);

-- ============================================================================
-- 2. CONVERSATIONS TABLE
-- ============================================================================
-- Stores chat conversations between users and the Mouse chatbot
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users_profiles(id) ON DELETE CASCADE,

  -- Conversation metadata
  mode TEXT NOT NULL CHECK (mode IN ('cas_pratique', 'dissertation', 'commentaire')),
  title TEXT NOT NULL DEFAULT 'Nouvelle conversation',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_mode ON public.conversations(mode);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON public.conversations(created_at DESC);

-- ============================================================================
-- 3. MESSAGES TABLE
-- ============================================================================
-- Stores individual messages within conversations
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,

  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,

  -- Legal citations (for assistant messages)
  citations JSONB DEFAULT '[]'::jsonb,
  -- Example structure:
  -- [
  --   {"type": "article", "reference": "Article 1240 du Code civil", "content": "..."},
  --   {"type": "jurisprudence", "reference": "Cass. civ. 1ère, 14 décembre 2004", "content": "..."}
  -- ]

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_citations ON public.messages USING GIN(citations);

-- ============================================================================
-- 4. CODE CIVIL ARTICLES TABLE
-- ============================================================================
-- Stores articles from French legal codes for reference and search
CREATE TABLE IF NOT EXISTS public.code_civil_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Article identification
  article_number TEXT NOT NULL UNIQUE,
  title TEXT,

  -- Content
  content TEXT NOT NULL,
  category TEXT, -- e.g., "Responsabilité civile", "Contrats", "Obligations"
  keywords TEXT[], -- Array of keywords for search

  -- Metadata
  code_name TEXT DEFAULT 'Code civil',
  last_modified DATE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for search and performance
CREATE INDEX IF NOT EXISTS idx_code_civil_article_number ON public.code_civil_articles(article_number);
CREATE INDEX IF NOT EXISTS idx_code_civil_category ON public.code_civil_articles(category);
CREATE INDEX IF NOT EXISTS idx_code_civil_keywords ON public.code_civil_articles USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_code_civil_content_search ON public.code_civil_articles USING GIN(to_tsvector('french', content));

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_civil_articles ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- RLS Policies for users_profiles
-- -----------------------------------------------------------------------------

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.users_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users_profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert own profile"
  ON public.users_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- RLS Policies for conversations
-- -----------------------------------------------------------------------------

-- Users can view their own conversations
CREATE POLICY "Users can view own conversations"
  ON public.conversations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own conversations
CREATE POLICY "Users can create own conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own conversations
CREATE POLICY "Users can update own conversations"
  ON public.conversations
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own conversations
CREATE POLICY "Users can delete own conversations"
  ON public.conversations
  FOR DELETE
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- RLS Policies for messages
-- -----------------------------------------------------------------------------

-- Users can view messages in their own conversations
CREATE POLICY "Users can view messages in own conversations"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Users can create messages in their own conversations
CREATE POLICY "Users can create messages in own conversations"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Users can delete messages in their own conversations
CREATE POLICY "Users can delete messages in own conversations"
  ON public.messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RLS Policies for code_civil_articles
-- -----------------------------------------------------------------------------

-- All authenticated users can read Code civil articles
CREATE POLICY "Authenticated users can read Code civil articles"
  ON public.code_civil_articles
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can modify Code civil articles (admin only)
CREATE POLICY "Only service role can modify Code civil articles"
  ON public.code_civil_articles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users_profiles
CREATE TRIGGER update_users_profiles_updated_at
  BEFORE UPDATE ON public.users_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for conversations
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for code_civil_articles
CREATE TRIGGER update_code_civil_articles_updated_at
  BEFORE UPDATE ON public.code_civil_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to reset monthly quota
CREATE OR REPLACE FUNCTION reset_monthly_quota()
RETURNS void AS $$
BEGIN
  UPDATE public.users_profiles
  SET
    messages_used = 0,
    quota_reset_date = NOW() + INTERVAL '1 month'
  WHERE quota_reset_date <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to increment message usage
CREATE OR REPLACE FUNCTION increment_message_usage(user_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.users_profiles
  SET messages_used = messages_used + 1
  WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA - CODE CIVIL ARTICLES
-- ============================================================================

-- Insert common Code civil articles for testing
INSERT INTO public.code_civil_articles (article_number, title, content, category, keywords) VALUES
(
  '1240',
  'Responsabilité du fait personnel',
  'Tout fait quelconque de l''homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer.',
  'Responsabilité civile',
  ARRAY['responsabilité', 'faute', 'dommage', 'réparation', 'fait personnel']
),
(
  '1241',
  'Responsabilité en cas de faute',
  'Chacun est responsable du dommage qu''il a causé non seulement par son fait, mais encore par sa négligence ou par son imprudence.',
  'Responsabilité civile',
  ARRAY['responsabilité', 'négligence', 'imprudence', 'dommage', 'faute']
),
(
  '1242',
  'Responsabilité du fait d''autrui et des choses',
  'On est responsable non seulement du dommage que l''on cause par son propre fait, mais encore de celui qui est causé par le fait des personnes dont on doit répondre, ou des choses que l''on a sous sa garde.',
  'Responsabilité civile',
  ARRAY['responsabilité', 'fait d''autrui', 'garde', 'choses', 'dommage']
),
(
  '1103',
  'Force obligatoire du contrat',
  'Les contrats légalement formés tiennent lieu de loi à ceux qui les ont faits.',
  'Droit des contrats',
  ARRAY['contrat', 'force obligatoire', 'pacta sunt servanda', 'parties']
),
(
  '1104',
  'Bonne foi contractuelle',
  'Les contrats doivent être négociés, formés et exécutés de bonne foi. Cette disposition est d''ordre public.',
  'Droit des contrats',
  ARRAY['contrat', 'bonne foi', 'négociation', 'exécution', 'ordre public']
)
ON CONFLICT (article_number) DO NOTHING;

-- ============================================================================
-- GRANTS AND PERMISSIONS
-- ============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Grant access to tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT ON public.code_civil_articles TO authenticated;

-- Grant all access to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.users_profiles IS 'User profiles complementing Supabase auth.users with subscription and usage tracking';
COMMENT ON TABLE public.conversations IS 'Chat conversations between users and the Mouse AI assistant';
COMMENT ON TABLE public.messages IS 'Individual messages within conversations, including legal citations';
COMMENT ON TABLE public.code_civil_articles IS 'French legal code articles for reference and search functionality';

COMMENT ON COLUMN public.users_profiles.monthly_quota IS 'Number of messages allowed per month (50 for free, unlimited for premium)';
COMMENT ON COLUMN public.users_profiles.messages_used IS 'Number of messages used in current billing period';
COMMENT ON COLUMN public.messages.citations IS 'JSONB array of legal citations (articles, jurisprudence, doctrine)';
