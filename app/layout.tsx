import Link from "next/link";
import "./globals.css";

export const metadata = { title: "Карта тривог" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <span className="font-semibold">🇺🇦 Тривоги</span>
            <Link href="/" className="text-slate-600 hover:text-slate-900">Карта</Link>
            <Link href="/ai" className="text-slate-600 hover:text-slate-900">AI</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
