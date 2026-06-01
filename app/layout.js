import "./globals.css";

export const metadata = {
  title: "Lista del súper",
  description: "Lista del supermercado compartida de Flor y Tomás",
};

export const viewport = {
  themeColor: "#1e293b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
