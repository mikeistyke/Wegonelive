type AlertModalProps = {
  open: boolean;
  auctionPrice: number;
  ebayLowestPrice: number;
  onClose: () => void;
};

export function AlertModal({ open, auctionPrice, ebayLowestPrice, onClose }: AlertModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Halt auction bidding alert">
      <div className="w-full max-w-lg rounded-2xl border border-red-500/40 bg-zinc-950 p-6 text-center shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-red-300">Critical pricing alert</p>
        <h2 className="mt-3 text-3xl font-extrabold text-red-500">HALT AUCTION BIDDING</h2>
        <p className="mt-4 text-zinc-200">
          Your auction price <span className="font-bold text-white">${auctionPrice.toFixed(2)}</span> is lower than the recent eBay sold price
          <span className="font-bold text-white"> ${ebayLowestPrice.toFixed(2)}</span>.
        </p>
        <p className="mt-2 text-sm text-red-300">Recommendation: list this product on eBay instead.</p>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white transition hover:bg-red-500"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
