import { NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/items  → lista completa (pendientes primero, más recientes arriba)
export async function GET() {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, done
    FROM items
    ORDER BY done ASC, created_at DESC
  `;
  return NextResponse.json(rows);
}

// POST /api/items  { name }  → agrega un producto
export async function POST(request) {
  await ensureSchema();
  const sql = getSql();
  const body = await request.json().catch(() => ({}));
  const name = (body.name || "").trim().slice(0, 80);
  if (!name) {
    return NextResponse.json({ error: "El nombre está vacío" }, { status: 400 });
  }
  const [row] = await sql`
    INSERT INTO items (name) VALUES (${name})
    RETURNING id, name, done
  `;
  return NextResponse.json(row, { status: 201 });
}

// DELETE /api/items?scope=done|all  → vacía comprados o toda la lista
export async function DELETE(request) {
  await ensureSchema();
  const sql = getSql();
  const scope = new URL(request.url).searchParams.get("scope");
  if (scope === "done") {
    await sql`DELETE FROM items WHERE done = TRUE`;
  } else {
    await sql`DELETE FROM items`;
  }
  return NextResponse.json({ ok: true });
}
