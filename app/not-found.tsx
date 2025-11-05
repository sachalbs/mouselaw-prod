import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="text-center px-4">
        {/* Icon */}
        <div className="text-6xl mb-6">⚖️</div>

        {/* Title */}
        <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>

        {/* Message */}
        <p className="text-xl text-gray-600 mb-2">Page non trouvée</p>
        <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto">
          Cette page n'existe pas ou a été déplacée. Retournez à l'accueil pour consulter votre assistant juridique.
        </p>

        {/* CTA */}
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <span>Retour à l'accueil</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
