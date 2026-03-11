import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Providers from "@/components/Providers";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fantasy FRC",
  description: "The premier Fantasy FIRST Robotics Competition experience.",
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en" className={outfit.className}>
      <body>
        <Providers>
          <Navbar />
          <main className="container">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
