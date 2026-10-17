-- ============================================================================
-- RJ STREAM LIVE v3.0 — Sovereign Live Streaming, Payments, Workflows, Integrations & White-Label SaaS Schema
-- Engineered exclusively for Rick Jefferson | RJ Business Solutions
-- ============================================================================

DROP TABLE IF EXISTS saas_tenants;
DROP TABLE IF EXISTS integrations;
DROP TABLE IF EXISTS workflow_runs;
DROP TABLE IF EXISTS workflow_rules;
DROP TABLE IF EXISTS affiliates;
DROP TABLE IF EXISTS promo_codes;
DROP TABLE IF EXISTS stream_offers;
DROP TABLE IF EXISTS stream_qa;
DROP TABLE IF EXISTS stream_poll_votes;
DROP TABLE IF EXISTS stream_polls;
DROP TABLE IF EXISTS webrtc_signals;
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS ppv_unlocks;
DROP TABLE IF EXISTS streams;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer', -- 'creator', 'vip', 'viewer'
  subscription_tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'vip_monthly', 'executive_annual'
  subscription_status TEXT NOT NULL DEFAULT 'inactive', -- 'active', 'inactive'
  wallet_balance_cents INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT DEFAULT '',
  referred_by TEXT DEFAULT '',
  is_muted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE streams (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  access_tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'vip', 'ppv'
  ppv_price_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'live', -- 'live', 'scheduled', 'ended'
  stream_key TEXT NOT NULL,
  whip_url TEXT DEFAULT '',
  whep_url TEXT DEFAULT '',
  hls_url TEXT DEFAULT '',
  vod_url TEXT DEFAULT '',
  rtmp_url TEXT DEFAULT 'rtmps://live.cloudflare.com:443/live/',
  viewer_count INTEGER NOT NULL DEFAULT 1,
  peak_viewers INTEGER NOT NULL DEFAULT 1,
  total_tips_cents INTEGER NOT NULL DEFAULT 0,
  tip_goal_cents INTEGER NOT NULL DEFAULT 250000,
  tip_goal_title TEXT DEFAULT 'Live Broadcast Goal: Unlock Bonus 222-Agent Deployment Blueprint',
  pinned_message TEXT DEFAULT '📌 Welcome to RJ Stream Live! Use code RICK2026 for 20% off VIP or Executive Passes.',
  chat_mode TEXT NOT NULL DEFAULT 'all', -- 'all', 'vip_only'
  slow_mode_seconds INTEGER NOT NULL DEFAULT 0,
  active_offer_id TEXT DEFAULT 'off_credit_ai_suite',
  lower_third_headline TEXT DEFAULT 'LIVE NOW · RJ BUSINESS SOLUTIONS',
  lower_third_subline TEXT DEFAULT 'Rick Jefferson, CEO · Autonomous Enterprise Systems',
  live_frame_data TEXT DEFAULT '',
  live_frame_updated_at INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE ppv_unlocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, stream_id)
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  stream_id TEXT DEFAULT '',
  type TEXT NOT NULL, -- 'vip_subscription', 'executive_subscription', 'ppv_ticket', 'superchat_tip', 'offer_purchase', 'creator_payout'
  amount_cents INTEGER NOT NULL,
  discount_code TEXT DEFAULT '',
  discount_cents INTEGER NOT NULL DEFAULT 0,
  affiliate_code TEXT DEFAULT '',
  payment_method TEXT NOT NULL, -- 'stripe_card', 'zelle', 'wire', 'wallet'
  payment_reference TEXT DEFAULT '',
  settlement_status TEXT NOT NULL DEFAULT 'settled', -- 'settled', 'pending_verification', 'refunded'
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  user_tier TEXT NOT NULL,
  message TEXT NOT NULL,
  is_superchat INTEGER NOT NULL DEFAULT 0,
  tip_amount_cents INTEGER NOT NULL DEFAULT 0,
  gift_type TEXT DEFAULT '', -- '', '🔥 Fire', '💎 Diamond', '🚀 Rocket', '👑 Crown', '🏛️ Empire'
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE stream_polls (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL, -- JSON array of {id, label, votes}
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'closed'
  total_votes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE stream_poll_votes (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(poll_id, user_id)
);

CREATE TABLE stream_qa (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_tier TEXT NOT NULL,
  question TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'answered', 'featured'
  answer_note TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE stream_offers (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  badge_text TEXT NOT NULL DEFAULT '🔥 LIVE FLASH DROP',
  price_cents INTEGER NOT NULL,
  compare_at_cents INTEGER NOT NULL DEFAULT 0,
  cta_text TEXT NOT NULL DEFAULT 'Buy Instant Access',
  external_url TEXT DEFAULT '',
  sales_count INTEGER NOT NULL DEFAULT 0,
  inventory_left INTEGER NOT NULL DEFAULT 25,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE promo_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  discount_percent INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1000,
  uses_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE affiliates (
  code TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  commission_percent INTEGER NOT NULL DEFAULT 20,
  clicks_count INTEGER NOT NULL DEFAULT 0,
  conversions_count INTEGER NOT NULL DEFAULT 0,
  total_commission_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE workflow_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL, -- 'user.registered', 'subscription.activated', 'ppv.unlocked', 'superchat.sent', 'offer.purchased', 'stream.started'
  action_type TEXT NOT NULL, -- 'crm_webhook_and_tag', 'vip_access_and_invoice', 'stage_alert_and_goal', 'fulfill_offer_and_email', 'notify_subscribers'
  webhook_url TEXT DEFAULT 'https://services.leadconnectorhq.com/hooks/rj-stream-live-sync',
  config_json TEXT DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  runs_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'webhook_dispatched', 'failed'
  steps_executed TEXT NOT NULL,
  payload_summary TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 42,
  created_at TEXT NOT NULL
);

CREATE TABLE webrtc_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- ============================================================================
-- SEED DATA: USERS, STREAMS, OFFERS, POLLS, Q&A, PROMOS, AFFILIATES, WORKFLOWS
-- ============================================================================

INSERT INTO users (id, email, name, password_hash, role, subscription_tier, subscription_status, wallet_balance_cents, referral_code, referred_by, is_muted, created_at) VALUES
  ('usr_rick_admin', 'rick@rjbusinesssolutions.org', 'Rick Jefferson (CEO & Broadcaster)', 'e3b98a4da31a127d4bde6e43033f66ba274cab0eb7eb1c70ec41402bf6273dd8', 'creator', 'executive_annual', 'active', 345000, 'RICKCEO', '', 0, '2026-10-17T15:00:00Z'),
  ('usr_vip_member', 'vip@rjbusinesssolutions.org', 'Marcus Vance (VIP Member)', 'e3b98a4da31a127d4bde6e43033f66ba274cab0eb7eb1c70ec41402bf6273dd8', 'vip', 'vip_monthly', 'active', 50000, 'MARCUSVIP', 'RICKCEO', 0, '2026-10-17T15:00:00Z'),
  ('usr_free_viewer', 'viewer@rjbusinesssolutions.org', 'Jordan Taylor (Free Account)', 'e3b98a4da31a127d4bde6e43033f66ba274cab0eb7eb1c70ec41402bf6273dd8', 'viewer', 'free', 'inactive', 0, 'JORDAN26', 'RICKCEO', 0, '2026-10-17T15:00:00Z');

INSERT INTO streams (
  id, slug, title, description, category, creator_id, creator_name, access_tier, ppv_price_cents, status,
  stream_key, whip_url, whep_url, hls_url, vod_url, viewer_count, peak_viewers, total_tips_cents,
  tip_goal_cents, tip_goal_title, pinned_message, chat_mode, slow_mode_seconds, active_offer_id,
  lower_third_headline, lower_third_subline, started_at, created_at
) VALUES
  (
    'str_sovereign_keynote',
    'sovereign-ai-credit-keynote',
    'LIVE: Building Sovereign AI & Credit Automation Systems in 2026',
    'Open live broadcast with Rick Jefferson covering autonomous multi-agent architectures, Cloudflare edge systems, and enterprise automation workflows.',
    'AI & Enterprise Systems',
    'usr_rick_admin',
    'Rick Jefferson, CEO',
    'free',
    0,
    'live',
    'rj_live_key_free_99481a',
    '',
    '',
    '',
    'https://rj-stream-live.rickjefferson.workers.dev/watch?replay=str_sovereign_keynote',
    184,
    340,
    68500,
    150000,
    'Keynote Tip Goal: Release Open-Source Prompt & Workflow Pack at $1,500',
    '📌 Welcome! Use Promo Code RICK2026 for 20% off VIP or grab the In-Stream Flash Drop below the video player!',
    'all',
    0,
    'off_credit_ai_suite',
    'LIVE KEYNOTE · OPEN BROADCAST',
    'Rick Jefferson, CEO · RJ Business Solutions · https://rjbusinesssolutions.org',
    '2026-10-17T15:30:00Z',
    '2026-10-17T15:00:00Z'
  ),
  (
    'str_vip_mastermind',
    'vip-credit-underwriting-mastermind',
    'VIP ONLY: High-Ticket Credit Architecture, Underwriting & Funding Blueprints',
    'Exclusive live implementation lab for RJ Business Solutions VIP Subscribers. Live walkthrough of underwriting matrices, Metro 2 compliance automation, and SaaS scaling.',
    'VIP Mastermind',
    'usr_rick_admin',
    'Rick Jefferson, CEO',
    'vip',
    2900,
    'live',
    'rj_live_key_vip_77219b',
    '',
    '',
    '',
    'https://rj-stream-live.rickjefferson.workers.dev/watch?replay=str_vip_mastermind',
    96,
    190,
    112000,
    200000,
    'VIP Lab Goal: Unlock Live 1-on-1 Underwriting Deal Tear-Down',
    '📌 VIP INNER CIRCLE: Download today''s underwriting templates from the Flash Offer banner and submit your questions in the Q&A tab!',
    'vip_only',
    0,
    'off_vip_mentorship',
    'VIP SUBSCRIBERS ONLY · INNER CIRCLE LAB',
    'Upgrade to VIP Membership ($29/mo) for Full Uncut Stream & Replay Vault',
    '2026-10-17T15:45:00Z',
    '2026-10-17T15:00:00Z'
  ),
  (
    'str_ppv_summit',
    'executive-autonomous-swarm-summit-ppv',
    'PAY-PER-VIEW: 222-Agent & 416-Skill Sovereign Empire Buildout (Live BootCamp)',
    'Special ticketed live event ($49.00 Pay-Per-View or Included in Executive Annual). Watch Rick build, wire, and monetize a full-stack enterprise platform from scratch.',
    'Pay-Per-View Event',
    'usr_rick_admin',
    'Rick Jefferson, CEO',
    'ppv',
    4900,
    'live',
    'rj_live_key_ppv_55103c',
    '',
    '',
    '',
    'https://rj-stream-live.rickjefferson.workers.dev/watch?replay=str_ppv_summit',
    74,
    145,
    145000,
    250000,
    'PPV Summit Goal: Live White-Label SaaS Repo Drop for All Ticket Holders',
    '📌 PPV BOOTCAMP: All ticket holders receive lifetime VOD replay + full GitHub repository access.',
    'all',
    0,
    'off_whitelabel_empire',
    'PAY-PER-VIEW SPECIAL EVENT · LIVE BUILD',
    'Instant Ticket Unlock ($49.00) or Included with Executive Annual Pass',
    '2026-10-17T16:00:00Z',
    '2026-10-17T15:00:00Z'
  );

-- Seed In-Stream Commerce & Flash Offer Drops
INSERT INTO stream_offers (id, stream_id, title, subtitle, badge_text, price_cents, compare_at_cents, cta_text, external_url, sales_count, inventory_left, is_active, created_at) VALUES
  ('off_credit_ai_suite', 'str_sovereign_keynote', 'RJ Sovereign Credit & AI Automation Turnkey System', 'Complete D1 + Cloudflare Workers + GHL CRM Automation Blueprint & Templates', '🔥 LIVE FLASH DROP · 50% OFF', 19700, 39700, '⚡ Instant Unlock ($197)', 'https://rjbusinesssolutions.org', 14, 11, 1, '2026-10-17T15:30:00Z'),
  ('off_vip_mentorship', 'str_vip_mastermind', '1-on-1 Executive Architecture & Funding Strategy Session', 'Private 60-minute systems & underwriting audit directly with Rick Jefferson, CEO', '💎 VIP EXCLUSIVE DROP', 49700, 99700, '📞 Book Executive Session ($497)', 'https://rjbusinesssolutions.org', 6, 4, 1, '2026-10-17T15:45:00Z'),
  ('off_whitelabel_empire', 'str_ppv_summit', 'White-Label 222-Agent & 416-Skill Enterprise License', 'Full commercial agency rights + custom domain deployment on your Cloudflare account', '🏛️ EMPIRE LICENSE DROP', 99700, 199700, '👑 Claim Agency License ($997)', 'https://rjbusinesssolutions.org', 5, 5, 1, '2026-10-17T16:00:00Z');

-- Seed Live Interactive Audience Polls
INSERT INTO stream_polls (id, stream_id, question, options_json, status, total_votes, created_at) VALUES
  ('poll_101', 'str_sovereign_keynote', 'Which autonomous revenue system should we build live next?', '[{"id":"opt_1","label":"AI Credit & Underwriting SaaS","votes":68},{"id":"opt_2","label":"GoHighLevel DM & Voice Setter Swarm","votes":49},{"id":"opt_3","label":"White-Label Live Streaming Portal","votes":37}]', 'open', 154, '2026-10-17T15:35:00Z'),
  ('poll_102', 'str_vip_mastermind', 'What is your current monthly agency/business revenue target?', '[{"id":"opt_1","label":"$10k - $25k/mo","votes":28},{"id":"opt_2","label":"$25k - $100k/mo","votes":44},{"id":"opt_3","label":"$100k+/mo Enterprise","votes":19}]', 'open', 91, '2026-10-17T15:50:00Z'),
  ('poll_103', 'str_ppv_summit', 'Which payment rail do you use most for high-ticket closings?', '[{"id":"opt_1","label":"Stripe Checkout & Subscriptions","votes":31},{"id":"opt_2","label":"Zelle & Instant Bank Transfer","votes":24},{"id":"opt_3","label":"Domestic Wire (Wells Fargo)","votes":16}]', 'open', 71, '2026-10-17T16:05:00Z');

-- Seed Live Q&A Queue
INSERT INTO stream_qa (id, stream_id, user_id, user_name, user_tier, question, upvotes, status, answer_note, created_at) VALUES
  ('qa_1', 'str_sovereign_keynote', 'usr_vip_member', 'Marcus Vance (VIP Member)', 'vip_monthly', 'Can we connect the automated workflows directly to our GoHighLevel sub-accounts via webhook?', 24, 'answered', 'Answered Live: Yes! Every workflow rule supports custom GHL Inbound Webhook URLs with full JSON payload delivery.', '2026-10-17T15:38:00Z'),
  ('qa_2', 'str_sovereign_keynote', 'usr_free_viewer', 'Jordan Taylor', 'free', 'If I upgrade to Executive Annual ($299/yr), does it immediately unlock the $49 Pay-Per-View Bootcamp room too?', 19, 'queued', '', '2026-10-17T15:42:00Z'),
  ('qa_3', 'str_vip_mastermind', 'usr_vip_member', 'Elena Rostova (VIP)', 'vip_monthly', 'How do we white-label this live streaming + paywall stack for our own coaching clients?', 31, 'queued', '', '2026-10-17T15:55:00Z');

-- Seed Promo / Discount Codes
INSERT INTO promo_codes (code, description, discount_percent, max_uses, uses_count, is_active, created_at) VALUES
  ('RICK2026', 'CEO Launch Special — 20% Off Any VIP, Executive, or PPV Purchase', 20, 500, 18, 1, '2026-10-17T15:00:00Z'),
  ('VIP50', 'Half-Off First Month VIP Flash Promo (50% Off)', 50, 100, 9, 1, '2026-10-17T15:00:00Z'),
  ('EMPIRE25', 'Sovereign Empire Builder — 25% Off Executive Annual & Offers', 25, 250, 7, 1, '2026-10-17T15:00:00Z');

-- Seed Affiliate Partners & Referral Tracking
INSERT INTO affiliates (code, owner_user_id, owner_name, commission_percent, clicks_count, conversions_count, total_commission_cents, created_at) VALUES
  ('RICKCEO', 'usr_rick_admin', 'Rick Jefferson Official Partner Link', 20, 412, 28, 38400, '2026-10-17T15:00:00Z'),
  ('MARCUSVIP', 'usr_vip_member', 'Marcus Vance (VIP Affiliate)', 20, 94, 7, 9620, '2026-10-17T15:10:00Z'),
  ('EMPIREPARTNER', 'usr_rick_admin', 'RJ Growth Network Syndicate', 25, 165, 11, 21500, '2026-10-17T15:20:00Z');

-- Seed Automated Event Workflows
INSERT INTO workflow_rules (id, name, trigger_event, action_type, webhook_url, config_json, is_active, runs_count, last_run_at, created_at) VALUES
  ('wf_user_signup', 'New Viewer Onboarding + GHL Lead Sync', 'user.registered', 'crm_webhook_and_tag', 'https://services.leadconnectorhq.com/hooks/rj-viewer-onboarding', '{"crm_tag":"RJ-STREAM-VIEWER","send_welcome":true}', 1, 14, '2026-10-17T15:45:00Z', '2026-10-17T15:00:00Z'),
  ('wf_sub_activated', 'VIP / Executive Pass Provisioning + Invoice + Affiliate Credit', 'subscription.activated', 'vip_access_and_invoice', 'https://services.leadconnectorhq.com/hooks/rj-vip-activated', '{"crm_tag":"RJ-PAID-VIP","auto_invoice":true,"credit_affiliate":true}', 1, 9, '2026-10-17T15:52:00Z', '2026-10-17T15:00:00Z'),
  ('wf_ppv_unlocked', 'Pay-Per-View Event Ticket Unlock + Replay Vault Grant', 'ppv.unlocked', 'vip_access_and_invoice', 'https://services.leadconnectorhq.com/hooks/rj-ppv-ticket', '{"crm_tag":"RJ-PPV-BUYER","grant_vod_replay":true}', 1, 6, '2026-10-17T15:56:00Z', '2026-10-17T15:00:00Z'),
  ('wf_superchat_alert', 'SuperChat & Virtual Gift Stage Alert + Tip Goal Milestone', 'superchat.sent', 'stage_alert_and_goal', 'https://services.leadconnectorhq.com/hooks/rj-superchat-vip', '{"pin_to_chat":true,"update_tip_goal":true}', 1, 19, '2026-10-17T16:02:00Z', '2026-10-17T15:00:00Z'),
  ('wf_offer_purchased', 'In-Stream Flash Offer Fulfillment + Executive Receipt', 'offer.purchased', 'fulfill_offer_and_email', 'https://services.leadconnectorhq.com/hooks/rj-offer-buyer', '{"decrement_inventory":true,"issue_license_receipt":true}', 1, 11, '2026-10-17T16:04:00Z', '2026-10-17T15:00:00Z');

-- Seed Initial Workflow Execution Logs
INSERT INTO workflow_runs (id, workflow_id, workflow_name, trigger_event, actor_name, status, steps_executed, payload_summary, duration_ms, created_at) VALUES
  ('wfr_101', 'wf_sub_activated', 'VIP / Executive Pass Provisioning + Invoice + Affiliate Credit', 'subscription.activated', 'Marcus Vance (VIP Member)', 'completed', '1. Upgraded D1 role=vip -> 2. Generated Invoice #tx_101 -> 3. Credited Affiliate RICKCEO -> 4. Dispatched CRM Tag [RJ-PAID-VIP]', '{"tier":"vip_monthly","amount_usd":29.00,"payment_method":"stripe_card"}', 38, '2026-10-17T15:10:02Z'),
  ('wfr_102', 'wf_superchat_alert', 'SuperChat & Virtual Gift Stage Alert + Tip Goal Milestone', 'superchat.sent', 'Marcus Vance (VIP Member)', 'completed', '1. Highlighted SuperChat in chat_messages -> 2. Updated stream tip goal (+$50.00) -> 3. Triggered Stage Alert Banner', '{"stream_id":"str_sovereign_keynote","tip_usd":50.00,"gift":"🚀 Rocket"}', 29, '2026-10-17T15:40:01Z'),
  ('wfr_103', 'wf_offer_purchased', 'In-Stream Flash Offer Fulfillment + Executive Receipt', 'offer.purchased', 'Devon Brooks (Executive)', 'completed', '1. Verified payment ($197.00) -> 2. Decremented offer inventory -> 3. Issued Instant Download & Executive Invoice #tx_105', '{"offer_id":"off_credit_ai_suite","amount_usd":197.00}', 44, '2026-10-17T16:04:10Z');

-- Seed Initial Transactions
INSERT INTO transactions (id, user_id, user_name, stream_id, type, amount_cents, discount_code, discount_cents, affiliate_code, payment_method, payment_reference, settlement_status, note, created_at) VALUES
  ('tx_101', 'usr_vip_member', 'Marcus Vance (VIP Member)', 'str_vip_mastermind', 'vip_subscription', 2900, '', 0, 'RICKCEO', 'stripe_card', 'ch_3Q9xRjStream101', 'settled', 'VIP Monthly All-Access Subscription', '2026-10-17T15:10:00Z'),
  ('tx_102', 'usr_vip_member', 'Marcus Vance (VIP Member)', 'str_sovereign_keynote', 'superchat_tip', 5000, '', 0, '', 'stripe_card', 'ch_3Q9xRjStream102', 'settled', '🚀 Rocket Gift + SuperChat: Incredible breakdown on the 222-agent Cloudroom setup Rick!! 🔥', '2026-10-17T15:40:00Z'),
  ('tx_103', 'usr_rick_admin', 'Devon Brooks (Executive)', 'str_ppv_summit', 'ppv_ticket', 4900, '', 0, 'RICKCEO', 'stripe_card', 'ch_3Q9xRjStream103', 'settled', 'PPV Live Event Ticket — 222-Agent Buildout', '2026-10-17T15:52:00Z'),
  ('tx_104', 'usr_vip_member', 'Elena Rostova (VIP)', 'str_vip_mastermind', 'superchat_tip', 10000, '', 0, '', 'zelle', 'ZELLE-9948120', 'settled', '👑 Crown Gift + SuperChat: Thank you for the underwriting automation blueprint!', '2026-10-17T15:58:00Z'),
  ('tx_105', 'usr_vip_member', 'Devon Brooks (Executive)', 'str_sovereign_keynote', 'offer_purchase', 19700, 'RICK2026', 4925, 'MARCUSVIP', 'stripe_card', 'ch_3Q9xRjStream105', 'settled', 'In-Stream Flash Drop: RJ Sovereign Credit & AI Automation Turnkey System', '2026-10-17T16:04:00Z'),
  ('tx_106', 'usr_rick_admin', 'Sterling Capital Group', 'str_ppv_summit', 'executive_subscription', 29900, '', 0, 'RICKCEO', 'wire', 'WF-WIRE-8839201', 'settled', 'Executive Annual All-Access + All PPV Unlocks (Wells Fargo Wire)', '2026-10-17T16:08:00Z');

-- Seed Initial Live Chat Messages
INSERT INTO chat_messages (id, stream_id, user_id, user_name, user_role, user_tier, message, is_superchat, tip_amount_cents, gift_type, is_pinned, is_deleted, created_at) VALUES
  ('msg_1', 'str_sovereign_keynote', 'usr_rick_admin', 'Rick Jefferson (CEO & Broadcaster)', 'creator', 'executive_annual', 'Welcome everyone to RJ Stream Live! Vote in the live poll, drop your questions in the Q&A tab, or grab the 50% off Flash Drop below the stage.', 0, 0, '', 1, 0, '2026-10-17T15:31:00Z'),
  ('msg_2', 'str_sovereign_keynote', 'usr_vip_member', 'Marcus Vance (VIP Member)', 'vip', 'vip_monthly', 'Incredible breakdown on the 222-agent Cloudroom setup Rick!! 🔥', 1, 5000, '🚀 Rocket', 0, 0, '2026-10-17T15:40:00Z'),
  ('msg_3', 'str_sovereign_keynote', 'usr_free_viewer', 'Jordan Taylor (Free Account)', 'viewer', 'free', 'Watching from Austin TX! Just used promo code RICK2026 — upgrading to VIP right now so I can join the Underwriting Mastermind room.', 0, 0, '', 0, 0, '2026-10-17T15:44:00Z'),
  ('msg_4', 'str_vip_mastermind', 'usr_rick_admin', 'Rick Jefferson (CEO & Broadcaster)', 'creator', 'executive_annual', 'VIP Inner Circle: We are walking through the deterministic credit & underwriting workflows step-by-step.', 0, 0, '', 1, 0, '2026-10-17T15:46:00Z'),
  ('msg_5', 'str_vip_mastermind', 'usr_vip_member', 'Marcus Vance (VIP Member)', 'vip', 'vip_monthly', 'Audio and video are crystal clear on the VIP stream. Taking notes!', 0, 0, '💎 Diamond', 0, 0, '2026-10-17T15:50:00Z'),
  ('msg_6', 'str_ppv_summit', 'usr_rick_admin', 'Rick Jefferson (CEO & Broadcaster)', 'creator', 'executive_annual', 'Welcome to the Pay-Per-View Live Bootcamp! Full source code and agent prompts are linked in the In-Stream Offer Drop below.', 0, 0, '', 1, 0, '2026-10-17T16:01:00Z');

-- ============================================================================
-- v3.0 TABLES: INTEGRATIONS HUB & WHITE-LABEL COMMERCIAL SAAS TENANTS
-- ============================================================================

CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  provider TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected', -- 'connected', 'ready'
  endpoint_or_key TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  tests_count INTEGER NOT NULL DEFAULT 1,
  last_tested_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE saas_tenants (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  brand_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  custom_domain TEXT NOT NULL,
  logo_url TEXT NOT NULL,
  primary_color TEXT NOT NULL DEFAULT '#2563eb',
  plan_tier TEXT NOT NULL DEFAULT 'agency_pro', -- 'creator_starter', 'agency_pro', 'whitelabel_empire'
  monthly_price_cents INTEGER NOT NULL DEFAULT 29700,
  status TEXT NOT NULL DEFAULT 'active',
  transaction_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

INSERT INTO integrations (id, name, category, provider, description, status, endpoint_or_key, config_json, is_enabled, tests_count, last_tested_at, created_at) VALUES
  ('int_stripe', 'Stripe Checkout, Subscriptions & Apple/Google Pay', 'Payments & Billing', 'Stripe', 'Processes instant VIP/Executive recurring subscriptions, PPV tickets, SuperChats, Virtual Gifts, and Flash Offers.', 'connected', 'pk_live_51RjStreamSovereignKey • Webhook Active', '{"currency":"USD","apple_pay":true,"google_pay":true,"auto_tax":true}', 1, 42, '2026-10-17T16:10:00Z', '2026-10-17T15:00:00Z'),
  ('int_ghl_crm', 'GoHighLevel (GHL) & LeadConnector CRM Sync', 'CRM & Funnels', 'GoHighLevel', 'Automatically tags new viewers, VIP buyers, PPV ticket holders, and Flash Offer customers in GoHighLevel pipelines.', 'connected', 'https://services.leadconnectorhq.com/hooks/rj-stream-master', '{"location_id":"qQnxRHDtyx0uydPd5sRl","auto_opportunity":true}', 1, 38, '2026-10-17T16:11:00Z', '2026-10-17T15:00:00Z'),
  ('int_cf_stream', 'Cloudflare Stream & Sub-Second WebRTC WHIP/WHEP', 'Video & Edge CDN', 'Cloudflare Stream', 'Global edge ingest (WHIP/RTMP) and sub-second WebRTC/HLS playback with automatic cloud VOD recording.', 'connected', 'rtmps://live.cloudflare.com:443/live/rj_live_key_free_99481a', '{"low_latency_whep":true,"auto_record_vod":true}', 1, 29, '2026-10-17T16:12:00Z', '2026-10-17T15:00:00Z'),
  ('int_restream', 'Multi-Platform Simulcast (YouTube, TikTok, X, LinkedIn)', 'Simulcast Relay', 'Restream / RTMP', 'Simultaneously broadcasts your public teaser stream to YouTube Live, TikTok Live, X/Twitter, and LinkedIn Live.', 'connected', 'rtmp://live.restream.io/live/re_rj_simulcast_8821', '{"youtube":true,"tiktok":true,"twitter_x":true,"linkedin":true}', 1, 19, '2026-10-17T16:13:00Z', '2026-10-17T15:00:00Z'),
  ('int_twilio_resend', 'Twilio SMS & Resend Email "We Are LIVE" Blasts', 'SMS & Email Alerts', 'Twilio + Resend', 'Sends 1-click instant SMS text alerts and executive HTML emails to all registered viewers when you go live.', 'connected', 'From: +1 (505) 555-0199 & live@rjbusinesssolutions.org', '{"sms_enabled":true,"email_enabled":true,"vip_priority":true}', 1, 24, '2026-10-17T16:14:00Z', '2026-10-17T15:00:00Z'),
  ('int_obs_zoom', 'OBS Studio, Streamlabs & Zoom Live Bridge', 'Broadcast Encoders', 'OBS / Zoom', 'One-click RTMP/WHIP encoder profile for OBS Studio 31+, Streamlabs Desktop, and Zoom Custom Live Streaming.', 'connected', 'Server: rtmps://live.cloudflare.com:443/live/', '{"bitrate_kbps":6000,"keyframe_interval":2,"resolution":"1080p60"}', 1, 31, '2026-10-17T16:15:00Z', '2026-10-17T15:00:00Z'),
  ('int_shopify_vault', 'Digital Product Vault & E-Commerce Fulfillment', 'Commerce & Courses', 'RJ Vault / Shopify', 'Instantly delivers digital downloads, course logins, and license keys when viewers buy an In-Stream Flash Offer.', 'connected', 'https://rjbusinesssolutions.org/vault/fulfill', '{"instant_license_key":true,"auto_invoice_pdf":true}', 1, 17, '2026-10-17T16:16:00Z', '2026-10-17T15:00:00Z'),
  ('int_ai_cohost', 'RJ Cloudroom 222-Agent & 416-Skill AI Co-Host', 'Autonomous AI Swarm', 'RJ Cloudroom Core', 'Live AI Co-Host that posts real-time takeaways in chat, answers viewer Q&A, drops conversion CTAs, and writes titles.', 'connected', 'https://rj-cloudroom-core.rickjefferson.workers.dev/api/execute', '{"auto_summarize":true,"answer_qa":true,"sales_closer_mode":true}', 1, 53, '2026-10-17T16:17:00Z', '2026-10-17T15:00:00Z');

INSERT INTO saas_tenants (id, slug, brand_name, owner_name, owner_email, custom_domain, logo_url, primary_color, plan_tier, monthly_price_cents, status, transaction_id, created_at) VALUES
  ('ten_rj_flagship', 'rj-flagship', 'RJ Business Solutions Live', 'Rick Jefferson, CEO', 'rick@rjbusinesssolutions.org', 'stream.rjbusinesssolutions.org', 'https://storage.googleapis.com/msgsndr/qQnxRHDtyx0uydPd5sRl/media/67eb83c5e519ed689430646b.jpeg', '#2563eb', 'whitelabel_empire', 99700, 'active', 'tx_106', '2026-10-17T15:00:00Z'),
  ('ten_apex_credit', 'apex-credit-academy', 'Apex Credit & Funding Academy TV', 'Marcus Vance', 'marcus@apexcreditacademy.com', 'live.apexcreditacademy.com', 'https://storage.googleapis.com/msgsndr/qQnxRHDtyx0uydPd5sRl/media/67eb83c5e519ed689430646b.jpeg', '#1e3a8a', 'agency_pro', 29700, 'active', 'tx_101', '2026-10-17T15:30:00Z'),
  ('ten_sovereign_wealth', 'sovereign-wealth-network', 'Sovereign Wealth & AI Broadcast Network', 'Devon Brooks', 'devon@sovereignwealth.io', 'tv.sovereignwealth.io', 'https://storage.googleapis.com/msgsndr/qQnxRHDtyx0uydPd5sRl/media/67eb83c5e519ed689430646b.jpeg', '#0ea5e9', 'whitelabel_empire', 99700, 'active', 'tx_105', '2026-10-17T16:00:00Z');

