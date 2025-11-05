-- Initialize temporary user for development
-- This user will be used until authentication is implemented

-- First, we need to insert into auth.users (this requires service role access)
-- For now, we'll just insert into users_profiles with the temp UUID

-- Insert temporary user profile
INSERT INTO public.users_profiles (
  id,
  email,
  full_name,
  subscription_status,
  monthly_quota,
  messages_used
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'temp@mouselaw.dev',
  'Utilisateur Temporaire',
  'free',
  50,
  0
)
ON CONFLICT (id) DO NOTHING;

-- Grant necessary permissions
-- The user should be able to create conversations and messages
