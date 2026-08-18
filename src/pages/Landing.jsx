import React from "react";
import { Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import LandingNav from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import Problem from "@/components/landing/Problem";
import Features from "@/components/landing/Features";
import ProductIntelligence from "@/components/landing/ProductIntelligence";
import DashboardPreview from "@/components/landing/DashboardPreview";
import CTA from "@/components/landing/CTA";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main>
        <Hero />
        <Problem />
        <Features />
        <ProductIntelligence />
        <DashboardPreview />
        <CTA />
      </main>
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid place-items-center w-7 h-7 rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="w-4 h-4" />
            </span>
            <span className="font-semibold text-foreground">Achron</span>
          </Link>
          <p>© {new Date().getFullYear()} Achron. Degree planning, made clear.</p>
        </div>
      </footer>
    </div>
  );
}