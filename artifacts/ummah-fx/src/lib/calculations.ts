export type ExposureDirection = "payable" | "receivable";

export interface CalculatorInputs {
  direction: ExposureDirection;
  foreignAmount: number;
  amountBasis?: "SOURCE" | "TARGET";
  baseCurrency: string;
  foreignCurrency: string;
  referenceRate: number; // Base currency per 1 Foreign currency
  scenarioSlider: number; // -20 to +20 percentage
  hedgeRatio: number; // 0 to 100 percentage
  hedgeRate: number; // Locked base per 1 foreign
}

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AED",
  "SAR",
  "AUD",
  "SGD",
  "INR",
  "MYR",
  "IDR",
  "PKR",
  "TRY",
  "CNY",
  "CHF",
  "JPY",
  "HUF",
  "MAD",
  "TND",
  "EGP",
  "BDT",
];

export interface CountryOption {
  code: string;
  name: string;
  currency: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: "US", name: "United States", currency: "USD" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "SG", name: "Singapore", currency: "SGD" },
  { code: "IN", name: "India", currency: "INR" },
  { code: "MY", name: "Malaysia", currency: "MYR" },
  { code: "ID", name: "Indonesia", currency: "IDR" },
  { code: "PK", name: "Pakistan", currency: "PKR" },
  { code: "TR", name: "Türkiye", currency: "TRY" },
  { code: "CN", name: "China", currency: "CNY" },
  { code: "CH", name: "Switzerland", currency: "CHF" },
  { code: "JP", name: "Japan", currency: "JPY" },
  { code: "HU", name: "Hungary", currency: "HUF" },
  { code: "MA", name: "Morocco", currency: "MAD" },
  { code: "TN", name: "Tunisia", currency: "TND" },
  { code: "EG", name: "Egypt", currency: "EGP" },
  { code: "BD", name: "Bangladesh", currency: "BDT" },
];

export interface CalculationResults {
  baselineValue: number;
  providerEffectiveRate: number;
  providerValue: number;
  scenarioReferenceRate: number;
  scenarioProviderRate: number;
  unhedgedScenarioValue: number;
  hedgedScenarioValue: number;
  effectiveBlendedRate: number;
  impactVsBaseline: number;
  amountProtected: number;
}

export function calculateFX(inputs: CalculatorInputs): CalculationResults {
  const {
    direction,
    foreignAmount,
    amountBasis = "SOURCE",
    referenceRate,
    scenarioSlider,
    hedgeRatio,
    hedgeRate,
  } = inputs;

  const providerEffectiveRate = referenceRate;
  const baselineValue = amountBasis === "TARGET"
    ? foreignAmount / referenceRate
    : foreignAmount * referenceRate;
  const providerValue = baselineValue;
    
  // Scenario rate
  // Positive scenarioSlider = base weakens (rates go up, bad for payables, good for receivables)
  // Negative scenarioSlider = base strengthens (rates go down, good for payables, bad for receivables)
  const scenarioReferenceRate = referenceRate * (1 + scenarioSlider / 100);
  const scenarioProviderRate = scenarioReferenceRate;
  
  const unhedgedScenarioValue = amountBasis === "TARGET"
    ? foreignAmount / scenarioProviderRate
    : foreignAmount * scenarioProviderRate;
    
  // Hedging
  const hedgeDec = hedgeRatio / 100;
  const hedgedAmount = foreignAmount * hedgeDec;
  const unhedgedAmount = foreignAmount * (1 - hedgeDec);
  
  // The hedged part uses the exact locked rate (no extra spread applied directly to it, assuming the rate is a fully loaded forward/option rate for simplicity)
  // For standard models, a forward rate has its own markup. We assume hedgeRate is the final executed rate.
  const hedgedPartBase = amountBasis === "TARGET"
    ? hedgedAmount / hedgeRate
    : hedgedAmount * hedgeRate;
  
  // The unhedged part goes through the spot market with the provider
  const unhedgedPartBase = amountBasis === "TARGET"
    ? unhedgedAmount / scenarioProviderRate
    : unhedgedAmount * scenarioProviderRate;
  
  const hedgedScenarioValue = hedgedPartBase + unhedgedPartBase;
  const effectiveBlendedRate = amountBasis === "TARGET"
    ? foreignAmount / hedgedScenarioValue
    : hedgedScenarioValue / foreignAmount;
    
  // Impact vs baseline under scenario
  // If payable, paying more is bad (-). If receivable, receiving less is bad (-).
  const impactVsBaseline = direction === "payable"
    ? providerValue - unhedgedScenarioValue // Unhedged is higher -> negative impact
    : unhedgedScenarioValue - providerValue; // Unhedged is lower -> negative impact
    
  const amountProtected = direction === "payable"
    ? unhedgedScenarioValue - hedgedScenarioValue // if unhedged is 110, hedged is 105, protected 5
    : hedgedScenarioValue - unhedgedScenarioValue; // if hedged is 105, unhedged is 100, protected 5

  return {
    baselineValue,
    providerEffectiveRate,
    providerValue,
    scenarioReferenceRate,
    scenarioProviderRate,
    unhedgedScenarioValue,
    hedgedScenarioValue,
    effectiveBlendedRate,
    impactVsBaseline,
    amountProtected,
  };
}

export function calculateVolatilityParams(historyPoints: { date: string; rate: number }[]) {
  if (!historyPoints || historyPoints.length < 2) return null;

  // Ensure points are sorted chronologically (oldest to newest)
  const sortedPoints = [...historyPoints].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const logReturns: number[] = [];
  for (let i = 1; i < sortedPoints.length; i++) {
    const prevRate = sortedPoints[i-1].rate;
    const currRate = sortedPoints[i].rate;
    if (prevRate > 0 && currRate > 0) {
      logReturns.push(Math.log(currRate / prevRate));
    }
  }

  if (logReturns.length < 1) return null;

  // Sample mean and standard deviation
  const mean = logReturns.reduce((sum, val) => sum + val, 0) / logReturns.length;
  const varianceSum = logReturns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  const dailyVolatility = logReturns.length > 1 ? Math.sqrt(varianceSum / (logReturns.length - 1)) : 0;
  
  return {
    latestRate: sortedPoints[sortedPoints.length - 1].rate,
    dailyVolatility,
    observationCount: logReturns.length
  };
}

export interface RiskRangePoint {
  day: number;
  label: string;
  lowerRate: number;
  centerRate: number;
  upperRate: number;
  providerLowerValue: number;
  providerCenterValue: number;
  providerUpperValue: number;
}

export function generateRiskRange(
  latestRate: number,
  dailyVolatility: number,
  horizonDays: number,
  foreignAmount: number,
  amountBasis: "SOURCE" | "TARGET" = "SOURCE",
): RiskRangePoint[] {
  const points: RiskRangePoint[] = [];
  
  let step = 1;
  if (horizonDays === 30) step = 3;
  if (horizonDays === 90) step = 7;
  
  const calculateProviderValue = (rate: number) => {
    return amountBasis === "TARGET"
      ? foreignAmount / rate
      : foreignAmount * rate;
  };

  const centerValue = calculateProviderValue(latestRate);

  for (let t = 0; t <= horizonDays; t += step) {
    const z = 1.645;
    const lowerRate = latestRate * Math.exp(-z * dailyVolatility * Math.sqrt(t));
    const upperRate = latestRate * Math.exp(z * dailyVolatility * Math.sqrt(t));
    
    const val1 = calculateProviderValue(lowerRate);
    const val2 = calculateProviderValue(upperRate);
    
    points.push({
      day: t,
      label: t === 0 ? "Today" : `Day ${t}`,
      lowerRate,
      centerRate: latestRate,
      upperRate,
      providerLowerValue: Math.min(val1, val2),
      providerCenterValue: centerValue,
      providerUpperValue: Math.max(val1, val2),
    });
  }

  // Ensure exact final day is included if step skipped it
  if (points[points.length - 1].day !== horizonDays) {
    const t = horizonDays;
    const z = 1.645;
    const lowerRate = latestRate * Math.exp(-z * dailyVolatility * Math.sqrt(t));
    const upperRate = latestRate * Math.exp(z * dailyVolatility * Math.sqrt(t));
    
    const val1 = calculateProviderValue(lowerRate);
    const val2 = calculateProviderValue(upperRate);
    
    points.push({
      day: t,
      label: `Day ${t}`,
      lowerRate,
      centerRate: latestRate,
      upperRate,
      providerLowerValue: Math.min(val1, val2),
      providerCenterValue: centerValue,
      providerUpperValue: Math.max(val1, val2),
    });
  }

  return points;
}

export function formatCurrency(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
