import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CMO Daily P&L Dashboard",
  description: "Daily app-wise P&L dashboard for RevenueCat and Windsor.ai data."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
