import { EbaySoldListing } from "../hooks/useEbaySearch";

type ResultsProps = {
  loading: boolean;
  error: string | null;
  insufficientData: boolean;
  usingSampleData: boolean;
  listings: EbaySoldListing[];
  auctionPrice: number | null;
  lowestSoldPrice: number | null;
  lastUpdated: string | null;
  onRetry: () => void;
  onRefresh: () => void;
};

export function Results({
  loading,
  error,
  insufficientData,
  usingSampleData,
  listings,
  auctionPrice,
  lowestSoldPrice,
  lastUpdated,
  onRetry,
  onRefresh,
}: ResultsProps) {
  const hasComparableData = auctionPrice !== null && lowestSoldPrice !== null;
  const shouldHalt = hasComparableData ? auctionPrice < lowestSoldPrice : false;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">eBay sold-price results</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-emerald-500 hover:text-emerald-300"
        >
          Refresh eBay Data
        </button>
      </div>

      {usingSampleData && (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Using dummy eBay sold data because `VITE_EBAY_APP_ID` is missing.
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-4 text-zinc-200">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-500 border-t-emerald-400" />
          Loading recent sold listings...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && insufficientData && (
        <p className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">Insufficient eBay data. No sold listings found for this search.</p>
      )}

      {!loading && !error && listings.length > 0 && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Lowest recent sold price</p>
              <p className="mt-2 text-2xl font-bold text-white">${lowestSoldPrice?.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Auction price on your site</p>
              <p className="mt-2 text-2xl font-bold text-white">${(auctionPrice ?? 0).toFixed(2)}</p>
            </div>
          </div>

          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${shouldHalt ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>
            {hasComparableData
              ? shouldHalt
                ? "HALT AUCTION BIDDING: auction price is lower than eBay sold price."
                : "Proceed with Auction: auction price is not lower than recent eBay sold price."
              : "Submit an auction price and search to compare."}
          </div>

          <ul className="space-y-2">
            {listings.map((listing) => (
              <li key={listing.id} className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-zinc-200">{listing.title}</p>
                  <p className="text-sm font-semibold text-emerald-300">${listing.price.toFixed(2)} {listing.currency}</p>
                </div>
                {listing.itemWebUrl && (
                  <a
                    href={listing.itemWebUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-cyan-300 hover:text-cyan-200"
                  >
                    View on eBay
                  </a>
                )}
              </li>
            ))}
          </ul>

          {lastUpdated && <p className="mt-4 text-xs text-zinc-500">Last updated: {new Date(lastUpdated).toLocaleString()}</p>}
        </>
      )}
    </section>
  );
}
