import { NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/items  { name, categoryId?, needed? }  → agrega un producto al catálogo
export async function POST(request) {
  await ensureSchema();
  const sql = getSql();
  const body = await request.json().catch(() => ({}));
  const name = (body.name || "").trim().slice(0, 80);
  if (!name) {
    return NextResponse.json({ error: "El nombre está vacío" }, { status: 400 });
  }
  const categoryId = body.categoryId ?? null;
  const needed = body.needed === true;
  const quantity = Math.max(1, Math.min(99, Number(body.quantity) || 1));
  const note = (body.note || "").trim().slice(0, 200) || null;
  const [row] = await sql`
    INSERT INTO items (name, category_id, needed, quantity, note)
    VALUES (${name}, ${categoryId}, ${needed}, ${quantity}, ${note})
    RETURNING id, name, category_id AS "categoryId", needed, checked, quantity, note
  `;
  return NextResponse.json(row, { status: 201 });
}
