import Link from 'next/link';
import { Scale, Sparkles, BookOpen, Shield, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/40 to-cyan-50/30">
      {/* Navbar */}
      <nav className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-6 h-6 text-blue-600" />
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              MouseLaw
            </span>
          </div>
          <Link
            href="/login"
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-lg transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/30"
          >
            Se connecter
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-7xl mx-auto px-6 py-20 text-center animate-fade-in">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 text-blue-700 rounded-full text-sm font-medium mb-8 shadow-sm">
          <Sparkles className="w-4 h-4" />
          IA juridique spécialisée en droit civil
        </div>

        <h1 className="text-6xl font-bold text-gray-900 mb-6 tracking-tight">
          Votre assistant juridique
          <br />
          <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent animate-gradient">
            expert en Code civil
          </span>
        </h1>

        <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-12 leading-relaxed">
          Posez vos questions juridiques et obtenez des réponses précises basées sur le Code civil français,
          accompagnées de références exactes aux articles de loi.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 hover:from-blue-700 hover:via-blue-800 hover:to-blue-900 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/60 hover:scale-105"
          >
            Commencer gratuitement
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto mt-20">
          <div className="text-center group">
            <div className="text-6xl font-bold bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform">
              2500+
            </div>
            <div className="text-sm text-gray-600 font-medium">Articles du Code civil</div>
          </div>
          <div className="text-center group">
            <div className="text-6xl font-bold bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform">
              100%
            </div>
            <div className="text-sm text-gray-600 font-medium">Réponses sourcées</div>
          </div>
          <div className="text-center group">
            <div className="text-6xl font-bold bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform">
              24/7
            </div>
            <div className="text-sm text-gray-600 font-medium">Disponible</div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="group bg-white rounded-2xl p-8 border-2 border-gray-200 hover:border-blue-300 shadow-sm hover:shadow-lg hover:shadow-blue-100 transition-all duration-300 hover:-translate-y-1">
            <div className="inline-flex p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl mb-4 group-hover:scale-110 transition-transform shadow-md">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Basé sur le Code civil
            </h3>
            <p className="text-gray-600">
              Toutes les réponses sont sourcées à partir des articles officiels du Code civil français.
            </p>
          </div>

          <div className="group bg-white rounded-2xl p-8 border-2 border-gray-200 hover:border-cyan-300 shadow-sm hover:shadow-lg hover:shadow-cyan-100 transition-all duration-300 hover:-translate-y-1">
            <div className="inline-flex p-3 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl mb-4 group-hover:scale-110 transition-transform shadow-md">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Intelligence artificielle
            </h3>
            <p className="text-gray-600">
              Propulsé par l'IA Mistral pour des réponses précises et contextualisées.
            </p>
          </div>

          <div className="group bg-white rounded-2xl p-8 border-2 border-gray-200 hover:border-blue-300 shadow-sm hover:shadow-lg hover:shadow-blue-100 transition-all duration-300 hover:-translate-y-1">
            <div className="inline-flex p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl mb-4 group-hover:scale-110 transition-transform shadow-md">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Fiable et sécurisé
            </h3>
            <p className="text-gray-600">
              Vos données sont protégées et toutes les réponses sont vérifiées.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
