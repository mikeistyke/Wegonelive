import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, CalendarClock, PlayCircle, Sparkles, Globe, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchLiveWindowStatus, getMsUntilIsoTimestamp, type LiveWindowStatus } from "../lib/liveAccess";

const formatEventDateEt = (isoValue?: string | null) => {
  const parsed = Date.parse(String(isoValue ?? ""));
  if (!Number.isFinite(parsed)) {
    return "TBD";
  }

  return new Date(parsed).toLocaleString(undefined, {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatCountdown = (msRemaining: number) => {
  const totalSeconds = Math.max(Math.floor(msRemaining / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

export default function Home() {
  const [isQrHuge, setIsQrHuge] = useState(false);
  const [windowStatus, setWindowStatus] = useState<LiveWindowStatus | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    let isMounted = true;

    const syncWindowStatus = async () => {
      const nextStatus = await fetchLiveWindowStatus(true);
      if (!isMounted) {
        return;
      }

      setWindowStatus(nextStatus);
    };

    void syncWindowStatus();
    const refreshInterval = setInterval(() => {
      void syncWindowStatus();
    }, 30_000);

    const tickInterval = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
      clearInterval(tickInterval);
    };
  }, []);

  const msUntilWindow = getMsUntilIsoTimestamp(windowStatus?.event?.window_opens_at, nowTick);
  const isWindowOpen = windowStatus?.event?.window_opens_at
    ? msUntilWindow <= 0
    : Boolean(windowStatus?.is_window_open);

  return (
    <div className="flex flex-col gap-24 pb-24">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20 lg:pt-48 lg:pb-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/20 via-zinc-950 to-zinc-950"></div>
        <div className="container relative mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-4xl"
          >
            <div className="mb-6 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-400 backdrop-blur-sm">
              <Sparkles className="mr-2 h-4 w-4" />
              Live Product Shopping • Product Development • Cultural Enrichment
            </div>
            <h1 className="mb-8 text-5xl font-extrabold tracking-tight text-white sm:text-7xl lg:text-8xl">
              The Thrill of the Auction, <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">The Comfort of Home</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-zinc-400 sm:text-xl">
              Transform passive browsing into active participation. We build live, interactive shopping platforms that empower businesses to boost conversions and give consumers an exhilarating, community-driven buying experience.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/grtw"
                className="group flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 font-semibold text-zinc-950 transition-all hover:bg-emerald-400 hover:scale-105"
              >
                <PlayCircle className="h-5 w-5" />
                Experience Live Shopping
              </Link>
              <Link
                to="/about"
                className="flex h-12 items-center justify-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/50 px-8 font-semibold text-white backdrop-blur-sm transition-all hover:bg-zinc-800"
              >
                Meet the Architect
                <ArrowRight className="h-4 w-4" />
              </Link>
              
              {/* QR Code */}
              <button 
                onClick={() => setIsQrHuge(true)}
                className="group relative ml-2 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/50 p-1 backdrop-blur-sm transition-all hover:scale-150 hover:bg-zinc-800 hover:z-10"
                aria-label="Show QR Code"
              >
                <img 
                  src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=http://wegonelive.com/qrcode.html" 
                  alt="QR Code" 
                  className="h-full w-full rounded-lg object-contain"
                />
              </button>
            </div>

            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-emerald-500/30 bg-zinc-900/60 p-4 text-left backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-300">
                    <CalendarClock className="h-4 w-4" />
                    Next Event
                  </p>
                  <p className="mt-1 text-lg font-bold text-white">{windowStatus?.event?.title || "Upcoming Live Shopping"}</p>
                  <p className="text-sm text-zinc-300">{formatEventDateEt(windowStatus?.event?.starts_at)} (ET / GMT-5)</p>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  isWindowOpen
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                }`}>
                  {isWindowOpen ? "Room Open" : `Opens in ${formatCountdown(msUntilWindow)}`}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <Link to="/shop-date" className="font-semibold text-emerald-300 hover:text-emerald-200">
                  View all shop dates
                </Link>
                <span className="text-zinc-600">•</span>
                <Link to="/grtw" className="font-semibold text-emerald-300 hover:text-emerald-200">
                  Register / Enter room
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Huge QR Code Modal */}
      <AnimatePresence>
        {isQrHuge && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
            onClick={() => setIsQrHuge(false)}
          >
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="relative flex flex-col items-center rounded-3xl bg-zinc-900 p-8 shadow-2xl border border-zinc-800"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setIsQrHuge(false)}
                className="absolute right-4 top-4 rounded-full bg-zinc-800 p-2 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
              <h3 className="mb-6 text-2xl font-bold text-white">Scan to Join</h3>
              <div className="rounded-2xl bg-white p-4">
                <img 
                  src="https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=http://wegonelive.com/qrcode.html" 
                  alt="Huge QR Code" 
                  className="h-64 w-64 md:h-96 md:w-96"
                />
              </div>
              <p className="mt-6 text-zinc-400">http://wegonelive.com/qrcode.html</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Services Bento Grid */}
      <section className="container mx-auto px-4">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Strategic Enablement Packages</h2>
          <p className="mt-4 text-zinc-400">More than just websites. We build ecosystems for growth.</p>
        </div>
        
        <div className="grid gap-6 md:grid-cols-3 lg:grid-rows-2">
          {/* Package 1 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-8 md:col-span-2 lg:row-span-2"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
            <Sparkles className="mb-6 h-10 w-10 text-emerald-400" />
            <h3 className="mb-4 text-2xl font-bold text-white">Bid to Win</h3>
            <p className="mb-6 text-zinc-400">
              Harness the power of real-time auctions to drive excitement and urgency. We design interactive 'Bid to Win' experiences that turn passive viewers into active participants. By leveraging our 'Wonder' to envision the perfect auction dynamics and our 'Enablement' to build robust, real-time bidding systems, we help you maximize product value and foster a thrilling community atmosphere.
            </p>
            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Real-time Auction Architecture</li>
              <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Gamified Engagement Mechanics</li>
              <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> High-Conversion Checkout Flows</li>
            </ul>
          </motion.div>

          {/* Package 2 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-8"
          >
            <Globe className="mb-6 h-8 w-8 text-cyan-400" />
            <h3 className="mb-3 text-xl font-bold text-white">Service or Ownership</h3>
            <p className="text-sm text-zinc-400">
              Whether you need a fully managed live shopping service or want to own the platform outright, we provide the strategic foundation. We empower you with a custom-built solution that you control, providing ongoing technical enablement so you can focus on selling.
            </p>
          </motion.div>

          {/* Package 3 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-8"
          >
            <Users className="mb-6 h-8 w-8 text-purple-400" />
            <h3 className="mb-3 text-xl font-bold text-white">Digital Storytelling & Partnerships</h3>
            <p className="text-sm text-zinc-400">
              Products don't sell themselves; stories do. We weave compelling narratives into your live events, transforming transactions into cultural moments. Through strategic partnerships, we enable you to build lasting connections with your audience.
            </p>
          </motion.div>
        </div>
      </section>

      {/* The "Context" Timeline / Philosophy */}
      <section className="container mx-auto px-4 py-12">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8 md:p-16">
          <div className="grid gap-12 md:grid-cols-2 lg:gap-24">
            <div>
              <h2 className="mb-6 text-3xl font-bold text-white">The Power of Context</h2>
              <p className="mb-6 text-lg text-zinc-400">
                I look at the history and background of a problem to build a better future. I plan. I am a relentless learner who believes that technology should serve the story, not the other way around.
              </p>
              <Link to="/about" className="inline-flex items-center font-medium text-emerald-400 hover:text-emerald-300">
                Read my full story <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-8 border-l-2 border-zinc-800 pl-8">
              <div className="relative">
                <div className="absolute -left-[41px] top-1 h-4 w-4 rounded-full border-4 border-zinc-900 bg-emerald-500"></div>
                <h4 className="text-lg font-bold text-white">1. Wonder</h4>
                <p className="mt-2 text-zinc-400">Pondering possibilities and seeing the potential in your brand that others miss.</p>
              </div>
              <div className="relative">
                <div className="absolute -left-[41px] top-1 h-4 w-4 rounded-full border-4 border-zinc-900 bg-cyan-500"></div>
                <h4 className="text-lg font-bold text-white">2. Invention</h4>
                <p className="mt-2 text-zinc-400">Pushing boundaries to create live shopping projects that genuinely excite people.</p>
              </div>
              <div className="relative">
                <div className="absolute -left-[41px] top-1 h-4 w-4 rounded-full border-4 border-zinc-900 bg-purple-500"></div>
                <h4 className="text-lg font-bold text-white">3. Enablement</h4>
                <p className="mt-2 text-zinc-400">Providing the technical grit and strategic help to make your vision a reality.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
