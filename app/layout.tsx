import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/providers/AuthProvider";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'MouseLaw - Assistant juridique IA',
  description: 'Assistant juridique intelligent expert en Code civil français. Réponses sourcées avec articles de loi et jurisprudence de la Cour de cassation.',
  keywords: ['droit', 'juridique', 'code civil', 'jurisprudence', 'IA', 'assistant juridique', 'légifrance'],
  authors: [{ name: 'MouseLaw' }],
  openGraph: {
    title: 'MouseLaw - Assistant juridique IA',
    description: 'Assistant juridique expert en droit civil français',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
