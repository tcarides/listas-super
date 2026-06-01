import { NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

// PATCH /api/items/:id  { needed?, checked?, name?, categoryId? }
export async function PATCH(request, { params }) {
  await ensureSchema();
  const sql = getSql();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (typeof body.needed === "boolean") {
    // Al sacar de la lista, también destildamos "comprado".
    if (body.needed === false) {
      await sql`UPDATE items SET needed = FALSE, checked = FALSE WHERE id = ${id}`;
    } else {
      await sql`UPDATE items SET needed = TRUE WHERE id = ${id}`;
    }
  }
  if (typeof body.checked === "boolean") {
    await sql`UPDATE items SET checked = ${body.checked} WHERE id = ${id}`;
  }
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (name) await sql`UPDATE items SET name = ${name} WHERE id = ${id}`;
  }
  if ("categoryId" in body) {
    await sql`UPDATE items SET category_id = ${body.categoryId ?? null} WHERE id = ${id}`;
  }
  if (body.quantity != null) {
    const q = Math.max(1, Math.min(99, Number(body.quantity) || 1));
    await sql`UPDATE items SET quantity = ${q} WHERE id = ${id}`;
  }
  if ("note" in body) {
    const note = (body.note || "").trim().slice(0, 200) || null;
    await sql`UPDATE items SET note = ${note} WHERE id = ${id}`;
  }

  const [row] = await sql`
    SELECT id, name, category_id AS "categoryId", needed, checked, quantity, note
    FROM items WHERE id = ${id}
  `;
  return NextResponse.json(row || {});
}

// DELETE /api/items/:id  → elimina del catálogo
export async function DELETE(request, { params }) {
  await ensureSchema();
  const sql = getSql();
  const { id } = await params;
  await sql`DELETE FROM items WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
