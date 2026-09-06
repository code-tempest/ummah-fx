import { Link } from "wouter";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-primary/15 bg-background/55 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center leading-none">
              <Link
                href="/"
                aria-label="UmmahFX"
                className="inline-flex items-baseline gap-2 font-sans leading-none text-primary"
              >
                <span className="font-bold text-[1.2rem] tracking-[-0.08em]">
                  UF
                  <sub className="ml-0.5 text-[0.55em] font-semibold leading-none tracking-normal translate-y-[0.08em]">x</sub>
                </span>
                <span className="text-[1.05rem] font-bold tracking-[-0.03em]">UmmahFX</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        {children}
      </main>

      <footer className="border-t py-8 mt-auto bg-card text-card-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center md:text-left text-sm text-muted-foreground max-w-2xl">
            <p className="mb-2">
              <strong>Illustrative Use Only:</strong> This tool provides indicative calculations for educational and hackathon purposes.
              It does not constitute financial advice, live market quotes, or a fatwa on Shariah compliance.
            </p>
            <p>
              Hedging structures and FX risk management require specialized review by qualified financial and Shariah advisors.
            </p>
            <p className="mt-2">
              <strong>Ethical &amp; Shariah disclaimer:</strong> This is not a trading terminal and does not provide live market execution.
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li><strong>No fatwa provided:</strong> Hedging calculations do not imply that all instruments are Shariah-compliant.</li>
              <li><strong>Consult scholars:</strong> Consult a qualified Islamic finance scholar before executing FX hedging structures.</li>
              <li><strong>Estimated comparisons:</strong> Competitor transfer data is estimated and can change before execution. Unknown intermediary and recipient-bank fees are shown as unavailable, never as zero.</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
