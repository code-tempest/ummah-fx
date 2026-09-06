import { useState, useMemo, useRef, useEffect } from "react";
import { CalculatorInputs, calculateFX, COUNTRIES, formatCurrency, calculateVolatilityParams, generateRiskRange } from "@/lib/calculations";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ComposedChart, Area } from "recharts";
import { ArrowRight, ChevronDown, AlertTriangle, TrendingUp, Info, Clock3, ShieldCheck, Database, FileText, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useGetFxComparison,
  getGetFxComparisonQueryKey,
  useGetFxHistory,
  getGetFxHistoryQueryKey,
} from "@workspace/api-client-react";

function formatCollectedAt(value: string | null) {
  if (!value) return "Collection time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function requirementValue(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Unknown";
}

function requiredOrNo(value: boolean | null) {
  if (value === true) return "Required";
  if (value === false) return "No";
  return "Unknown";
}

function additionalChecksSummary(
  proofOfAddressMayBeRequired: boolean | null,
  selfieMayBeRequired: boolean | null,
  sourceOfFundsMayBeRequired: boolean | null,
  businessDocumentsMayBeRequired: boolean | null,
) {
  const checks = [
    proofOfAddressMayBeRequired,
    selfieMayBeRequired,
    sourceOfFundsMayBeRequired,
    businessDocumentsMayBeRequired,
  ];
  if (checks.some((value) => value === true)) return "May be requested";
  if (checks.some((value) => value === null)) return "Unknown";
  return "Not listed";
}

export default function Home() {
  const [transferMode, setTransferMode] = useState<"sending" | "receiving">("sending");
  const [sendingCountry, setSendingCountry] = useState("CA");
  const [receivingCountry, setReceivingCountry] = useState("US");
  const [inputs, setInputs] = useState<CalculatorInputs & { timeframe: string }>({
    direction: "receivable",
    foreignAmount: 50000,
    amountBasis: "TARGET",
    baseCurrency: "USD",
    foreignCurrency: "CAD",
    timeframe: "30",
    referenceRate: 0.78, // Kept for type compatibility, overwritten by API
    scenarioSlider: 0,
    hedgeRatio: 50,
    hedgeRate: 0.79,
  });

  const [flow, setFlow] = useState({
    calculated: false,
    exploredHedging: false,
    showHedgingSection: false,
  });
  
  const [hasEditedHedgeRate, setHasEditedHedgeRate] = useState(false);
  const [riskHorizon, setRiskHorizon] = useState<number>(30);
  const resultsCardRef = useRef<HTMLDivElement>(null);

  const handleInput = (key: keyof typeof inputs, value: any) => {
    if (key === "hedgeRate") setHasEditedHedgeRate(true);
    
    setInputs((prev) => {
      const next = { ...prev, [key]: value };
      
      return next;
    });
  };

  const handleCountryChange = (side: "sending" | "receiving", countryCode: string) => {
    const country = COUNTRIES.find((option) => option.code === countryCode);
    if (!country) return;

    if (side === "sending") {
      const nextReceiving = countryCode === receivingCountry
        ? COUNTRIES.find((option) => option.code !== countryCode)?.code ?? receivingCountry
        : receivingCountry;
      const receiving = COUNTRIES.find((option) => option.code === nextReceiving);
      setSendingCountry(countryCode);
      setReceivingCountry(nextReceiving);
      setInputs((prev) => ({
        ...prev,
        foreignCurrency: country.currency,
        baseCurrency: receiving?.currency ?? prev.baseCurrency,
      }));
    } else {
      const nextSending = countryCode === sendingCountry
        ? COUNTRIES.find((option) => option.code !== countryCode)?.code ?? sendingCountry
        : sendingCountry;
      const sending = COUNTRIES.find((option) => option.code === nextSending);
      setSendingCountry(nextSending);
      setReceivingCountry(countryCode);
      setInputs((prev) => ({
        ...prev,
        foreignCurrency: sending?.currency ?? prev.foreignCurrency,
        baseCurrency: country.currency,
      }));
    }
    setFlow((prev) => ({ ...prev, calculated: false }));
  };

  const isSending = transferMode === "sending";
  const apiDays = Math.min(Number(inputs.timeframe), 90);
  
  const historyParams = { 
    from: inputs.foreignCurrency, 
    to: inputs.baseCurrency, 
    days: apiDays 
  };

  const { data: history } = useGetFxHistory(historyParams, {
    query: {
      enabled: flow.calculated,
      queryKey: getGetFxHistoryQueryKey(historyParams)
    }
  });

  const comparisonParams = {
    from: inputs.foreignCurrency,
    to: inputs.baseCurrency,
    amount: inputs.foreignAmount,
    amountType: "RECEIVE" as const,
    sourceCountry: sendingCountry,
    targetCountry: receivingCountry,
  };

  const {
    data: comparison,
    isLoading: isComparisonLoading,
    isError: isComparisonError,
  } = useGetFxComparison(comparisonParams, {
    query: {
      enabled: flow.calculated,
      queryKey: getGetFxComparisonQueryKey(comparisonParams),
    },
  });

  const latestRate = history?.points?.[history.points.length - 1]?.rate;

  useEffect(() => {
    if (latestRate && !hasEditedHedgeRate) {
      setInputs(prev => ({ ...prev, hedgeRate: latestRate }));
    }
  }, [latestRate, hasEditedHedgeRate]);

  const availableProviders = comparison?.providers.filter(
    (provider) =>
      provider.status === "available" &&
      provider.senderPays,
  ) ?? [];
  const bestProvider = availableProviders[0];

  // Overall results for hedging section using selected provider
  const activeResults = useMemo(() => {
    return calculateFX({
      ...inputs,
      referenceRate: latestRate || 1
    });
  }, [inputs, latestRate]);

  const riskMetrics = useMemo(() => {
    if (!history?.points || history.points.length < 2) return null;
    return calculateVolatilityParams(history.points);
  }, [history?.points]);

  const riskRangeData = useMemo(() => {
    if (!riskMetrics || !history) return null;
    
    return generateRiskRange(
      riskMetrics.latestRate,
      riskMetrics.dailyVolatility,
      riskHorizon,
      inputs.foreignAmount,
      "TARGET",
    );
  }, [riskMetrics, riskHorizon, inputs.foreignAmount, history]);

  const riskChartData = useMemo(() => {
    const latestHistoryDate = history?.points?.[history.points.length - 1]?.date;
    if (!riskRangeData || !latestHistoryDate) return [];

    const startDate = new Date(latestHistoryDate);
    if (Number.isNaN(startDate.getTime())) return [];

    const dateFormatter = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

    return riskRangeData.map(d => {
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + d.day);

      return {
        name: dateFormatter.format(date),
      range: [d.providerLowerValue, d.providerUpperValue],
      center: d.providerCenterValue,
      lower: d.providerLowerValue,
      upper: d.providerUpperValue
      };
    });
  }, [history, riskRangeData]);

  const handleCalculate = () => {
    setFlow(prev => ({ ...prev, calculated: true }));
    setTimeout(() => {
      resultsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-sans font-bold tracking-tight text-foreground mb-3">Currency Planner</h1>
           <p className="text-lg text-muted-foreground">Find the best option for your needs and avoid hidden fees.</p>
        </div>
      </div>
      {/* STEP 1: INITIAL QUESTIONNAIRE */}
      <Card className="glass-panel overflow-hidden border-t-4 border-t-accent shadow-sm">
        <CardContent className="p-6 sm:p-8 space-y-8">
          
          <div className="space-y-4">
            <Label className="text-base font-medium text-foreground">What are you doing with this transfer?</Label>
            <Tabs 
              value={transferMode}
              onValueChange={(v) => {
                setTransferMode(v as "sending" | "receiving");
                setFlow((prev) => ({ ...prev, calculated: false }));
              }}
              className="w-full"
            >
              <TabsList className="w-full grid grid-cols-2 h-14 p-1">
                <TabsTrigger value="sending" className="text-base h-full rounded-md">Send money</TabsTrigger>
                <TabsTrigger value="receiving" className="text-base h-full rounded-md">Receive money</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-sm text-muted-foreground">
              {isSending
                ? "Enter what your recipient needs; compare what you pay in your home currency."
                : "Enter what you need to receive; compare what the sender pays in their currency."}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-4">
              <Label className="text-base font-medium text-foreground">Sending country</Label>
              <Select value={sendingCountry} onValueChange={(value) => handleCountryChange("sending", value)}>
                <SelectTrigger className="h-14 text-lg bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name} ({country.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-4">
              <Label className="text-base font-medium text-foreground">Receiving country</Label>
              <Select value={receivingCountry} onValueChange={(value) => handleCountryChange("receiving", value)}>
                <SelectTrigger className="h-14 text-lg bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name} ({country.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-base font-medium text-foreground">
              {isSending ? "Amount recipient needs" : "Amount you need to receive"}
            </Label>
            <div className="relative">
              <Input
                type="number"
                min="0"
                value={inputs.foreignAmount}
                onChange={(e) => handleInput("foreignAmount", Number(e.target.value))}
                className="pr-24 text-lg h-14 bg-background"
              />
              <div className="absolute inset-y-0 right-0 flex items-center px-4 text-sm font-semibold tracking-wide text-muted-foreground border-l border-border">
                {inputs.baseCurrency}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {isSending ? (
                <>The recipient receives <strong className="text-foreground">{inputs.baseCurrency}</strong>; you pay in <strong className="text-foreground">{inputs.foreignCurrency}</strong>.</>
              ) : (
                <>You receive <strong className="text-foreground">{inputs.baseCurrency}</strong>; the sender pays in <strong className="text-foreground">{inputs.foreignCurrency}</strong>.</>
              )}
            </p>
          </div>

          {!flow.calculated && (
            <div className="pt-6 animate-in fade-in">
              <Button size="lg" className="w-full text-lg h-14 rounded-xl" onClick={handleCalculate}>
                Compare Providers <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}

        </CardContent>
      </Card>
      {/* STEP 2: RESULTS & SCENARIOS */}
      {flow.calculated && (
        <div ref={resultsCardRef} className="space-y-12 animate-in slide-in-from-bottom-8 fade-in duration-700 pt-4">
          
           {isComparisonLoading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
               <p className="text-muted-foreground font-medium">Fetching current provider estimates...</p>
            </div>
           ) : isComparisonError || !comparison ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4 glass-panel rounded-xl border-destructive/20">
              <AlertTriangle className="h-10 w-10 text-destructive" />
               <p className="text-foreground font-medium text-lg">Failed to load provider comparisons.</p>
              <p className="text-muted-foreground text-sm">Please check the selected currencies or try again later.</p>
            </div>
          ) : (
            <>
              {/* PROVIDERS COMPARISON */}
              <div>
                 <div className="mb-4">
                  <h2 className="text-3xl font-sans font-medium text-foreground tracking-tight">Compare Transfer Providers</h2>
                </div>
                 <p className="text-muted-foreground mb-3 text-lg">
                  {comparison.disclosure}
                </p>
                 <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-8 text-xs text-muted-foreground">
                   <span>
                     <span className="inline-flex items-center gap-1 font-medium text-foreground">
                       <span>Reference Rate</span>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <button
                             type="button"
                             aria-label="About the reference rate"
                             className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                           >
                             <Info className="h-3.5 w-3.5" />
                           </button>
                         </TooltipTrigger>
                         <TooltipContent side="top" className="max-w-xs text-xs font-normal">
                           A neutral market benchmark. Each provider rate below is its own transfer estimate and may differ because of provider pricing, fees, and corridor conditions.
                         </TooltipContent>
                       </Tooltip>
                     </span>{" "}
                     {comparison.reference.rate
                       ? `1 ${comparison.from} = ${comparison.reference.rate.toFixed(4)} ${comparison.to}`
                       : "Unavailable"}
                     {comparison.reference.asOf ? ` as of ${comparison.reference.asOf}` : ""}
                   </span>
                   <span>
                     <span className="font-medium text-foreground">Retrieved:</span>{" "}
                     {formatCollectedAt(comparison.retrievedAt)}
                   </span>
                </div>
                
                <div className="grid gap-5">
                  {comparison.providers.map((provider) => {
                    const isAvailable = provider.status === "available";
                    const primaryMoney = provider.senderPays;
                    const bestMoney = bestProvider?.senderPays;
                    const isBest = isAvailable && provider.id === bestProvider?.id;
                    const diff = primaryMoney && bestMoney
                      ? Math.abs(primaryMoney.amount - bestMoney.amount)
                      : null;
                    const requirements = [
                      ["Online account", requiredOrNo(provider.onboarding.accountRequired)],
                      ["Branch visit", requiredOrNo(provider.onboarding.branchVisitMayBeRequired)],
                      ["Government ID", requiredOrNo(provider.onboarding.idRequired)],
                      ["Proof of address may be required", provider.onboarding.proofOfAddressMayBeRequired],
                      ["Selfie may be required", provider.onboarding.selfieMayBeRequired],
                      ["Source of funds may be required", provider.onboarding.sourceOfFundsMayBeRequired],
                      ["Business documents may be required", provider.onboarding.businessDocumentsMayBeRequired],
                    ] as const;

                    return (
                      <Card
                        key={provider.id}
                        className={cn(
                          "glass-panel transition-all duration-300 relative overflow-hidden",
                          isBest && "border-primary/50 shadow-md bg-primary/[0.03]",
                          !isAvailable && "opacity-80",
                        )}
                      >
                        {isBest && (
                          <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1.5 rounded-bl-lg tracking-widest shadow-sm">
                            BEST AVAILABLE
                          </div>
                        )}
                        <CardContent className="p-6">
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center gap-3">
                                <h3 className="font-sans font-semibold text-2xl">{provider.name}</h3>
                                {isBest && (
                                  <Badge variant="secondary" className="text-[10px] h-5 bg-primary/15 text-primary border-none">
                                    Recommended for this amount
                                  </Badge>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-muted-foreground pt-1">
                                <div className="flex items-center gap-1.5 bg-background/50 px-2.5 py-1 rounded-md border border-border/50">
                                  <span className="font-medium text-foreground">Rate:</span>
                                  {provider.rate === null ? "Unavailable" : provider.rate.toFixed(4)}
                                </div>
                                <div className="flex items-center gap-1.5 bg-background/50 px-2.5 py-1 rounded-md border border-border/50">
                                  <Clock3 className="h-3.5 w-3.5" />
                                  <span className="font-medium text-foreground">Transfer time:</span>
                                  {provider.delivery.display}
                                </div>
                              </div>
                            </div>

                            <div className="text-right border-t md:border-t-0 md:border-l border-border/50 pt-5 md:pt-0 md:pl-8 flex flex-col justify-center">
                              <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                                 {isSending ? "You pay" : "Sender pays"}
                              </div>
                              <div className="text-4xl font-sans font-bold text-foreground tracking-tight">
                                {primaryMoney
                                  ? formatCurrency(primaryMoney.amount, primaryMoney.currency)
                                  : provider.status === "available"
                                    ? "Amount unavailable"
                                    : "No approved quote"}
                              </div>
                              {diff !== null && diff > 0 && (
                                <div className="text-sm font-medium text-destructive mt-2">
                                  Estimated extra cost: {formatCurrency(diff, primaryMoney?.currency ?? inputs.baseCurrency)}
                                </div>
                              )}
                              {isBest && (
                                <div className="text-sm font-medium text-primary mt-2">
                                  Lowest estimated amount to send
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-6 border-t border-border/50 pt-4 space-y-2">
                            <Collapsible>
                              <CollapsibleTrigger asChild>
                                <button
                                  type="button"
                                  className="group w-full flex items-center justify-between gap-4 rounded-lg px-2 py-2 text-left hover:bg-muted/40 transition-colors"
                                >
                                  <span className="min-w-0">
                                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                      <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                                      Signup & verification
                                    </span>
                                    <span className="block mt-1 text-xs text-muted-foreground truncate">
                                      Online account: {requiredOrNo(provider.onboarding.accountRequired)}
                                      <span className="mx-2">·</span>
                                      Branch visit: {requiredOrNo(provider.onboarding.branchVisitMayBeRequired)}
                                      <span className="mx-2">·</span>
                                      ID: {requiredOrNo(provider.onboarding.idRequired)}
                                      <span className="mx-2">·</span>
                                      Additional checks: {additionalChecksSummary(
                                        provider.onboarding.proofOfAddressMayBeRequired,
                                        provider.onboarding.selfieMayBeRequired,
                                        provider.onboarding.sourceOfFundsMayBeRequired,
                                        provider.onboarding.businessDocumentsMayBeRequired,
                                      )}
                                    </span>
                                  </span>
                                  <span className="flex items-center gap-2 shrink-0 text-xs font-medium text-primary">
                                    View details
                                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                                  </span>
                                </button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="pt-4 px-2">
                                <div className="space-y-3">
                                  <div className="grid sm:grid-cols-2 gap-2">
                                    {requirements.map(([label, value]) => (
                                      <div key={label} className="flex items-center justify-between gap-3 rounded-lg bg-background/60 border border-border/40 px-3 py-2 text-xs">
                                        <span className="text-muted-foreground">{label}</span>
                                        <span className="font-semibold text-foreground">
                                          {typeof value === "string" ? value : requirementValue(value)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  {provider.onboarding.notes.map((note) => (
                                    <p key={note} className="text-xs text-muted-foreground">{note}</p>
                                  ))}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>

                            <Collapsible>
                              <CollapsibleTrigger asChild>
                                <button
                                  type="button"
                                  className="group w-full flex items-center justify-between gap-4 rounded-lg px-2 py-2 text-left hover:bg-muted/40 transition-colors"
                                >
                                  <span className="min-w-0">
                                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                      <Database className="h-4 w-4 text-primary shrink-0" />
                                      Data and fee details
                                    </span>
                                    <span className="block mt-1 text-xs text-muted-foreground truncate">
                                      Source: {provider.source.label}
                                      <span className="mx-2">·</span>
                                      Additional fees may apply
                                    </span>
                                  </span>
                                  <span className="flex items-center gap-2 shrink-0 text-xs font-medium text-primary">
                                    View details
                                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                                  </span>
                                </button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="pt-4 px-2">
                                <div className="space-y-3 text-sm">
                                  {provider.unavailableReason && (
                                    <p className="rounded-lg border border-dashed border-border px-3 py-2 text-muted-foreground">
                                      {provider.unavailableReason}
                                    </p>
                                  )}
                                  <p className="text-muted-foreground">{provider.additionalFeesNote}</p>
                                  <div className="text-xs text-muted-foreground space-y-1">
                                    <p><strong className="text-foreground">Source:</strong> {provider.source.label}</p>
                                    <p><strong className="text-foreground">Collected:</strong> {formatCollectedAt(provider.source.collectedAt)}</p>
                                    <p><strong className="text-foreground">Timing basis:</strong> {provider.delivery.basis}</p>
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* RISK RANGE FORECAST */}
              {isSending && riskMetrics && riskRangeData && riskChartData.length > 0 && (
                <div className="pt-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-3xl font-sans font-medium text-foreground tracking-tight flex items-center gap-3">
                      <TrendingUp className="h-7 w-7 text-primary" />
                      Future Risk Range
                    </h2>
                    <Select value={riskHorizon.toString()} onValueChange={(v) => setRiskHorizon(Number(v))}>
                      <SelectTrigger className="w-[180px] h-10 bg-background shadow-sm border-border/60">
                        <SelectValue placeholder="Timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Next 7 Days</SelectItem>
                        <SelectItem value="30">Next 30 Days</SelectItem>
                        <SelectItem value="90">Next 90 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="bg-primary/5 border border-primary/20 p-5 rounded-xl mb-6 space-y-3">
                    <p className="text-foreground text-lg leading-relaxed font-medium">
                      Based on recent volatility, the home-currency cost of this amount could fall between
                      <span className="font-sans font-bold mx-1.5">{formatCurrency(riskRangeData[riskRangeData.length - 1].providerLowerValue, inputs.foreignCurrency)}</span> 
                      and 
                      <span className="font-sans font-bold mx-1.5">{formatCurrency(riskRangeData[riskRangeData.length - 1].providerUpperValue, inputs.foreignCurrency)}</span> 
                      over the next {riskHorizon} days.
                    </p>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5"><Badge variant="outline" className="bg-background">Volatility: {(riskMetrics.dailyVolatility * 100).toFixed(2)}% daily</Badge></div>
                       <div className="flex items-center gap-1.5"><Badge variant="outline" className="bg-background">{riskMetrics.observationCount} day historical sample</Badge></div>
                    </div>
                  </div>
                  
                  <Card className="glass-panel overflow-hidden border-border/50 shadow-sm relative">
                    <CardContent className="p-6 sm:p-8">
                      <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={riskChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{fill: "hsl(var(--muted-foreground))", fontSize: 12}} 
                              minTickGap={30}
                            />
                            <YAxis 
                              domain={['auto', 'auto']} 
                              axisLine={false} 
                              tickLine={false}
                              tickFormatter={(val) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(val)}
                              tick={{fill: "hsl(var(--muted-foreground))", fontSize: 12}}
                              width={65}
                            />
                            <RechartsTooltip 
                              content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                  const rangePayload = payload.find(p => p.dataKey === 'range');
                                  const centerPayload = payload.find(p => p.dataKey === 'center');
                                  if (!rangePayload || !centerPayload) return null;
                                   const rangeValue = Array.isArray(rangePayload.value)
                                     ? rangePayload.value.map(Number)
                                     : [];
                                   const centerValue = Number(centerPayload.value);
                                   if (
                                     rangeValue.length < 2 ||
                                     !Number.isFinite(rangeValue[0]) ||
                                     !Number.isFinite(rangeValue[1]) ||
                                     !Number.isFinite(centerValue)
                                   ) return null;
                                  
                                  return (
                                    <div className="bg-popover border border-border/60 text-popover-foreground p-4 rounded-xl shadow-xl text-sm min-w-[240px]">
                                      <p className="font-semibold mb-3 text-muted-foreground">{label}</p>
                                      <div className="space-y-3">
                                        <div className="flex justify-between items-center text-muted-foreground">
                                           <span>High cost estimate</span>
                                           <span className="font-sans font-semibold text-foreground text-base">{formatCurrency(rangeValue[1], inputs.foreignCurrency)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-primary font-medium py-1 border-y border-border/40">
                                           <span>Current cost at today's rate</span>
                                           <span className="font-sans font-bold text-base">{formatCurrency(centerValue, inputs.foreignCurrency)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-muted-foreground">
                                           <span>Low cost estimate</span>
                                           <span className="font-sans font-semibold text-foreground text-base">{formatCurrency(rangeValue[0], inputs.foreignCurrency)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="range" 
                              stroke="none" 
                              fill="hsl(var(--primary))" 
                              fillOpacity={0.12}
                              activeDot={false}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="center" 
                              stroke="hsl(var(--primary))" 
                              strokeWidth={2}
                              strokeDasharray="4 4"
                              dot={false}
                              activeDot={{ r: 6, strokeWidth: 0, fill: "hsl(var(--primary))" }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-6 flex items-start gap-3 text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg">
                        <Info className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground/70" />
                        <p>
                           <strong>Statistical projection only.</strong> This fan chart assumes future volatility will match recent history. It is a mathematical range, not a guaranteed forecast. Actual market outcomes can and will fall outside this 90% model range. Extreme events, geopolitical shocks, or central bank policies are not modeled here.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* HEDGING */}
              {isSending && <div className="pt-8">
                <div className="border border-border/50 rounded-2xl bg-card shadow-sm glass-panel overflow-hidden transition-all duration-300">
                  <button 
                    onClick={() => setFlow(prev => ({ ...prev, showHedgingSection: !prev.showHedgingSection }))}
                    className="w-full px-8 py-6 flex items-center justify-between text-2xl font-sans font-medium hover:bg-muted/40 transition-colors text-left"
                  >
                    Explore fixing the exchange rate
                    <ChevronDown className={cn("h-6 w-6 text-muted-foreground transition-transform duration-300", flow.showHedgingSection && "rotate-180")} />
                  </button>
                  
                  {flow.showHedgingSection && (
                    <div className="px-8 pb-8 pt-2 space-y-10 border-t border-border/50 animate-in fade-in slide-in-from-top-4">
                      <p className="text-muted-foreground text-lg leading-relaxed max-w-3xl">
                        Some businesses agree an exchange rate in advance so they know the future cost. This is called hedging. 
                        It protects you if the market moves against you, but means you might miss out if the market improves. 
                        This scenario uses the historical reference rate only. It does not assume a provider spread or fee.
                      </p>
                      
                      {!flow.exploredHedging ? (
                        <Button size="lg" className="rounded-xl h-14 text-base px-8" onClick={() => setFlow(prev => ({...prev, exploredHedging: true}))}>
                          Test a fixed rate scenario
                        </Button>
                      ) : (
                        <div className="space-y-10 animate-in fade-in duration-500 pt-6 border-t border-border/50">
                          
                          <div className="space-y-4">
                            <Label className="text-lg font-medium">1. How much of the total do you want to fix?</Label>
                            <div className="flex flex-wrap gap-4 pt-2">
                              {[25, 50, 75, 100].map(ratio => (
                                <Button 
                                  key={ratio} 
                                  variant={inputs.hedgeRatio === ratio ? "default" : "outline"}
                                  onClick={() => handleInput("hedgeRatio", ratio)}
                                  className="w-24 h-12 text-base rounded-xl"
                                >
                                  {ratio}%
                                </Button>
                              ))}
                            </div>
                            <p className="text-sm text-muted-foreground">Fixing {inputs.hedgeRatio}% leaves {100 - inputs.hedgeRatio}% to float at the market rate.</p>
                          </div>

                          <div className="space-y-4">
                            <Label className="text-lg font-medium">2. Agreed Rate (Forward Rate)</Label>
                            <Input 
                              type="number" 
                              step="0.0001" 
                              className="w-56 h-12 text-lg font-mono bg-background rounded-xl" 
                              value={inputs.hedgeRate} 
                              onChange={e => handleInput("hedgeRate", Number(e.target.value))} 
                            />
                            <p className="text-sm text-muted-foreground">
                              Providers usually offer a forward rate slightly different from the current reference rate.
                            </p>
                          </div>

                          <div className="space-y-5 pt-6 border-t border-border/50">
                            <Label className="text-lg font-medium">3. Test a market movement</Label>
                            <p className="text-sm text-muted-foreground">
                              See how your fixed rate holds up if the currency changes by 5%.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 pt-2">
                              <Button 
                                variant={inputs.scenarioSlider === -5 ? "default" : "outline"} 
                                onClick={() => handleInput("scenarioSlider", -5)}
                                className="flex-1 h-14 whitespace-normal rounded-xl"
                              >
                                {inputs.foreignCurrency} gets 5% cheaper
                              </Button>
                              <Button 
                                variant={inputs.scenarioSlider === 0 ? "default" : "outline"} 
                                onClick={() => handleInput("scenarioSlider", 0)}
                                className="flex-1 h-14 whitespace-normal rounded-xl"
                              >
                                No change
                              </Button>
                              <Button 
                                variant={inputs.scenarioSlider === 5 ? "default" : "outline"} 
                                onClick={() => handleInput("scenarioSlider", 5)}
                                className="flex-1 h-14 whitespace-normal rounded-xl"
                              >
                                {inputs.foreignCurrency} gets 5% more expensive
                              </Button>
                            </div>
                          </div>

                          <div className="p-8 bg-primary/5 rounded-2xl border border-primary/15 space-y-4 shadow-sm">
                            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
                               Estimated home-currency cost with part of the rate fixed
                            </p>
                            <div className="text-5xl font-sans font-bold text-foreground tracking-tight">
                               {formatCurrency(activeResults.hedgedScenarioValue, inputs.foreignCurrency)}
                            </div>
                            <p className="text-base text-muted-foreground mt-4 leading-relaxed max-w-2xl">
                              In your <strong>{inputs.scenarioSlider > 0 ? "5% more expensive" : inputs.scenarioSlider < 0 ? "5% cheaper" : "no change"}</strong> scenario, 
                              fixing the rate for {inputs.hedgeRatio}% of the amount gives you a blended effective rate of <strong>{activeResults.effectiveBlendedRate.toFixed(4)}</strong>. 
                              
                              {inputs.scenarioSlider !== 0 && (
                                <span className="block mt-4 font-medium text-foreground bg-background/50 p-4 rounded-xl border border-border/50">
                                  {activeResults.amountProtected > 0 
                                   ? `This approach protects ${formatCurrency(activeResults.amountProtected, inputs.foreignCurrency)} compared to floating 100%.`
                                   : `Because the market moved favorably, fixing the rate cost you ${formatCurrency(Math.abs(activeResults.amountProtected), inputs.foreignCurrency)} in opportunity.`}
                                </span>
                              )}
                            </p>
                          </div>

                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>}
            </>
          )}
        </div>
      )}
      <section className="pt-16 pb-24 space-y-8" aria-labelledby="methodology-heading">
        <div className="space-y-4 max-w-4xl">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary" />
            <h2 id="methodology-heading" className="text-3xl font-sans font-bold text-foreground">
              Methodology &amp; Data Sources
            </h2>
          </div>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Transparency in calculation is essential for trust. This section explains how UmmahFX arrives at its figures and the limitations of these models.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="glass-panel md:col-span-2">
            <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground grid md:grid-cols-2 gap-x-12 gap-y-6">
              <div>
                <strong className="text-foreground text-base">Provider comparison</strong>
                <br />
                Provider rates, fees, recipient amounts, and transfer times come from the Wise Comparison API. Competitor values are estimates collected from provider websites for bank-transfer pay-in and pay-out; they are not executable quotes.
              </div>
              <div>
                <strong className="text-foreground text-base">Risk range forecast</strong>
                <br />
                The risk fan chart projects a model range based purely on the sample standard deviation of daily logarithmic returns over the retrieved historical period (typically up to 90 days).
                <br />
                <em>Formula:</em>{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded">Latest Rate * exp(±1.645 * DailyVolatility * sqrt(Days))</code>
                <br />
                This model assumes zero drift (no inherent directional bias) and normal distribution of returns.
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel md:col-span-2">
            <div className="p-6 flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">Limitations of the Risk Range</h3>
            </div>
            <CardContent className="pt-0 space-y-4 text-sm leading-relaxed text-muted-foreground md:grid md:grid-cols-2 md:gap-x-12">
              <p>
                <strong className="text-foreground">Past performance is not indicative of future results.</strong>
                <br />
                The volatility model assumes the immediate future will behave like the immediate past. It cannot predict sudden macroeconomic shifts, geopolitical events, or central bank policy surprises.
              </p>
              <p>
                <strong className="text-foreground">Missing market days.</strong>
                <br />
                Weekends and holidays are ignored; the model scales by calendar days roughly equivalent to trading days in this simplified illustration. It includes no interest-rate differential or forward-points model.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
