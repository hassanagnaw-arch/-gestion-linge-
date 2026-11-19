"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";

type RoomType = { id: string; name: string };
type LinenType = { id: string; name: string };
type NomenclatureRow = {
  room_type_id: string;
  linen_type_id: string;
  service_type: string;
  quantity_needed: number;
};
type LogRow = {
  id: string;
  log_date: string;
  room_type_id: string;
  service_type: string;
  room_count: number;
  entered_by: string | null;
};

const SERVICE_TYPES = ["Départ", "Recouche"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function JournalPage() {
  const supabase = createClient();

  const [hotelId, setHotelId] = useState<string | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [linenTypes, setLinenTypes] = useState<LinenType[]>([]);
  const [nomenclature, setNomenclature] = useState<NomenclatureRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // formulaire
  const [logDate, setLogDate] = useState("");

  useEffect(() => {
    setLogDate(todayStr());
  }, []);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0]);
  const [roomCount, setRoomCount] = useState(1);
  const [enteredBy, setEnteredBy] = useState("");

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

    const [{ data: rts }, { data: lts }, { data: noms }, { data: dayLogs }] =
      await Promise.all([
        supabase.from("room_types").select("id, name").eq("hotel_id", hId).order("name"),
        supabase.from("linen_types").select("id, name").eq("hotel_id", hId).order("name"),
        supabase
          .from("nomenclature")
          .select("room_type_id, linen_type_id, service_type, quantity_needed")
          .eq("hotel_id", hId),
        supabase
          .from("daily_log")
          .select("id, log_date, room_type_id, service_type, room_count, entered_by")
          .eq("hotel_id", hId)
          .eq("log_date", logDate)
          .order("id", { ascending: false }),
      ]);

    setRoomTypes(rts ?? []);
    setLinenTypes(lts ?? []);
    setNomenclature(noms ?? []);
    setLogs(dayLogs ?? []);
    if ((rts?.length ?? 0) > 0 && !roomTypeId) setRoomTypeId(rts![0].id);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDate]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hotelId || !roomTypeId) return;
    setSaving(true);
    setError(null);

    const { error: insertErr } = await supabase.from("daily_log").insert({
      hotel_id: hotelId,
      log_date: logDate,
      room_type_id: roomTypeId,
      service_type: serviceType,
      room_count: roomCount,
      entered_by: enteredBy || null,
    });

    setSaving(false);
    if (insertErr) {
      setError("Erreur à l'enregistrement : " + insertErr.message);
      return;
    }
    setRoomCount(1);
    await loadAll();
  }

  // Calcul du linge consommé, à partir des lignes du jour + nomenclature
  const consumption: Record<string, number> = {};
  for (const lt of linenTypes) consumption[lt.id] = 0;
  for (const log of logs) {
    const matches = nomenclature.filter(
      (n) => n.room_type_id === log.room_type_id && n.service_type === log.service_type
    );
    for (const m of matches) {
      consumption[m.linen_type_id] =
        (consumption[m.linen_type_id] ?? 0) + m.quantity_needed * log.room_count;
    }
  }

  const roomTypeName = (id: string) => roomTypes.find((r) => r.id === id)?.name ?? "?";

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Journal quotidien</h1>

      {error && (
        <div className="rounded-md bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4 bg-white"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type de chambre</label>
            <select
              value={roomTypeId}
              onChange={(e) => setRoomTypeId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              {roomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type de service</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Nombre de chambres</label>
            <input
              type="number"
              min={1}
              value={roomCount}
              onChange={(e) => setRoomCount(parseInt(e.target.value || "1", 10))}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">Saisi par</label>
            <input
              type="text"
              value={enteredBy}
              onChange={(e) => setEnteredBy(e.target.value)}
              placeholder="Ton prénom"
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !roomTypeId}
          className="w-full sm:w-auto rounded-md bg-black text-white px-5 py-2.5 font-medium disabled:opacity-50"
        >
          {saving ? "Enregistrement..." : "Ajouter"}
        </button>
      </form>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Entrées du {logDate} {loading && "(chargement...)"}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2">Type de chambre</th>
                <th className="text-left px-3 py-2">Service</th>
                <th className="text-left px-3 py-2">Nb chambres</th>
                <th className="text-left px-3 py-2">Saisi par</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{roomTypeName(log.room_type_id)}</td>
                  <td className="px-3 py-2">{log.service_type}</td>
                  <td className="px-3 py-2">{log.room_count}</td>
                  <td className="px-3 py-2">{log.entered_by ?? "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-gray-400 text-center">
                    Aucune entrée pour cette date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Linge consommé ce jour (calcul automatique)</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2">Type de linge</th>
                <th className="text-left px-3 py-2">Quantité consommée</th>
              </tr>
            </thead>
            <tbody>
              {linenTypes.map((lt) => (
                <tr key={lt.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{lt.name}</td>
                  <td className="px-3 py-2 font-medium">{consumption[lt.id] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
