import { NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/categories  { name }  → crea una sección
export async function POST(request) {
  await ensureSchema();
  const sql = getSql();
  const body = await request.json().catch(() => ({}));
  const name = (body.name || "").trim().slice(0, 60);
  if (!name) {
    return NextResponse.json({ error: "El nombre está vacío" }, { status: 400 });
  }
  const [{ max }] = await sql`SELECT COALESCE(MAX(position), 0) AS max FROM categories`;
  const [row] = await sql`
    INSERT INTO categories (name, position)
    VALUES (${name}, ${Number(max) + 1})
    RETURNING id, name, position
  `;
  return NextResponse.json(row, { status: 201 });
}
