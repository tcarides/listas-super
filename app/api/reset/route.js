import { NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/reset  { scope: "trip" | "checked" }
//  - trip:    termina la compra → desmarca todo (needed=false, checked=false)
//  - checked: solo destilda lo comprado, manteniendo la lista
export async function POST(request) {
  await ensureSchema();
  const sql = getSql();
  const body = await request.json().catch(() => ({}));
  const scope = body.scope === "checked" ? "checked" : "trip";

  if (scope === "checked") {
    await sql`UPDATE items SET checked = FALSE WHERE checked = TRUE`;
  } else {
    await sql`UPDATE items SET needed = FALSE, checked = FALSE WHERE needed = TRUE OR checked = TRUE`;
  }
  return NextResponse.json({ ok: true });
}
