import { AlertCircle } from 'lucide-react';

export function ErrorMessage({
  message,
  title = "Une erreur est survenue"
}: {
  message: string;
  title?: string;
}) {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-900 mb-1">
            {title}
          </h3>
          <p className="text-sm text-red-800">
            {message}
          </p>
          <p className="text-xs text-red-600 mt-2">
            Si le problème persiste, contactez le support.
          </p>
        </div>
      </div>
    </div>
  );
}
