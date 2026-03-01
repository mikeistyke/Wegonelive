import { useEffect, useMemo, useState } from "react";
import { AlertModal } from "../components/AlertModal";
import { Results } from "../components/Results";
import { SearchForm } from "../components/SearchForm";
import { useEbaySearch } from "../hooks/useEbaySearch";

export default function EbayPriceGuard() {
  const [auctionPrice, setAuctionPrice] = useState<number | null>(null);
  const [showHaltModal, setShowHaltModal] = useState(false);

  const {
    listings,
    loading,
    error,
    insufficientData,
    usingSampleData,
    lowestSoldPrice,
    lastUpdated,
    runSearch,
    refresh,
  } = useEbaySearch();

  const shouldHalt = useMemo(() => {
    if (auctionPrice === null || lowestSoldPrice === null) {
      return false;
    }

    return auctionPrice < lowestSoldPrice;
  }, [auctionPrice, lowestSoldPrice]);

  useEffect(() => {
    if (shouldHalt) {
      setShowHaltModal(true);
    }
  }, [shouldHalt]);

  async function handleSubmit(params: { productQuery: string; auctionPrice: number }) {
    setAuctionPrice(params.auctionPrice);
    await runSearch(params.productQuery);
  }

  async function handleRetry() {
    await refresh();
  }

  async function handleRefresh() {
    await refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">eBay Sold Price Guard</h1>
        <p className="mt-2 text-sm text-zinc-300 sm:text-base">
          Compare your current auction price with recent sold listings from eBay Browse API.
        </p>
      </header>

      <SearchForm onSubmit={handleSubmit} loading={loading} />

      <Results
        loading={loading}
        error={error}
        insufficientData={insufficientData}
        usingSampleData={usingSampleData}
        listings={listings}
        auctionPrice={auctionPrice}
        lowestSoldPrice={lowestSoldPrice}
        lastUpdated={lastUpdated}
        onRetry={handleRetry}
        onRefresh={handleRefresh}
      />

      <AlertModal
        open={showHaltModal && shouldHalt}
        auctionPrice={auctionPrice ?? 0}
        ebayLowestPrice={lowestSoldPrice ?? 0}
        onClose={() => setShowHaltModal(false)}
      />
    </div>
  );
}
