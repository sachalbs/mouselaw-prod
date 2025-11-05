import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-4xl mb-4">⚖️</div>
        <LoadingSpinner size="lg" />
        <p className="text-sm text-gray-600 mt-4">Chargement...</p>
      </div>
    </div>
  );
}
