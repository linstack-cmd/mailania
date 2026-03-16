/**
 * Mock inbox data for LOCAL_DEV_NO_AUTH mode.
 *
 * Deterministic set of realistic messages for testing the triage UI
 * without a Google account. Only loaded when LOCAL_DEV_NO_AUTH=true.
 */

import type { InboxMessage } from "./gmail.js";

export const MOCK_INBOX_MESSAGES: InboxMessage[] = [
  {
    id: "mock-001",
    subject: "Your weekly digest from Dev.to",
    from: "digest@dev.to",
    date: "Mon, 10 Mar 2025 08:00:00 -0400",
    snippet:
      "Top posts this week: Building a CLI in Rust, Why SQLite is underrated, and more...",
  },
  {
    id: "mock-002",
    subject: "[GitHub] dependabot: Bump express from 4.20.0 to 4.21.1",
    from: "notifications@github.com",
    date: "Mon, 10 Mar 2025 09:15:00 -0400",
    snippet:
      "dependabot[bot] opened a pull request in your-org/your-repo #142",
  },
  {
    id: "mock-003",
    subject: "Invoice #4821 from Vercel",
    from: "billing@vercel.com",
    date: "Sun, 09 Mar 2025 14:30:00 -0400",
    snippet:
      "Your invoice for March 2025 is ready. Total: $20.00. View invoice →",
  },
  {
    id: "mock-004",
    subject: "Re: Coffee next week?",
    from: "alice@example.com",
    date: "Sun, 09 Mar 2025 11:45:00 -0400",
    snippet:
      "Hey! Tuesday works for me. How about 2pm at the usual spot?",
  },
  {
    id: "mock-005",
    subject: "[GitHub] Review requested: feat: add triage UI #87",
    from: "notifications@github.com",
    date: "Sat, 08 Mar 2025 16:20:00 -0400",
    snippet:
      "danny requested your review on linstack-cmd/mailania#87",
  },
  {
    id: "mock-006",
    subject: "Your Fly.io app restarted",
    from: "alerts@fly.io",
    date: "Sat, 08 Mar 2025 03:12:00 -0400",
    snippet:
      "App mailania-prod in region yyz restarted due to health check failure.",
  },
  {
    id: "mock-007",
    subject: "Stripe: Successful payment for $9.99",
    from: "receipts@stripe.com",
    date: "Fri, 07 Mar 2025 20:00:00 -0400",
    snippet:
      "Payment to Acme SaaS Inc. was successful. Receipt #re_3P2x...",
  },
  {
    id: "mock-008",
    subject: "New comment on your blog post",
    from: "noreply@hashnode.com",
    date: "Fri, 07 Mar 2025 15:30:00 -0400",
    snippet:
      'Someone commented on "Building Mailania: An AI Email Triage Tool"',
  },
  {
    id: "mock-009",
    subject: "[GitHub] CI failed: main · linstack-cmd/mailania",
    from: "notifications@github.com",
    date: "Fri, 07 Mar 2025 12:05:00 -0400",
    snippet:
      "Build failed for commit abc1234: TypeScript error in src/server/triage.ts",
  },
  {
    id: "mock-010",
    subject: "Your Cloudflare certificate is renewing",
    from: "noreply@cloudflare.com",
    date: "Thu, 06 Mar 2025 10:00:00 -0400",
    snippet:
      "The SSL certificate for mailania.probablydanny.com will auto-renew in 7 days.",
  },
];
