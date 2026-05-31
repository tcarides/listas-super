"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 4000;

export default function Home() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  // Cantidad de mutaciones en vuelo: mientras haya alguna, el polling no
  // pisa el estado optimista del usuario.
  const pending = useRef(0);

  const fetchItems = useCallback(async () => {
    if (pending.current > 0) return;
    try {
      const res = await fetch("/api/items", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (pending.current === 0) setItems(data);
    } catch {
      /* sin conexión: reintentamos en el próximo poll */
    } finally {
      setLoaded(true);
    }
  }, []);

  // Carga inicial + polling + refetch al volver a la pestaña.
  useEffect(() => {
    fetchItems();
    const id = setInterval(fetchItems, POLL_MS);
    const onFocus = () => fetchItems();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [fetchItems]);

  async function mutate(fn) {
    pending.current += 1;
    try {
      await fn();
    } catch {
      await fetchItems();
    } finally {
      pending.current -= 1;
    }
  }

  async function addItem(e) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    inputRef.current?.focus();

    const tempId = "tmp-" + Date.now();
    setItems((prev) => [{ id: tempId, name, done: false }, ...prev]);

    await mutate(async () => {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("add");
      const saved = await res.json();
      setItems((prev) => prev.map((i) => (i.id === tempId ? saved : i)));
    });
  }

  async function toggleItem(item) {
    if (typeof item.id === "string" && item.id.startsWith("tmp-")) return;
    const done = !item.done;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, done } : i))
    );
    await mutate(async () => {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!res.ok) throw new Error("toggle");
    });
  }

  async function deleteItem(item) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    if (typeof item.id === "string" && item.id.startsWith("tmp-")) return;
    await mutate(async () => {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete");
    });
  }

  async function clearScope(scope) {
    if (scope === "all" && !confirm("¿Vaciar toda la lista?")) return;
    setItems((prev) => (scope === "done" ? prev.filter((i) => !i.done) : []));
    await mutate(async () => {
      const res = await fetch(`/api/items?scope=${scope}`, { method: "DELETE" });
      if (!res.ok) throw new Error("clear");
    });
  }

  // Pendientes primero, comprados al final (el orden del server ya lo hace,
  // pero lo reforzamos para el estado optimista local).
  const ordered = [
    ...items.filter((i) => !i.done),
    ...items.filter((i) => i.done),
  ];
  const total = items.length;
  const pendingCount = items.filter((i) => !i.done).length;

  let summaryText = "Cargando…";
  if (loaded) {
    if (total === 0) summaryText = "Sin productos todavía";
    else if (pendingCount === 0) summaryText = "¡Todo comprado! 🎉";
    else
      summaryText =
        pendingCount + " pendiente" + (pendingCount === 1 ? "" : "s") +
        " de " + total;
  }

  return (
    <>
      <header className="app-header">
        <h1>🛒 Lista del súper</h1>
        <p className="summary">{summaryText}</p>
      </header>

      <main>
        <form className="add-form" onSubmit={addItem} autoComplete="off">
          <input
            ref={inputRef}
            className="item-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Agregar producto…"
            aria-label="Nombre del producto"
            enterKeyHint="done"
            maxLength={80}
          />
          <button
            type="submit"
            className="add-btn"
            aria-label="Agregar"
            disabled={!draft.trim()}
          >
            ＋
          </button>
        </form>

        <ul className="list" aria-live="polite">
          {ordered.map((item) => (
            <li
              key={item.id}
              className={"list-item" + (item.done ? " done" : "")}
            >
              <button
                type="button"
                className="check"
                aria-label={item.done ? "Marcar pendiente" : "Marcar comprado"}
                onClick={() => toggleItem(item)}
              >
                {item.done ? "✓" : ""}
              </button>
              <span className="name" onClick={() => toggleItem(item)}>
                {item.name}
              </span>
              <button
                type="button"
                className="delete"
                aria-label={"Eliminar " + item.name}
                onClick={() => deleteItem(item)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        {loaded && total === 0 && (
          <p className="empty-state">
            Tu lista está vacía.
            <br />
            Escribí un producto arriba para empezar.
          </p>
        )}
      </main>

      {total > 0 && (
        <footer className="app-footer">
          <button
            className="footer-btn"
            onClick={() => clearScope("done")}
            disabled={pendingCount === total}
          >
            Borrar comprados
          </button>
          <button className="footer-btn danger" onClick={() => clearScope("all")}>
            Vaciar lista
          </button>
        </footer>
      )}
    </>
  );
}
