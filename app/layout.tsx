import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Minecraft Inventory Editor',
  description: 'A web application for editing Minecraft inventories with GUI selection and item placement.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
