/**
 * Mock inbox data for LOCAL_DEV_NO_AUTH mode.
 *
 * Deterministic set of realistic messages for testing the triage UI
 * without a Google account. Only loaded when LOCAL_DEV_NO_AUTH=true.
 */

import type { InboxMessage } from "./gmail.js";

export interface MockChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const MOCK_GENERAL_CHAT_MESSAGES: MockChatMessage[] = [
  {
    role: "user",
    content: "What stands out in my inbox right now?",
  },
  {
    role: "assistant",
    content:
      "Looking at your inbox, a few things stand out:\n\n" +
      "1. **CI failure on main** — GitHub notifications show a TypeScript build error in `src/server/triage.ts`. You probably want to look at that first since it's blocking your main branch.\n\n" +
      "2. **Dependabot PR** — There's an Express bump from 4.20.0 to 4.21.1 waiting for review. Security patch, likely safe to merge.\n\n" +
      "3. **Personal reply from Alice** — She confirmed Tuesday at 2pm for coffee. You might want to reply to lock that in.\n\n" +
      "The rest is mostly automated notifications (Fly.io restart, Cloudflare cert renewal, Stripe receipt) — nothing urgent there.",
  },
  {
    role: "user",
    content: "Can you find any receipts or billing emails?",
  },
  {
    role: "assistant",
    content:
      "I found 2 billing/receipt emails:\n\n" +
      "• **Vercel** — Invoice #4821 for March 2025, $20.00 (read, from Sun Mar 9)\n" +
      "• **Stripe** — Payment confirmation for $9.99 to Acme SaaS Inc. (read, from Fri Mar 7)\n\n" +
      "Both are already read. Want me to suggest a filter to auto-label these as \"Receipts\"?",
  },
];

export const MOCK_INBOX_MESSAGES: InboxMessage[] = [
  {
    id: "mock-001",
    subject: "Your weekly digest from Dev.to",
    from: "Dev.to Weekly <digest@dev.to>",
    date: "Mon, 10 Mar 2025 08:00:00 -0400",
    snippet:
      "Top posts this week: Building a CLI in Rust, Why SQLite is underrated, and more...",
    isRead: true,
  },
  {
    id: "mock-002",
    subject: "[GitHub] dependabot: Bump express from 4.20.0 to 4.21.1",
    from: "GitHub <notifications@github.com>",
    date: "Mon, 10 Mar 2025 09:15:00 -0400",
    snippet:
      "dependabot[bot] opened a pull request in your-org/your-repo #142",
    isRead: false,
  },
  {
    id: "mock-003",
    subject: "Invoice #4821 from Vercel",
    from: "Vercel Billing <billing@vercel.com>",
    date: "Sun, 09 Mar 2025 14:30:00 -0400",
    snippet:
      "Your invoice for March 2025 is ready. Total: $20.00. View invoice →",
    isRead: true,
  },
  {
    id: "mock-004",
    subject: "Re: Coffee next week?",
    from: "Alice Chen <alice@example.com>",
    date: "Sun, 09 Mar 2025 11:45:00 -0400",
    snippet:
      "Hey! Tuesday works for me. How about 2pm at the usual spot?",
    isRead: false,
  },
  {
    id: "mock-005",
    subject: "[GitHub] Review requested: feat: add triage UI #87",
    from: "GitHub <notifications@github.com>",
    date: "Sat, 08 Mar 2025 16:20:00 -0400",
    snippet:
      "danny requested your review on linstack-cmd/mailania#87",
    isRead: false,
  },
  {
    id: "mock-006",
    subject: "Your Fly.io app restarted",
    from: "Fly.io Alerts <alerts@fly.io>",
    date: "Sat, 08 Mar 2025 03:12:00 -0400",
    snippet:
      "App mailania-prod in region yyz restarted due to health check failure.",
    isRead: true,
  },
  {
    id: "mock-007",
    subject: "Stripe: Successful payment for $9.99",
    from: "Stripe Receipts <receipts@stripe.com>",
    date: "Fri, 07 Mar 2025 20:00:00 -0400",
    snippet:
      "Payment to Acme SaaS Inc. was successful. Receipt #re_3P2x...",
    isRead: true,
  },
  {
    id: "mock-008",
    subject: "New comment on your blog post",
    from: "Hashnode <noreply@hashnode.com>",
    date: "Fri, 07 Mar 2025 15:30:00 -0400",
    snippet:
      'Someone commented on "Building Mailania: An AI Email Triage Tool"',
    isRead: false,
  },
  {
    id: "mock-009",
    subject: "[GitHub] CI failed: main · linstack-cmd/mailania",
    from: "GitHub <notifications@github.com>",
    date: "Fri, 07 Mar 2025 12:05:00 -0400",
    snippet:
      "Build failed for commit abc1234: TypeScript error in src/server/triage.ts",
    isRead: false,
  },
  {
    id: "mock-010",
    subject: "Your Cloudflare certificate is renewing",
    from: "Cloudflare <noreply@cloudflare.com>",
    date: "Thu, 06 Mar 2025 10:00:00 -0400",
    snippet:
      "The SSL certificate for mailania.probablydanny.com will auto-renew in 7 days.",
    isRead: true,
  },
];
