import Link from "next/link";

const LINKS = [
  { href: "/journal", title: "Journal quotidien", desc: "Saisir les chambres faites et voir le linge consommé." },
  { href: "/livraison", title: "Livraison", desc: "Enregistrer les livraisons reçues et vérifier une facture." },
  { href: "/stock", title: "Stock", desc: "Stock disponible, non conformes, manquants, ajustements." },
];

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Gestion de linge</h1>
      <p className="text-gray-600">Choisis un écran :</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-xl border border-gray-200 p-4 bg-white hover:border-black transition-colors"
          >
            <div className="font-semibold mb-1">{l.title}</div>
            <div className="text-sm text-gray-500">{l.desc}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
