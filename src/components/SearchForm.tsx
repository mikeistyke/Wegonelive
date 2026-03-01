import { FormEvent, useState } from "react";

type SearchFormProps = {
  onSubmit: (params: { productQuery: string; auctionPrice: number }) => void;
  loading: boolean;
};

export function SearchForm({ onSubmit, loading }: SearchFormProps) {
  const [productQuery, setProductQuery] = useState("");
  const [auctionPrice, setAuctionPrice] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedPrice = Number(auctionPrice);
    if (!productQuery.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return;
    }

    onSubmit({
      productQuery: productQuery.trim(),
      auctionPrice: parsedPrice,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:grid-cols-2 sm:gap-5 sm:p-6">
      <div className="sm:col-span-2">
        <label htmlFor="productQuery" className="mb-2 block text-sm font-medium text-zinc-200">
          eBay item ID or product keywords
        </label>
        <input
          id="productQuery"
          value={productQuery}
          onChange={(event) => setProductQuery(event.target.value)}
          placeholder="Example: 1234567890 or iPhone 15 Pro 256GB"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 outline-none ring-emerald-500 transition focus:ring-2"
          required
        />
      </div>

      <div>
        <label htmlFor="auctionPrice" className="mb-2 block text-sm font-medium text-zinc-200">
          Auction price on your site (USD)
        </label>
        <input
          id="auctionPrice"
          type="number"
          min="0"
          step="0.01"
          value={auctionPrice}
          onChange={(event) => setAuctionPrice(event.target.value)}
          placeholder="500"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 outline-none ring-emerald-500 transition focus:ring-2"
          required
        />
      </div>

      <div className="flex items-end">
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Checking eBay sold data..." : "Compare with eBay"}
        </button>
      </div>
    </form>
  );
}
