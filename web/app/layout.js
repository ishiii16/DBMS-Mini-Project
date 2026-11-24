import "./globals.css";
import Nav from "@/components/Nav";
import { Toaster } from "@/components/ui";
export const metadata = { title: "MoodTune — semantic music discovery" };
export default function RootLayout({ children }) {
  return (<html lang="en"><body><Nav /><main>{children}</main><Toaster /></body></html>);
}
