#!/usr/bin/env tsx

/**
 * Apply jurisprudence table migration to Supabase
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         Applying Jurisprudence Table Migration           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Read migration file
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', 'add_jurisprudence_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Reading migration file...');
    console.log(`   File: ${migrationPath}\n`);

    console.log('🔧 Applying migration to Supabase...\n');

    // Note: Supabase client doesn't directly support raw SQL execution from client
    // We need to use the Supabase dashboard or CLI for migrations
    // This script serves as documentation

    console.log('⚠️  Please apply this migration using one of these methods:\n');
    console.log('1. Supabase Dashboard:');
    console.log('   - Go to https://supabase.com/dashboard');
    console.log('   - Select your project');
    console.log('   - Go to SQL Editor');
    console.log('   - Paste the contents of supabase/migrations/add_jurisprudence_table.sql');
    console.log('   - Run the query\n');

    console.log('2. Supabase CLI:');
    console.log('   - Install: npm install -g supabase');
    console.log('   - Login: supabase login');
    console.log('   - Link project: supabase link');
    console.log('   - Apply migration: supabase db push\n');

    console.log('3. Manual SQL execution:');
    console.log('   The migration SQL is ready in:');
    console.log(`   ${migrationPath}\n`);

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('For now, I will create the table directly using the Supabase client...\n');

    // Try to create the table directly
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS public.jurisprudence (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        juridiction TEXT NOT NULL,
        date DATE NOT NULL,
        numero TEXT NOT NULL UNIQUE,
        nom_usuel TEXT,
        titre TEXT NOT NULL,
        faits TEXT NOT NULL,
        solution TEXT NOT NULL,
        principe TEXT NOT NULL,
        articles_lies TEXT[] DEFAULT '{}',
        categorie TEXT,
        importance TEXT CHECK (importance IN ('fondamental', 'majeur', 'important', 'complementaire')),
        mots_cles TEXT[] DEFAULT '{}',
        embedding VECTOR(1024),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    console.log('✅ Migration SQL is ready to be applied.');
    console.log('   Please apply it manually via the Supabase Dashboard SQL Editor.\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
