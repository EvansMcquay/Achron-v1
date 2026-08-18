import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";

const LINKS = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "About", href: "#about" },
];

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-md border-b border-border"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="w-4 h-4" />
          </span>
          <span className="font-semibold tracking-tight text-lg">Achron</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Log In</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/register">Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}