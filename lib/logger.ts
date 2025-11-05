/**
 * Logger pour environnement production
 * - En dev : affiche tous les logs
 * - En prod : affiche seulement erreurs et warnings
 */

const isDev = process.env.NODE_ENV === 'development';
const isProd = process.env.NODE_ENV === 'production';

export const logger = {
  info: (...args: any[]) => {
    if (isDev) {
      console.log('ℹ️', ...args);
    }
  },

  success: (...args: any[]) => {
    if (isDev) {
      console.log('✅', ...args);
    }
  },

  error: (...args: any[]) => {
    // Toujours logger les erreurs
    console.error('❌', ...args);
  },

  warn: (...args: any[]) => {
    console.warn('⚠️', ...args);
  },

  debug: (...args: any[]) => {
    if (isDev) {
      console.log('🔍', ...args);
    }
  },
};
