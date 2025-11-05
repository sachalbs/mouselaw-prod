#!/usr/bin/env node

/**
 * Vérifie que toutes les variables d'environnement requises sont présentes
 */

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MISTRAL_API_KEY',
];

const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('❌ Variables d\'environnement manquantes:');
  missing.forEach(key => console.error(`   - ${key}`));
  console.error('\n💡 Copiez .env.example vers .env.local et remplissez les valeurs.');
  process.exit(1);
}

console.log('✅ Toutes les variables d\'environnement sont présentes');
console.log(`   - ${required.length} variables configurées`);
