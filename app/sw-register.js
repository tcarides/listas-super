"use client";

import { useEffect } from "react";

// Registra el service worker (solo en producción, para no interferir con HMR
// en desarrollo). Sin UI: corre una vez al montar.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Falla silenciosa: la app sigue andando sin offline.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
