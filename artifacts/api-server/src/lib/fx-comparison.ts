type DataSourceKind =
  | "DIRECT_API"
  | "THIRD_PARTY_ESTIMATE"
  | "FIRST_PARTY_DISCLOSURE"
  | "DERIVED"
  | "UNAVAILABLE";

export type WiseQuote = {
  dateCollected?: string | null;
  deliveryEstimation?: {
    duration?: { min?: string | null; max?: string | null } | null;
    providerGivesEstimate?: boolean;
  } | null;
  fee?: number | null;
  markup?: number | null;
  rate?: number | null;
  receivedAmount?: number | null;
  sendAmount?: number | null;
};

type WiseProvider = {
  alias?: string;
  name?: string;
  type?: string;
  quotes?: WiseQuote[];
};

type WisePayload = {
  providers?: WiseProvider[];
};

type Onboarding = {
  accountRequired: boolean | null;
  onlineSignupAvailable: boolean | null;
  idRequired: boolean | null;
  proofOfAddressMayBeRequired: boolean | null;
  selfieMayBeRequired: boolean | null;
  sourceOfFundsMayBeRequired: boolean | null;
  businessDocumentsMayBeRequired: boolean | null;
  branchVisitMayBeRequired: boolean | null;
  notes: string[];
};

type ComparisonInput = {
  from: string;
  to: string;
  amount: number;
  amountType: "SEND" | "RECEIVE";
  sourceCountry: string;
  targetCountry: string;
};

const WISE_COMPARISON_URL = "https://api.wise.com/2026Q3/comparisons";
const WISE_SOURCE_URL = "https://docs.wise.com/api-reference/comparison";
const BOC_SOURCE_URL = "https://www.bankofcanada.ca/valet/docs";
const CACHE_TTL_MS = 15 * 60 * 1000;

const cache = new Map<string, { expiresAt: number; value: unknown }>();

const canadianBanks = [
  { id: "rbc", name: "Royal Bank of Canada" },
  { id: "bnc", name: "National Bank of Canada" },
  { id: "td", name: "TD Canada Trust" },
  { id: "scotiabank", name: "Scotiabank" },
  { id: "bmo", name: "Bank of Montreal" },
  { id: "cibc", name: "CIBC" },
  { id: "desjardins", name: "Desjardins" },
] as const;

const genericOnboarding: Onboarding = {
  accountRequired: null,
  onlineSignupAvailable: null,
  idRequired: null,
  proofOfAddressMayBeRequired: null,
  selfieMayBeRequired: null,
  sourceOfFundsMayBeRequired: true,
  businessDocumentsMayBeRequired: null,
  branchVisitMayBeRequired: null,
  notes: [
    "Requirements vary by transfer amount, customer type, corridor, and compliance review.",
  ],
};

const onboardingByProvider: Record<string, Onboarding> = {
  wise: {
    accountRequired: true,
    onlineSignupAvailable: true,
    idRequired: true,
    proofOfAddressMayBeRequired: true,
    selfieMayBeRequired: true,
    sourceOfFundsMayBeRequired: true,
    businessDocumentsMayBeRequired: true,
    branchVisitMayBeRequired: false,
    notes: ["Wise may request additional verification before completing a transfer."],
  },
  ofx: {
    accountRequired: true,
    onlineSignupAvailable: true,
    idRequired: true,
    proofOfAddressMayBeRequired: true,
    selfieMayBeRequired: null,
    sourceOfFundsMayBeRequired: true,
    businessDocumentsMayBeRequired: true,
    branchVisitMayBeRequired: false,
    notes: ["Account approval and transfer limits depend on customer verification."],
  },
  "western-union": {
    accountRequired: true,
    onlineSignupAvailable: true,
    idRequired: true,
    proofOfAddressMayBeRequired: true,
    selfieMayBeRequired: null,
    sourceOfFundsMayBeRequired: true,
    businessDocumentsMayBeRequired: null,
    branchVisitMayBeRequired: false,
    notes: ["These requirements describe the online bank-transfer route modeled here."],
  },
  paypal: {
    accountRequired: true,
    onlineSignupAvailable: true,
    idRequired: true,
    proofOfAddressMayBeRequired: true,
    selfieMayBeRequired: null,
    sourceOfFundsMayBeRequired: true,
    businessDocumentsMayBeRequired: true,
    branchVisitMayBeRequired: false,
    notes: ["Account verification requirements vary by account and transaction."],
  },
  remitly: {
    accountRequired: true,
    onlineSignupAvailable: true,
    idRequired: true,
    proofOfAddressMayBeRequired: true,
    selfieMayBeRequired: null,
    sourceOfFundsMayBeRequired: true,
    businessDocumentsMayBeRequired: null,
    branchVisitMayBeRequired: false,
    notes: [
      "Remitly may request a photo ID or supporting documents, especially for a first transfer, higher limits, or a review.",
    ],
  },
  instarem: {
    accountRequired: true,
    onlineSignupAvailable: true,
    idRequired: true,
    proofOfAddressMayBeRequired: true,
    selfieMayBeRequired: null,
    sourceOfFundsMayBeRequired: true,
    businessDocumentsMayBeRequired: null,
    branchVisitMayBeRequired: false,
    notes: [
      "Instarem asks for an email, phone number, identity document, and address document; verification can vary by country.",
    ],
  },
  "world-remit": {
    accountRequired: true,
    onlineSignupAvailable: true,
    idRequired: true,
    proofOfAddressMayBeRequired: true,
    selfieMayBeRequired: true,
    sourceOfFundsMayBeRequired: true,
    businessDocumentsMayBeRequired: null,
    branchVisitMayBeRequired: false,
    notes: [
      "WorldRemit says regulated verification commonly includes government ID and may also request a selfie, proof of address, bank statement, transfer purpose, or source of funds.",
    ],
  },
  "wells-fargo": {
    accountRequired: true,
    onlineSignupAvailable: true,
    idRequired: true,
    proofOfAddressMayBeRequired: true,
    selfieMayBeRequired: null,
    sourceOfFundsMayBeRequired: true,
    businessDocumentsMayBeRequired: false,
    branchVisitMayBeRequired: false,
    notes: [
      "The Wells Fargo estimate models a digital wire from an eligible Wells Fargo account; branch wires are a separate route.",
    ],
  },
  chase: {
    accountRequired: true,
    onlineSignupAvailable: true,
    idRequired: true,
    proofOfAddressMayBeRequired: true,
    selfieMayBeRequired: null,
    sourceOfFundsMayBeRequired: true,
    businessDocumentsMayBeRequired: false,
    branchVisitMayBeRequired: false,
    notes: [
      "The Chase estimate models an online wire from an eligible checking account after wire enrollment; a banker can also help in a branch.",
    ],
  },
  bmo: {
    accountRequired: true,
    onlineSignupAvailable: null,
    idRequired: true,
    proofOfAddressMayBeRequired: true,
    selfieMayBeRequired: null,
    sourceOfFundsMayBeRequired: true,
    businessDocumentsMayBeRequired: false,
    branchVisitMayBeRequired: null,
    notes: [
      "BMO says opening a Canadian bank account requires original identification and a Canadian residential address; the transfer route may vary by account.",
    ],
  },
};

for (const bank of canadianBanks) {
  onboardingByProvider[bank.id] = {
    accountRequired: true,
    onlineSignupAvailable: null,
    idRequired: true,
    proofOfAddressMayBeRequired: true,
    selfieMayBeRequired: null,
    sourceOfFundsMayBeRequired: true,
    businessDocumentsMayBeRequired: false,
    branchVisitMayBeRequired: null,
    notes: [
      "Opening a Canadian personal bank account generally requires government identification and an address document; the online or branch path varies by bank and account.",
    ],
  };
}

onboardingByProvider.td = {
  accountRequired: true,
  onlineSignupAvailable: true,
  idRequired: true,
  proofOfAddressMayBeRequired: true,
  selfieMayBeRequired: null,
  sourceOfFundsMayBeRequired: true,
  businessDocumentsMayBeRequired: false,
  branchVisitMayBeRequired: true,
  notes: [
    "TD says Canadian account opening requires personal identification and a Canadian residential address; some newcomer or account-activation paths require a branch visit.",
  ],
};

onboardingByProvider.bmo = {
  accountRequired: true,
  onlineSignupAvailable: null,
  idRequired: true,
  proofOfAddressMayBeRequired: true,
  selfieMayBeRequired: null,
  sourceOfFundsMayBeRequired: true,
  businessDocumentsMayBeRequired: false,
  branchVisitMayBeRequired: true,
  notes: [
    "BMO says opening a Canadian bank account requires original identification and a Canadian residential address; newcomers may need to open an account in person.",
  ],
};

function normalizeProviderType(
  value: string | undefined,
): "bank" | "moneyTransferProvider" | "travelMoney" | "unknown" {
  if (value === "bank" || value === "moneyTransferProvider" || value === "travelMoney") {
    return value;
  }
  return "unknown";
}

function canonicalProviderId(alias: string, name: string): string {
  const normalized = `${alias} ${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (
    alias.toLowerCase() === "rbc" ||
    normalized.includes("rbc") ||
    normalized.includes("royal bank of canada") ||
    normalized.includes("royalbankofcanada")
  ) {
    return "rbc";
  }

  if (
    alias.toLowerCase() === "bnc" ||
    normalized.includes("bnc") ||
    normalized.includes("national bank of canada") ||
    normalized.includes("nationalbankofcanada")
  ) {
    return "bnc";
  }

  if (
    alias.toLowerCase() === "td-bank" ||
    normalized.includes("td bank") ||
    normalized.includes("td canada trust")
  ) {
    return "td";
  }

  return alias.toLowerCase();
}

function canonicalProviderName(id: string, name: string): string {
  if (id === "rbc") return "Royal Bank of Canada";
  if (id === "bnc") return "National Bank of Canada";
  if (id === "td") return "TD Canada Trust";
  return name;
}

function hoursFromDuration(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?)?$/,
  );
  if (!match) return null;
  return (
    Number(match[1] ?? 0) * 24 +
    Number(match[2] ?? 0) +
    Number(match[3] ?? 0) / 60
  );
}

function formatDuration(hours: number): string {
  if (hours < 24) {
    const rounded = Math.max(1, Math.round(hours));
    return `${rounded} hour${rounded === 1 ? "" : "s"}`;
  }
  const days = Math.max(1, Math.round(hours / 24));
  return `${days} business day${days === 1 ? "" : "s"}`;
}

function fallbackDelivery(
  providerType: "bank" | "moneyTransferProvider" | "travelMoney" | "unknown",
) {
  if (providerType === "moneyTransferProvider") {
    return {
      minHours: 1,
      maxHours: 72,
      display: "Same day–3 business days",
      basis:
        "Fallback estimate for an online money-transfer provider when Wise does not return a delivery duration; actual timing varies by corridor and payout method.",
    };
  }

  if (providerType === "travelMoney") {
    return {
      minHours: 24,
      maxHours: 72,
      display: "1–3 business days",
      basis:
        "Fallback estimate for a travel-money transfer when Wise does not return a delivery duration.",
    };
  }

  return {
    minHours: 24,
    maxHours: 120,
    display: "1–5 business days",
    basis:
      "Fallback estimate for an international bank wire when Wise does not return a delivery duration; intermediary and receiving-bank processing can add time.",
  };
}

export type ProviderType =
  | "bank"
  | "moneyTransferProvider"
  | "travelMoney"
  | "unknown";

export function deliveryFromWise(
  quote: WiseQuote,
  providerType: ProviderType,
) {
  const minHours = hoursFromDuration(quote.deliveryEstimation?.duration?.min);
  const maxHours = hoursFromDuration(quote.deliveryEstimation?.duration?.max);

  if (minHours !== null && maxHours !== null) {
    return {
      minHours,
      maxHours,
      display:
        minHours === maxHours
          ? formatDuration(maxHours)
          : `${formatDuration(minHours)}–${formatDuration(maxHours)}`,
      basis: "Wise comparison estimate for bank-transfer pay-in and pay-out",
    };
  }

  if (maxHours !== null) {
    return {
      minHours,
      maxHours,
      display: `Up to ${formatDuration(maxHours)}`,
      basis: "Wise comparison estimate for bank-transfer pay-in and pay-out",
    };
  }

  if (minHours !== null) {
    return {
      minHours,
      maxHours,
      display: `From ${formatDuration(minHours)}`,
      basis: "Wise comparison estimate for bank-transfer pay-in and pay-out",
    };
  }

  return fallbackDelivery(providerType);
}

function source(
  kind: DataSourceKind,
  label: string,
  url: string | null,
  collectedAt: string | null,
  retrievedAt: string,
) {
  return { kind, label, url, collectedAt, retrievedAt };
}

async function fetchJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Ummah-FX/1.0",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Upstream returned HTTP ${response.status}`);
  }
  return response.json();
}

async function cadValue(currency: string): Promise<{ value: number; date: string }> {
  if (currency === "CAD") return { value: 1, date: new Date().toISOString().slice(0, 10) };

  const url = new URL(
    `https://www.bankofcanada.ca/valet/observations/FX${currency}CAD/json`,
  );
  url.searchParams.set("recent", "10");
  const payload = (await fetchJson(url)) as {
    observations?: Array<Record<string, { v?: string } | string>>;
  };
  const series = `FX${currency}CAD`;

  for (const observation of [...(payload.observations ?? [])].reverse()) {
    const raw = observation[series];
    const value = typeof raw === "object" && raw ? Number(raw.v) : Number.NaN;
    const date = typeof observation.d === "string" ? observation.d : "";
    if (Number.isFinite(value) && date) return { value, date };
  }

  throw new Error(`No Bank of Canada observation for ${currency}`);
}

async function fetchReferenceRate(from: string, to: string, retrievedAt: string) {
  try {
    const [fromCad, toCad] = await Promise.all([cadValue(from), cadValue(to)]);
    const rate = fromCad.value / toCad.value;
    return {
      status: "available" as const,
      rate,
      asOf: [fromCad.date, toCad.date].sort()[0],
      source: source(
        "DIRECT_API",
        "Bank of Canada Valet daily reference rates",
        BOC_SOURCE_URL,
        null,
        retrievedAt,
      ),
    };
  } catch {
    return {
      status: "unavailable" as const,
      rate: null,
      asOf: null,
      source: source(
        "UNAVAILABLE",
        "Bank of Canada Valet daily reference rates",
        BOC_SOURCE_URL,
        null,
        retrievedAt,
      ),
    };
  }
}

async function fetchWiseProviders(input: ComparisonInput, retrievedAt: string) {
  const url = new URL(WISE_COMPARISON_URL);
  url.searchParams.set("sourceCurrency", input.from);
  url.searchParams.set("targetCurrency", input.to);
  url.searchParams.set(
    input.amountType === "SEND" ? "sendAmount" : "recipientGetsAmount",
    String(input.amount),
  );
  url.searchParams.set("sourceCountry", input.sourceCountry);
  url.searchParams.set("targetCountry", input.targetCountry);
  url.searchParams.set("includeWise", "true");

  const requestUrls = [url];
  if (input.sourceCountry === "CA" || input.targetCountry === "CA") {
    for (const providerAlias of ["rbc", "bnc"]) {
      const targetedUrl = new URL(url);
      targetedUrl.searchParams.set("providers", providerAlias);
      requestUrls.push(targetedUrl);
    }
  }

  const payloads = (await Promise.all(
    requestUrls.map((requestUrl) =>
      fetchJson(requestUrl).catch((): WisePayload => ({ providers: [] })),
    ),
  )) as WisePayload[];

  const results = payloads.flatMap((payload) =>
    (payload.providers ?? []).flatMap((provider) => {
    const quote = provider.quotes?.[0];
    if (!provider.alias || !provider.name || !quote) return [];
    const id = canonicalProviderId(provider.alias, provider.name);
     const type = normalizeProviderType(provider.type);

    const providerFee =
      typeof quote.fee === "number"
        ? { amount: quote.fee, currency: input.from }
        : null;
    const senderAmount =
      input.amountType === "SEND"
        ? input.amount
        : typeof quote.sendAmount === "number"
          ? quote.sendAmount
          : null;
    const recipientAmount =
      input.amountType === "RECEIVE"
        ? input.amount
        : typeof quote.receivedAmount === "number"
          ? quote.receivedAmount
          : null;

    return [{
      id,
      name: canonicalProviderName(id, provider.name),
       type,
      status: "available" as const,
      confidence: "estimated" as const,
      rate: typeof quote.rate === "number" ? quote.rate : null,
      markupPercent: typeof quote.markup === "number" ? quote.markup : null,
      providerFee,
      knownTotalFee: providerFee,
      senderPays:
        senderAmount === null
          ? null
          : { amount: senderAmount, currency: input.from },
      recipientGets:
        recipientAmount === null
          ? null
          : { amount: recipientAmount, currency: input.to },
      additionalFeesNote:
        "Known total includes the estimated provider fee shown. Intermediary or recipient-bank fees may still apply; amounts are unavailable.",
       delivery: deliveryFromWise(quote, type),
      onboarding: onboardingByProvider[id] ?? genericOnboarding,
      source: source(
        "THIRD_PARTY_ESTIMATE",
        "Wise Comparison API",
        WISE_SOURCE_URL,
        quote.dateCollected ?? null,
        retrievedAt,
      ),
      unavailableReason: null,
    }];
    }),
  );

  const uniqueProviders = new Map<string, (typeof results)[number]>();
  for (const provider of results) {
    uniqueProviders.set(provider.id, provider);
  }
  return [...uniqueProviders.values()];
}

export async function getFxComparison(input: ComparisonInput) {
  const key = JSON.stringify(input);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const retrievedAt = new Date().toISOString();
  const [wiseResult, reference] = await Promise.all([
    fetchWiseProviders(input, retrievedAt).catch(() => []),
    fetchReferenceRate(input.from, input.to, retrievedAt),
  ]);

  const providers = [...wiseResult];

  providers.sort((a, b) => {
    if (input.amountType === "RECEIVE") {
      const aValue = a.senderPays?.amount ?? Number.POSITIVE_INFINITY;
      const bValue = b.senderPays?.amount ?? Number.POSITIVE_INFINITY;
      return aValue - bValue;
    }
    const aValue = a.recipientGets?.amount ?? Number.NEGATIVE_INFINITY;
    const bValue = b.recipientGets?.amount ?? Number.NEGATIVE_INFINITY;
    return bValue - aValue;
  });

  const value = {
    ...input,
    retrievedAt,
    disclosure:
      "Competitor prices and delivery times are Wise estimates collected from provider websites, generally around hourly, for bank-transfer pay-in and pay-out. They are not executable quotes. Additional bank fees may apply.",
    reference,
    providers,
  };
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}