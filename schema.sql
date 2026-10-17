-- ============================================================================
-- RJ STREAM LIVE — Sovereign Live Streaming & Paid Subscriber Platform Schema
-- Engineered for Rick Jefferson | RJ Business Solutions
-- ============================================================================

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
  rtmp_url TEXT DEFAULT 'rtmps://live.cloudflare.com:443/live/',
  viewer_count INTEGER NOT NULL DEFAULT 1,
  peak_viewers INTEGER NOT NULL DEFAULT 1,
  total_tips_cents INTEGER NOT NULL DEFAULT 0,
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
  type TEXT NOT NULL, -- 'vip_subscription', 'executive_subscription', 'ppv_ticket', 'superchat_tip'
  amount_cents INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
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

-- Seed Default Accounts (Creator Admin, Paid VIP Subscriber, Free Viewer)
-- Default password for all demo accounts: rj2026live (hash: sha256('rj-salt-2026:rj2026live'))
INSERT INTO users (id, email, name, password_hash, role, subscription_tier, subscription_status, wallet_balance_cents, created_at) VALUES
  ('usr_rick_admin', 'rick@rjbusinesssolutions.org', 'Rick Jefferson (CEO & Broadcaster)', 'e3b98a4da31a127d4bde6e43033f66ba274cab0eb7eb1c70ec41402bf6273dd8', 'creator', 'executive_annual', 'active', 250000, '2026-10-17T15:00:00Z'),
  ('usr_vip_member', 'vip@rjbusinesssolutions.org', 'Marcus Vance (VIP Member)', 'e3b98a4da31a127d4bde6e43033f66ba274cab0eb7eb1c70ec41402bf6273dd8', 'vip', 'vip_monthly', 'active', 50000, '2026-10-17T15:00:00Z'),
  ('usr_free_viewer', 'viewer@rjbusinesssolutions.org', 'Jordan Taylor (Free Account)', 'e3b98a4da31a127d4bde6e43033f66ba274cab0eb7eb1c70ec41402bf6273dd8', 'viewer', 'free', 'inactive', 0, '2026-10-17T15:00:00Z');

-- Seed Live & Monetized Streams
INSERT INTO streams (
  id, slug, title, description, category, creator_id, creator_name, access_tier, ppv_price_cents, status,
  stream_key, whip_url, whep_url, hls_url, viewer_count, peak_viewers, total_tips_cents,
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
    148,
    312,
    18500,
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
    84,
    165,
    42000,
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
    62,
    119,
    74500,
    'PAY-PER-VIEW SPECIAL EVENT · LIVE BUILD',
    'Instant Ticket Unlock ($49.00) or Included with Executive Annual Pass',
    '2026-10-17T16:00:00Z',
    '2026-10-17T15:00:00Z'
  );

-- Seed Initial Transactions
INSERT INTO transactions (id, user_id, user_name, stream_id, type, amount_cents, payment_method, note, created_at) VALUES
  ('tx_101', 'usr_vip_member', 'Marcus Vance (VIP Member)', 'str_vip_mastermind', 'vip_subscription', 2900, 'stripe_card', 'VIP Monthly All-Access Subscription', '2026-10-17T15:10:00Z'),
  ('tx_102', 'usr_vip_member', 'Marcus Vance (VIP Member)', 'str_sovereign_keynote', 'superchat_tip', 5000, 'stripe_card', 'Incredible breakdown on the 222-agent Cloudroom setup Rick!! 🔥', '2026-10-17T15:40:00Z'),
  ('tx_103', 'usr_rick_admin', 'Devon Brooks (Executive)', 'str_ppv_summit', 'ppv_ticket', 4900, 'stripe_card', 'PPV Live Event Ticket — 222-Agent Buildout', '2026-10-17T15:52:00Z'),
  ('tx_104', 'usr_vip_member', 'Elena Rostova (VIP)', 'str_vip_mastermind', 'superchat_tip', 10000, 'zelle', 'Thank you for the underwriting automation blueprint!', '2026-10-17T15:58:00Z');

-- Seed Initial Live Chat Messages
INSERT INTO chat_messages (id, stream_id, user_id, user_name, user_role, user_tier, message, is_superchat, tip_amount_cents, created_at) VALUES
  ('msg_1', 'str_sovereign_keynote', 'usr_rick_admin', 'Rick Jefferson (CEO & Broadcaster)', 'creator', 'executive_annual', 'Welcome everyone to RJ Stream Live! Drop your questions in the chat — VIP and PPV rooms are also open.', 0, 0, '2026-10-17T15:31:00Z'),
  ('msg_2', 'str_sovereign_keynote', 'usr_vip_member', 'Marcus Vance (VIP Member)', 'vip', 'vip_monthly', 'Incredible breakdown on the 222-agent Cloudroom setup Rick!! 🔥', 1, 5000, '2026-10-17T15:40:00Z'),
  ('msg_3', 'str_sovereign_keynote', 'usr_free_viewer', 'Jordan Taylor (Free Account)', 'viewer', 'free', 'Watching from Austin TX! Upgrading to VIP right now so I can join the Underwriting Mastermind room.', 0, 0, '2026-10-17T15:44:00Z'),
  ('msg_4', 'str_vip_mastermind', 'usr_rick_admin', 'Rick Jefferson (CEO & Broadcaster)', 'creator', 'executive_annual', 'VIP Inner Circle: We are walking through the deterministic credit & underwriting workflows step-by-step.', 0, 0, '2026-10-17T15:46:00Z'),
  ('msg_5', 'str_vip_mastermind', 'usr_vip_member', 'Marcus Vance (VIP Member)', 'vip', 'vip_monthly', 'Audio and video are crystal clear on the VIP stream. Taking notes!', 0, 0, '2026-10-17T15:50:00Z'),
  ('msg_6', 'str_ppv_summit', 'usr_rick_admin', 'Rick Jefferson (CEO & Broadcaster)', 'creator', 'executive_annual', 'Welcome to the Pay-Per-View Live Bootcamp! Full source code and agent prompts are linked below the player.', 0, 0, '2026-10-17T16:01:00Z');
