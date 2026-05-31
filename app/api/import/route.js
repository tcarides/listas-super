import { NextResponse } from "next/server";
import { getSql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/import
 * Body: {
 *   replace?: boolean,                       // si true, vacía catálogo antes
 *   categories: [                            // secciones en orden
 *     { name: string, items: (string | { name, needed? })[] }
 *   ]
 * }
 * Carga masiva del catálogo (pensado para importar desde AnyList).
 */
export async function POST(request) {
  await ensureSchema();
  const sql = getSql();
  const body = await request.json().catch(() => ({}));
  const groups = Array.isArray(body.categories) ? body.categories : [];

  if (body.replace) {
    await sql`DELETE FROM items`;
    await sql`DELETE FROM categories`;
  }

  let createdCategories = 0;
  let createdItems = 0;
  let position = 0;
  const inserts = [];

  for (const group of groups) {
    const cname = (group?.name || "").trim().slice(0, 60);
    let categoryId = null;

    if (cname) {
      const existing = await sql`SELECT id FROM categories WHERE name = ${cname} LIMIT 1`;
      if (existing.length) {
        categoryId = existing[0].id;
      } else {
        const [row] = await sql`
          INSERT INTO categories (name, position)
          VALUES (${cname}, ${position})
          RETURNING id
        `;
        categoryId = row.id;
        createdCategories += 1;
      }
    }
    position += 1;

    const list = Array.isArray(group?.items) ? group.items : [];
    for (const raw of list) {
      const name = (typeof raw === "string" ? raw : raw?.name || "")
        .trim()
        .slice(0, 80);
      if (!name) continue;
      const needed = typeof raw === "object" && raw?.needed === true;
      const checked = typeof raw === "object" && raw?.checked === true;
      const quantity =
        typeof raw === "object"
          ? Math.max(1, Math.min(99, Number(raw?.quantity) || 1))
          : 1;
      inserts.push(
        sql`INSERT INTO items (name, category_id, needed, checked, quantity)
            VALUES (${name}, ${categoryId}, ${needed}, ${checked}, ${quantity})`
      );
      createdItems += 1;
    }
  }

  // Inserta todos los productos en una sola transacción (rápido aunque sean cientos).
  if (inserts.length) await sql.transaction(inserts);

  return NextResponse.json({
    categories: createdCategories,
    items: createdItems,
  });
}
