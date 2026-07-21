import "./globals.css";

export const metadata = { title: "Reframe Next Demo" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
