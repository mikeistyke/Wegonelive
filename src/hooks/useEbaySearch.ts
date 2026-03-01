import { useCallback, useMemo, useState } from "react";

export type EbaySoldListing = {
  id: string;
  title: string;
  price: number;
  currency: string;
  endDate?: string;
  itemWebUrl?: string;
};

type EbayItemSummary = {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  price?: {
    value?: string;
    currency?: string;
  };
  itemEndDate?: string;
  endDate?: string;
};

type EbaySearchResponse = {
  configMissing?: boolean;
  itemSummaries?: EbayItemSummary[];
  error?: string;
};

const MAX_RESULTS = 5;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function isWithin90Days(dateString?: string) {
  if (!dateString) {
    return true;
  }

  const timestamp = new Date(dateString).getTime();
  if (Number.isNaN(timestamp)) {
    return true;
  }

  return Date.now() - timestamp <= NINETY_DAYS_MS;
}

function normalizeListing(item: EbayItemSummary): EbaySoldListing | null {
  const value = Number(item.price?.value ?? 0);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return {
    id: item.itemId ?? `${item.title ?? "item"}-${value}`,
    title: item.title ?? "Untitled eBay listing",
    price: value,
    currency: item.price?.currency ?? "USD",
    endDate: item.itemEndDate ?? item.endDate,
    itemWebUrl: item.itemWebUrl,
  };
}

function getMockListings(query: string): EbaySoldListing[] {
  const baseTitle = query.trim() || "Sample Product";

  return [
    { id: "mock-1", title: `${baseTitle} - Sold Listing 1`, price: 550, currency: "USD", endDate: new Date().toISOString() },
    { id: "mock-2", title: `${baseTitle} - Sold Listing 2`, price: 575, currency: "USD", endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "mock-3", title: `${baseTitle} - Sold Listing 3`, price: 590, currency: "USD", endDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() },
  ];
}

export function useEbaySearch() {
  const [listings, setListings] = useState<EbaySoldListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficientData, setInsufficientData] = useState(false);
  const [usingSampleData, setUsingSampleData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  const lowestSoldPrice = useMemo(() => {
    if (listings.length === 0) {
      return null;
    }

    return Math.min(...listings.map((listing) => listing.price));
  }, [listings]);

  const runSearch = useCallback(async (query: string) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setListings([]);
      setInsufficientData(true);
      setError("Enter an eBay item ID or product keywords.");
      return;
    }

    setLoading(true);
    setError(null);
    setInsufficientData(false);
    setUsingSampleData(false);

    try {
      const params = new URLSearchParams({ q: normalizedQuery, limit: String(MAX_RESULTS) });
      const response = await fetch(`/api/ebay/sold-search?${params.toString()}`, { method: "GET" });

      if (!response.ok) {
        throw new Error(`eBay API request failed (${response.status}). Verify backend eBay credentials and retry.`);
      }

      const data = (await response.json()) as EbaySearchResponse;

      if (data.configMissing) {
        const mockListings = getMockListings(normalizedQuery);
        setListings(mockListings);
        setUsingSampleData(true);
        setLastUpdated(new Date().toISOString());
        setLastQuery(normalizedQuery);
        setLoading(false);
        return;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const normalizedListings = (data.itemSummaries ?? [])
        .map(normalizeListing)
        .filter((item): item is EbaySoldListing => Boolean(item))
        .filter((item) => isWithin90Days(item.endDate))
        .slice(0, MAX_RESULTS);

      if (normalizedListings.length === 0) {
        setListings([]);
        setInsufficientData(true);
      } else {
        setListings(normalizedListings);
      }

      setLastUpdated(new Date().toISOString());
      setLastQuery(normalizedQuery);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to fetch eBay data right now.";
      setError(message);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!lastQuery) {
      return;
    }

    await runSearch(lastQuery);
  }, [lastQuery, runSearch]);

  return {
    listings,
    loading,
    error,
    insufficientData,
    usingSampleData,
    lowestSoldPrice,
    lastUpdated,
    runSearch,
    refresh,
  };
}
