import { NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

// PATCH /api/items/:id  { done } o { name }  → marca/desmarca o renombra
export async function PATCH(request, { params }) {
  await ensureSchema();
  const sql = getSql();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (typeof body.done === "boolean") {
    const [row] = await sql`
      UPDATE items SET done = ${body.done}
      WHERE id = ${id}
      RETURNING id, name, done
    `;
    return NextResponse.json(row || {});
  }

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (!name) {
      return NextResponse.json({ error: "El nombre está vacío" }, { status: 400 });
    }
    const [row] = await sql`
      UPDATE items SET name = ${name}
      WHERE id = ${id}
      RETURNING id, name, done
    `;
    return NextResponse.json(row || {});
  }

  return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
}

// DELETE /api/items/:id  → elimina un producto
export async function DELETE(request, { params }) {
  await ensureSchema();
  const sql = getSql();
  const { id } = await params;
  await sql`DELETE FROM items WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
