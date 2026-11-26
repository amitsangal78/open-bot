"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { IntegrationPanel } from "./integration-panel";
export function StockQuotePanel() {
  const [symbol, setSymbol] = useState("INFY.NS"),
    [quote, setQuote] = useState<{
      symbol: string;
      price: number;
      previousClose: number;
      currency: string;
      timestamp: number;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h3>Fetch a quote</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const response = await fetch("/api/workspace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command: "quote", symbol }),
              }),
              data = await response.json();
            if (!response.ok)
              throw new Error(data.error || "Quote unavailable.");
            setQuote(data);
            setError("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Stock symbol
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            maxLength={30}
          />
        </label>
        <Button disabled={busy}>Fetch quote</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {quote && (
        <>
          <p>
            {quote.symbol} · {quote.currency} {quote.price} · Previous close{" "}
            {quote.previousClose}
          </p>
          <p className="hint">
            Quote timestamp:{" "}
            {new Date(quote.timestamp).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}
            . Data may be delayed.
          </p>
          <IntegrationPanel
            compact
            sourceKind="stocks"
            sourceRef={quote.symbol + ":" + quote.timestamp}
            title={quote.symbol + " stock quote"}
            text={JSON.stringify(quote, null, 2)}
          />
        </>
      )}
    </section>
  );
}
