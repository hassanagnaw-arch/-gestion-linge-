"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";

type LinenType = { id: string; name: string; default_unit_price: number | null };
type DeliveryRow = {
  id: string;
  delivery_date: string;
  linen_type_id: string;
  quantity_received: number;
  unit_price: number | null;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function LivraisonPage() {
  const supabase = createClient();

  const [hotelId, setHotelId] = useState<string | null>(null);
  const [linenTypes, setLinenTypes] = useState<LinenType[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // filtre période
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  useEffect(() => {
    setDateStart(firstOfMonthStr());
    setDateEnd(todayStr());
  }, []);

  // formulaire
  const [deliveryDate, setDeliveryDate] = useState("");
  const [linenTypeId, setLinenTypeId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState<number | "">("");

  useEffect(() => {
    setDeliveryDate(todayStr());
  }, []);

  const loadAll = useCallback(async () => {
    if (!dateStart || !dateEnd) return;
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

    const [{ data: lts }, { data: dels, error: delErr }] = await Promise.all([
      supabase
        .from("linen_types")
        .select("id, name, default_unit_price")
        .eq("hotel_id", hId)
        .order("name"),
      supabase
        .from("deliveries")
        .select("id, delivery_date, linen_type_id, quantity_received, unit_price")
        .eq("hotel_id", hId)
        .gte("delivery_date", dateStart)
        .lte("delivery_date", dateEnd)
        .order("delivery_date", { ascending: false }),
    ]);

    setLinenTypes(lts ?? []);
    setDeliveries(dels ?? []);
    if ((lts?.length ?? 0) > 0 && !linenTypeId) setLinenTypeId(lts![0].id);
    if (delErr) setError("Erreur de chargement : " + delErr.message);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStart, dateEnd]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function handleLinenTypeChange(id: string) {
    setLinenTypeId(id);
    const lt = linenTypes.find((l) => l.id === id);
    setUnitPrice(lt?.default_unit_price ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hotelId || !linenTypeId) return;
    setSaving(true);
    setError(null);

    const { data: inserted, error: insertErr } = await supabase
      .from("deliveries")
      .insert({
        hotel_id: hotelId,
        delivery_date: deliveryDate,
        linen_type_id: linenTypeId,
        quantity_received: quantity,
        unit_price: unitPrice === "" ? null : unitPrice,
      })
      .select()
      .single();

    if (insertErr || !inserted) {
      setSaving(false);
      setError("Erreur à l'enregistrement : " + insertErr?.message);
      return;
    }

    // On pose la ligne dans le journal de mouvements de stock (réception).
    // La quantité reçue est toujours entrée positive par l'utilisateur ;
    // "reception" exige une quantité positive (contrainte de la table).
    const { error: moveErr } = await supabase.from("stock_movements").insert({
      hotel_id: hotelId,
      linen_type_id: linenTypeId,
      movement_type: "reception",
      quantity: quantity,
      movement_date: deliveryDate,
      delivery_id: inserted.id,
    });

    setSaving(false);
    if (moveErr) {
      setError(
        "La livraison est enregistrée, mais le mouvement de stock a échoué : " + moveErr.message
      );
      return;
    }
    setQuantity(1);
    await loadAll();
  }

  const linenTypeName = (id: string) => linenTypes.find((l) => l.id === id)?.name ?? "?";

  // Récap par type de linge sur la période filtrée
  const recap: Record<string, { quantity: number; montant: number }> = {};
  for (const d of deliveries) {
    const key = d.linen_type_id;
    const montant = (d.unit_price ?? 0) * d.quantity_received;
    if (!recap[key]) recap[key] = { quantity: 0, montant: 0 };
    recap[key].quantity += d.quantity_received;
    recap[key].montant += montant;
  }
  const grandTotal = Object.values(recap).reduce((s, r) => s + r.montant, 0);

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Livraison</h1>

      {error && (
        <div className="rounded-md bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4 bg-white"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date de livraison</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type de linge</label>
            <select
              value={linenTypeId}
              onChange={(e) => handleLinenTypeChange(e.target.value)}
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
            <label className="block text-sm font-medium mb-1">Quantité reçue</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value || "1", 10))}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Prix unitaire</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={unitPrice}
              onChange={(e) =>
                setUnitPrice(e.target.value === "" ? "" : parseFloat(e.target.value))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="Pré-rempli depuis le tarif du type de linge"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !linenTypeId}
          className="w-full sm:w-auto rounded-md bg-black text-white px-5 py-2.5 font-medium disabled:opacity-50"
        >
          {saving ? "Enregistrement..." : "Ajouter"}
        </button>
      </form>

      <section className="rounded-xl border border-gray-200 p-4 sm:p-6 bg-white">
        <h2 className="text-lg font-semibold mb-3">Période à vérifier</h2>
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
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Récapitulatif du {dateStart} au {dateEnd} {loading && "(chargement...)"}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2">Type de linge</th>
                <th className="text-left px-3 py-2">Quantité reçue</th>
                <th className="text-left px-3 py-2">Montant</th>
              </tr>
            </thead>
            <tbody>
              {linenTypes
                .filter((lt) => recap[lt.id])
                .map((lt) => (
                  <tr key={lt.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{lt.name}</td>
                    <td className="px-3 py-2">{recap[lt.id].quantity}</td>
                    <td className="px-3 py-2">{recap[lt.id].montant.toFixed(2)}</td>
                  </tr>
                ))}
              {Object.keys(recap).length === 0 && !loading && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-gray-400 text-center">
                    Aucune livraison sur cette période.
                  </td>
                </tr>
              )}
            </tbody>
            {Object.keys(recap).length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2">{grandTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Détail des livraisons</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Type de linge</th>
                <th className="text-left px-3 py-2">Quantité</th>
                <th className="text-left px-3 py-2">P.U.</th>
                <th className="text-left px-3 py-2">Montant</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{d.delivery_date}</td>
                  <td className="px-3 py-2">{linenTypeName(d.linen_type_id)}</td>
                  <td className="px-3 py-2">{d.quantity_received}</td>
                  <td className="px-3 py-2">{d.unit_price ?? "—"}</td>
                  <td className="px-3 py-2">
                    {((d.unit_price ?? 0) * d.quantity_received).toFixed(2)}
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-gray-400 text-center">
                    Aucune entrée.
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
