import { CheckCircle2, Circle, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Roadmap() {
  const stages = [
    {
      title: "Stage 1: The Core Math (Current MVP)",
      status: "complete",
      desc: "Implement deterministic, stateless functions that take inputs (amount, rates, spreads) and return outputs. No database required. Used plain React state to hold the numbers.",
      skills: "Variables, basic math, React state (useState)."
    },
    {
      title: "Stage 2: The Interactive Workspace",
      status: "complete",
      desc: "Built the UI using Tailwind CSS and standard components. Visualized the outputs using Recharts so users can actually see the difference between 'doing nothing' and 'hedging'.",
      skills: "CSS styling, passing props, array mapping."
    },
    {
      title: "Stage 3: Offline PWA (Next Step)",
      status: "pending",
      desc: "Convert this site into a Progressive Web App (PWA). This adds a 'manifest' file and a 'Service Worker' so a business owner in an area with bad cell service can still calculate their FX risk offline.",
      skills: "Service Workers, browser caching."
    },
    {
      title: "Stage 4: Real-time API Integration",
      status: "pending",
      desc: "Instead of asking the user to type in the Central Bank rate, fetch it automatically from a public API (like Open Exchange Rates).",
      skills: "HTTP fetch, async/await, JSON parsing."
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="space-y-4">
        <h1 className="text-4xl font-sans font-bold text-foreground">Build Roadmap</h1>
        <p className="text-xl text-muted-foreground leading-relaxed">
          For student judges and developers: How to build UmmahFX from scratch, specifically tailored if your background is in embedded C or hardware.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <h2 className="text-2xl font-sans font-semibold">Development Stages</h2>
          <div className="relative border-l-2 border-muted ml-3 space-y-8 pb-4">
            {stages.map((stage, i) => (
              <div key={i} className="relative pl-8">
                <div className="absolute -left-[11px] top-1 bg-background">
                  {stage.status === "complete" ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">{stage.title}</h3>
                <p className="text-muted-foreground mb-2">{stage.desc}</p>
                <div className="inline-flex items-center text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">
                  New Concept: {stage.skills}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="bg-primary text-primary-foreground border-none">
            <CardHeader>
                  <CardTitle className="text-xl font-sans flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Why not a PWA yet?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-primary-foreground/90 leading-relaxed">
              <p>
                A Progressive Web App (PWA) allows a website to be installed on a phone like a native app. 
              </p>
              <p>
                For a hackathon MVP, building a responsive standard web app prioritizes delivery speed and iterative feedback. Adding a Service Worker too early complicates debugging. We will add offline caching once the core mechanics are validated by SME users.
              </p>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-lg font-sans">Tech Stack Glossary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div>
                <strong className="text-foreground">React / Vite:</strong> Like a `main()` loop that redraws the UI whenever variables (state) change.
              </div>
              <div>
                <strong className="text-foreground">Tailwind CSS:</strong> Styling directly in the code, like setting register bits for display colors without writing separate configuration files.
              </div>
              <div>
                <strong className="text-foreground">Recharts:</strong> A library that takes arrays of numbers and turns them into SVG graphics automatically.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
