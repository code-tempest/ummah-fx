import { Router, type IRouter } from "express";
import {
  GetFxComparisonQueryParams,
  GetFxComparisonResponse,
  GetFxHistoryQueryParams,
  GetFxHistoryResponse,
} from "@workspace/api-zod";
import { getFxComparison } from "../lib/fx-comparison";

const router: IRouter = Router();

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

router.get("/fx/comparison", async (req, res): Promise<void> => {
  const parsed = GetFxComparisonQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = {
    from: parsed.data.from.toUpperCase(),
    to: parsed.data.to.toUpperCase(),
    amount: parsed.data.amount,
    amountType: parsed.data.amountType ?? "SEND",
    sourceCountry: parsed.data.sourceCountry.toUpperCase(),
    targetCountry: parsed.data.targetCountry.toUpperCase(),
  };

  if (input.from === input.to) {
    res.status(400).json({ error: "Currencies must be different." });
    return;
  }

  try {
    const comparison = await getFxComparison(input);
    res.json(GetFxComparisonResponse.parse(comparison));
  } catch (error) {
    req.log.error({ error, ...input }, "FX comparison request failed");
    res.status(502).json({
      error: "Transfer-provider comparison is temporarily unavailable.",
    });
  }
});

router.get("/fx/history", async (req, res): Promise<void> => {
  const parsed = GetFxHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const from = parsed.data.from.toUpperCase();
  const to = parsed.data.to.toUpperCase();
  const days = parsed.data.days ?? 30;

  if (from === to) {
    res.status(400).json({ error: "Currencies must be different." });
    return;
  }

  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const url = new URL(
    `https://api.frankfurter.app/${isoDate(start)}..${isoDate(end)}`,
  );
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      req.log.warn(
        { statusCode: response.status, from, to },
        "FX reference provider rejected request",
      );
      res.status(502).json({
        error: "Reference-rate history is unavailable for this currency pair.",
      });
      return;
    }

    const payload = (await response.json()) as {
      rates?: Record<string, Record<string, number>>;
    };

    const points = Object.entries(payload.rates ?? {})
      .map(([date, rates]) => ({ date, rate: rates[to] }))
      .filter(
        (point): point is { date: string; rate: number } =>
          typeof point.rate === "number" && Number.isFinite(point.rate),
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    if (points.length === 0) {
      res.status(502).json({
        error: "No historical reference rates were returned for this pair.",
      });
      return;
    }

    const data = GetFxHistoryResponse.parse({
      from,
      to,
      source: "Frankfurter / European Central Bank reference rates",
      asOf: points.at(-1)?.date,
      points,
    });

    res.json(data);
  } catch (error) {
    req.log.error({ error, from, to }, "FX reference provider request failed");
    res.status(502).json({
      error: "Reference-rate history is temporarily unavailable.",
    });
  }
});

export default router;