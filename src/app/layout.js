import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";
import { ToastProvider } from "@/components/Toast";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata = {
  title: "OceanSis — POS",
  description: "Sistema Punto de Venta (POS) y cocina",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={`${sans.variable} ${display.variable} font-sans antialiased`}>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
