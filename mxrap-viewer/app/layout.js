import "./globals.css";

// Fonts are bundled locally and declared in globals.css (@font-face), so
// neither building nor running the viewer needs the internet.

export const metadata = {
  title: "Mining 3D Data Viewer",
  description: "Explore mXrap mining exports locally in your browser with interactive 3D scenes, rock mass quality intervals and seismic charts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
