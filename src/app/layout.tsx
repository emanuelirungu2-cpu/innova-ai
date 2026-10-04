import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Innova AI | One clear workspace for hospitality",
  description: "Manage rooms, reservations, restaurant sales, guest records, and daily operations with Innova AI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
