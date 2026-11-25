"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";

type LinenType = { id: string; name: string };
type Movement = {
  id: string;
  linen_type_id: string;
  movement_type: string;
  quantity: number;
  movement_date: string;
  note: string | null;
};

const MOVEMENT_LABELS: Record<string, string> = {
  stock_initial: "Stock initial",
  reception: "Réception",
  consommation: "Consommation",
  non_conforme: "Non conforme",
  manquant: "Manquant",
  ajustement: "Ajustement",
};

const ENTRY_TYPES = ["non_conforme", "manquant", "ajustement"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function StockPage() {
  const supabase = createClient();

  const [hotelId, setHotelId] = useState<string | null>(null);
  const [linenTypes, setLinenTypes] = useState<LinenType[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // filtre détail
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterLinen, setFilterLinen] = useState("");

  useEffect(() => {
    setDateStart(firstOfMonthStr());
    setDateEnd(todayStr());
  }, []);

  // formulaire non conforme / manquant / ajustement
  const [entryDate, setEntryDate] = useState("");
  const [entryLinenId, setEntryLinenId] = useState("");
  const [entryType, setEntryType] = useState("non_conforme");
  const [entryQuantity, setEntryQuantity] = useState(1);
  const [entryDirection, setEntryDirection] = useState<"plus" | "moins">("moins");
  const [entryNote, setEntryNote] = useState("");
  const [entryBy, setEntryBy] = useState("");

  useEffect(() => {
    setEntryDate(todayStr());
  }, []);

  // stock initial
  const [initialValues, setInitialValues] = useState<Record<string, number>>({});
  const [savingInitial, setSavingInitial] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: hotels, error: hotelErr } = await supabase
      .from("hotels")
      .select("id")
      .limit(1);
    if (hotelErr || !hotels || hotels.length === 0) {
      setError("Impossible de trouver l'hôtel. Vérifie la table 'hotels'.");
      setLoading(false);
      return;
    }
    const hId = hotels[0].id as string;
    setHotelId(hId);

    const [{ data: lts }, { data: moves, error: moveErr }] = await Promise.all([
      supabase.from("linen_types").select("id, name").eq("hotel_id", hId).order("name"),
      supabase
        .from("stock_movements")
        .select("id, linen_type_id, movement_type, quantity, movement_date, note")
        .eq("hotel_id", hId),
    ]);

    setLinenTypes(lts ?? []);
    setMovements(moves ?? []);
    if ((lts?.length ?? 0) > 0 && !entryLinenId) setEntryLinenId(lts![0].id);
    if (moveErr) setError("Erreur de chargement : " + moveErr.message);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const linenTypeName = (id: string) => linenTypes.find((l) => l.id === id)?.name ?? "?";

  // Solde actuel par type de linge = somme de TOUS les mouvements (tout historique confondu)
  const balance: Record<string, number> = {};
  for (const lt of linenTypes) balance[lt.id] = 0;
  for (const m of movements) {
    balance[m.linen_type_id] = (balance[m.linen_type_id] ?? 0) + m.quantity;
  }

  // Types de linge n'ayant pas encore de stock initial posé
  const linenWithoutInitial = linenTypes.filter(
    (lt) => !movements.some((m) => m.linen_type_id === lt.id && m.movement_type === "stock_initial")
  );

  async function handleSetInitial(linenTypeId: string) {
    if (!hotelId) return;
    const qty = initialValues[linenTypeId];
    if (qty === undefined || qty < 0) return;
    setSavingInitial(linenTypeId);
    setError(null);

    const { error: insertErr } = await supabase.from("stock_movements").insert({
      hotel_id: hotelId,
      linen_type_id: linenTypeId,
      movement_type: "stock_initial",
      quantity: qty,
      movement_date: todayStr(),
    });

    setSavingInitial(null);
    if (insertErr) {
      setError("Erreur à l'enregistrement du stock initial : " + insertErr.message);
      return;
    }
    await loadAll();
  }

  async function handleEntrySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hotelId || !entryLinenId) return;
    setSaving(true);
    setError(null);

    // La quantité tapée est toujours positive ; le signe est déterminé ici,
    // jamais par l'utilisateur :
    // - non_conforme / manquant : toujours un retrait du stock
    // - ajustement : selon le sens choisi (ajout ou retrait)
    let signedQuantity = -Math.abs(entryQuantity);
    if (entryType === "ajustement") {
      signedQuantity = entryDirection === "plus" ? Math.abs(entryQuantity) : -Math.abs(entryQuantity);
    }

    const { error: insertErr } = await supabase.from("stock_movements").insert({
      hotel_id: hotelId,
      linen_type_id: entryLinenId,
      movement_type: entryType,
      quantity: signedQuantity,
      movement_date: entryDate,
      note: entryNote || null,
      created_by: entryBy || null,
    });

    setSaving(false);
    if (insertErr) {
      setError("Erreur à l'enregistrement : " + insertErr.message);
      return;
    }
    setEntryQuantity(1);
    setEntryNote("");
    await loadAll();
  }

  // Détail filtré (pour vérifier/grouper)
  const filteredMovements = movements.filter((m) => {
    if (m.movement_date < dateStart || m.movement_date > dateEnd) return false;
    if (filterType && m.movement_type !== filterType) return false;
    if (filterLinen && m.linen_type_id !== filterLinen) return false;
    return true;
  });

  const recapByType: Record<string, number> = {};
  for (const m of filteredMovements) {
    const key = m.movement_type;
    recapByType[key] = (recapByType[key] ?? 0) + m.quantity;
  }

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Stock</h1>

      {error && (
        <div className="rounded-md bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Stock disponible par type de linge {loading && "(chargement...)"}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2">Type de linge</th>
                <th className="text-left px-3 py-2">Disponible</th>
              </tr>
            </thead>
            <tbody>
              {linenTypes.map((lt) => (
                <tr key={lt.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{lt.name}</td>
                  <td className="px-3 py-2 font-medium">{balance[lt.id] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {linenWithoutInitial.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-6 space-y-3">
          <h2 className="text-lg font-semibold">Stock de départ à renseigner</h2>
          <p className="text-sm text-gray-600">
            Ces types de linge n&apos;ont pas encore de stock initial. Entre le nombre que tu as
            physiquement aujourd&apos;hui, une seule fois par type.
          </p>
          <div className="space-y-2">
            {linenWithoutInitial.map((lt) => (
              <div key={lt.id} className="flex items-center gap-3">
                <span className="w-40 text-sm">{lt.name}</span>
                <input
                  type="number"
                  min={0}
                  value={initialValues[lt.id] ?? ""}
                  onChange={(e) =>
                    setInitialValues({ ...initialValues, [lt.id]: parseInt(e.target.value || "0", 10) })
                  }
                  className="w-28 rounded-md border border-gray-300 px-3 py-1.5"
                />
                <button
                  type="button"
                  onClick={() => handleSetInitial(lt.id)}
                  disabled={savingInitial === lt.id || initialValues[lt.id] === undefined}
                  className="rounded-md bg-black text-white px-4 py-1.5 text-sm disabled:opacity-50"
                >
                  {savingInitial === lt.id ? "..." : "Enregistrer"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Signaler non conforme / manquant / ajustement</h2>
        <form
          onSubmit={handleEntrySubmit}
          className="rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4 bg-white"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Type de linge</label>
              <select
                value={entryLinenId}
                onChange={(e) => setEntryLinenId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              >
                {linenTypes.map((lt) => (
                  <option key={lt.id} value={lt.id}>
                    {lt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Type d&apos;événement</label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              >
                {ENTRY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MOVEMENT_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Quantité</label>
              <input
                type="number"
                min={1}
                value={entryQuantity}
                onChange={(e) => setEntryQuantity(parseInt(e.target.value || "1", 10))}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>

            {entryType === "ajustement" && (
              <div>
                <label className="block text-sm font-medium mb-1">Sens</label>
                <select
                  value={entryDirection}
                  onChange={(e) => setEntryDirection(e.target.value as "plus" | "moins")}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value="moins">Je retire du stock</option>
                  <option value="plus">J&apos;ajoute au stock</option>
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Raison / note</label>
              <input
                type="text"
                value={entryNote}
                onChange={(e) => setEntryNote(e.target.value)}
                placeholder="Ex : taie tachée, perdu à la blanchisserie..."
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Saisi par</label>
              <input
                type="text"
                value={entryBy}
                onChange={(e) => setEntryBy(e.target.value)}
                placeholder="Ton prénom"
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || !entryLinenId}
            className="w-full sm:w-auto rounded-md bg-black text-white px-5 py-2.5 font-medium disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Ajouter"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 p-4 sm:p-6 bg-white">
        <h2 className="text-lg font-semibold mb-3">Vérifier / filtrer l&apos;historique</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Du</label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Au</label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type de mouvement</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Tous</option>
              {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type de linge</label>
            <select
              value={filterLinen}
              onChange={(e) => setFilterLinen(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Tous</option>
              {linenTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Récapitulatif par type de mouvement ({filteredMovements.length} ligne
          {filteredMovements.length > 1 ? "s" : ""})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2">Type de mouvement</th>
                <th className="text-left px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(recapByType).map(([type, total]) => (
                <tr key={type} className="border-t border-gray-100">
                  <td className="px-3 py-2">{MOVEMENT_LABELS[type] ?? type}</td>
                  <td className="px-3 py-2 font-medium">{total}</td>
                </tr>
              ))}
              {Object.keys(recapByType).length === 0 && !loading && (
                <tr>
                  <td colSpan={2} className="px-3 py-4 text-gray-400 text-center">
                    Aucun mouvement sur cette période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Détail</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Type de linge</th>
                <th className="text-left px-3 py-2">Mouvement</th>
                <th className="text-left px-3 py-2">Quantité</th>
                <th className="text-left px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovements
                .slice()
                .sort((a, b) => (a.movement_date < b.movement_date ? 1 : -1))
                .map((m) => (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{m.movement_date}</td>
                    <td className="px-3 py-2">{linenTypeName(m.linen_type_id)}</td>
                    <td className="px-3 py-2">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</td>
                    <td className="px-3 py-2">{m.quantity}</td>
                    <td className="px-3 py-2">{m.note ?? "—"}</td>
                  </tr>
                ))}
              {filteredMovements.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-gray-400 text-center">
                    Aucune ligne.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
