"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 4000;
const NO_CAT = "__none__";

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("lista"); // "lista" | "catalogo"
  const [draft, setDraft] = useState("");
  const [draftCat, setDraftCat] = useState("");
  const [query, setQuery] = useState("");
  const [reordering, setReordering] = useState(false);
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

  // ---------- items ----------
  function patchLocal(id, changes) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  }

  async function patchItem(item, payload, optimistic) {
    patchLocal(item.id, optimistic);
    await mutate(async () => {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("patch");
    });
  }

  const setNeeded = (item, needed) =>
    patchItem(item, { needed }, needed ? { needed } : { needed, checked: false });
  const setChecked = (item, checked) => patchItem(item, { checked }, { checked });
  const setQuantity = (item, quantity) => {
    const q = Math.max(1, Math.min(99, quantity));
    return patchItem(item, { quantity: q }, { quantity: q });
  };

  async function addItem(e) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    const categoryId = draftCat ? Number(draftCat) : null;
    const tempId = "tmp-" + Date.now();
    setItems((prev) => [
      ...prev,
      { id: tempId, name, categoryId, needed: true, checked: false, quantity: 1 },
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
    await patchItem(item, { name }, { name });
  }

  async function moveItem(item) {
    const options = categories.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
    const ans = prompt(
      `¿A qué sección movés "${item.name}"?\n\n${options}\n\n0. Sin categoría`,
      ""
    );
    if (ans == null) return;
    const n = Number(ans.trim());
    if (Number.isNaN(n) || n < 0 || n > categories.length) return;
    const categoryId = n === 0 ? null : categories[n - 1].id;
    await patchItem(item, { categoryId }, { categoryId });
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

  // ---------- categorías ----------
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

  async function renameCategory(cat) {
    const next = prompt("Renombrar sección:", cat.name);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === cat.name) return;
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, name } : c)));
    await mutate(async () => {
      const res = await fetch(`/api/categories/${cat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("rename-cat");
    });
  }

  async function moveCategory(catId, dir) {
    const idx = categories.findIndex((c) => c.id === catId);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= categories.length) return;
    const a = categories[idx];
    const b = categories[swapIdx];
    const next = [...categories];
    next[idx] = { ...b, position: a.position };
    next[swapIdx] = { ...a, position: b.position };
    setCategories(next);
    await mutate(async () => {
      await Promise.all([
        fetch(`/api/categories/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: b.position }),
        }),
        fetch(`/api/categories/${b.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: a.position }),
        }),
      ]);
    });
  }

  // ---------- reset de compra ----------
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

  // ---------- agrupado ----------
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

  const catalogFiltered = query
    ? items.filter((i) => norm(i.name).includes(norm(query)))
    : items;
  const catalogGroups = groupItems(catalogFiltered);

  // ---------- resumen ----------
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
            onQty={setQuantity}
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
            query={query}
            setQuery={setQuery}
            reordering={reordering}
            setReordering={setReordering}
            onAdd={addItem}
            onAddCategory={addCategory}
            onRenameCategory={renameCategory}
            onMoveCategory={moveCategory}
            onToggleNeeded={(it) => setNeeded(it, !it.needed)}
            onRename={renameItem}
            onMove={moveItem}
            onDelete={deleteItem}
            onQty={setQuantity}
          />
        )}
      </main>

      {view === "lista" && neededItems.length > 0 && (
        <footer className="app-footer">
          <button className="footer-btn" onClick={uncheckAll} disabled={boughtCount === 0}>
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

// ===================== Cantidad =====================
function QtyStepper({ item, onQty }) {
  return (
    <div className="qty" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="qty-btn"
        aria-label="Restar"
        disabled={item.quantity <= 1}
        onClick={() => onQty(item, item.quantity - 1)}
      >
        −
      </button>
      <span className="qty-num">{item.quantity}</span>
      <button
        type="button"
        className="qty-btn"
        aria-label="Sumar"
        onClick={() => onQty(item, item.quantity + 1)}
      >
        ＋
      </button>
    </div>
  );
}

// ===================== Vista LISTA =====================
function ListaView({ groups, loaded, onToggle, onRemove, onQty }) {
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
      {groups.map((g) => {
        // Comprados al fondo: pendientes arriba, tachados abajo.
        const ordered = [
          ...g.items.filter((i) => !i.checked),
          ...g.items.filter((i) => i.checked),
        ];
        return (
          <section key={g.id ?? "none"} className="cat-section">
            <h2 className="cat-title">{g.name}</h2>
            <ul className="list">
              {ordered.map((it) => (
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
                  <QtyStepper item={it} onQty={onQty} />
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
        );
      })}
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
  query,
  setQuery,
  reordering,
  setReordering,
  onAdd,
  onAddCategory,
  onRenameCategory,
  onMoveCategory,
  onToggleNeeded,
  onRename,
  onMove,
  onDelete,
  onQty,
}) {
  return (
    <>
      <div className="search-wrap">
        <input
          className="search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 Buscar producto…"
          aria-label="Buscar producto"
        />
      </div>

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
        <button
          type="button"
          className={"ghost-btn" + (reordering ? " active" : "")}
          onClick={() => setReordering((v) => !v)}
        >
          {reordering ? "Listo" : "⇅ Ordenar"}
        </button>
      </div>

      {loaded && groups.length === 0 && (
        <p className="empty-state">
          {query ? "No hay productos que coincidan." : "El catálogo está vacío."}
        </p>
      )}

      {groups.map((g, gi) => (
        <section key={g.id ?? "none"} className="cat-section">
          <div className="cat-head">
            <h2 className="cat-title">{g.name}</h2>
            {reordering && g.id != null ? (
              <div className="cat-order">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Subir sección"
                  disabled={gi === 0}
                  onClick={() => onMoveCategory(g.id, "up")}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Bajar sección"
                  onClick={() => onMoveCategory(g.id, "down")}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Renombrar sección"
                  onClick={() => onRenameCategory({ id: g.id, name: g.name })}
                >
                  ✎
                </button>
              </div>
            ) : null}
          </div>
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
                {it.needed && <QtyStepper item={it} onQty={onQty} />}
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
                  className="icon-btn"
                  aria-label="Mover de sección"
                  onClick={() => onMove(it)}
                >
                  ⇄
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
