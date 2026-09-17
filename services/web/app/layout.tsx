import "./globals.css";

export const metadata = {
  title: "Aperture — Ship safely. Learn what works.",
  description:
    "Open-source rollout and experimentation infrastructure for developers and coding agents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <main>{children}</main>
      </body>
    </html>
  );
}
