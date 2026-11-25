import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestion Linge",
  description: "Gestion du linge hôtelier",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-gray-200 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 flex gap-6 text-sm font-medium">
            <Link href="/journal" className="py-3 hover:text-black text-gray-600">
              Journal quotidien
            </Link>
            <Link href="/livraison" className="py-3 hover:text-black text-gray-600">
              Livraison
            </Link>
            <Link href="/stock" className="py-3 hover:text-black text-gray-600">
              Stock
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
