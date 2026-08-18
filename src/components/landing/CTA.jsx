import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function CTA() {
  return (
    <section id="about" className="scroll-mt-24 py-24 border-t border-border">
      <div className="mx-auto max-w-4xl px-5 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-3xl sm:text-5xl font-bold tracking-tight"
        >
          Your graduation path starts with knowing where you stand.
        </motion.h2>
        <p className="mt-4 text-muted-foreground text-lg">Build your academic plan with Achron.</p>
        <div className="mt-8 flex justify-center">
          <Button size="lg" asChild>
            <Link to="/register">
              Get Started <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}