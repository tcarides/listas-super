"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 4000;
const NO_CAT = "__none__"; // clave para "Sin categoría"

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("lista"); // "lista" | "catalogo"
  const [draft, setDraft] = useState("");
  const [draftCat, setDraftCat] = useState("");
  const pending = useRef(0);

  // ---------- carga + sincronización ----------
  const fetchState = useCallback(async () => {
    if (pending.current > 0) return;
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (pending.current === 0) {
        setCategories(data.categories || []);
        setItems(data.items || []);
      }
    } catch {
      /* sin conexión: reintenta en el próximo poll */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, POLL_MS);
    const onFocus = () => fetchState();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [fetchState]);

  async function mutate(fn) {
    pending.current += 1;
    try {
      await fn();
    } catch {
      await fetchState();
    } finally {
      pending.current -= 1;
    }
  }

  // ---------- acciones sobre items ----------
  function patchLocal(id, changes) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  }

  async function setNeeded(item, needed) {
    patchLocal(item.id, needed ? { needed } : { needed, checked: false });
    await mutate(async () => {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needed }),
      });
      if (!res.ok) throw new Error("needed");
    });
  }

  async function setChecked(item, checked) {
    patchLocal(item.id, { checked });
    await mutate(async () => {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked }),
      });
      if (!res.ok) throw new Error("checked");
    });
  }

  async function addItem(e) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    const categoryId = draftCat ? Number(draftCat) : null;
    const tempId = "tmp-" + Date.now();
    setItems((prev) => [
      ...prev,
      { id: tempId, name, categoryId, needed: true, checked: false },
    ]);
    await mutate(async () => {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, categoryId, needed: true }),
      });
      if (!res.ok) throw new Error("add");
      const saved = await res.json();
      setItems((prev) => prev.map((i) => (i.id === tempId ? saved : i)));
    });
  }

  async function renameItem(item) {
    const next = prompt("Editar nombre:", item.name);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === item.name) return;
    patchLocal(item.id, { name });
    await mutate(async () => {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("rename");
    });
  }

  async function deleteItem(item) {
    if (!confirm(`¿Eliminar "${item.name}" del catálogo?`)) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    if (typeof item.id === "string" && item.id.startsWith("tmp-")) return;
    await mutate(async () => {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete");
    });
  }

  async function addCategory() {
    const name = prompt("Nombre de la nueva sección:");
    if (name == null) return;
    const clean = name.trim();
    if (!clean) return;
    await mutate(async () => {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clean }),
      });
      if (!res.ok) throw new Error("cat");
      const cat = await res.json();
      setCategories((prev) => [...prev, cat]);
    });
  }

  async function resetTrip() {
    if (!confirm("¿Terminar la compra? Se va a vaciar la lista (el catálogo queda).")) return;
    setItems((prev) => prev.map((i) => ({ ...i, needed: false, checked: false })));
    await mutate(async () => {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "trip" }),
      });
      if (!res.ok) throw new Error("reset");
    });
  }

  async function uncheckAll() {
    setItems((prev) => prev.map((i) => ({ ...i, checked: false })));
    await mutate(async () => {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "checked" }),
      });
      if (!res.ok) throw new Error("uncheck");
    });
  }

  // ---------- agrupado por categoría ----------
  function groupItems(list) {
    const byCat = new Map();
    for (const it of list) {
      const key = it.categoryId == null ? NO_CAT : String(it.categoryId);
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(it);
    }
    const groups = [];
    for (const cat of categories) {
      const arr = byCat.get(String(cat.id));
      if (arr && arr.length) groups.push({ id: cat.id, name: cat.name, items: arr });
    }
    const none = byCat.get(NO_CAT);
    if (none && none.length) groups.push({ id: null, name: "Sin categoría", items: none });
    return groups;
  }

  const neededItems = items.filter((i) => i.needed);
  const boughtCount = neededItems.filter((i) => i.checked).length;
  const listaGroups = groupItems(neededItems);
  const catalogGroups = groupItems(items);

  // ---------- resumen del header ----------
  let summary = "Cargando…";
  if (loaded) {
    if (view === "lista") {
      if (neededItems.length === 0)
        summary = "Tu lista está vacía — marcá productos en el Catálogo";
      else if (boughtCount === neededItems.length) summary = "¡Compra completa! 🎉";
      else summary = `${boughtCount} de ${neededItems.length} comprados`;
    } else {
      summary = `${items.length} productos · ${neededItems.length} en la lista`;
    }
  }

  return (
    <>
      <header className="app-header">
        <h1>🛒 Lista del súper</h1>
        <p className="summary">{summary}</p>
        <div className="tabs" role="tablist">
          <button
            className={"tab" + (view === "lista" ? " active" : "")}
            onClick={() => setView("lista")}
          >
            Lista{neededItems.length ? ` (${neededItems.length})` : ""}
          </button>
          <button
            className={"tab" + (view === "catalogo" ? " active" : "")}
            onClick={() => setView("catalogo")}
          >
            Catálogo
          </button>
        </div>
      </header>

      <main>
        {view === "lista" ? (
          <ListaView
            groups={listaGroups}
            loaded={loaded}
            onToggle={(it) => setChecked(it, !it.checked)}
            onRemove={(it) => setNeeded(it, false)}
          />
        ) : (
          <CatalogoView
            groups={catalogGroups}
            categories={categories}
            loaded={loaded}
            draft={draft}
            setDraft={setDraft}
            draftCat={draftCat}
            setDraftCat={setDraftCat}
            onAdd={addItem}
            onAddCategory={addCategory}
            onToggleNeeded={(it) => setNeeded(it, !it.needed)}
            onRename={renameItem}
            onDelete={deleteItem}
          />
        )}
      </main>

      {view === "lista" && neededItems.length > 0 && (
        <footer className="app-footer">
          <button
            className="footer-btn"
            onClick={uncheckAll}
            disabled={boughtCount === 0}
          >
            Destildar comprados
          </button>
          <button className="footer-btn danger" onClick={resetTrip}>
            Terminar compra
          </button>
        </footer>
      )}
    </>
  );
}

// ===================== Vista LISTA (a comprar) =====================
function ListaView({ groups, loaded, onToggle, onRemove }) {
  if (loaded && groups.length === 0) {
    return (
      <p className="empty-state">
        Todavía no marcaste nada para comprar.
        <br />
        Andá a <strong>Catálogo</strong> y tocá los productos que necesitás.
      </p>
    );
  }
  return (
    <>
      {groups.map((g) => (
        <section key={g.id ?? "none"} className="cat-section">
          <h2 className="cat-title">{g.name}</h2>
          <ul className="list">
            {g.items.map((it) => (
              <li key={it.id} className={"list-item" + (it.checked ? " done" : "")}>
                <button
                  type="button"
                  className="check"
                  aria-label={it.checked ? "Desmarcar" : "Marcar comprado"}
                  onClick={() => onToggle(it)}
                >
                  {it.checked ? "✓" : ""}
                </button>
                <span className="name" onClick={() => onToggle(it)}>
                  {it.name}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Sacar de la lista"
                  onClick={() => onRemove(it)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

// ===================== Vista CATÁLOGO =====================
function CatalogoView({
  groups,
  categories,
  loaded,
  draft,
  setDraft,
  draftCat,
  setDraftCat,
  onAdd,
  onAddCategory,
  onToggleNeeded,
  onRename,
  onDelete,
}) {
  return (
    <>
      <form className="add-form" onSubmit={onAdd} autoComplete="off">
        <input
          className="item-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nuevo producto…"
          aria-label="Nombre del producto"
          enterKeyHint="done"
          maxLength={80}
        />
        <button type="submit" className="add-btn" aria-label="Agregar" disabled={!draft.trim()}>
          ＋
        </button>
      </form>

      <div className="add-row">
        <select
          className="cat-select"
          value={draftCat}
          onChange={(e) => setDraftCat(e.target.value)}
          aria-label="Categoría del nuevo producto"
        >
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" className="ghost-btn" onClick={onAddCategory}>
          + Sección
        </button>
      </div>

      {loaded && groups.length === 0 && (
        <p className="empty-state">
          El catálogo está vacío.
          <br />
          Agregá productos arriba o importá tu lista de AnyList.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.id ?? "none"} className="cat-section">
          <h2 className="cat-title">{g.name}</h2>
          <ul className="list">
            {g.items.map((it) => (
              <li key={it.id} className={"list-item catalog" + (it.needed ? " needed" : "")}>
                <button
                  type="button"
                  className="check"
                  aria-label={it.needed ? "Sacar de la lista" : "Agregar a la lista"}
                  onClick={() => onToggleNeeded(it)}
                >
                  {it.needed ? "✓" : "＋"}
                </button>
                <span className="name" onClick={() => onToggleNeeded(it)}>
                  {it.name}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Editar"
                  onClick={() => onRename(it)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label="Eliminar"
                  onClick={() => onDelete(it)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
