import { useState, useEffect, useRef, useMemo, FormEvent, MouseEvent, ChangeEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Hand, Send, User, DollarSign, AlertCircle, Play, Pause, Volume2, VolumeX, Maximize, Tv, Camera, CameraOff, MessageSquare, Loader2, Volume1, Sparkles, CheckCircle2, StopCircle } from "lucide-react";
import AgoraRTC, { type IAgoraRTCClient, type ICameraVideoTrack, type IMicrophoneAudioTrack, type IAgoraRTCRemoteUser } from "agora-rtc-sdk-ng";
import { GoogleGenAI, Modality } from "@google/genai";
import { useEbaySearch } from "../hooks/useEbaySearch";
import { fetchLiveWindowStatus, getRegisteredGuest, setRegisteredGuest } from "../lib/liveAccess";

interface Guest {
  id: number;
  name: string;
  email: string;
}

interface Bid {
  id: number;
  guest_id: number;
  guest_name: string;
  amount: number;
  item_id: string;
  bid_time: string;
}

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  subcategories?: Category[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
}

interface AuctionNotice {
  id: number;
  item_id: string;
  notice_type: string;
  message: string;
  created_by_guest_id: number | null;
  metadata: any;
  reviewed_at: string | null;
  reviewed_by_guest_id: number | null;
  created_at: string;
}

interface LiveRofrCandidate {
  guest_id: number;
  name: string;
}

interface LiveRofrCheckResponse {
  meets_guard: boolean;
  guard_value: number;
  min_guard_value: number;
  threshold_ratio: number;
  rofr_order: LiveRofrCandidate[];
}

interface RofrDecision {
  guest_id: number;
  name: string;
  action: "accepted" | "declined" | "skipped";
  at: string;
}

interface MinimumNotMetState {
  name: string;
  amount: number;
  minimumPrice: number;
  rofrQueue: LiveRofrCandidate[];
  rofrIndex: number;
  rofrHistory: RofrDecision[];
}

interface LiveLotItem {
  id: string;
  sku: string | null;
  title: string;
  quantity_expected: number;
  quantity_sold: number;
}

interface LiveLotContextResponse {
  session: { id: string; name: string; status: string } | null;
  items: LiveLotItem[];
}

interface AgoraTokenResponse {
  appId: string;
  channelName: string;
  uid: string | number;
  role: "publisher" | "subscriber";
  token: string;
  expiresAt: number;
}

interface AgoraSessionIdentity {
  channelName: string;
  uid: string | number;
  role: "publisher" | "subscriber";
  guestId?: number;
}

type BroadcastStatus = "idle" | "connecting" | "live" | "error";

const NOTICE_FILTER_STORAGE_KEY = "wgl.presenterNoticeFilter";
const QUALITY_LABEL_STABILIZE_MS = 2000;
const LSP_DEFAULT_POSTER = "/lsp-default-logo.jpg";

export default function LiveShopping() {
  const initialRegisteredGuest = getRegisteredGuest();
  const [guest, setGuest] = useState<Guest | null>(initialRegisteredGuest);
  const [name, setName] = useState(initialRegisteredGuest?.name ?? "");
  const [email, setEmail] = useState(initialRegisteredGuest?.email ?? "");
  const [bids, setBids] = useState<Bid[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bidAmount, setBidAmount] = useState("");
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(true);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<BroadcastStatus>("idle");
  const [streamQualityLabel, setStreamQualityLabel] = useState<"AUTO" | "SD" | "HD" | "FHD" | "4K">("AUTO");
  const [hostStreamMetrics, setHostStreamMetrics] = useState<{ resolution: string; fps: number | null; bitrateKbps: number | null } | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [activeTab, setActiveTab] = useState<'bids' | 'qa'>('bids');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'agent', text: 'Hi! I am your product expert. Ask me anything about the Vintage Leather Jacket!' }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [auctioneerMessage, setAuctioneerMessage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hostInsights, setHostInsights] = useState<{ sentiment: string, topQuestion: string, suggestion: string } | null>(null);
  const [checkoutWinner, setCheckoutWinner] = useState<{ name: string, amount: number } | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isAuctionLive, setIsAuctionLive] = useState(false);
  const [isBiddingStopping, setIsBiddingStopping] = useState(false);
  const [isBiddingStopped, setIsBiddingStopped] = useState(false);
  const [presenterNotice, setPresenterNotice] = useState<string | null>(null);
  const [minimumNotMetWinner, setMinimumNotMetWinner] = useState<MinimumNotMetState | null>(null);
  const [auctionNotices, setAuctionNotices] = useState<AuctionNotice[]>([]);
  const [reviewingNoticeId, setReviewingNoticeId] = useState<number | null>(null);
  const [noticeFilter, setNoticeFilter] = useState<"all" | "pending" | "reviewed">("all");
  const [adContent, setAdContent] = useState<{ id: string, title: string, description: string, cta: string, imageUrl: string, sponsor?: string } | null>(null);
  const [liveLotSessionName, setLiveLotSessionName] = useState<string>("");
  const [liveLotItems, setLiveLotItems] = useState<LiveLotItem[]>([]);
  const [selectedLiveLotItemId, setSelectedLiveLotItemId] = useState<string>("");
  const auctionStartTimeRef = useRef<number>(Date.now() + 60 * 60 * 1000);
  const bidsRef = useRef<Bid[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const audienceClientRef = useRef<IAgoraRTCClient | null>(null);
  const hostSessionRef = useRef<AgoraSessionIdentity | null>(null);
  const audienceSessionRef = useRef<AgoraSessionIdentity | null>(null);
  const hostTokenRenewalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audienceTokenRenewalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolutionPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qualityLabelStabilizeUntilRef = useRef<number>(0);
  const activeRenderedVideoTrackRef = useRef<{ play: (element: HTMLElement) => void; stop: () => void } | null>(null);
  const activeRenderedAudioTrackRef = useRef<{ play: () => void; stop: () => void } | null>(null);
  
  // Ad tracking refs
  const adViewStartTimeRef = useRef<number | null>(null);

  const selectedLiveLotItem = liveLotItems.find((item) => item.id === selectedLiveLotItemId) ?? null;
  const currentItemId = selectedLiveLotItem?.sku?.trim() || selectedLiveLotItem?.id || "item-001";
  const currentItemTitle = selectedLiveLotItem?.title || "Vintage Leather Jacket";
  const currentAgoraChannelName = useMemo(() => {
    const normalized = (currentItemId || "item-001")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!normalized) {
      return "item-001";
    }

    return normalized.startsWith("item-") ? normalized : `item-${normalized}`;
  }, [currentItemId]);
  const currentRofrCandidate = minimumNotMetWinner
    ? minimumNotMetWinner.rofrQueue[minimumNotMetWinner.rofrIndex] ?? null
    : null;

  const logAgoraClientEvent = (event: string, metadata: Record<string, unknown> = {}) => {
    console.info("[agora-client]", {
      event,
      ts: new Date().toISOString(),
      channelName: currentAgoraChannelName,
      ...metadata,
    });
  };

  const stopResolutionPolling = () => {
    if (resolutionPollingRef.current) {
      clearInterval(resolutionPollingRef.current);
      resolutionPollingRef.current = null;
    }
  };

  const classifyResolution = (width: number, height: number): "SD" | "HD" | "FHD" | "4K" => {
    if (width >= 3840 || height >= 2160) {
      return "4K";
    }
    if (width >= 1920 || height >= 1080) {
      return "FHD";
    }
    if (width >= 1280 || height >= 720) {
      return "HD";
    }
    return "SD";
  };

  const readVideoResolution = (track: ICameraVideoTrack): { width: number; height: number } | null => {
    const mediaTrack = track.getMediaStreamTrack?.();
    const settings = mediaTrack?.getSettings?.();
    const settingsWidth = Number(settings?.width ?? 0);
    const settingsHeight = Number(settings?.height ?? 0);

    if (settingsWidth > 0 && settingsHeight > 0) {
      return { width: settingsWidth, height: settingsHeight };
    }

    const stats = (track as unknown as { getStats?: () => Record<string, unknown> | null }).getStats?.();
    if (!stats) {
      return null;
    }

    const sendWidth = Number(stats.sendResolutionWidth ?? 0);
    const sendHeight = Number(stats.sendResolutionHeight ?? 0);
    if (sendWidth > 0 && sendHeight > 0) {
      return { width: sendWidth, height: sendHeight };
    }

    const captureWidth = Number(stats.captureResolutionWidth ?? 0);
    const captureHeight = Number(stats.captureResolutionHeight ?? 0);
    if (captureWidth > 0 && captureHeight > 0) {
      return { width: captureWidth, height: captureHeight };
    }

    const sendResolution = String(stats.sendResolution ?? "");
    const sendMatch = sendResolution.match(/(\d+)\s*[xX]\s*(\d+)/);
    if (sendMatch) {
      const sendParsedWidth = Number(sendMatch[1]);
      const sendParsedHeight = Number(sendMatch[2]);
      if (sendParsedWidth > 0 && sendParsedHeight > 0) {
        return { width: sendParsedWidth, height: sendParsedHeight };
      }
    }

    const captureResolution = String(stats.captureResolution ?? "");
    const captureMatch = captureResolution.match(/(\d+)\s*[xX]\s*(\d+)/);
    if (captureMatch) {
      const captureParsedWidth = Number(captureMatch[1]);
      const captureParsedHeight = Number(captureMatch[2]);
      if (captureParsedWidth > 0 && captureParsedHeight > 0) {
        return { width: captureParsedWidth, height: captureParsedHeight };
      }
    }

    const renderedWidth = Number(videoRef.current?.videoWidth ?? 0);
    const renderedHeight = Number(videoRef.current?.videoHeight ?? 0);
    if (renderedWidth > 0 && renderedHeight > 0) {
      return { width: renderedWidth, height: renderedHeight };
    }

    return null;
  };

  const refreshStreamResolutionBadge = () => {
    const videoTrack = localVideoTrackRef.current;
    if (!videoTrack) {
      return;
    }

    const resolution = readVideoResolution(videoTrack);
    if (!resolution) {
      return;
    }

    const stats = (videoTrack as unknown as { getStats?: () => Record<string, unknown> | null }).getStats?.() ?? null;
    const sendFrameRate = Number(stats?.sendFrameRate ?? 0);
    const captureFrameRate = Number(stats?.captureFrameRate ?? 0);
    const frameRate = sendFrameRate > 0 ? sendFrameRate : captureFrameRate > 0 ? captureFrameRate : null;

    const sendBitrateRaw = Number(stats?.sendBitrate ?? stats?.targetSendBitrate ?? 0);
    const bitrateKbps = sendBitrateRaw > 0
      ? Math.round(sendBitrateRaw > 10000 ? sendBitrateRaw / 1000 : sendBitrateRaw)
      : null;

    const nextLabel = classifyResolution(resolution.width, resolution.height);
    const nextResolution = `${resolution.width}x${resolution.height}`;
    const isWithinStabilizeWindow = Date.now() < qualityLabelStabilizeUntilRef.current;
    setStreamQualityLabel((current) => {
      if (isWithinStabilizeWindow && current !== "AUTO") {
        return current;
      }

      return nextLabel;
    });
    setHostStreamMetrics((current) => {
      if (
        current &&
        current.resolution === nextResolution &&
        current.fps === frameRate &&
        current.bitrateKbps === bitrateKbps
      ) {
        return current;
      }

      return {
        resolution: nextResolution,
        fps: frameRate,
        bitrateKbps,
      };
    });
  };

  const {
    loading: isEbayLoading,
    error: ebayError,
    insufficientData: ebayInsufficientData,
    usingSampleData,
    lowestSoldPrice,
    runSearch: runEbaySearch,
    refresh: refreshEbayData,
  } = useEbaySearch();

  useEffect(() => {
    bidsRef.current = bids;
  }, [bids]);

  useEffect(() => {
    void runEbaySearch(currentItemTitle);
  }, [runEbaySearch, currentItemTitle]);

  useEffect(() => {
    const fetchLiveLotContext = async () => {
      try {
        const res = await fetch("/api/lot-decoder/live-context");
        if (!res.ok) {
          return;
        }

        const data = await res.json() as LiveLotContextResponse;
        setLiveLotSessionName(data.session?.name ?? "");
        setLiveLotItems(data.items ?? []);

        if ((data.items ?? []).length === 0) {
          setSelectedLiveLotItemId("");
          return;
        }

        setSelectedLiveLotItemId((prev) => {
          if (prev && data.items.some((item) => item.id === prev)) {
            return prev;
          }

          return data.items[0].id;
        });
      } catch (err) {
        console.error("Failed to fetch live lot context", err);
      }
    };

    void fetchLiveLotContext();
    const interval = setInterval(fetchLiveLotContext, 10000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setIsBiddingStopping(false);
    setIsBiddingStopped(false);
    setCheckoutWinner(null);
    setMinimumNotMetWinner(null);
  }, [currentItemId]);

  useEffect(() => {
    let isMounted = true;

    const syncScheduledStart = async () => {
      try {
        const status = await fetchLiveWindowStatus(true);
        const startsAtMs = Date.parse(status.event?.starts_at ?? "");

        if (!isMounted || !Number.isFinite(startsAtMs)) {
          return;
        }

        auctionStartTimeRef.current = startsAtMs;
      } catch {
        // Keep fallback ref value when schedule cannot be resolved.
      }
    };

    void syncScheduledStart();
    const scheduleRefreshInterval = setInterval(() => {
      void syncScheduledStart();
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(scheduleRefreshInterval);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = auctionStartTimeRef.current - now;
      if (diff > 0) {
        setTimeRemaining(Math.floor(diff / 1000));
        setIsAuctionLive(false);
      } else {
        setTimeRemaining(null);
        setIsAuctionLive(true);
      }
    }, 1000);

    const initialDiff = auctionStartTimeRef.current - Date.now();
    if (initialDiff > 0) {
      setTimeRemaining(Math.floor(initialDiff / 1000));
      setIsAuctionLive(false);
    } else {
      setTimeRemaining(null);
      setIsAuctionLive(true);
    }

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const savedFilter = window.localStorage.getItem(NOTICE_FILTER_STORAGE_KEY);
    if (savedFilter === "all" || savedFilter === "pending" || savedFilter === "reviewed") {
      setNoticeFilter(savedFilter);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(NOTICE_FILTER_STORAGE_KEY, noticeFilter);
  }, [noticeFilter]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch("/api/categories");
        if (res.ok) {
          const data = await res.json();
          setCategories(data);
        }
      } catch (err) {
        console.error("Failed to fetch categories", err);
      }
    };

    fetchCategories();
    generateAd();
    const adInterval = setInterval(generateAd, 60000);

    return () => {
      clearInterval(adInterval);
    };
  }, []);

  useEffect(() => {
    const fetchBids = async () => {
      try {
        const res = await fetch(`/api/bids/${currentItemId}`);
        if (res.ok) {
          const data = await res.json();
          setBids(data);
        }
      } catch (err) {
        console.error("Failed to fetch bids", err);
      }
    };

    const fetchAuctionNotices = async () => {
      try {
        const res = await fetch(`/api/auction-notices/${currentItemId}`);
        if (res.ok) {
          const data = await res.json() as AuctionNotice[];
          setAuctionNotices(data);
          const latestPresenterNotice = data.find((notice) =>
            notice.notice_type === "presenter_alert" || notice.notice_type === "minimum_price_interest"
          );
          setPresenterNotice(latestPresenterNotice?.message ?? null);
        }
      } catch (err) {
        console.error("Failed to fetch auction notices", err);
      }
    };

    fetchBids();
    fetchAuctionNotices();
    const interval = setInterval(fetchBids, 3000);
    const noticeInterval = setInterval(fetchAuctionNotices, 4000);
    return () => {
      clearInterval(interval);
      clearInterval(noticeInterval);
    };
  }, [currentItemId]);

  const createAuctionNotice = async (payload: {
    notice_type: string;
    message: string;
    metadata?: Record<string, any>;
    created_by_guest_id?: number;
  }) => {
    try {
      const res = await fetch("/api/auction-notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: currentItemId,
          notice_type: payload.notice_type,
          message: payload.message,
          metadata: payload.metadata,
          created_by_guest_id: payload.created_by_guest_id,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save auction notice");
      }

      const savedNotice = await res.json() as AuctionNotice;
      setAuctionNotices((prev) => [savedNotice, ...prev].slice(0, 50));
      return savedNotice;
    } catch (err) {
      console.error("Failed to persist auction notice", err);
      return null;
    }
  };

  const trackAdEvent = async (eventType: 'impression' | 'click' | 'time_on_ad' | 'conversion', adId: string, extraData: any = {}) => {
    try {
      await fetch('/api/analytics/ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          adId,
          campaignName: adContent?.title || null,
          sponsor: adContent?.sponsor || null,
          ...extraData,
        }),
      });
    } catch (err) {
      console.warn('Ad analytics tracking failed', err);
    }
  };

  useEffect(() => {
    // When a new ad is displayed
    if (adContent) {
      void trackAdEvent('impression', adContent.id);
      adViewStartTimeRef.current = Date.now();
    }

    // Cleanup function runs when ad changes or component unmounts
    return () => {
      if (adContent && adViewStartTimeRef.current) {
        const timeOnAd = Date.now() - adViewStartTimeRef.current;
        void trackAdEvent('time_on_ad', adContent.id, { durationMs: timeOnAd });
      }
    };
  }, [adContent]);

  const handleAdClick = () => {
    if (adContent) {
      void trackAdEvent('click', adContent.id);
      // Simulate conversion after click (for demo purposes)
      setTimeout(() => {
        void trackAdEvent('conversion', adContent.id, { value: 1.50 }); // e.g., $1.50 earned
      }, 5000);
      
      // Open the sponsor link (mocked)
      window.open('https://example.com/sponsor', '_blank');
    }
  };

  const generateAd = async () => {
    const fallbackAd = {
      id: `ad-fallback-${Date.now()}`,
      title: "Complete the Look",
      description: `Pair your ${currentItemTitle} with matching accessories and save today.`,
      cta: "Shop Now",
      imageUrl: `https://picsum.photos/seed/${Date.now()}/800/400`,
    };

    try {
      const response = await fetch("/api/ad/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemTitle: currentItemTitle }),
      });

      if (!response.ok) {
        throw new Error(`Ad API failed (${response.status})`);
      }

      const adData = await response.json() as {
        id?: string;
        title?: string;
        description?: string;
        cta?: string;
        imageUrl?: string;
        sponsor?: string;
      };

      setAdContent({
        id: adData.id || fallbackAd.id,
        title: adData.title || fallbackAd.title,
        description: adData.description || fallbackAd.description,
        cta: adData.cta || fallbackAd.cta,
        imageUrl: adData.imageUrl || fallbackAd.imageUrl,
        sponsor: adData.sponsor,
      });
    } catch (err) {
      console.error("Ad generation error:", err);
      setAdContent(fallbackAd);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (res.ok) {
        setRegisteredGuest(data as Guest);
        setGuest(data as Guest);
      } else {
        setError(data.error || "Failed to register");
      }
    } catch (err) {
      setError("Network error");
    }
  };

  const handleBid = async (e: FormEvent) => {
    e.preventDefault();
    if (!guest) return;
    if (!isAuctionLive) {
      setError("Bidding opens when the stream is LIVE.");
      return;
    }
    if (isBiddingStopped) {
      setError("Bidding has ended for this item.");
      return;
    }
    setError("");
    
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    const highestBid = bids.length > 0 ? bids[0].amount : 0;
    if (amount <= highestBid) {
      setError(`Bid must be higher than $${highestBid}`);
      return;
    }

    try {
      const res = await fetch("/api/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_id: guest.id,
          amount,
          item_id: currentItemId,
        }),
      });
      
      if (res.ok) {
        setBidAmount("");
        // Optimistic update
        const newBids = [{
          id: Date.now(),
          guest_id: guest.id,
          guest_name: guest.name,
          amount,
          item_id: currentItemId,
          bid_time: new Date().toISOString()
        }, ...bids].sort((a, b) => b.amount - a.amount);
        
        setBids(newBids);
        
        // Trigger Auctioneer Agent
        triggerAuctioneerAgent(guest.name, amount, newBids.length > 1 ? newBids[1].amount : 50);
        
      } else {
        const data = await res.json();
        setError(data.error || "Failed to place bid");
      }
    } catch (err) {
      setError("Network error");
    }
  };

  const triggerAuctioneerAgent = async (bidderName: string, bidAmount: number, previousBid: number) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are an energetic, fast-talking auctioneer for a live shopping stream. The current item is a Vintage Leather Jacket. 
        ${bidderName} just bid $${bidAmount}. The previous bid was $${previousBid}. 
        Write a very short, punchy, exciting one-sentence hype message to encourage more bids. 
        Example: "🔥 Tyke just jumped in with $150! Who's going to give me $160? Don't let this jacket slip away!"`,
      });
      
      const hypeText = response.text;
      
      if (hypeText) {
        setAuctioneerMessage(hypeText);
        // Clear message after 5 seconds
        setTimeout(() => setAuctioneerMessage(null), 5000);
        
        // Generate and play TTS
        try {
          setIsSpeaking(true);
          const ttsResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: `Say energetically and quickly: ${hypeText}` }] }],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Zephyr' }, // Energetic voice
                },
              },
            },
          });

          const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            playAudioBase64(base64Audio);
          } else {
             setIsSpeaking(false);
          }
        } catch (ttsErr) {
          console.error("TTS error:", ttsErr);
          setIsSpeaking(false);
        }
      }
    } catch (err) {
      console.error("Auctioneer Agent error:", err);
    }
  };

  const playAudioBase64 = async (base64Data: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const audioCtx = audioContextRef.current;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Gemini TTS returns raw PCM audio at 24kHz, 1 channel, 16-bit
      const pcmData = new Int16Array(bytes.buffer);
      const audioBuffer = audioCtx.createBuffer(1, pcmData.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      
      for (let i = 0; i < pcmData.length; i++) {
        channelData[i] = pcmData[i] / 32768.0;
      }

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      
      source.onended = () => {
        setIsSpeaking(false);
      };
      
      source.start();
    } catch (err) {
      console.error("Error playing audio:", err);
      setIsSpeaking(false);
    }
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: chatInput.trim()
    };
    
    const prevMessages = [...chatMessages, userMessage];
    setChatMessages(prevMessages);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a helpful product expert for a live shopping stream. The current item is a Vintage Leather Jacket (Item #001), 100% full-grain cowhide leather, starting at $50. Answer the following user question concisely and enthusiastically: ${userMessage.text}`,
      });
      
      const agentMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        text: response.text || "I'm sorry, I couldn't process that right now."
      };
      
      const newMessages = [...prevMessages, agentMessage];
      setChatMessages(newMessages);
      
      // Update Host Copilot Insights
      if (isBroadcasting) {
        updateHostInsights(newMessages);
      }
      
    } catch (err) {
      console.error("Chat error:", err);
      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        text: "I'm having trouble connecting right now. Please try again later!"
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const updateHostInsights = async (messages: ChatMessage[]) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Only send the last 10 user messages to keep it relevant
      const recentUserMessages = messages
        .filter(m => m.role === 'user')
        .slice(-10)
        .map(m => m.text)
        .join("\n");
        
      if (!recentUserMessages) return;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a co-host assistant for a live shopping stream. Analyze the following recent chat messages from viewers:
        "${recentUserMessages}"
        
        Provide a very brief summary in this exact JSON format:
        {
          "sentiment": "Short description of audience mood (e.g., 'High energy!', 'Curious about sizing')",
          "topQuestion": "The most common or important question being asked",
          "suggestion": "One actionable piece of advice for the host right now"
        }`,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      if (response.text) {
        const insights = JSON.parse(response.text);
        setHostInsights(insights);
      }
    } catch (err) {
      console.error("Host Copilot error:", err);
    }
  };

  const togglePlay = async () => {
    const videoEl = videoRef.current;
    if (!videoEl) {
      return;
    }

    const activeRenderedVideoTrack = activeRenderedVideoTrackRef.current;
    if (activeRenderedVideoTrack) {
      if (isPlaying) {
        activeRenderedVideoTrack.stop();
        activeRenderedAudioTrackRef.current?.stop();
        setIsPlaying(false);
      } else {
        activeRenderedVideoTrack.play(videoEl);
        activeRenderedAudioTrackRef.current?.play();
        setIsPlaying(true);
      }
      return;
    }

    if (videoEl.paused) {
      try {
        await videoEl.play();
      } catch (err) {
        console.error("Unable to resume video playback", err);
      }
      return;
    }

    videoEl.pause();
  };

  const stopAgoraBroadcast = async (nextStatus: BroadcastStatus = "idle") => {
    stopResolutionPolling();

    if (hostTokenRenewalTimerRef.current) {
      clearTimeout(hostTokenRenewalTimerRef.current);
      hostTokenRenewalTimerRef.current = null;
    }

    hostSessionRef.current = null;

    const client = agoraClientRef.current;
    const videoTrack = localVideoTrackRef.current;
    const audioTrack = localAudioTrackRef.current;

    if (videoTrack || audioTrack) {
      try {
        if (client) {
          const tracksToUnpublish = [videoTrack, audioTrack].filter(Boolean) as Array<ICameraVideoTrack | IMicrophoneAudioTrack>;
          if (tracksToUnpublish.length > 0) {
            await client.unpublish(tracksToUnpublish);
          }
        }
      } catch (err) {
        console.error("Failed to unpublish Agora tracks", err);
      }

      if (videoTrack) {
        videoTrack.stop();
        videoTrack.close();
      }

      if (audioTrack) {
        audioTrack.stop();
        audioTrack.close();
      }
    }

    if (client) {
      try {
        await client.leave();
      } catch (err) {
        console.error("Failed to leave Agora channel", err);
      }
    }

    localVideoTrackRef.current = null;
    localAudioTrackRef.current = null;
    activeRenderedVideoTrackRef.current = null;
    activeRenderedAudioTrackRef.current = null;
    agoraClientRef.current = null;
    setStream(null);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = "";
      videoRef.current.load();
    }

    setIsBroadcasting(false);
    setIsPlaying(false);
    setBroadcastStatus(nextStatus);
    setStreamQualityLabel("AUTO");
    setHostStreamMetrics(null);
    qualityLabelStabilizeUntilRef.current = 0;
  };

  const requestAgoraToken = async (session: AgoraSessionIdentity) => {
    logAgoraClientEvent("token.request.start", {
      role: session.role,
      uidType: typeof session.uid,
      hasGuestId: Boolean(session.guestId),
    });

    const tokenRes = await fetch("/api/agora/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    });

    if (!tokenRes.ok) {
      const payload = await tokenRes.json().catch(() => null) as { error?: string; details?: string } | null;
      const message = payload?.details || payload?.error || "Failed to get Agora token";
      logAgoraClientEvent("token.request.failed", {
        role: session.role,
        status: tokenRes.status,
        message,
      });
      throw new Error(message);
    }

    const tokenPayload = await tokenRes.json() as AgoraTokenResponse;
    logAgoraClientEvent("token.request.succeeded", {
      role: session.role,
      expiresAt: tokenPayload.expiresAt,
    });
    return tokenPayload;
  };

  const scheduleHostTokenRenewal = (expiresAt: number) => {
    if (hostTokenRenewalTimerRef.current) {
      clearTimeout(hostTokenRenewalTimerRef.current);
      hostTokenRenewalTimerRef.current = null;
    }

    const renewInMs = Math.max((expiresAt - Math.floor(Date.now() / 1000) - 60) * 1000, 5000);

    hostTokenRenewalTimerRef.current = setTimeout(async () => {
      const activeClient = agoraClientRef.current;
      const activeSession = hostSessionRef.current;

      if (!activeClient || !activeSession) {
        return;
      }

      try {
        const refreshedToken = await requestAgoraToken(activeSession);
        await activeClient.renewToken(refreshedToken.token);
        logAgoraClientEvent("token.renew.succeeded", {
          role: "publisher",
          expiresAt: refreshedToken.expiresAt,
        });
        scheduleHostTokenRenewal(refreshedToken.expiresAt);
      } catch (err) {
        console.error("Failed to renew host Agora token", err);
        logAgoraClientEvent("token.renew.failed", {
          role: "publisher",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }, renewInMs);
  };

  const scheduleAudienceTokenRenewal = (expiresAt: number) => {
    if (audienceTokenRenewalTimerRef.current) {
      clearTimeout(audienceTokenRenewalTimerRef.current);
      audienceTokenRenewalTimerRef.current = null;
    }

    const renewInMs = Math.max((expiresAt - Math.floor(Date.now() / 1000) - 60) * 1000, 5000);

    audienceTokenRenewalTimerRef.current = setTimeout(async () => {
      const activeClient = audienceClientRef.current;
      const activeSession = audienceSessionRef.current;

      if (!activeClient || !activeSession) {
        return;
      }

      try {
        const refreshedToken = await requestAgoraToken(activeSession);
        await activeClient.renewToken(refreshedToken.token);
        logAgoraClientEvent("token.renew.succeeded", {
          role: "subscriber",
          expiresAt: refreshedToken.expiresAt,
        });
        scheduleAudienceTokenRenewal(refreshedToken.expiresAt);
      } catch (err) {
        console.error("Failed to renew audience Agora token", err);
        logAgoraClientEvent("token.renew.failed", {
          role: "subscriber",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }, renewInMs);
  };

  const resetVideoToFallback = () => {
    activeRenderedVideoTrackRef.current?.stop();
    activeRenderedAudioTrackRef.current?.stop();
    activeRenderedVideoTrackRef.current = null;
    activeRenderedAudioTrackRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = "";
      videoRef.current.load();
    }
    setIsPlaying(false);
  };

  const stopAudienceSession = async () => {
    if (audienceTokenRenewalTimerRef.current) {
      clearTimeout(audienceTokenRenewalTimerRef.current);
      audienceTokenRenewalTimerRef.current = null;
    }

    audienceSessionRef.current = null;

    const client = audienceClientRef.current;
    if (!client) {
      return;
    }

    activeRenderedVideoTrackRef.current?.stop();
    activeRenderedAudioTrackRef.current?.stop();
    activeRenderedVideoTrackRef.current = null;
    activeRenderedAudioTrackRef.current = null;

    try {
      client.removeAllListeners();
      await client.leave();
    } catch (err) {
      console.error("Failed to leave Agora audience channel", err);
    }

    audienceClientRef.current = null;
  };

  const playRemoteTrackToVideo = (remoteUser: IAgoraRTCRemoteUser) => {
    if (!videoRef.current || isBroadcasting) {
      return;
    }

    if (!remoteUser.videoTrack) {
      return;
    }

    videoRef.current.src = "";
    videoRef.current.srcObject = null;
    remoteUser.videoTrack.play(videoRef.current);
    activeRenderedVideoTrackRef.current = remoteUser.videoTrack;
    setIsPlaying(true);
  };

  const startAudienceSession = async () => {
    if (isBroadcasting) {
      return;
    }

    if (audienceClientRef.current && audienceSessionRef.current?.channelName === currentAgoraChannelName) {
      return;
    }

    if (audienceClientRef.current) {
      await stopAudienceSession();
    }

    try {
      logAgoraClientEvent("audience.join.start", {
        guestId: guest?.id ?? null,
      });

      const session: AgoraSessionIdentity = {
        channelName: currentAgoraChannelName,
        uid: `viewer-${guest?.id ?? "anon"}-${Date.now()}`,
        role: "subscriber",
      };

      const tokenPayload = await requestAgoraToken(session);
      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      client.setClientRole("audience");

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        logAgoraClientEvent("audience.user_published", {
          mediaType,
          remoteUid: user.uid,
        });

        if (mediaType === "video") {
          playRemoteTrackToVideo(user);
        }

        if (mediaType === "audio") {
          if (user.audioTrack) {
            activeRenderedAudioTrackRef.current = user.audioTrack;
            if (isPlaying) {
              user.audioTrack.play();
            }
          }
        }
      });

      client.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "audio") {
          user.audioTrack?.stop();
          activeRenderedAudioTrackRef.current = null;
        }

        if (mediaType === "video") {
          resetVideoToFallback();
        }
      });

      client.on("user-left", () => {
        resetVideoToFallback();
      });

      await client.join(tokenPayload.appId, tokenPayload.channelName, tokenPayload.token, tokenPayload.uid);
      audienceClientRef.current = client;
  audienceSessionRef.current = session;
  scheduleAudienceTokenRenewal(tokenPayload.expiresAt);
      logAgoraClientEvent("audience.join.succeeded", {
        uid: tokenPayload.uid,
      });

      const firstRemoteUserWithVideo = client.remoteUsers.find((user) => Boolean(user.videoTrack));
      if (firstRemoteUserWithVideo) {
        playRemoteTrackToVideo(firstRemoteUserWithVideo);
      }
    } catch (err) {
      console.error("Failed to start Agora audience session", err);
      logAgoraClientEvent("audience.join.failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const getBroadcastStartErrorMessage = (error: unknown) => {
    const fallback = "Could not start Agora live broadcast.";
    if (!error) {
      return fallback;
    }

    const rawMessage = error instanceof Error ? error.message : String(error);
    const normalizedMessage = rawMessage.toLowerCase();
    const errorName = typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
    const normalizedName = errorName.toLowerCase();
    const errorCode = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    const normalizedCode = errorCode.toLowerCase();

    const isPermissionDenied =
      normalizedName.includes("notallowed") ||
      normalizedName.includes("permission") ||
      normalizedMessage.includes("notallowederror") ||
      normalizedMessage.includes("permission denied") ||
      normalizedMessage.includes("permission is denied") ||
      normalizedCode.includes("permission") ||
      normalizedCode.includes("not_allowed");

    if (isPermissionDenied) {
      return "Camera/Microphone permission denied. Allow camera and mic for this site, then retry. If testing in VS Code Simple Browser, use Chrome or Edge at http://localhost:3000/live instead.";
    }

    return rawMessage || fallback;
  };

  const toggleBroadcast = async () => {
    setError("");

    if (isBroadcasting) {
      logAgoraClientEvent("host.stop.requested");
      await stopAgoraBroadcast();
      void startAudienceSession();
    } else {
      try {
        if (!guest?.id) {
          setError("Register with a host account before starting broadcast.");
          setBroadcastStatus("error");
          return;
        }

        await stopAudienceSession();
        setBroadcastStatus("connecting");
        logAgoraClientEvent("host.start.requested", {
          guestId: guest.id,
        });
        const session: AgoraSessionIdentity = {
          channelName: currentAgoraChannelName,
          uid: `host-${guest?.id ?? "anon"}-${Date.now()}`,
          role: "publisher",
          guestId: guest.id,
        };

        const tokenPayload = await requestAgoraToken(session);
        const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        client.setClientRole("host");
        await client.join(tokenPayload.appId, tokenPayload.channelName, tokenPayload.token, tokenPayload.uid);
        logAgoraClientEvent("host.join.succeeded", {
          uid: tokenPayload.uid,
        });

        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks({
          AEC: true,
          ANS: true,
        }, {
          encoderConfig: "1080p_1",
        });

        await client.publish([audioTrack, videoTrack]);
        logAgoraClientEvent("host.publish.succeeded");

        if (videoRef.current) {
          videoRef.current.src = "";
          videoRef.current.srcObject = null;
          videoTrack.play(videoRef.current);
        }
        activeRenderedVideoTrackRef.current = videoTrack;

        const mediaStream = new MediaStream([
          videoTrack.getMediaStreamTrack(),
          audioTrack.getMediaStreamTrack(),
        ]);

        agoraClientRef.current = client;
  hostSessionRef.current = session;
  scheduleHostTokenRenewal(tokenPayload.expiresAt);
        localAudioTrackRef.current = audioTrack;
        localVideoTrackRef.current = videoTrack;

        setStream(mediaStream);
        setIsBroadcasting(true);
        setIsPlaying(true);
        setIsMuted(true);
        setBroadcastStatus("live");
        qualityLabelStabilizeUntilRef.current = Date.now() + QUALITY_LABEL_STABILIZE_MS;
        setTimeout(() => {
          refreshStreamResolutionBadge();
        }, 250);
        stopResolutionPolling();
        resolutionPollingRef.current = setInterval(() => {
          refreshStreamResolutionBadge();
        }, 1000);
      } catch (err) {
        console.error("Failed to start Agora broadcast.", err);
        logAgoraClientEvent("host.start.failed", {
          message: err instanceof Error ? err.message : String(err),
        });
        setError(getBroadcastStartErrorMessage(err));
        await stopAgoraBroadcast("error");
      }
    }
  };

  useEffect(() => {
    void startAudienceSession();

    return () => {
      void stopAudienceSession();
    };
  }, [guest?.id, isBroadcasting, currentAgoraChannelName]);

  useEffect(() => {
    return () => {
      stopResolutionPolling();
      void stopAudienceSession();
      void stopAgoraBroadcast();
    };
  }, []);

  const handleStopBid = () => {
    if (isBiddingStopping || isBiddingStopped) return;
    setIsBiddingStopping(true);
    
    // Add a chat message to notify users
    setChatMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'agent',
      text: "⚠️ Bidding will close in 30 seconds! Get your final bids in now!"
    }]);
    
    setTimeout(() => {
      setIsBiddingStopping(false);
      setIsBiddingStopped(true);
      
      if (bidsRef.current.length > 0) {
        const winningBid = bidsRef.current[0];
        void evaluateWinningBidForCheckout(winningBid);
      } else {
        setChatMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'agent',
          text: "⚠️ Bidding has closed. No bids were placed."
        }]);
      }
    }, 30000);
  };

  const evaluateWinningBidForCheckout = async (winningBid: Bid) => {
    try {
      let rofrCheck: LiveRofrCheckResponse | null = null;

      const rofrResponse = await fetch("/api/lot-decoder/live-rofr-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: currentItemId,
          item_title: currentItemTitle,
          winning_bid: winningBid.amount,
          winning_guest_id: winningBid.guest_id,
        }),
      });

      if (rofrResponse.ok) {
        rofrCheck = await rofrResponse.json() as LiveRofrCheckResponse;
      }

      const fallbackMinimum = lowestSoldPrice ?? 0;
      const guardValue = rofrCheck?.guard_value && rofrCheck.guard_value > 0
        ? rofrCheck.guard_value
        : fallbackMinimum;
      const meetsGuard = rofrCheck ? rofrCheck.meets_guard : (fallbackMinimum <= 0 || winningBid.amount >= fallbackMinimum);

      if (guardValue > 0 && !meetsGuard) {
        const rofrQueue = rofrCheck?.rofr_order ?? [];
        const rofrPreview = rofrQueue.length > 0
          ? `ROFR order: ${rofrQueue.slice(0, 5).map((candidate) => candidate.name).join(", ")}${rofrQueue.length > 5 ? "..." : ""}.`
          : "ROFR order: highest bidder first, then prior live participants.";

        const notice = `Presenter alert: highest bid $${winningBid.amount.toFixed(2)} is below guard $${guardValue.toFixed(2)}. Offer Right of First Refusal at $${guardValue.toFixed(2)}. ${rofrPreview}`;
        setPresenterNotice(notice);

        void createAuctionNotice({
          notice_type: "presenter_alert",
          message: notice,
          metadata: {
            highestBid: winningBid.amount,
            minimumPrice: guardValue,
            winnerName: winningBid.guest_name,
            rofrOrder: rofrCheck?.rofr_order ?? [],
          },
        });

        setChatMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'agent',
          text: notice,
        }]);

        setMinimumNotMetWinner({
          name: winningBid.guest_name,
          amount: winningBid.amount,
          minimumPrice: guardValue,
          rofrQueue,
          rofrIndex: 0,
          rofrHistory: [],
        });

        return;
      }

      triggerCheckoutAgent(winningBid);
    } catch (err) {
      console.error("Failed to evaluate winning bid guard/ROFR", err);
      triggerCheckoutAgent(winningBid);
    }
  };

  const syncLotDecoderSale = async (winningBid: Bid) => {
    try {
      const res = await fetch("/api/lot-decoder/live-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: currentItemId,
          item_title: currentItemTitle,
          sale_amount: winningBid.amount,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn("Lot Decoder live sync failed", data);
      }
    } catch (err) {
      console.warn("Lot Decoder live sync network error", err);
    }
  };

  const triggerCheckoutAgent = async (winningBid: Bid) => {
    void syncLotDecoderSale(winningBid);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are an automated checkout assistant for a live shopping stream. The auction just ended.
        ${winningBid.guest_name} won the Vintage Leather Jacket with a bid of $${winningBid.amount}.
        Write a very brief, congratulatory message with a call to action to complete their purchase.
        Example: "Congratulations Tyke! You won the Leather Jacket for $150. Click here to complete your purchase within 5 minutes."`,
      });
      
      if (response.text) {
        // In a real app, you would send this to the specific user via WebSocket.
        // For this demo, we'll show it if the current user is the winner.
        if (guest && guest.id === winningBid.guest_id) {
          setCheckoutWinner({ name: winningBid.guest_name, amount: winningBid.amount });
          
          // Also add it to the chat for everyone to see
          setChatMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'agent',
            text: `🎉 The auction has ended! ${response.text}`
          }]);
        } else {
           // Add it to the chat for everyone to see
          setChatMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'agent',
            text: `🎉 The auction has ended! ${winningBid.guest_name} won the item for $${winningBid.amount}!`
          }]);
        }
      }
    } catch (err) {
      console.error("Checkout Agent error:", err);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const duration = videoRef.current.duration;
      if (duration > 0) {
        setProgress((current / duration) * 100);
      }
    }
  };

  const handleProgressClick = (e: MouseEvent<HTMLDivElement>) => {
    if (videoRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      videoRef.current.currentTime = pos * videoRef.current.duration;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
      if (isMuted && volume === 0) {
        setVolume(1);
        videoRef.current.volume = 1;
      }
    }
  };

  const handleVolumeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  };

  const toggleFullScreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.parentElement?.requestFullscreen();
      }
    }
  };

  const presenterNotices = auctionNotices.filter((notice) =>
    notice.notice_type === "presenter_alert" || notice.notice_type === "minimum_price_interest"
  );

  const filteredPresenterNotices = presenterNotices.filter((notice) => {
    if (noticeFilter === "pending") {
      return !notice.reviewed_at;
    }

    if (noticeFilter === "reviewed") {
      return Boolean(notice.reviewed_at);
    }

    return true;
  });

  const markNoticeReviewed = async (noticeId: number) => {
    try {
      setReviewingNoticeId(noticeId);
      const res = await fetch(`/api/auction-notices/${noticeId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewed_by_guest_id: guest?.id ?? null,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to mark notice as reviewed");
      }

      const updated = await res.json() as AuctionNotice;
      setAuctionNotices((prev) => prev.map((notice) => (notice.id === updated.id ? updated : notice)));
    } catch (err) {
      console.error("Failed to mark notice reviewed", err);
    } finally {
      setReviewingNoticeId(null);
    }
  };

  const notifyPresenterForMinimumPrice = () => {
    if (!guest || !minimumNotMetWinner) {
      return;
    }

    setIsHandRaised(true);
    const message = `${guest.name} raised a hand and is willing to accept the ROFR guard value of $${minimumNotMetWinner.minimumPrice.toFixed(2)}.`;
    void createAuctionNotice({
      notice_type: "minimum_price_interest",
      message,
      metadata: {
        bidderName: guest.name,
        offeredMinimumPrice: minimumNotMetWinner.minimumPrice,
      },
      created_by_guest_id: guest.id,
    });
    setPresenterNotice(message);
    setChatMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'agent',
      text: message,
    }]);
  };

  const handleRofrAccept = () => {
    if (!minimumNotMetWinner || !currentRofrCandidate) {
      return;
    }

    const decisionAt = new Date().toISOString();
    const acceptedPrice = minimumNotMetWinner.minimumPrice;

    setMinimumNotMetWinner((prev) => {
      if (!prev || !currentRofrCandidate) {
        return prev;
      }

      return {
        ...prev,
        rofrHistory: [
          ...prev.rofrHistory,
          {
            guest_id: currentRofrCandidate.guest_id,
            name: currentRofrCandidate.name,
            action: "accepted",
            at: decisionAt,
          },
        ],
      };
    });

    setCheckoutWinner({ name: currentRofrCandidate.name, amount: acceptedPrice });
    setMinimumNotMetWinner(null);

    const message = `ROFR accepted: ${currentRofrCandidate.name} accepted ${currentItemTitle} at $${acceptedPrice.toFixed(2)}.`;
    setChatMessages((prev) => [...prev, {
      id: Date.now().toString(),
      role: "agent",
      text: message,
    }]);

    void syncLotDecoderSale({
      id: Date.now(),
      guest_id: currentRofrCandidate.guest_id,
      guest_name: currentRofrCandidate.name,
      amount: acceptedPrice,
      item_id: currentItemId,
      bid_time: decisionAt,
    });

    void createAuctionNotice({
      notice_type: "minimum_price_interest",
      message,
      metadata: {
        itemId: currentItemId,
        itemTitle: currentItemTitle,
        rofrAcceptedBy: currentRofrCandidate.name,
        guardValue: acceptedPrice,
      },
    });
  };

  const handleRofrDecline = () => {
    if (!minimumNotMetWinner || !currentRofrCandidate) {
      return;
    }

    const decisionAt = new Date().toISOString();
    const candidateName = currentRofrCandidate.name;

    setMinimumNotMetWinner((prev) => {
      if (!prev || !currentRofrCandidate) {
        return prev;
      }

      const nextIndex = prev.rofrIndex + 1;
      const hasNext = nextIndex < prev.rofrQueue.length;

      if (!hasNext) {
        return null;
      }

      return {
        ...prev,
        rofrIndex: nextIndex,
        rofrHistory: [
          ...prev.rofrHistory,
          {
            guest_id: currentRofrCandidate.guest_id,
            name: currentRofrCandidate.name,
            action: "declined",
            at: decisionAt,
          },
        ],
      };
    });

    const noMoreCandidates = minimumNotMetWinner.rofrIndex + 1 >= minimumNotMetWinner.rofrQueue.length;
    const message = noMoreCandidates
      ? `ROFR complete: ${candidateName} declined and no additional candidates remain for ${currentItemTitle}.`
      : `ROFR update: ${candidateName} declined. Moving to next candidate.`;

    setChatMessages((prev) => [...prev, {
      id: Date.now().toString(),
      role: "agent",
      text: message,
    }]);

    void createAuctionNotice({
      notice_type: "presenter_alert",
      message,
      metadata: {
        itemId: currentItemId,
        itemTitle: currentItemTitle,
        rofrDecision: "declined",
        candidateName,
      },
    });
  };

  const handleRofrOfferNext = () => {
    if (!minimumNotMetWinner || !currentRofrCandidate) {
      return;
    }

    const decisionAt = new Date().toISOString();
    const currentName = currentRofrCandidate.name;

    setMinimumNotMetWinner((prev) => {
      if (!prev || !currentRofrCandidate) {
        return prev;
      }

      const nextIndex = prev.rofrIndex + 1;
      const hasNext = nextIndex < prev.rofrQueue.length;

      if (!hasNext) {
        return null;
      }

      return {
        ...prev,
        rofrIndex: nextIndex,
        rofrHistory: [
          ...prev.rofrHistory,
          {
            guest_id: currentRofrCandidate.guest_id,
            name: currentRofrCandidate.name,
            action: "skipped",
            at: decisionAt,
          },
        ],
      };
    });

    const noMoreCandidates = minimumNotMetWinner.rofrIndex + 1 >= minimumNotMetWinner.rofrQueue.length;
    const message = noMoreCandidates
      ? `ROFR queue ended after skipping ${currentName}.`
      : `ROFR update: skipping ${currentName}, offering to next participant.`;

    setChatMessages((prev) => [...prev, {
      id: Date.now().toString(),
      role: "agent",
      text: message,
    }]);

    void createAuctionNotice({
      notice_type: "presenter_alert",
      message,
      metadata: {
        itemId: currentItemId,
        itemTitle: currentItemTitle,
        rofrDecision: "skipped",
        candidateName: currentName,
      },
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 min-h-[calc(100vh-8rem)]">
      <div className="grid h-[800px] max-h-[calc(100vh-10rem)] gap-6 lg:grid-cols-3">
        
        {/* Left/Main Column: Video Player */}
        <div className="flex flex-col gap-6 lg:col-span-2 h-full">
          <div className="relative flex-1 overflow-hidden rounded-3xl border border-zinc-800 bg-black shadow-2xl">
            {/* Video Placeholder or Actual Video */}
            <video 
              ref={videoRef}
              className={`h-full w-full object-cover ${isBroadcasting ? 'scale-x-[-1]' : ''}`}
              poster={LSP_DEFAULT_POSTER}
              loop={!isBroadcasting}
              muted={isMuted}
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            
            {/* Auctioneer Agent Overlay */}
            <AnimatePresence>
              {auctioneerMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: 50, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.9 }}
                  className="absolute top-24 left-1/2 -translate-x-1/2 z-50 w-[80%] max-w-md"
                >
                  <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 p-1 shadow-[0_0_30px_rgba(245,158,11,0.5)]">
                    <div className="rounded-xl bg-zinc-950/90 px-6 py-4 backdrop-blur-md text-center border border-amber-500/20 relative overflow-hidden">
                      {isSpeaking && (
                        <div className="absolute inset-0 bg-amber-500/10 animate-pulse pointer-events-none" />
                      )}
                      <div className="flex items-center justify-center gap-3 mb-2">
                        {isSpeaking && <Volume1 className="h-5 w-5 text-amber-500 animate-bounce" />}
                        <span className="text-xs font-bold uppercase tracking-widest text-amber-500">Auctioneer AI</span>
                      </div>
                      <p className="text-lg font-bold text-white drop-shadow-md relative z-10">
                        {auctioneerMessage}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Countdown Clock Overlay */}
            <AnimatePresence>
              {timeRemaining !== null && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-40"
                >
                  <div className="flex flex-col items-center bg-black/40 backdrop-blur-sm p-8 rounded-3xl border border-[#20B2AA]/30 shadow-[0_0_50px_rgba(32,178,170,0.2)]">
                    <p className="text-xl font-bold text-white uppercase tracking-widest mb-2">Auction Starts In</p>
                    <div className="text-8xl font-black text-[#20B2AA] drop-shadow-[0_0_15px_rgba(32,178,170,0.8)] tracking-tighter">
                      {formatTime(timeRemaining)}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Overlay UI */}
            <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-transparent to-black/40 p-6 pointer-events-none">
              <div className="flex items-start justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium backdrop-blur-md border ${
                    isAuctionLive
                      ? "bg-red-500/20 text-red-500 border-red-500/30"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                  }`}>
                    <span className="relative flex h-2 w-2">
                      {isAuctionLive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>}
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${isAuctionLive ? "bg-red-500" : "bg-amber-400"}`}></span>
                    </span>
                    {isAuctionLive ? "LIVE" : "Soon"}
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs font-bold text-white backdrop-blur-md border border-white/10">
                    <span className={streamQualityLabel === "SD" ? "text-amber-400" : "text-emerald-400"}>{streamQualityLabel}</span>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-4">
                  <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white backdrop-blur-md border border-white/10">
                    <User className="h-4 w-4" />
                    1,204 watching
                  </div>

                  {isBroadcasting && hostStreamMetrics && (
                    <div className="rounded-full bg-black/50 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md border border-white/10">
                      {hostStreamMetrics.resolution}
                      {hostStreamMetrics.fps ? ` · ${hostStreamMetrics.fps}fps` : ""}
                      {hostStreamMetrics.bitrateKbps ? ` · ${hostStreamMetrics.bitrateKbps}kbps` : ""}
                    </div>
                  )}

                  {broadcastStatus !== "idle" && (
                    broadcastStatus === "error" ? (
                      <button
                        type="button"
                        onClick={toggleBroadcast}
                        className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider border backdrop-blur-md bg-red-500/20 text-red-300 border-red-500/40 pointer-events-auto hover:bg-red-500/30 transition-colors"
                        title="Retry broadcast"
                      >
                        error · retry
                      </button>
                    ) : (
                      <div className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider border backdrop-blur-md ${
                        broadcastStatus === "live"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      }`}>
                        {broadcastStatus}
                      </div>
                    )
                  )}
                  
                  {/* Host Copilot Overlay (Only visible when broadcasting) */}
                  <AnimatePresence>
                    {isBroadcasting && hostInsights && (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="w-64 rounded-xl bg-black/60 backdrop-blur-md border border-[#20B2AA]/30 p-4 shadow-lg pointer-events-auto"
                      >
                        <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
                          <Sparkles className="h-4 w-4 text-[#20B2AA]" />
                          <span className="text-xs font-bold uppercase tracking-wider text-[#20B2AA]">Host Copilot</span>
                        </div>
                        <div className="space-y-3 text-sm">
                          <div>
                            <span className="text-zinc-400 text-xs block mb-1">Sentiment</span>
                            <span className="text-white font-medium">{hostInsights.sentiment}</span>
                          </div>
                          <div>
                            <span className="text-zinc-400 text-xs block mb-1">Top Question</span>
                            <span className="text-white font-medium">{hostInsights.topQuestion}</span>
                          </div>
                          <div>
                            <span className="text-zinc-400 text-xs block mb-1">Suggestion</span>
                            <span className="text-emerald-400 font-medium">{hostInsights.suggestion}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {presenterNotice && (
                    <div className="w-64 rounded-xl bg-red-500/10 backdrop-blur-md border border-red-500/30 p-3 shadow-lg">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-red-300">Presenter Notice</p>
                      <p className="mt-1 text-xs text-red-100">{presenterNotice}</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-4 pointer-events-auto">
                <div className="flex items-end justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white drop-shadow-lg">Vintage Leather Jacket</h2>
                    <p className="text-emerald-400 font-medium drop-shadow-md">Item #001 • Starting at $50</p>
                  </div>
                </div>

                {/* Video Controls */}
                <div className="flex flex-col gap-3 rounded-2xl bg-black/60 p-4 backdrop-blur-md border border-white/10">
                  {/* Progress Bar */}
                  <div 
                    className="h-2 w-full cursor-pointer rounded-full bg-white/20 overflow-hidden"
                    onClick={handleProgressClick}
                  >
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-100 ease-linear"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  
                  {/* Controls Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <button 
                        onClick={togglePlay}
                        className="text-white hover:text-emerald-400 transition-colors"
                      >
                        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                      </button>
                      
                      <div className="flex items-center gap-3 group">
                        <button 
                          onClick={toggleMute}
                          className="text-white hover:text-emerald-400 transition-colors"
                        >
                          {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-0 opacity-0 group-hover:w-24 group-hover:opacity-100 transition-all duration-300 accent-emerald-500 cursor-pointer"
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {isBroadcasting && (
                        <button 
                          onClick={handleStopBid}
                          disabled={isBiddingStopping || isBiddingStopped}
                          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
                            isBiddingStopping || isBiddingStopped
                              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                              : "bg-red-600 text-black hover:bg-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                          }`}
                        >
                          <StopCircle className="h-4 w-4" />
                          {isBiddingStopped ? "Bidding Stopped" : isBiddingStopping ? "Stopping..." : "Stop Bid"}
                        </button>
                      )}
                      <button 
                        onClick={toggleBroadcast}
                        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
                          isBroadcasting 
                            ? "bg-red-500 text-white hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.5)]" 
                            : "bg-yellow-400 text-zinc-950 hover:bg-yellow-500 shadow-[0_0_15px_rgba(250,204,21,0.3)]"
                        }`}
                      >
                        {isBroadcasting ? (
                          <>
                            <CameraOff className="h-4 w-4" />
                            Stop Broadcast
                          </>
                        ) : (
                          <>
                            <Camera className="h-4 w-4" />
                            Start Broadcast
                          </>
                        )}
                      </button>
                      <button 
                        onClick={toggleFullScreen}
                        className="text-white hover:text-emerald-400 transition-colors"
                      >
                        <Maximize className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ad Banner Section */}
          <div
            onClick={handleAdClick}
            className="h-32 rounded-3xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm overflow-hidden relative flex items-center shadow-lg group shrink-0 cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#20B2AA]/10 to-transparent pointer-events-none" />
            {adContent ? (
              <>
                <div className="h-full w-48 shrink-0 relative overflow-hidden">
                  <img 
                    src={adContent.imageUrl} 
                    alt={adContent.title} 
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-zinc-900/90" />
                </div>
                <div className="flex-1 p-6 flex items-center justify-between relative z-10">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="h-3 w-3 text-[#20B2AA]" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#20B2AA]">Sponsored</span>
                    </div>
                    <h4 className="text-lg font-bold text-white mb-1">{adContent.title}</h4>
                    <p className="text-sm text-zinc-400 max-w-md">{adContent.description}</p>
                  </div>
                  <button className="shrink-0 rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20 transition-colors border border-white/5 backdrop-blur-md">
                    {adContent.cta}
                  </button>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-medium">Generating personalized ad...</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Bidding Interface */}
        <div className="flex flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm h-full relative">
          
          {/* Checkout Winner Overlay */}
          <AnimatePresence>
            {checkoutWinner && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-md p-8 text-center"
              >
                <div className="mb-6 rounded-full bg-emerald-500/20 p-6 border border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                  <CheckCircle2 className="h-16 w-16 text-emerald-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">You Won!</h2>
                <p className="text-zinc-300 mb-8 text-lg">
                  Congratulations {checkoutWinner.name}, you won the Vintage Leather Jacket for <span className="font-bold text-emerald-400">${checkoutWinner.amount}</span>.
                </p>
                <button 
                  onClick={() => setCheckoutWinner(null)}
                  className="w-full max-w-xs rounded-xl bg-emerald-500 px-6 py-4 font-bold text-zinc-950 transition-colors hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                >
                  Complete Purchase
                </button>
                <p className="mt-4 text-sm text-zinc-500">Please complete your purchase within 5 minutes.</p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {minimumNotMetWinner && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-md p-8 text-center"
              >
                <div className="mb-6 rounded-full bg-amber-500/20 p-6 border border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.25)]">
                  <AlertCircle className="h-16 w-16 text-amber-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-3">Minimum Price Not Met</h2>
                <p className="text-zinc-300 mb-6 max-w-xl">
                  The live bid did not reach the guard value. Right of first refusal is offered at the guard value, starting with the highest bidder and then other live participants.
                </p>
                <p className="text-sm text-zinc-400 mb-6">
                  Highest bid: ${minimumNotMetWinner.amount.toFixed(2)} · Guard value: ${minimumNotMetWinner.minimumPrice.toFixed(2)}
                </p>
                {minimumNotMetWinner.rofrQueue.length > 0 ? (
                  <>
                    <p className="text-xs text-zinc-400 mb-3 max-w-xl">
                      Current ROFR offer: <span className="text-amber-300 font-semibold">{currentRofrCandidate?.name ?? "N/A"}</span>
                      {` (${Math.min(minimumNotMetWinner.rofrIndex + 1, minimumNotMetWinner.rofrQueue.length)}/${minimumNotMetWinner.rofrQueue.length})`}
                    </p>
                    <p className="text-xs text-zinc-500 mb-3 max-w-xl">
                      ROFR queue: {minimumNotMetWinner.rofrQueue.slice(0, 6).map((candidate) => candidate.name).join(", ")}
                      {minimumNotMetWinner.rofrQueue.length > 6 ? "..." : ""}
                    </p>
                  </>
                ) : null}
                {minimumNotMetWinner.rofrHistory.length > 0 ? (
                  <div className="mb-4 w-full max-w-xl rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 text-left">
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">ROFR decisions</p>
                    <ul className="space-y-1 text-xs text-zinc-300">
                      {minimumNotMetWinner.rofrHistory.slice(-4).map((decision) => (
                        <li key={`${decision.guest_id}-${decision.at}`}>
                          {decision.name}: {decision.action}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex w-full max-w-xs flex-col gap-3">
                  <button
                    onClick={handleRofrAccept}
                    disabled={!currentRofrCandidate}
                    className="w-full rounded-xl bg-emerald-500 px-6 py-3 font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Accept ROFR Offer
                  </button>
                  <button
                    onClick={handleRofrDecline}
                    disabled={!currentRofrCandidate}
                    className="w-full rounded-xl bg-amber-500 px-6 py-3 font-bold text-zinc-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Decline and Move Next
                  </button>
                  <button
                    onClick={handleRofrOfferNext}
                    disabled={!currentRofrCandidate}
                    className="w-full rounded-xl border border-zinc-600 px-6 py-3 font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Offer Next in Queue
                  </button>
                  <button
                    onClick={() => setMinimumNotMetWinner(null)}
                    className="w-full rounded-xl border border-zinc-700 px-6 py-3 font-semibold text-zinc-200 transition-colors hover:bg-zinc-800"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="border-b border-zinc-800 p-6 bg-zinc-900 flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Hand className="h-5 w-5 text-[#20B2AA]" /> {/* Seafoam Green */}
              Live Bidding
            </h3>
            {guest && (
              <button
                onClick={() => setIsHandRaised(!isHandRaised)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isHandRaised 
                    ? "bg-amber-500/20 text-amber-500 border border-amber-500/50" 
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                <Hand className={`h-4 w-4 ${isHandRaised ? "animate-bounce" : ""}`} />
                {isHandRaised ? "Lower Hand" : "Raise Hand"}
              </button>
            )}
          </div>

          {!guest ? (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <div className="mb-6 rounded-full bg-[#20B2AA]/10 p-4">
                <User className="h-8 w-8 text-[#20B2AA]" />
              </div>
              <h4 className="mb-2 text-lg font-bold text-white">Join the Auction</h4>
              <p className="mb-8 text-sm text-zinc-400">Register to place bids and interact with the host.</p>
              
              <form onSubmit={handleRegister} className="w-full space-y-4">
                <input
                  type="text"
                  placeholder="Your Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:border-[#20B2AA] focus:outline-none focus:ring-1 focus:ring-[#20B2AA]"
                  required
                />
                <input
                  type="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:border-[#20B2AA] focus:outline-none focus:ring-1 focus:ring-[#20B2AA]"
                  required
                />
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#20B2AA] px-4 py-3 font-bold text-zinc-950 transition-colors hover:bg-[#1C9B94]"
                >
                  Enter Room
                </button>
              </form>
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Current Item Card */}
              <div className="border-b border-zinc-800 bg-zinc-900/80 p-4">
                <div className="rounded-xl border border-[#20B2AA]/30 bg-[#20B2AA]/5 p-4 transition-all duration-300 hover:border-[#20B2AA]/50 hover:bg-[#20B2AA]/10 hover:shadow-[0_0_15px_rgba(32,178,170,0.1)]">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#20B2AA]">Current Item</p>
                      <h4 className="mt-1 text-lg font-bold text-white">{currentItemTitle}</h4>
                      <p className="text-sm text-zinc-400">{selectedLiveLotItem?.sku ? `Item ${selectedLiveLotItem.sku}` : `Row ${currentItemId}`}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-400">Starting Bid</p>
                      <p className="text-lg font-bold text-white">$50.00</p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1">
                    <label className="text-[11px] uppercase tracking-wide text-zinc-500">Live lot row target</label>
                    <select
                      value={selectedLiveLotItemId}
                      onChange={(event) => setSelectedLiveLotItemId(event.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#20B2AA]"
                    >
                      {liveLotItems.length === 0 ? (
                        <option value="">No lot rows found</option>
                      ) : (
                        liveLotItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.sku || item.id} · {item.title} ({item.quantity_sold}/{item.quantity_expected})
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-[11px] text-zinc-500">
                      {liveLotSessionName
                        ? `Session: ${liveLotSessionName}`
                        : "No active lot session found. Activate one in /insights/live-ledger."}
                    </p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="mt-4 flex gap-2 border-b border-zinc-800">
                  <button
                    onClick={() => setActiveTab('bids')}
                    className={`pb-2 px-4 text-sm font-bold transition-colors ${
                      activeTab === 'bids' 
                        ? "border-b-2 border-[#20B2AA] text-[#20B2AA]" 
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Bids
                  </button>
                  <button
                    onClick={() => setActiveTab('qa')}
                    className={`pb-2 px-4 text-sm font-bold transition-colors flex items-center gap-2 ${
                      activeTab === 'qa' 
                        ? "border-b-2 border-[#20B2AA] text-[#20B2AA]" 
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Product Q&A
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Presenter Notices</p>
                    <span className="text-[11px] text-zinc-500">{filteredPresenterNotices.length}</span>
                  </div>
                  <div className="mb-2 flex items-center gap-1.5">
                    {[
                      { key: "all", label: "All" },
                      { key: "pending", label: "Needs review" },
                      { key: "reviewed", label: "Reviewed" },
                    ].map((filterOption) => (
                      <button
                        key={filterOption.key}
                        type="button"
                        onClick={() => setNoticeFilter(filterOption.key as "all" | "pending" | "reviewed")}
                        className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                          noticeFilter === filterOption.key
                            ? "bg-amber-500 text-zinc-950"
                            : "border border-zinc-700 text-zinc-300 hover:border-zinc-500"
                        }`}
                      >
                        {filterOption.label}
                      </button>
                    ))}
                  </div>
                  {filteredPresenterNotices.length === 0 ? (
                    <p className="text-xs text-zinc-500">No notices for this filter.</p>
                  ) : (
                    <ul className="max-h-32 space-y-2 overflow-y-auto pr-1">
                      {filteredPresenterNotices.slice(0, 5).map((notice) => (
                        <li key={notice.id} className="rounded-lg border border-zinc-700 bg-zinc-950 p-2.5">
                          <p className="text-[11px] leading-relaxed text-zinc-200">{notice.message}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                            <span>{new Date(notice.created_at).toLocaleTimeString()}</span>
                            <span className={notice.reviewed_at ? "text-emerald-400" : "text-amber-300"}>
                              {notice.reviewed_at ? "Reviewed" : "Needs review"}
                            </span>
                            {notice.metadata?.highestBid !== undefined && (
                              <span>High: ${Number(notice.metadata.highestBid).toFixed(2)}</span>
                            )}
                            {notice.metadata?.minimumPrice !== undefined && (
                              <span>Min: ${Number(notice.metadata.minimumPrice).toFixed(2)}</span>
                            )}
                            {notice.metadata?.bidderName && <span>Bidder: {notice.metadata.bidderName}</span>}
                          </div>
                          {!notice.reviewed_at && (
                            <button
                              type="button"
                              onClick={() => void markNoticeReviewed(notice.id)}
                              disabled={reviewingNoticeId === notice.id}
                              className="mt-2 rounded-md border border-zinc-600 px-2 py-1 text-[10px] font-semibold text-zinc-200 transition hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {reviewingNoticeId === notice.id ? "Marking..." : "Mark as reviewed"}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {activeTab === 'bids' ? (
                <>
                  {/* Bid History */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Bidding History</h4>
                    <AnimatePresence initial={false}>
                      {bids.map((bid, index) => (
                        <motion.div
                          layout
                          key={bid.id}
                          initial={{ opacity: 0, x: -20, scale: 0.95 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ type: "spring", stiffness: 300, damping: 24 }}
                          className={`flex items-center justify-between rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                            index === 0 
                              ? "border-[#20B2AA]/50 bg-[#20B2AA]/10 shadow-[0_0_15px_rgba(32,178,170,0.15)] hover:shadow-[0_0_20px_rgba(32,178,170,0.25)]" 
                              : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800/80"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                              index === 0 ? "bg-[#20B2AA] text-zinc-950" : "bg-zinc-800 text-zinc-400"
                            }`}>
                              {index === 0 ? <Hand className="h-5 w-5" /> : <User className="h-5 w-5" />}
                            </div>
                            <div>
                              <p className={`font-medium ${index === 0 ? "text-white" : "text-zinc-300"}`}>
                                {bid.guest_name}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {new Date(bid.bid_time).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                          <div className={`text-lg font-bold ${index === 0 ? "text-[#20B2AA]" : "text-white"}`}>
                            ${bid.amount.toFixed(2)}
                          </div>
                        </motion.div>
                      ))}
                      {bids.length === 0 && (
                        <div className="flex h-full items-center justify-center text-zinc-500">
                          No bids yet. Be the first!
                        </div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Bid Input */}
                  <div className="border-t border-zinc-800 bg-zinc-900 p-6">
                    <form onSubmit={handleBid} className="flex flex-col gap-3">
                      <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-300">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-zinc-200">eBay Sold Guard</span>
                          <button
                            type="button"
                            onClick={() => void refreshEbayData()}
                            className="rounded-md border border-zinc-600 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition hover:border-emerald-500 hover:text-emerald-300"
                          >
                            Refresh eBay Data
                          </button>
                        </div>
                        <p className="mt-2">
                          {isEbayLoading
                            ? "Checking recent eBay sold listings..."
                            : lowestSoldPrice !== null
                              ? `Lowest recent sold: $${lowestSoldPrice.toFixed(2)}${usingSampleData ? " (sample data)" : ""}`
                              : ebayInsufficientData
                                ? "Insufficient eBay data for this item."
                                : "No eBay sold baseline loaded yet."}
                        </p>
                        {ebayError && <p className="mt-1 text-red-400">{ebayError}</p>}
                      </div>
                      {error && (
                        <div className="flex items-center gap-2 text-sm text-red-400">
                          <AlertCircle className="h-4 w-4" />
                          {error}
                        </div>
                      )}
                      <div className="relative flex items-center">
                        <div className="absolute left-4 text-zinc-400">
                          <DollarSign className="h-5 w-5" />
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Enter bid amount..."
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          disabled={!isAuctionLive || isBiddingStopped}
                          className="w-full rounded-full border border-zinc-700 bg-zinc-950 py-4 pl-12 pr-16 text-lg font-bold text-white placeholder-zinc-600 focus:border-[#20B2AA] focus:outline-none focus:ring-1 focus:ring-[#20B2AA]"
                        />
                        <button
                          type="submit"
                          disabled={!isAuctionLive || isBiddingStopped}
                          className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#20B2AA] text-zinc-950 transition-transform hover:scale-105 active:scale-95"
                        >
                          <Send className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-500 px-2">
                        <span>Current highest: ${bids.length > 0 ? bids[0].amount.toFixed(2) : "0.00"}</span>
                        <span>wegonelive.com</span>
                      </div>
                    </form>
                  </div>
                </>
              ) : (
                <>
                  {/* Q&A Chat History */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Ask the Expert</h4>
                    <div className="space-y-4">
                      {chatMessages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl p-4 ${
                            msg.role === 'user' 
                              ? 'bg-zinc-800 text-white rounded-tr-sm' 
                              : 'bg-[#20B2AA]/10 border border-[#20B2AA]/30 text-zinc-200 rounded-tl-sm'
                          }`}>
                            {msg.role === 'agent' && (
                              <div className="flex items-center gap-2 mb-1">
                                <MessageSquare className="h-3 w-3 text-[#20B2AA]" />
                                <span className="text-xs font-bold text-[#20B2AA]">Product Expert AI</span>
                              </div>
                            )}
                            <p className="text-sm leading-relaxed">{msg.text}</p>
                          </div>
                        </div>
                      ))}
                      {isChatLoading && (
                        <div className="flex justify-start">
                          <div className="bg-[#20B2AA]/10 border border-[#20B2AA]/30 rounded-2xl rounded-tl-sm p-4">
                            <Loader2 className="h-5 w-5 text-[#20B2AA] animate-spin" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chat Input */}
                  <div className="border-t border-zinc-800 bg-zinc-900 p-6">
                    <form onSubmit={handleSendMessage} className="flex flex-col gap-3">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          placeholder="Ask about the jacket..."
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          disabled={isChatLoading}
                          className="w-full rounded-full border border-zinc-700 bg-zinc-950 py-4 pl-6 pr-16 text-sm text-white placeholder-zinc-600 focus:border-[#20B2AA] focus:outline-none focus:ring-1 focus:ring-[#20B2AA] disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={isChatLoading || !chatInput.trim()}
                          className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#20B2AA] text-zinc-950 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                        >
                          <Send className="h-5 w-5" />
                        </button>
                      </div>
                    </form>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Coming Next Component */}
      <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm">
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-white">Coming Next</h3>
          <div className="mt-2 h-1 w-full bg-gradient-to-r from-[#20B2AA] to-transparent" style={{ clipPath: 'polygon(0 0, 100% 40%, 100% 60%, 0 100%)' }}></div>
        </div>
        <div>
          <h4 className="mb-4 text-xl font-semibold text-[#20B2AA]">Categories</h4>
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => (
              <div key={category.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-all hover:border-zinc-700 hover:bg-zinc-800/50">
                <h5 className="font-bold text-white">{category.name}</h5>
                {category.subcategories && category.subcategories.length > 0 && (
                  <ul className="mt-2 space-y-1 pl-2">
                    {category.subcategories.map((sub) => (
                      <li key={sub.id} className="text-sm text-zinc-400">
                        • {sub.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Channels Component */}
      <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#20B2AA]">
            <Tv className="h-6 w-6 text-zinc-950" />
          </div>
          <h3 className="text-2xl font-bold text-white">Channels</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className="bg-zinc-800/50 text-xs uppercase text-zinc-300">
              <tr>
                <th className="rounded-tl-lg px-4 py-3 font-semibold">Channel</th>
                <th className="px-4 py-3 font-semibold">Feature</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="rounded-tr-lg px-4 py-3 font-semibold">Shopping Item</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              <tr className="transition-colors hover:bg-zinc-800/30">
                <td className="px-4 py-4 font-medium text-white">WGL Main</td>
                <td className="px-4 py-4">Live Auction</td>
                <td className="px-4 py-4">Clothes</td>
                <td className="px-4 py-4">Vintage Leather Jacket</td>
              </tr>
              <tr className="transition-colors hover:bg-zinc-800/30">
                <td className="px-4 py-4 font-medium text-white">Tech Hub</td>
                <td className="px-4 py-4">Product Demo</td>
                <td className="px-4 py-4">Tools</td>
                <td className="px-4 py-4">Power Drill 2000</td>
              </tr>
              <tr className="transition-colors hover:bg-zinc-800/30">
                <td className="px-4 py-4 font-medium text-white">Home & Garden</td>
                <td className="px-4 py-4">Clearance</td>
                <td className="px-4 py-4">Outdoors</td>
                <td className="px-4 py-4">Patio Furniture Set</td>
              </tr>
              <tr className="transition-colors hover:bg-zinc-800/30">
                <td className="px-4 py-4 font-medium text-white">Office Pro</td>
                <td className="px-4 py-4">Flash Sale</td>
                <td className="px-4 py-4">Office Supplies</td>
                <td className="px-4 py-4">Ergonomic Chair</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
