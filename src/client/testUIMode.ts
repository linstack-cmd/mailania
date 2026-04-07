/**
 * Test UI Mode — client-side only, activated via ?testUI=1 URL param.
 *
 * Renders the full Mailania UI with realistic mock data for visual QA.
 * Zero LLM calls, zero auth required, zero real user data exposed.
 */

import type { ChatMessageData } from "./ChatPanel";
import type { TriageSuggestion } from "./TriageSuggestions";

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export function isTestUIMode(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("testUI") === "1";
}

// ---------------------------------------------------------------------------
// Mock inbox messages (20 realistic emails)
// ---------------------------------------------------------------------------

export interface MockInboxMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isRead?: boolean;
}

const now = new Date();
function daysAgo(n: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export const TEST_INBOX_MESSAGES: MockInboxMessage[] = [
  {
    id: "test-001",
    subject: "🚨 [GitHub] CI failed: main · acme/dashboard",
    from: "GitHub <notifications@github.com>",
    date: daysAgo(0),
    snippet: "Build failed for commit f3a21bc: TypeScript error in src/components/Chart.tsx line 42",
    isRead: false,
  },
  {
    id: "test-002",
    subject: "Re: Q2 Planning — final agenda",
    from: "Sarah Kim <sarah.kim@acmecorp.com>",
    date: daysAgo(0),
    snippet: "Updated the doc with everyone's input. Let's finalize tomorrow at 10am. I added a section on the infrastructure migration...",
    isRead: false,
  },
  {
    id: "test-003",
    subject: "[Slack] New message in #engineering",
    from: "Slack <notification@slack.com>",
    date: daysAgo(0),
    snippet: "Marcus: Has anyone else seen the latency spike on the payments service? Looks like it started around 3am UTC",
    isRead: false,
  },
  {
    id: "test-004",
    subject: "Your AWS bill for March 2025",
    from: "Amazon Web Services <billing@aws.amazon.com>",
    date: daysAgo(1),
    snippet: "Your estimated charges for this billing period are $247.83. View your bill →",
    isRead: true,
  },
  {
    id: "test-005",
    subject: "[GitHub] dependabot: Bump vite from 6.0.3 to 6.1.0",
    from: "GitHub <notifications@github.com>",
    date: daysAgo(1),
    snippet: "dependabot[bot] opened a pull request in acme/dashboard #298 — includes security fix for CVE-2025-0142",
    isRead: false,
  },
  {
    id: "test-006",
    subject: "Invoice INV-2025-0089 from Vercel",
    from: "Vercel Billing <billing@vercel.com>",
    date: daysAgo(1),
    snippet: "Your invoice for March 2025 is ready. Pro plan: $20.00. View invoice →",
    isRead: true,
  },
  {
    id: "test-007",
    subject: "Re: Coffee Thursday?",
    from: "Alex Rivera <alex.r@gmail.com>",
    date: daysAgo(1),
    snippet: "Thursday works! How about 3pm at Blue Bottle on Valencia? I'll grab the first round ☕",
    isRead: false,
  },
  {
    id: "test-008",
    subject: "Your Fly.io app restarted",
    from: "Fly.io Alerts <alerts@fly.io>",
    date: daysAgo(2),
    snippet: "App dashboard-prod in region yyz restarted due to OOM. Peak memory usage: 487MB / 512MB limit.",
    isRead: true,
  },
  {
    id: "test-009",
    subject: "[GitHub] Review requested: feat: add dark mode #287",
    from: "GitHub <notifications@github.com>",
    date: daysAgo(2),
    snippet: "jamie-dev requested your review on acme/dashboard#287 — adds system-preference-aware dark mode with manual toggle",
    isRead: false,
  },
  {
    id: "test-010",
    subject: "Stripe: Payment received — $49.00",
    from: "Stripe Receipts <receipts@stripe.com>",
    date: daysAgo(2),
    snippet: "Payment from Widget Corp for Standard Plan (monthly). Receipt #re_5Qx2kL...",
    isRead: true,
  },
  {
    id: "test-011",
    subject: "New comment on your blog post",
    from: "Hashnode <noreply@hashnode.com>",
    date: daysAgo(3),
    snippet: 'Great write-up! I\'ve been looking for exactly this approach to handle WebSocket reconnection...',
    isRead: true,
  },
  {
    id: "test-012",
    subject: "Your weekly digest from Dev.to",
    from: "Dev.to Weekly <digest@dev.to>",
    date: daysAgo(3),
    snippet: "Top posts: Building a CLI in Rust, Why SQLite is underrated, React Server Components deep dive...",
    isRead: true,
  },
  {
    id: "test-013",
    subject: "Cloudflare: SSL certificate auto-renewed",
    from: "Cloudflare <noreply@cloudflare.com>",
    date: daysAgo(3),
    snippet: "The SSL certificate for dashboard.acmecorp.com has been automatically renewed. Valid until Jun 28, 2025.",
    isRead: true,
  },
  {
    id: "test-014",
    subject: "Team standup notes — March 26",
    from: "Notion <notify@makenotion.com>",
    date: daysAgo(3),
    snippet: "Updates: Frontend — dark mode PR ready for review. Backend — payments API migration 80% complete. Infra — new monitoring dashboards deployed.",
    isRead: true,
  },
  {
    id: "test-015",
    subject: "Your Figma export is ready",
    from: "Figma <noreply@figma.com>",
    date: daysAgo(4),
    snippet: 'Your export of "Dashboard Redesign v3" is ready to download. 24 frames exported as PNG @2x.',
    isRead: true,
  },
  {
    id: "test-016",
    subject: "[Linear] BUG-142: User avatar not loading on mobile",
    from: "Linear <notifications@linear.app>",
    date: daysAgo(4),
    snippet: "New issue assigned to you by Jamie. Priority: High. Due: March 31. Image CDN returns 403 on Safari iOS...",
    isRead: false,
  },
  {
    id: "test-017",
    subject: "GitHub Copilot: Your usage summary",
    from: "GitHub <noreply@github.com>",
    date: daysAgo(5),
    snippet: "You accepted 847 suggestions this month (73% acceptance rate). Top languages: TypeScript, Python, Go.",
    isRead: true,
  },
  {
    id: "test-018",
    subject: "Re: Apartment viewing Saturday",
    from: "Lisa Park <lisa.park@outlook.com>",
    date: daysAgo(5),
    snippet: "The landlord confirmed 11am on Saturday. Address is 425 Valencia St, Apt 3B. Buzzer code is #4271.",
    isRead: false,
  },
  {
    id: "test-019",
    subject: "Your order has shipped!",
    from: "Amazon <ship-confirm@amazon.com>",
    date: daysAgo(6),
    snippet: "Your order #114-7283941 (Keychron K3 Pro mechanical keyboard) has shipped. Estimated delivery: March 31.",
    isRead: true,
  },
  {
    id: "test-020",
    subject: "Reminder: Dentist appointment Monday 9am",
    from: "SmileDental <reminders@smiledental.com>",
    date: daysAgo(7),
    snippet: "This is a reminder for your appointment with Dr. Chen on Monday, March 31 at 9:00 AM. Reply CONFIRM to confirm.",
    isRead: true,
  },
];

// ---------------------------------------------------------------------------
// Mock chat messages
// ---------------------------------------------------------------------------

export const TEST_CHAT_MESSAGES: ChatMessageData[] = [
  {
    id: "test-chat-1",
    role: "user",
    content: "What needs my attention right now?",
    createdAt: daysAgo(0),
  },
  {
    id: "test-chat-2",
    role: "assistant",
    content:
      "Looking at your inbox, here's what stands out:\n\n" +
      "1. **CI failure on main** — There's a TypeScript error in Chart.tsx blocking the main branch. Worth fixing first.\n\n" +
      "2. **Dependabot security PR** — Vite bump includes a CVE fix (CVE-2025-0142). Should review and merge soon.\n\n" +
      "3. **Linear bug (High priority)** — Avatar loading issue on Safari iOS, assigned to you, due March 31.\n\n" +
      "4. **Sarah's Q2 planning email** — She wants to finalize the agenda tomorrow at 10am. You might want to review the doc tonight.\n\n" +
      "The rest is mostly receipts, notifications, and newsletters — nothing urgent there.",
    createdAt: daysAgo(0),
  },
  {
    id: "test-chat-3",
    role: "user",
    content: "Any receipts or billing emails I should track?",
    createdAt: daysAgo(0),
  },
  {
    id: "test-chat-4",
    role: "assistant",
    content:
      "Found 3 billing/receipt emails:\n\n" +
      "• **AWS** — March bill: $247.83 (1 day ago)\n" +
      "• **Vercel** — Invoice INV-2025-0089: $20.00 (1 day ago)\n" +
      "• **Stripe** — Payment received: $49.00 from Widget Corp (2 days ago)\n\n" +
      "All are already read. Want me to suggest a filter to auto-label billing emails?",
    createdAt: daysAgo(0),
  },
  {
    id: "test-chat-5",
    role: "user",
    content: "How about personal emails — anything I need to reply to?",
    createdAt: daysAgo(0),
  },
  {
    id: "test-chat-6",
    role: "assistant",
    content:
      "Two personal emails waiting for a reply:\n\n" +
      "• **Alex Rivera** — Confirmed coffee Thursday at 3pm, Blue Bottle on Valencia. Just needs a 👍 from you.\n" +
      "• **Lisa Park** — Apartment viewing Saturday 11am, 425 Valencia St Apt 3B. She sent the buzzer code. You might want to confirm you're coming.\n\n" +
      "Both are fairly time-sensitive since the events are this week.",
    createdAt: daysAgo(0),
  },
];

// ---------------------------------------------------------------------------
// Mock suggestions / proposals
// ---------------------------------------------------------------------------

interface TestSuggestionWithId {
  id: string;
  suggestion: TriageSuggestion;
  status: string;
}

export const TEST_SUGGESTIONS: TestSuggestionWithId[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    status: "pending",
    suggestion: {
      kind: "archive_bulk",
      title: "Archive 5 automated notifications",
      rationale: "These are read CI alerts, deployment notifications, and certificate renewals that don't need further action.",
      confidence: "high",
      messageIds: ["test-008", "test-013", "test-017", "test-012", "test-015"],
    },
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    status: "pending",
    suggestion: {
      kind: "create_filter",
      title: 'Auto-label billing emails as "Receipts"',
      rationale: "You receive regular billing emails from AWS, Vercel, and Stripe. A filter would auto-label and skip inbox.",
      confidence: "medium",
      filterDraft: {
        from: "billing@aws.amazon.com OR billing@vercel.com OR receipts@stripe.com",
        label: "Receipts",
        archive: true,
      },
    },
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    status: "pending",
    suggestion: {
      kind: "needs_user_input",
      title: "Reply to Alex about Thursday coffee",
      rationale: "Alex confirmed Thursday 3pm at Blue Bottle. A quick confirmation would lock this in.",
      confidence: "high",
      messageIds: ["test-007"],
      questions: ["Should I draft a quick confirmation reply?"],
    },
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    status: "pending",
    suggestion: {
      kind: "mark_read",
      title: "Mark 3 newsletters as read",
      rationale: "Dev.to digest, Hashnode comment notification, and GitHub Copilot summary are informational and don't need action.",
      confidence: "medium",
      messageIds: ["test-011", "test-012", "test-017"],
    },
  },
];

// ---------------------------------------------------------------------------
// Mock status data
// ---------------------------------------------------------------------------

export const TEST_STATUS = {
  authenticated: true,
  localDev: true,
  user: {
    id: "test-user-001",
    displayName: "Test User",
    email: "testuser@example.com",
  },
  gmailAccounts: [
    {
      id: "test-gmail-001",
      email: "testuser@example.com",
      isPrimary: true,
      isActive: true,
    },
  ],
  gmailConnected: true,
  hasPasskey: true,
  activeGmailAccountId: "test-gmail-001",
};
