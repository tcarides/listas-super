# 🛒 listas-super

Lista del supermercado compartida (Flor y Tomás), sincronizada en la nube.
Una sola lista, sin login: quien abra la URL ve y edita lo mismo.

- **Stack:** Next.js (App Router) + Postgres (Neon / Vercel Postgres)
- **Mobile-first**, pensada para usar en el súper
- Se sincroniza sola entre dispositivos (refresca cada pocos segundos)

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # y pegá tu DATABASE_URL real
npm run dev
```

Abrí http://localhost:3000. La tabla `items` se crea sola en la primera consulta.

## Deploy en Vercel

1. Subí el repo a GitHub (ya está conectado a `tcarides/listas-super`).
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importá el repo.
3. En el proyecto, andá a **Storage → Create Database → Postgres (Neon)** y conectala.
   Vercel inyecta sola la variable `DATABASE_URL` / `POSTGRES_URL`.
4. **Deploy**. Listo: compartí la URL con Flor.

> No hace falta configurar nada más: la base se inicializa sola.

## Estructura

```
app/
  page.js                 UI (cliente): lista, alta, marcar, borrar
  layout.js               layout raíz
  globals.css             estilos mobile-first
  api/items/route.js      GET (listar) · POST (agregar) · DELETE (vaciar)
  api/items/[id]/route.js PATCH (marcar/renombrar) · DELETE (eliminar uno)
lib/db.js                 cliente Neon + creación de tabla
```
