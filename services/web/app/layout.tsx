export const metadata = {
  title: 'Aperture — Experimentation',
  description: 'Open-source A/B testing for startups',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <main>{children}</main>
      </body>
    </html>
  )
}
