export type AteShortType = "ATE";

export type AteStage = "pre-auction" | "live-auction" | "post-auction";

export type AtePriority = "P0" | "P1";

export interface AteQaItem {
  id: string;
  shortType: AteShortType;
  stage: AteStage;
  priority: AtePriority;
  question: string;
  answer: string;
  tags: string[];
}

export const ATE_QA_MODEL_NAME = "Ask The Expert Q&A";
export const ATE_QA_SHORTTYPE: AteShortType = "ATE";
export const ATE_QA_MODEL_VERSION = "2026-03-02";
export const ATE_NO_MATCH_RESPONSE = "I don't have a verified answer for that yet. Please tap Raise Hand so the host can help you live. For your security, do not share internal corporate details, passwords, or full payment info in chat.";

export const ATE_QA_ITEMS: AteQaItem[] = [
  {
    id: "ate-001",
    shortType: "ATE",
    stage: "pre-auction",
    priority: "P0",
    question: "Do I need an account to join the live auction?",
    answer: "Yes, please register first so we can verify bidders and keep the auction fair. Once registered, you can rejoin quickly for future events.",
    tags: ["account", "registration", "join"],
  },
  {
    id: "ate-002",
    shortType: "ATE",
    stage: "pre-auction",
    priority: "P0",
    question: "When does the live room open?",
    answer: "The room opens during the official pre-show access window before the event starts. If the window is closed, you will be redirected to the ready page.",
    tags: ["live-room", "schedule", "access-window"],
  },
  {
    id: "ate-003",
    shortType: "ATE",
    stage: "pre-auction",
    priority: "P0",
    question: "Can I watch before bidding starts?",
    answer: "Yes. During pre-show you can watch updates, view sponsor content, and ask questions in Ask The Expert before live bidding begins.",
    tags: ["pre-show", "watch", "bidding"],
  },
  {
    id: "ate-004",
    shortType: "ATE",
    stage: "pre-auction",
    priority: "P0",
    question: "How can I make sure I do not miss the start?",
    answer: "Join early during pre-show and keep the live page open. Make sure your device volume and internet connection are stable.",
    tags: ["start-time", "pre-show", "tips"],
  },
  {
    id: "ate-005",
    shortType: "ATE",
    stage: "pre-auction",
    priority: "P0",
    question: "What should I do if I cannot enter the live page?",
    answer: "First confirm you are registered and signed in with the same identity. If access is still blocked, the event window may not be open yet.",
    tags: ["access", "signin", "support"],
  },
  {
    id: "ate-006",
    shortType: "ATE",
    stage: "pre-auction",
    priority: "P1",
    question: "Can I preview items before the auction goes live?",
    answer: "Yes, item details are shown before bidding opens so you can review what you are interested in ahead of time.",
    tags: ["items", "preview", "catalog"],
  },
  {
    id: "ate-007",
    shortType: "ATE",
    stage: "pre-auction",
    priority: "P1",
    question: "How does bidding work in simple terms?",
    answer: "You place a bid amount on the active lot. Higher eligible bids can replace yours until the lot closes.",
    tags: ["bids", "how-it-works", "lots"],
  },
  {
    id: "ate-008",
    shortType: "ATE",
    stage: "pre-auction",
    priority: "P1",
    question: "How do I know if my bid was accepted?",
    answer: "Accepted bids appear in the live bid feed with updated ranking. If your bid does not appear, try again and check your connection.",
    tags: ["bid-status", "feed", "confirmation"],
  },
  {
    id: "ate-009",
    shortType: "ATE",
    stage: "live-auction",
    priority: "P0",
    question: "What if the stream freezes or lags?",
    answer: "Check your internet connection first, then refresh the page. Rejoining usually restores the stream while preserving the live session context.",
    tags: ["stream", "lag", "refresh"],
  },
  {
    id: "ate-010",
    shortType: "ATE",
    stage: "live-auction",
    priority: "P0",
    question: "Why did it say minimum not met on a lot?",
    answer: "That means the final bid did not reach the seller's minimum acceptable value for that item.",
    tags: ["minimum", "reserve", "lot-status"],
  },
  {
    id: "ate-011",
    shortType: "ATE",
    stage: "live-auction",
    priority: "P0",
    question: "Can I increase my bid after placing one?",
    answer: "Yes. You can place a higher bid while the lot is still open, and the newest valid amount becomes your active bid.",
    tags: ["bids", "increase", "active-lot"],
  },
  {
    id: "ate-012",
    shortType: "ATE",
    stage: "live-auction",
    priority: "P0",
    question: "How do I know when a lot is closed?",
    answer: "A lot is closed when bidding stops and the winner or final outcome is announced on the live interface.",
    tags: ["lot-close", "winner", "status"],
  },
  {
    id: "ate-013",
    shortType: "ATE",
    stage: "live-auction",
    priority: "P1",
    question: "Can I bid from my phone?",
    answer: "Yes, mobile bidding is supported. Keep your browser updated and use a stable connection for best real-time performance.",
    tags: ["mobile", "bidding", "compatibility"],
  },
  {
    id: "ate-014",
    shortType: "ATE",
    stage: "live-auction",
    priority: "P1",
    question: "Is there a delay between what I see and live bidding?",
    answer: "A short delay can happen depending on network conditions, but bids are recorded by the platform in real time.",
    tags: ["delay", "realtime", "network"],
  },
  {
    id: "ate-015",
    shortType: "ATE",
    stage: "live-auction",
    priority: "P1",
    question: "Can I ask product questions during the auction?",
    answer: "Yes, Ask The Expert is available for quick product and process questions while you watch and bid.",
    tags: ["ask-the-expert", "product-questions", "support"],
  },
  {
    id: "ate-016",
    shortType: "ATE",
    stage: "live-auction",
    priority: "P1",
    question: "Can I cancel a bid after I place it?",
    answer: "Bid cancellation rules depend on event policy. If you made an error, contact support or the host immediately.",
    tags: ["bid-policy", "cancel", "support"],
  },
  {
    id: "ate-017",
    shortType: "ATE",
    stage: "post-auction",
    priority: "P0",
    question: "How will I know if I won a lot?",
    answer: "Winners are shown at lot close and then confirmed through your account or event communication channel.",
    tags: ["winner", "notification", "lot-close"],
  },
  {
    id: "ate-018",
    shortType: "ATE",
    stage: "post-auction",
    priority: "P0",
    question: "When do I get my invoice if I win?",
    answer: "Invoices are sent after winner confirmation and final lot processing, usually shortly after the event.",
    tags: ["invoice", "winner", "timing"],
  },
  {
    id: "ate-019",
    shortType: "ATE",
    stage: "post-auction",
    priority: "P0",
    question: "What payment methods are accepted?",
    answer: "Accepted payment methods are shown during checkout or invoicing. Please follow the payment instructions in your winner notice.",
    tags: ["payment", "checkout", "invoice"],
  },
  {
    id: "ate-020",
    shortType: "ATE",
    stage: "post-auction",
    priority: "P0",
    question: "What if I think there is an issue with my invoice?",
    answer: "Contact support with your lot number and account details. We will review and correct invoice issues as quickly as possible.",
    tags: ["invoice", "support", "billing"],
  },
  {
    id: "ate-021",
    shortType: "ATE",
    stage: "post-auction",
    priority: "P1",
    question: "How will shipping be handled after I pay?",
    answer: "Shipping details and timelines are provided after payment confirmation. Track updates through your order or support channel.",
    tags: ["shipping", "fulfillment", "payment"],
  },
  {
    id: "ate-022",
    shortType: "ATE",
    stage: "post-auction",
    priority: "P1",
    question: "Can I return an item if there is a problem?",
    answer: "Returns depend on the event's published policy. Check the item terms and contact support if you need help with a claim.",
    tags: ["returns", "policy", "support"],
  },
  {
    id: "ate-023",
    shortType: "ATE",
    stage: "post-auction",
    priority: "P1",
    question: "Is my personal and payment information secure?",
    answer: "We use secure systems and controlled access practices to protect user data. Never share passwords or full payment details in chat.",
    tags: ["security", "privacy", "payments"],
  },
  {
    id: "ate-024",
    shortType: "ATE",
    stage: "post-auction",
    priority: "P1",
    question: "How do I contact support after the auction ends?",
    answer: "Use the support contact shown on your event page or invoice message. Include your lot and account details for faster help.",
    tags: ["support", "contact", "post-auction"],
  },
];

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface FindAteQuickAnswerOptions {
  minScore?: number;
}

export function findAteQuickAnswer(query: string, options?: FindAteQuickAnswerOptions): AteQaItem | null {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return null;
  }

  const minScore = options?.minScore ?? 2;
  const queryTerms = normalizedQuery.split(" ").filter((term) => term.length > 2);
  if (queryTerms.length === 0) {
    return null;
  }

  let bestMatch: { item: AteQaItem; score: number } | null = null;

  for (const item of ATE_QA_ITEMS) {
    const corpus = normalize(`${item.question} ${item.answer} ${item.tags.join(" ")}`);
    let score = 0;

    for (const term of queryTerms) {
      if (corpus.includes(term)) {
        score += 1;
      }
    }

    if (score === 0) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { item, score };
    }
  }

  if (!bestMatch || bestMatch.score < minScore) {
    return null;
  }

  return bestMatch.item;
}