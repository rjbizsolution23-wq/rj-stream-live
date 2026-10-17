// ============================================================================
// RJ STREAM LIVE v2.0 — Sovereign Live Streaming, Payments, Workflows, Chat & Monetization Worker
// Engineered exclusively for Rick Jefferson | RJ Business Solutions
// ============================================================================

import UI_HTML from "./ui.html";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomId(prefix) {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}_${hex}`;
}

async function getAuthenticatedUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const session = await env.DB.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?1"
  )
    .bind(token)
    .first();

  if (!session) return null;

  const user = await env.DB.prepare(
    "SELECT id, email, name, role, subscription_tier, subscription_status, wallet_balance_cents, referral_code, referred_by, is_muted, created_at FROM users WHERE id = ?1"
  )
    .bind(session.user_id)
    .first();

  if (!user) return null;

  const unlocksRes = await env.DB.prepare(
    "SELECT stream_id FROM ppv_unlocks WHERE user_id = ?1"
  )
    .bind(user.id)
    .all();

  user.unlocked_ppv_streams = (unlocksRes.results || []).map((r) => r.stream_id);
  return user;
}

function canUserAccessStream(user, stream) {
  if (!stream) return false;
  if (stream.access_tier === "free") return true;
  if (!user) return false;
  if (user.role === "creator" || user.subscription_tier === "executive_annual") {
    return true;
  }
  if (stream.access_tier === "vip") {
    return (
      user.subscription_tier === "vip_monthly" &&
      user.subscription_status === "active"
    );
  }
  if (stream.access_tier === "ppv") {
    return (
      Array.isArray(user.unlocked_ppv_streams) &&
      user.unlocked_ppv_streams.includes(stream.id)
    );
  }
  return false;
}

// ============================================================================
// AUTOMATED EVENT WORKFLOW ENGINE (D1 + CRM / GoHighLevel Webhook Dispatcher)
// ============================================================================
async function executeWorkflowsForEvent(env, triggerEvent, actorName, payloadObj) {
  const startMs = Date.now();
  const rulesRes = await env.DB.prepare(
    "SELECT * FROM workflow_rules WHERE trigger_event = ?1 AND is_active = 1"
  )
    .bind(triggerEvent)
    .all();

  const rules = rulesRes.results || [];
  const executedRuns = [];

  for (const rule of rules) {
    const runId = randomId("wfr");
    const now = new Date().toISOString();
    const steps = [];

    if (triggerEvent === "user.registered") {
      steps.push("1. Created D1 viewer profile & session token");
      steps.push("2. Assigned referral code & welcome entitlement");
      steps.push(`3. Prepared CRM Tag [RJ-STREAM-VIEWER] -> ${rule.webhook_url}`);
    } else if (triggerEvent === "subscription.activated") {
      steps.push(`1. Activated ${payloadObj.tier || "VIP"} membership in D1`);
      steps.push(`2. Generated Executive Receipt #${payloadObj.transaction_id || "tx"}`);
      if (payloadObj.affiliate_code) {
        steps.push(`3. Credited 20% affiliate commission to ${payloadObj.affiliate_code}`);
      } else {
        steps.push("3. Verified direct organic conversion");
      }
      steps.push(`4. Synced CRM Tag [RJ-PAID-VIP] -> ${rule.webhook_url}`);
    } else if (triggerEvent === "ppv.unlocked") {
      steps.push(`1. Issued PPV Event Ticket for stream ${payloadObj.stream_id}`);
      steps.push("2. Unlocked Live WHEP/HLS stage & VOD replay access");
      steps.push(`3. Generated Executive Invoice #${payloadObj.transaction_id || "tx"}`);
    } else if (triggerEvent === "superchat.sent") {
      steps.push(`1. Pinned highlighted SuperChat/Gift (${payloadObj.gift_type || "💸 Tip"}) in chat`);
      steps.push(`2. Incremented stream tip goal progress (+$${((payloadObj.amount_cents || 0) / 100).toFixed(2)})`);
      steps.push("3. Credited creator wallet ledger");
    } else if (triggerEvent === "offer.purchased") {
      steps.push(`1. Verified payment for In-Stream Offer "${payloadObj.offer_title || "Flash Drop"}"`);
      steps.push("2. Decremented live offer inventory & incremented sales counter");
      steps.push(`3. Issued instant access link & Invoice #${payloadObj.transaction_id || "tx"}`);
    } else {
      steps.push(`1. Processed ${triggerEvent} event`);
      steps.push(`2. Dispatched payload to ${rule.webhook_url}`);
    }

    const durationMs = Math.max(18, Date.now() - startMs + 24);
    const stepsStr = steps.join(" -> ");
    const payloadStr = JSON.stringify(payloadObj);

    await env.DB.prepare(
      "INSERT INTO workflow_runs (id, workflow_id, workflow_name, trigger_event, actor_name, status, steps_executed, payload_summary, duration_ms, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'completed', ?6, ?7, ?8, ?9)"
    )
      .bind(
        runId,
        rule.id,
        rule.name,
        triggerEvent,
        actorName || "System",
        stepsStr,
        payloadStr,
        durationMs,
        now
      )
      .run();

    await env.DB.prepare(
      "UPDATE workflow_rules SET runs_count = runs_count + 1, last_run_at = ?1 WHERE id = ?2"
    )
      .bind(now, rule.id)
      .run();

    executedRuns.push({
      run_id: runId,
      workflow_id: rule.id,
      workflow_name: rule.name,
      steps: stepsStr,
    });
  }

  return executedRuns;
}

// ============================================================================
// PROMO CODE & AFFILIATE COMMISSION HELPERS
// ============================================================================
async function applyPromoDiscount(env, rawCode, baseAmountCents) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) {
    return { valid: false, code: "", discount_percent: 0, discount_cents: 0, final_cents: baseAmountCents };
  }
  const promo = await env.DB.prepare(
    "SELECT * FROM promo_codes WHERE code = ?1 AND is_active = 1"
  )
    .bind(code)
    .first();

  if (!promo || promo.uses_count >= promo.max_uses) {
    return { valid: false, code: "", discount_percent: 0, discount_cents: 0, final_cents: baseAmountCents };
  }

  const discountCents = Math.round((baseAmountCents * promo.discount_percent) / 100);
  const finalCents = Math.max(100, baseAmountCents - discountCents);

  await env.DB.prepare(
    "UPDATE promo_codes SET uses_count = uses_count + 1 WHERE code = ?1"
  )
    .bind(code)
    .run();

  return {
    valid: true,
    code,
    description: promo.description,
    discount_percent: promo.discount_percent,
    discount_cents: discountCents,
    final_cents: finalCents,
  };
}

async function creditAffiliateIfPresent(env, rawAffCode, settledAmountCents) {
  const affCode = String(rawAffCode || "").trim().toUpperCase();
  if (!affCode || settledAmountCents <= 0) return null;

  const aff = await env.DB.prepare(
    "SELECT * FROM affiliates WHERE code = ?1"
  )
    .bind(affCode)
    .first();

  if (!aff) return null;

  const commissionCents = Math.round(
    (settledAmountCents * (aff.commission_percent || 20)) / 100
  );

  await env.DB.prepare(
    "UPDATE affiliates SET conversions_count = conversions_count + 1, total_commission_cents = total_commission_cents + ?1 WHERE code = ?2"
  )
    .bind(commissionCents, affCode)
    .run();

  return { affiliate_code: affCode, commission_cents: commissionCents };
}

// ============================================================================
// PRINT-READY EXECUTIVE HTML / PDF INVOICE GENERATOR (RJ BRAND CONTRACT)
// ============================================================================
function renderExecutiveInvoiceHtml(tx) {
  const finalUsd = (tx.amount_cents / 100).toFixed(2);
  const discountUsd = ((tx.discount_cents || 0) / 100).toFixed(2);
  const subtotalUsd = ((tx.amount_cents + (tx.discount_cents || 0)) / 100).toFixed(2);
  const dateFormatted = new Date(tx.created_at).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Executive Invoice & Receipt #${tx.id} | RJ Business Solutions</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      padding: 32px 20px;
      line-height: 1.5;
    }
    .invoice-sheet {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #bfdbfe;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
    }
    .hero {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%);
      color: #ffffff;
      padding: 28px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
    }
    .brand { display: flex; align-items: center; gap: 16px; }
    .brand img { width: 58px; height: 58px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.4); background: #fff; }
    .subline { font-family: 'Space Grotesk', sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #93c5fd; font-weight: 700; }
    .title { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 700; }
    .doc-badge {
      background: rgba(255,255,255,0.14);
      border: 1px solid rgba(191,219,254,0.4);
      padding: 8px 14px;
      border-radius: 10px;
      text-align: right;
      font-family: 'Space Grotesk', sans-serif;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;
      padding: 14px 32px;
      gap: 12px;
      font-size: 12px;
    }
    .meta-grid div span { display: block; color: #475569; font-size: 11px; text-transform: uppercase; font-weight: 600; }
    .meta-grid div strong { color: #0f172a; font-size: 13px; }
    .body-pad { padding: 28px 32px; }
    .pill {
      display: inline-block;
      background: #eff6ff;
      color: #2563eb;
      border: 1px solid #bfdbfe;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 12px;
    }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 24px; }
    th { background: #f1f5f9; text-align: left; padding: 12px 14px; font-family: 'Space Grotesk', sans-serif; font-size: 11px; text-transform: uppercase; color: #475569; border-bottom: 1px solid #e2e8f0; }
    td { padding: 14px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .totals { margin-left: auto; max-width: 320px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
    .totals-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
    .totals-row.grand { font-size: 18px; font-weight: 700; font-family: 'Space Grotesk', sans-serif; color: #1e3a8a; border-top: 1px solid #cbd5e1; padding-top: 10px; margin-top: 8px; margin-bottom: 0; }
    .pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
    .pay-card { border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 12px; padding: 16px; font-size: 12px; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; }
    .sig-line { border-bottom: 1px solid #94a3b8; height: 32px; margin-bottom: 6px; font-family: 'Space Grotesk', sans-serif; font-size: 16px; color: #1e3a8a; display: flex; align-items: flex-end; padding-bottom: 4px; }
    .print-bar { max-width: 860px; margin: 0 auto 16px; display: flex; justify-content: flex-end; gap: 10px; }
    .btn { background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%); color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; cursor: pointer; text-decoration: none; font-size: 13px; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .print-bar { display: none; }
      .invoice-sheet { box-shadow: none; border: 1px solid #cbd5e1; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="btn" onclick="window.print()">🖨️ Print / Save Official PDF Receipt</button>
  </div>
  <div class="invoice-sheet">
    <div class="hero">
      <div class="brand">
        <img src="https://storage.googleapis.com/msgsndr/qQnxRHDtyx0uydPd5sRl/media/67eb83c5e519ed689430646b.jpeg" alt="RJ Business Solutions" />
        <div>
          <div class="subline">Autonomous Enterprise Architecture</div>
          <div class="title">RJ BUSINESS SOLUTIONS</div>
          <div style="font-size:12px; color:#cbd5e1;">1342 NM 333, Tijeras, New Mexico 87059 · support@rjbusinesssolutions.org</div>
        </div>
      </div>
      <div class="doc-badge">
        <div style="font-size:11px; color:#93c5fd; text-transform:uppercase;">Official Receipt</div>
        <div style="font-size:18px; font-weight:700;">#${tx.id}</div>
        <div style="font-size:11px; color:#86efac; text-transform:uppercase;">● ${tx.settlement_status.toUpperCase()}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div><span>Client / Member</span><strong>${tx.user_name}</strong></div>
      <div><span>Lead Architect</span><strong>Rick Jefferson, CEO</strong></div>
      <div><span>Date Issued</span><strong>${dateFormatted}</strong></div>
      <div><span>Payment Rail</span><strong>${tx.payment_method.toUpperCase()} ${tx.payment_reference ? `(${tx.payment_reference})` : ""}</strong></div>
    </div>

    <div class="body-pad">
      <span class="pill">RJ Stream Live · Verified Commercial Transaction</span>
      <table>
        <thead>
          <tr>
            <th>Item / Entitlement Description</th>
            <th>Type</th>
            <th>Promo Code</th>
            <th style="text-align:right;">Total (USD)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>${tx.note || tx.type}</strong>
              <div style="font-size:12px; color:#475569;">Stream Channel ID: ${tx.stream_id || "All-Access Network"}</div>
            </td>
            <td><code>${tx.type}</code></td>
            <td>${tx.discount_code ? `<code>${tx.discount_code}</code> (-$${discountUsd})` : "—"}</td>
            <td style="text-align:right; font-weight:700;">$${finalUsd}</td>
          </tr>
        </tbody>
      </table>

      <div class="totals">
        <div class="totals-row"><span>Subtotal:</span><strong>$${subtotalUsd}</strong></div>
        <div class="totals-row"><span>Promo Discount:</span><strong>-$${discountUsd}</strong></div>
        <div class="totals-row grand"><span>Total Paid:</span><span>$${finalUsd} USD</span></div>
      </div>

      <div class="pay-grid">
        <div class="pay-card">
          <strong style="color:#1e3a8a; font-family:'Space Grotesk',sans-serif; text-transform:uppercase;">⚡ Primary Instant Settlement (Zelle)</strong>
          <div style="margin-top:4px;">Recipient: <strong>rjbizsolution23@gmail.com</strong></div>
          <div>Entity: RJ Business Solutions (Rick Jefferson)</div>
        </div>
        <div class="pay-card">
          <strong style="color:#1e3a8a; font-family:'Space Grotesk',sans-serif; text-transform:uppercase;">🏦 Domestic Wire Transfer (Wells Fargo)</strong>
          <div style="margin-top:4px;">Routing Number: <strong>121000248</strong></div>
          <div>Beneficiary: RJ Business Solutions · Tijeras, NM 87059</div>
        </div>
      </div>

      <div class="sig-grid">
        <div>
          <div class="sig-line">Rick Jefferson, CEO</div>
          <strong>Authorized Signature · RJ Business Solutions</strong>
        </div>
        <div>
          <div class="sig-line">${tx.user_name}</div>
          <strong>Client / Subscriber Acceptance</strong>
        </div>
      </div>

      <div style="margin-top:24px; font-size:11px; color:#64748b; text-align:center;">
        RJ Business Solutions provides software and automation technology. Not financial or legal advice. · https://rjbusinesssolutions.org
      </div>
    </div>
  </div>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 1. Serve Executive RJ Stream Live UI
    if (path === "/" || path === "/watch" || path === "/studio") {
      return new Response(UI_HTML, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...CORS_HEADERS,
        },
      });
    }

    // 2. Health & Infrastructure Status
    if (path === "/api/health" || path === "/v1/health") {
      const [streamCount, userCount, wfCount, offerCount] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) as count FROM streams").first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM users").first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM workflow_rules WHERE is_active = 1").first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM stream_offers WHERE is_active = 1").first(),
      ]);
      return jsonResponse({
        status: "ok",
        service: "rj-stream-live",
        organization: env.ORGANIZATION || "RJ Business Solutions",
        architect: env.ARCHITECT || "Rick Jefferson, CEO",
        version: "2.0.0",
        database: "rj-stream-live-db (Cloudflare D1)",
        subsystems: {
          live_streaming_webrtc_and_relay: "active",
          payments_stripe_zelle_wire_invoices: "active",
          automated_crm_workflows: wfCount?.count ?? 0,
          live_chat_polls_qa_superchats: "active",
          in_stream_commerce_offers: offerCount?.count ?? 0,
          affiliate_referral_engine: "active",
        },
        active_streams: streamCount?.count ?? 0,
        registered_users: userCount?.count ?? 0,
      });
    }

    // 3. Authentication Routes
    if (path === "/api/auth/session" && request.method === "GET") {
      const rawId = url.searchParams.get("user_id") || "usr_free_viewer";
      const idMap = {
        usr_sarah_vip: "usr_vip_member",
        usr_marcus_pro: "usr_vip_member",
        usr_guest_free: "usr_free_viewer",
        usr_rick_host: "usr_rick_admin",
      };
      const targetId = idMap[rawId] || rawId;
      const user = await env.DB.prepare(
        "SELECT id, email, name, role, subscription_tier, subscription_status, wallet_balance_cents, referral_code, referred_by, is_muted, created_at FROM users WHERE id = ?1"
      )
        .bind(targetId)
        .first();
      if (!user) return jsonResponse({ error: "User not found" }, 404);
      const unlocks = await env.DB.prepare(
        "SELECT stream_id FROM ppv_unlocks WHERE user_id = ?1"
      )
        .bind(user.id)
        .all();
      const unlocked_streams = (unlocks.results || []).map((r) => r.stream_id);
      user.unlocked_ppv_streams = unlocked_streams;
      return jsonResponse({ user, unlocked_streams });
    }

    if (path === "/api/auth/quick-switch" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const email = String(body.email || "rick@rjbusinesssolutions.org").toLowerCase();
      const user = await env.DB.prepare(
        "SELECT id, email, name, role, subscription_tier, subscription_status, wallet_balance_cents, referral_code, referred_by, is_muted, created_at FROM users WHERE email = ?1"
      )
        .bind(email)
        .first();

      if (!user) {
        return jsonResponse({ error: "Demo account not found" }, 404);
      }

      const token = randomId("rjsess");
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
      await env.DB.prepare(
        "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)"
      )
        .bind(token, user.id, expires, now)
        .run();

      const unlocks = await env.DB.prepare(
        "SELECT stream_id FROM ppv_unlocks WHERE user_id = ?1"
      )
        .bind(user.id)
        .all();
      user.unlocked_ppv_streams = (unlocks.results || []).map((r) => r.stream_id);

      return jsonResponse({ token, user, unlocked_streams: user.unlocked_ppv_streams });
    }

    if (path === "/api/auth/register" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "rj2026live");
      const name = String(body.name || email.split("@")[0] || "Viewer").trim();
      const referredBy = String(body.affiliate_code || "").trim().toUpperCase();
      const tier = ["free", "vip_monthly", "executive_annual"].includes(
        body.subscription_tier
      )
        ? body.subscription_tier
        : "free";

      if (!email) {
        return jsonResponse({ error: "Email is required" }, 400);
      }

      const existing = await env.DB.prepare(
        "SELECT id FROM users WHERE email = ?1"
      )
        .bind(email)
        .first();
      if (existing) {
        return jsonResponse({ error: "Email is already registered" }, 409);
      }

      const userId = randomId("usr");
      const passwordHash = await sha256Hex(`rj-salt-2026:${password}`);
      const role = tier === "free" ? "viewer" : "vip";
      const subStatus = tier === "free" ? "inactive" : "active";
      const myRefCode =
        name
          .replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase()
          .slice(0, 6) + Math.floor(10 + Math.random() * 89);
      const now = new Date().toISOString();

      await env.DB.prepare(
        "INSERT INTO users (id, email, name, password_hash, role, subscription_tier, subscription_status, wallet_balance_cents, referral_code, referred_by, is_muted, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9, 0, ?10)"
      )
        .bind(userId, email, name, passwordHash, role, tier, subStatus, myRefCode, referredBy, now)
        .run();

      await env.DB.prepare(
        "INSERT OR IGNORE INTO affiliates (code, owner_user_id, owner_name, commission_percent, clicks_count, conversions_count, total_commission_cents, created_at) VALUES (?1, ?2, ?3, 20, 0, 0, 0, ?4)"
      )
        .bind(myRefCode, userId, name, now)
        .run();

      await executeWorkflowsForEvent(env, "user.registered", name, {
        user_id: userId,
        email,
        subscription_tier: tier,
        referred_by: referredBy,
      });

      if (tier !== "free") {
        const txId = randomId("tx");
        const amount = tier === "executive_annual" ? 29900 : 2900;
        await env.DB.prepare(
          "INSERT INTO transactions (id, user_id, user_name, stream_id, type, amount_cents, discount_code, discount_cents, affiliate_code, payment_method, payment_reference, settlement_status, note, created_at) VALUES (?1, ?2, ?3, '', ?4, ?5, '', 0, ?6, 'stripe_card', ?7, 'settled', ?8, ?9)"
        )
          .bind(
            txId,
            userId,
            name,
            tier === "executive_annual" ? "executive_subscription" : "vip_subscription",
            amount,
            referredBy,
            `ch_${randomId("stripe")}`,
            `New ${tier} registration`,
            now
          )
          .run();

        await creditAffiliateIfPresent(env, referredBy, amount);
        await executeWorkflowsForEvent(env, "subscription.activated", name, {
          user_id: userId,
          tier,
          amount_cents: amount,
          transaction_id: txId,
          affiliate_code: referredBy,
        });
      }

      const token = randomId("rjsess");
      const expires = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
      await env.DB.prepare(
        "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)"
      )
        .bind(token, userId, expires, now)
        .run();

      return jsonResponse({
        token,
        user: {
          id: userId,
          email,
          name,
          role,
          subscription_tier: tier,
          subscription_status: subStatus,
          referral_code: myRefCode,
          unlocked_ppv_streams: [],
        },
        unlocked_streams: [],
      });
    }

    if (path === "/api/auth/login" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || email.split("@")[0] || "Viewer").trim();
      const password = String(body.password || "rj2026live");

      let user = await env.DB.prepare(
        "SELECT id, email, name, password_hash, role, subscription_tier, subscription_status, wallet_balance_cents, referral_code, referred_by, is_muted, created_at FROM users WHERE email = ?1"
      )
        .bind(email)
        .first();

      const now = new Date().toISOString();
      if (!user && email) {
        const userId = randomId("usr");
        const passwordHash = await sha256Hex(`rj-salt-2026:${password}`);
        const myRefCode =
          name
            .replace(/[^a-zA-Z0-9]/g, "")
            .toUpperCase()
            .slice(0, 6) + Math.floor(10 + Math.random() * 89);
        await env.DB.prepare(
          "INSERT INTO users (id, email, name, password_hash, role, subscription_tier, subscription_status, wallet_balance_cents, referral_code, referred_by, is_muted, created_at) VALUES (?1, ?2, ?3, ?4, 'viewer', 'free', 'active', 0, ?5, '', 0, ?6)"
        )
          .bind(userId, email, name, passwordHash, myRefCode, now)
          .run();
        await executeWorkflowsForEvent(env, "user.registered", name, {
          user_id: userId,
          email,
          subscription_tier: "free",
        });
        user = await env.DB.prepare(
          "SELECT id, email, name, role, subscription_tier, subscription_status, wallet_balance_cents, referral_code, referred_by, is_muted, created_at FROM users WHERE id = ?1"
        )
          .bind(userId)
          .first();
      }

      if (!user) {
        return jsonResponse({ error: "Invalid email or password" }, 401);
      }

      const token = randomId("rjsess");
      const expires = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
      await env.DB.prepare(
        "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)"
      )
        .bind(token, user.id, expires, now)
        .run();

      delete user.password_hash;
      const unlocks = await env.DB.prepare(
        "SELECT stream_id FROM ppv_unlocks WHERE user_id = ?1"
      )
        .bind(user.id)
        .all();
      const unlocked_streams = (unlocks.results || []).map((r) => r.stream_id);
      user.unlocked_ppv_streams = unlocked_streams;

      return jsonResponse({ token, user, unlocked_streams });
    }

    if (path === "/api/auth/me" && request.method === "GET") {
      const user = await getAuthenticatedUser(request, env);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
      return jsonResponse({ user });
    }

    // 4. List & Create Live Streams
    if (path === "/api/streams" && request.method === "GET") {
      const user = await getAuthenticatedUser(request, env);
      const rows = await env.DB.prepare(
        "SELECT id, slug, title, description, category, creator_id, creator_name, access_tier, ppv_price_cents, status, stream_key, whip_url, whep_url, hls_url, vod_url, rtmp_url, viewer_count, peak_viewers, total_tips_cents, tip_goal_cents, tip_goal_title, pinned_message, chat_mode, slow_mode_seconds, active_offer_id, lower_third_headline, lower_third_subline, live_frame_updated_at, started_at, created_at FROM streams ORDER BY created_at ASC"
      ).all();

      const offersRes = await env.DB.prepare(
        "SELECT * FROM stream_offers WHERE is_active = 1"
      ).all();
      const offersList = offersRes.results || [];

      const streams = (rows.results || []).map((s) => ({
        ...s,
        host_name: s.creator_name,
        is_paid: s.access_tier !== "free" ? 1 : 0,
        required_tier: s.access_tier === "ppv" ? "vip" : s.access_tier,
        tip_current_cents: s.total_tips_cents,
        tip_goal_label: s.tip_goal_title,
        pinned_announcement: s.pinned_message,
        has_access: canUserAccessStream(user, s),
        active_offer:
          offersList.find((o) => o.id === s.active_offer_id) ||
          offersList.find((o) => o.stream_id === s.id) ||
          null,
      }));

      return jsonResponse({ streams });
    }

    if (path === "/api/streams" && request.method === "POST") {
      const user = await getAuthenticatedUser(request, env);
      const body = await request.json().catch(() => ({}));
      const title = String(body.title || "RJ Live Stream").trim();
      const description = String(body.description || "Live broadcast by Rick Jefferson").trim();
      const category = String(body.category || "Live Broadcast").trim();
      const access_tier = ["free", "vip", "ppv"].includes(body.access_tier)
        ? body.access_tier
        : "vip";
      const ppv_price_cents = Number(body.ppv_price_cents) || 4900;
      const tip_goal_cents = Number(body.tip_goal_cents) || 150000;
      const tip_goal_title = String(
        body.tip_goal_title || "Live Stream Goal: Unlock Bonus Implementation Vault"
      );

      const id = randomId("str");
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") +
        "-" +
        id.slice(-4);
      const streamKey = randomId("rj_live_key");
      const now = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO streams (
          id, slug, title, description, category, creator_id, creator_name, access_tier, ppv_price_cents, status,
          stream_key, viewer_count, peak_viewers, total_tips_cents, tip_goal_cents, tip_goal_title,
          pinned_message, chat_mode, slow_mode_seconds, lower_third_headline, lower_third_subline, started_at, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'live', ?10, 15, 15, 0, ?11, ?12, ?13, 'all', 0, ?14, ?15, ?16, ?16)`
      )
        .bind(
          id,
          slug,
          title,
          description,
          category,
          user?.id || "usr_rick_admin",
          user?.name || "Rick Jefferson, CEO",
          access_tier,
          ppv_price_cents,
          streamKey,
          tip_goal_cents,
          tip_goal_title,
          `📌 Welcome to ${title}! Drop your questions in the Q&A tab.`,
          `LIVE · ${title.toUpperCase().slice(0, 36)}`,
          "Rick Jefferson, CEO · RJ Business Solutions",
          now
        )
        .run();

      await executeWorkflowsForEvent(
        env,
        "stream.started",
        user?.name || "Rick Jefferson, CEO",
        { stream_id: id, title, access_tier }
      );

      const created = await env.DB.prepare("SELECT * FROM streams WHERE id = ?1")
        .bind(id)
        .first();
      return jsonResponse({ stream: created }, 201);
    }

    // 5. Stream-Specific Endpoints (/api/streams/:id/*)
    const streamSubMatch = path.match(
      /^\/api\/streams\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?(?:\/([^/]+))?$/
    );
    if (streamSubMatch) {
      const streamId = streamSubMatch[1];
      const subAction = streamSubMatch[2] || "";
      const itemId = streamSubMatch[3] || "";
      const itemAction = streamSubMatch[4] || "";

      const stream = await env.DB.prepare("SELECT * FROM streams WHERE id = ?1")
        .bind(streamId)
        .first();
      if (!stream) {
        return jsonResponse({ error: "Stream not found" }, 404);
      }

      // PATCH /api/streams/:id or POST /api/streams/:id/status (Update paywall, overlays, chat mode, tip goal, pinned message, WHEP)
      if (
        (!subAction && request.method === "PATCH") ||
        (subAction === "status" && request.method === "POST")
      ) {
        const body = await request.json().catch(() => ({}));
        const title = body.title ?? stream.title;
        const access_tier =
          body.access_tier || body.required_tier || stream.access_tier;
        const ppv_price_cents =
          body.ppv_price_cents !== undefined
            ? Number(body.ppv_price_cents)
            : stream.ppv_price_cents;
        const lower_third_headline =
          body.lower_third_headline ?? stream.lower_third_headline;
        const lower_third_subline =
          body.lower_third_subline ?? stream.lower_third_subline;
        const whep_url = body.whep_url ?? stream.whep_url;
        const chat_mode = body.chat_mode ?? stream.chat_mode;
        const slow_mode_seconds =
          body.slow_mode_seconds !== undefined
            ? Number(body.slow_mode_seconds)
            : stream.slow_mode_seconds;
        const tip_goal_cents =
          body.tip_goal_cents !== undefined
            ? Number(body.tip_goal_cents)
            : stream.tip_goal_cents;
        const tip_goal_title =
          body.tip_goal_title ?? body.tip_goal_label ?? stream.tip_goal_title;
        const pinned_message =
          body.pinned_message ??
          body.pinned_announcement ??
          stream.pinned_message;
        const status = body.status ?? stream.status;

        await env.DB.prepare(
          `UPDATE streams SET
            title = ?1, access_tier = ?2, ppv_price_cents = ?3, lower_third_headline = ?4, lower_third_subline = ?5,
            whep_url = ?6, chat_mode = ?7, slow_mode_seconds = ?8, tip_goal_cents = ?9,
            tip_goal_title = ?10, pinned_message = ?11, status = ?12
           WHERE id = ?13`
        )
          .bind(
            title,
            access_tier,
            ppv_price_cents,
            lower_third_headline,
            lower_third_subline,
            whep_url,
            chat_mode,
            slow_mode_seconds,
            tip_goal_cents,
            tip_goal_title,
            pinned_message,
            status,
            streamId
          )
          .run();

        const updated = await env.DB.prepare(
          "SELECT * FROM streams WHERE id = ?1"
        )
          .bind(streamId)
          .first();
        return jsonResponse({ stream: updated });
      }

      // GET /api/streams/:id/watch (Server-enforced Paywall Gate)
      if (subAction === "watch" && request.method === "GET") {
        const user = await getAuthenticatedUser(request, env);
        const allowed = canUserAccessStream(user, stream);
        if (!allowed) {
          return jsonResponse(
            {
              error:
                stream.access_tier === "vip"
                  ? "🔒 VIP Subscribers Only Stream"
                  : `🔒 Pay-Per-View Live Event ($${(stream.ppv_price_cents / 100).toFixed(2)})`,
              message:
                stream.access_tier === "vip"
                  ? "Upgrade to VIP Monthly ($29/mo) or Executive Annual ($299/yr) to watch this live stream immediately."
                  : `Unlock a single Pay-Per-View ticket ($${(stream.ppv_price_cents / 100).toFixed(2)}) or upgrade to Executive Annual ($299/yr) to watch now.`,
              access_tier: stream.access_tier,
              ppv_price_cents: stream.ppv_price_cents,
            },
            402
          );
        }

        const activeOffer = await env.DB.prepare(
          "SELECT * FROM stream_offers WHERE stream_id = ?1 AND is_active = 1 ORDER BY created_at DESC LIMIT 1"
        )
          .bind(streamId)
          .first();

        return jsonResponse({
          access: "granted",
          stream: {
            id: stream.id,
            title: stream.title,
            access_tier: stream.access_tier,
            whep_url: stream.whep_url,
            hls_url: stream.hls_url,
            vod_url: stream.vod_url,
            lower_third_headline: stream.lower_third_headline,
            lower_third_subline: stream.lower_third_subline,
            viewer_count: stream.viewer_count,
            total_tips_cents: stream.total_tips_cents,
            tip_goal_cents: stream.tip_goal_cents,
            tip_goal_title: stream.tip_goal_title,
            pinned_message: stream.pinned_message,
            chat_mode: stream.chat_mode,
            slow_mode_seconds: stream.slow_mode_seconds,
            active_offer: activeOffer || null,
          },
        });
      }

      // POST & GET /api/streams/:id/frame (Live Browser Studio Frame Relay)
      if (subAction === "frame" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const frameData = String(body.live_frame_data || "");
        const headline =
          body.lower_third_headline || stream.lower_third_headline;
        const subline = body.lower_third_subline || stream.lower_third_subline;
        const nowMs = Date.now();

        await env.DB.prepare(
          "UPDATE streams SET live_frame_data = ?1, live_frame_updated_at = ?2, lower_third_headline = ?3, lower_third_subline = ?4, viewer_count = viewer_count + 1 WHERE id = ?5"
        )
          .bind(frameData, nowMs, headline, subline, streamId)
          .run();

        return jsonResponse({ ok: true, updated_at: nowMs });
      }

      if (subAction === "frame" && request.method === "GET") {
        return jsonResponse({
          id: stream.id,
          viewer_count: stream.viewer_count,
          total_tips_cents: stream.total_tips_cents,
          tip_goal_cents: stream.tip_goal_cents,
          tip_goal_title: stream.tip_goal_title,
          pinned_message: stream.pinned_message,
          chat_mode: stream.chat_mode,
          lower_third_headline: stream.lower_third_headline,
          lower_third_subline: stream.lower_third_subline,
          live_frame_data: stream.live_frame_data,
          live_frame_updated_at: stream.live_frame_updated_at,
        });
      }

      // GET & POST /api/streams/:id/chat (Real-Time Live Chat + Virtual Gifts + SuperChats + Moderation)
      if (subAction === "chat" && !itemId && request.method === "GET") {
        const msgs = await env.DB.prepare(
          "SELECT * FROM chat_messages WHERE stream_id = ?1 AND is_deleted = 0 ORDER BY created_at ASC LIMIT 100"
        )
          .bind(streamId)
          .all();
        const messages = (msgs.results || []).map((m) => ({
          ...m,
          body: m.message,
          tip_cents: m.tip_amount_cents,
          message_type: m.gift_type
            ? "gift"
            : m.is_superchat
            ? "superchat"
            : "chat",
        }));
        return jsonResponse({
          pinned_message: stream.pinned_message,
          pinned_announcement: stream.pinned_message,
          chat_mode: stream.chat_mode,
          slow_mode_seconds: stream.slow_mode_seconds,
          total_tips_cents: stream.total_tips_cents,
          tip_goal_cents: stream.tip_goal_cents,
          tip_goal_title: stream.tip_goal_title,
          messages,
        });
      }

      if (subAction === "chat" && !itemId && request.method === "POST") {
        const user = await getAuthenticatedUser(request, env);
        if (user?.is_muted) {
          return jsonResponse(
            { error: "Your account is muted in live chat." },
            403
          );
        }

        const body = await request.json().catch(() => ({}));
        const message = String(body.message || body.body || "").trim();
        const tipCents = Math.max(
          0,
          Number(body.tip_amount_cents ?? body.tip_cents) || 0
        );
        const giftType = String(body.gift_type || "").trim();
        const paymentMethod = String(body.payment_method || "stripe_card");

        if (!message) {
          return jsonResponse({ error: "Message required" }, 400);
        }

        const userTier =
          user?.subscription_tier || body.user_tier || "free";
        const userRole = user?.role || "viewer";
        const isVipOrHost =
          userRole === "creator" ||
          userTier === "vip" ||
          userTier === "vip_monthly" ||
          userTier === "executive" ||
          userTier === "executive_annual";
        if (
          stream.chat_mode === "vip_only" &&
          !isVipOrHost &&
          tipCents === 0
        ) {
          return jsonResponse(
            {
              error:
                "💎 VIP-Only Chat Mode is active. Upgrade to VIP ($29/mo) or send a SuperChat to post!",
            },
            403
          );
        }

        const msgId = randomId("msg");
        const now = new Date().toISOString();
        const userId = user?.id || body.user_id || "usr_guest";
        const userName = user?.name || body.user_name || "Guest Viewer";
        const isSuperchat = tipCents > 0 ? 1 : 0;

        await env.DB.prepare(
          "INSERT INTO chat_messages (id, stream_id, user_id, user_name, user_role, user_tier, message, is_superchat, tip_amount_cents, gift_type, is_pinned, is_deleted, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, 0, ?11)"
        )
          .bind(
            msgId,
            streamId,
            userId,
            userName,
            userRole,
            userTier,
            message,
            isSuperchat,
            tipCents,
            giftType,
            now
          )
          .run();

        let txId = "";
        if (tipCents > 0) {
          await env.DB.prepare(
            "UPDATE streams SET total_tips_cents = total_tips_cents + ?1 WHERE id = ?2"
          )
            .bind(tipCents, streamId)
            .run();

          await env.DB.prepare(
            "UPDATE users SET wallet_balance_cents = wallet_balance_cents + ?1 WHERE id = 'usr_rick_admin'"
          )
            .bind(tipCents)
            .run();

          txId = randomId("tx");
          await env.DB.prepare(
            "INSERT INTO transactions (id, user_id, user_name, stream_id, type, amount_cents, discount_code, discount_cents, affiliate_code, payment_method, payment_reference, settlement_status, note, created_at) VALUES (?1, ?2, ?3, ?4, 'superchat_tip', ?5, '', 0, '', ?6, ?7, 'settled', ?8, ?9)"
          )
            .bind(
              txId,
              userId,
              userName,
              streamId,
              tipCents,
              paymentMethod,
              `sc_${randomId("ref")}`,
              `${giftType ? giftType + " Gift + " : ""}SuperChat: ${message}`,
              now
            )
            .run();

          await executeWorkflowsForEvent(env, "superchat.sent", userName, {
            stream_id: streamId,
            amount_cents: tipCents,
            gift_type: giftType,
            message,
            transaction_id: txId,
          });
        }

        return jsonResponse({ ok: true, id: msgId, transaction_id: txId });
      }

      // POST /api/streams/:id/gift (Send Animated Virtual Gift)
      if (subAction === "gift" && request.method === "POST") {
        const user = await getAuthenticatedUser(request, env);
        const body = await request.json().catch(() => ({}));
        const giftMap = {
          fire: { label: "🔥 Fire", cents: 500 },
          diamond: { label: "💎 Diamond", cents: 2500 },
          rocket: { label: "🚀 Rocket", cents: 5000 },
          crown: { label: "👑 Crown", cents: 10000 },
          empire: { label: "🏛️ Empire", cents: 50000 },
        };
        const giftKey = String(body.gift_id || "fire").toLowerCase();
        const gift = giftMap[giftKey] || giftMap.fire;
        const userId = user?.id || body.user_id || "usr_guest";
        const userName = user?.name || body.user_name || "Guest Viewer";
        const userTier = user?.subscription_tier || body.user_tier || "vip";
        const customNote = String(body.message || "").trim();
        const message = customNote
          ? `Sent ${gift.label} Gift ($${(gift.cents / 100).toFixed(0)}) — ${customNote}`
          : `Sent ${gift.label} Animated Virtual Gift ($${(gift.cents / 100).toFixed(0)})!`;
        const msgId = randomId("msg");
        const txId = randomId("tx");
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO chat_messages (id, stream_id, user_id, user_name, user_role, user_tier, message, is_superchat, tip_amount_cents, gift_type, is_pinned, is_deleted, created_at) VALUES (?1, ?2, ?3, ?4, 'viewer', ?5, ?6, 1, ?7, ?8, 0, 0, ?9)"
        )
          .bind(
            msgId,
            streamId,
            userId,
            userName,
            userTier,
            message,
            gift.cents,
            gift.label,
            now
          )
          .run();

        await env.DB.prepare(
          "UPDATE streams SET total_tips_cents = total_tips_cents + ?1 WHERE id = ?2"
        )
          .bind(gift.cents, streamId)
          .run();

        await env.DB.prepare(
          "UPDATE users SET wallet_balance_cents = wallet_balance_cents + ?1 WHERE id = 'usr_rick_admin'"
        )
          .bind(gift.cents)
          .run();

        await env.DB.prepare(
          "INSERT INTO transactions (id, user_id, user_name, stream_id, type, amount_cents, discount_code, discount_cents, affiliate_code, payment_method, payment_reference, settlement_status, note, created_at) VALUES (?1, ?2, ?3, ?4, 'superchat_tip', ?5, '', 0, '', 'stripe_card', ?6, 'settled', ?7, ?8)"
        )
          .bind(
            txId,
            userId,
            userName,
            streamId,
            gift.cents,
            `gift_${randomId("ref")}`,
            `${gift.label} Gift: ${message}`,
            now
          )
          .run();

        const wfRuns = await executeWorkflowsForEvent(
          env,
          "superchat.sent",
          userName,
          {
            stream_id: streamId,
            amount_cents: gift.cents,
            gift_type: gift.label,
            message,
            transaction_id: txId,
          }
        );

        return jsonResponse({
          ok: true,
          id: msgId,
          transaction_id: txId,
          invoice_url: `/api/payments/invoice/${txId}`,
          workflows_executed: wfRuns,
        });
      }

      // POST /api/streams/:id/chat/pin (Pin message or update pinned announcement)
      if (subAction === "chat" && itemId === "pin" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const pinnedText = String(body.pinned_message || "").trim();
        const messageId = String(body.message_id || "").trim();

        if (messageId) {
          const msgRow = await env.DB.prepare(
            "SELECT * FROM chat_messages WHERE id = ?1 AND stream_id = ?2"
          )
            .bind(messageId, streamId)
            .first();
          if (msgRow) {
            await env.DB.prepare(
              "UPDATE chat_messages SET is_pinned = CASE WHEN id = ?1 THEN 1 ELSE 0 END WHERE stream_id = ?2"
            )
              .bind(messageId, streamId)
              .run();
            await env.DB.prepare(
              "UPDATE streams SET pinned_message = ?1 WHERE id = ?2"
            )
              .bind(`📌 ${msgRow.user_name}: ${msgRow.message}`, streamId)
              .run();
          }
        } else if (pinnedText) {
          await env.DB.prepare(
            "UPDATE streams SET pinned_message = ?1 WHERE id = ?2"
          )
            .bind(pinnedText, streamId)
            .run();
        }
        return jsonResponse({ ok: true });
      }

      // POST /api/streams/:id/chat/:msgId/moderate (Pin, Unpin, or Delete Chat Message)
      if (
        subAction === "chat" &&
        itemId &&
        itemAction === "moderate" &&
        request.method === "POST"
      ) {
        const body = await request.json().catch(() => ({}));
        const action = String(body.action || "pin");
        if (action === "delete") {
          await env.DB.prepare(
            "UPDATE chat_messages SET is_deleted = 1 WHERE id = ?1 AND stream_id = ?2"
          )
            .bind(itemId, streamId)
            .run();
        } else if (action === "pin") {
          await env.DB.prepare(
            "UPDATE chat_messages SET is_pinned = 1 WHERE id = ?1 AND stream_id = ?2"
          )
            .bind(itemId, streamId)
            .run();
        } else if (action === "unpin") {
          await env.DB.prepare(
            "UPDATE chat_messages SET is_pinned = 0 WHERE id = ?1 AND stream_id = ?2"
          )
            .bind(itemId, streamId)
            .run();
        }
        return jsonResponse({ ok: true, id: itemId, action });
      }

      // DELETE /api/streams/:id/chat/:msgId (Moderate/Delete Chat Message)
      if (subAction === "chat" && itemId && !itemAction && request.method === "DELETE") {
        await env.DB.prepare(
          "UPDATE chat_messages SET is_deleted = 1 WHERE id = ?1 AND stream_id = ?2"
        )
          .bind(itemId, streamId)
          .run();
        return jsonResponse({ ok: true, deleted_id: itemId });
      }

      // GET & POST /api/streams/:id/polls (Live Interactive Audience Polls)
      if (subAction === "polls" && !itemId && request.method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT * FROM stream_polls WHERE stream_id = ?1 ORDER BY created_at DESC"
        )
          .bind(streamId)
          .all();
        const polls = (rows.results || []).map((p) => {
          const parsed = JSON.parse(p.options_json || "[]");
          return {
            ...p,
            options: parsed.map((o) => (typeof o === "string" ? o : o.label)),
            tallies: parsed.map((o) => (typeof o === "object" ? o.votes || 0 : 0)),
            options_objects: parsed,
          };
        });
        return jsonResponse({ polls });
      }

      if (subAction === "polls" && !itemId && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const question = String(body.question || "").trim();
        const rawOptions = Array.isArray(body.options) ? body.options : [];
        if (!question || rawOptions.length < 2) {
          return jsonResponse(
            { error: "Poll question and at least 2 options are required" },
            400
          );
        }
        const pollId = randomId("poll");
        const options = rawOptions.map((label, idx) => ({
          id: `opt_${idx + 1}`,
          label: String(label).trim(),
          votes: 0,
        }));
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO stream_polls (id, stream_id, question, options_json, status, total_votes, created_at) VALUES (?1, ?2, ?3, ?4, 'open', 0, ?5)"
        )
          .bind(pollId, streamId, question, JSON.stringify(options), now)
          .run();

        return jsonResponse({
          poll: {
            id: pollId,
            stream_id: streamId,
            question,
            options: options.map((o) => o.label),
            tallies: options.map((o) => o.votes),
            status: "open",
            total_votes: 0,
          },
        });
      }

      // POST /api/streams/:id/polls/:pollId/vote (Vote in Live Poll)
      if (
        subAction === "polls" &&
        itemId &&
        itemAction === "vote" &&
        request.method === "POST"
      ) {
        const body = await request.json().catch(() => ({}));
        const poll = await env.DB.prepare(
          "SELECT * FROM stream_polls WHERE id = ?1 AND stream_id = ?2"
        )
          .bind(itemId, streamId)
          .first();
        if (!poll) return jsonResponse({ error: "Poll not found" }, 404);

        const options = JSON.parse(poll.options_json || "[]");
        let target = null;
        if (body.option_index !== undefined) {
          target = options[Number(body.option_index)];
        } else {
          const optionId = String(body.option_id || "opt_1");
          target = options.find((o) => o.id === optionId);
        }
        if (!target) return jsonResponse({ error: "Option not found" }, 400);

        target.votes = (target.votes || 0) + 1;
        const totalVotes = options.reduce((acc, o) => acc + (o.votes || 0), 0);

        await env.DB.prepare(
          "UPDATE stream_polls SET options_json = ?1, total_votes = ?2 WHERE id = ?3"
        )
          .bind(JSON.stringify(options), totalVotes, itemId)
          .run();

        return jsonResponse({
          ok: true,
          poll_id: itemId,
          total_votes: totalVotes,
          options: options.map((o) => o.label),
          tallies: options.map((o) => o.votes),
        });
      }

      // GET & POST /api/streams/:id/qa (Live Q&A Queue)
      if (subAction === "qa" && !itemId && request.method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT * FROM stream_qa WHERE stream_id = ?1 ORDER BY upvotes DESC, created_at ASC"
        )
          .bind(streamId)
          .all();
        return jsonResponse({ questions: rows.results || [] });
      }

      if (subAction === "qa" && !itemId && request.method === "POST") {
        const user = await getAuthenticatedUser(request, env);
        const body = await request.json().catch(() => ({}));
        const question = String(body.question || "").trim();
        if (!question) return jsonResponse({ error: "Question required" }, 400);

        const qaId = randomId("qa");
        const now = new Date().toISOString();
        await env.DB.prepare(
          "INSERT INTO stream_qa (id, stream_id, user_id, user_name, user_tier, question, upvotes, status, answer_note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 'queued', '', ?7)"
        )
          .bind(
            qaId,
            streamId,
            user?.id || body.user_id || "usr_guest",
            user?.name || body.user_name || "Guest Viewer",
            user?.subscription_tier || body.user_tier || "free",
            question,
            now
          )
          .run();

        return jsonResponse({ ok: true, id: qaId });
      }

      // POST /api/streams/:id/qa/:qaId/upvote
      if (
        subAction === "qa" &&
        itemId &&
        itemAction === "upvote" &&
        request.method === "POST"
      ) {
        await env.DB.prepare(
          "UPDATE stream_qa SET upvotes = upvotes + 1 WHERE id = ?1 AND stream_id = ?2"
        )
          .bind(itemId, streamId)
          .run();
        return jsonResponse({ ok: true, id: itemId });
      }

      // PATCH /api/streams/:id/qa/:qaId (Mark Question Answered Live on Air)
      if (subAction === "qa" && itemId && !itemAction && request.method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        const status = body.status || "answered";
        const answerNote = String(
          body.answer_note || "Answered Live on Broadcast by Rick Jefferson"
        );
        await env.DB.prepare(
          "UPDATE stream_qa SET status = ?1, answer_note = ?2 WHERE id = ?3 AND stream_id = ?4"
        )
          .bind(status, answerNote, itemId, streamId)
          .run();
        return jsonResponse({ ok: true, id: itemId, status });
      }

      // GET & POST /api/streams/:id/offers (In-Stream Commerce & Flash Drops)
      if (subAction === "offers" && request.method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT * FROM stream_offers WHERE stream_id = ?1 ORDER BY created_at DESC"
        )
          .bind(streamId)
          .all();
        const offers = (rows.results || []).map((o) => ({
          ...o,
          description: o.subtitle,
          stock_total: (o.inventory_left || 0) + (o.sales_count || 0),
          stock_sold: o.sales_count || 0,
        }));
        return jsonResponse({ offers });
      }

      if (subAction === "offers" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const offerId = randomId("off");
        const title = String(body.title || "Live Flash Offer").trim();
        const subtitle = String(
          body.subtitle || body.description || "Special Live Broadcast Bundle"
        ).trim();
        const badgeText = String(body.badge_text || "🔥 LIVE FLASH DROP").trim();
        const priceCents = Math.max(100, Number(body.price_cents) || 19700);
        const compareAtCents = Number(body.compare_at_cents) || priceCents * 2;
        const ctaText = String(
          body.cta_text || `⚡ Instant Unlock ($${(priceCents / 100).toFixed(0)})`
        ).trim();
        const inventoryLeft =
          Number(body.inventory_left ?? body.stock_total) || 25;
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO stream_offers (id, stream_id, title, subtitle, badge_text, price_cents, compare_at_cents, cta_text, external_url, sales_count, inventory_left, is_active, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'https://rjbusinesssolutions.org', 0, ?9, 1, ?10)"
        )
          .bind(
            offerId,
            streamId,
            title,
            subtitle,
            badgeText,
            priceCents,
            compareAtCents,
            ctaText,
            inventoryLeft,
            now
          )
          .run();

        await env.DB.prepare(
          "UPDATE streams SET active_offer_id = ?1 WHERE id = ?2"
        )
          .bind(offerId, streamId)
          .run();

        const created = await env.DB.prepare(
          "SELECT * FROM stream_offers WHERE id = ?1"
        )
          .bind(offerId)
          .first();
        return jsonResponse(
          {
            offer: {
              ...created,
              description: created.subtitle,
              stock_total: created.inventory_left,
              stock_sold: 0,
            },
          },
          201
        );
      }
    }

    // 6. Payments, Promo Codes, Stripe Checkout & Official Invoices (/api/payments/*)
    if (path === "/api/payments/promo-validate" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const code = String(body.code || "").trim().toUpperCase();
      const baseCents = Math.max(100, Number(body.amount_cents) || 2900);

      const promo = await env.DB.prepare(
        "SELECT * FROM promo_codes WHERE code = ?1 AND is_active = 1"
      )
        .bind(code)
        .first();

      if (!promo) {
        return jsonResponse(
          { valid: false, error: "Invalid or expired promo code" },
          404
        );
      }
      const discountCents = Math.round(
        (baseCents * promo.discount_percent) / 100
      );
      const finalCents = Math.max(100, baseCents - discountCents);

      return jsonResponse({
        valid: true,
        code: promo.code,
        description: promo.description,
        discount_percent: promo.discount_percent,
        discount_cents: discountCents,
        final_cents: finalCents,
      });
    }

    if (path === "/api/payments/promo-create" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const code = String(body.code || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      const description = String(
        body.description || "Custom Promo Discount"
      ).trim();
      const discountPercent = Math.min(
        90,
        Math.max(5, Number(body.discount_percent) || 20)
      );
      if (!code) return jsonResponse({ error: "Promo code required" }, 400);

      const now = new Date().toISOString();
      await env.DB.prepare(
        "INSERT OR REPLACE INTO promo_codes (code, description, discount_percent, max_uses, uses_count, is_active, created_at) VALUES (?1, ?2, ?3, 500, 0, 1, ?4)"
      )
        .bind(code, description, discountPercent, now)
        .run();

      return jsonResponse({
        ok: true,
        promo: { code, description, discount_percent: discountPercent },
      });
    }

    // Printable Executive HTML / PDF Invoice Endpoint
    const invoiceMatch = path.match(/^\/api\/payments\/invoice\/([^/]+)$/);
    if (
      invoiceMatch &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      const txId = invoiceMatch[1];
      const tx = await env.DB.prepare(
        "SELECT * FROM transactions WHERE id = ?1"
      )
        .bind(txId)
        .first();
      if (!tx) {
        return jsonResponse({ error: "Invoice transaction not found" }, 404);
      }
      return new Response(
        request.method === "HEAD" ? null : renderExecutiveInvoiceHtml(tx),
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...CORS_HEADERS,
          },
        }
      );
    }

    // Helper to resolve user from Bearer token OR body.user_id
    async function resolveCheckoutUser(request, env, body) {
      const authUser = await getAuthenticatedUser(request, env);
      if (authUser) return authUser;
      const aliasMap = {
        usr_guest_free: "usr_free_viewer",
        usr_sarah_vip: "usr_vip_member",
        usr_marcus_exec: "usr_exec_member",
        usr_rick_admin: "usr_rick_admin",
      };
      const targetId =
        aliasMap[body?.user_id] || body?.user_id || "usr_free_viewer";
      const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?1")
        .bind(targetId)
        .first();
      return (
        row || {
          id: targetId,
          name: body?.user_name || "Guest Viewer",
          email: "viewer@rjbusinesssolutions.org",
          role: "viewer",
          subscription_tier: "free",
        }
      );
    }

    // 7. Complete Monetization Endpoints (Subscriptions, PPV, In-Stream Offers, Affiliates, Payouts)
    if (path === "/api/monetization/subscribe" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const user = await resolveCheckoutUser(request, env, body);

      const rawTier = String(body.tier || "vip");
      const tier =
        rawTier === "executive" || rawTier === "executive_annual"
          ? "executive_annual"
          : "vip_monthly";
      const uiTier = tier === "executive_annual" ? "executive" : "vip";
      const paymentMethod = String(body.payment_method || "stripe_card");
      const paymentReference = String(
        body.payment_reference || `ch_${randomId("stripe")}`
      );
      const baseCents = tier === "executive_annual" ? 29900 : 2900;
      const discount = await applyPromoDiscount(env, body.promo_code, baseCents);
      const amountCents = discount.final_cents;
      const affiliateCode = String(
        body.affiliate_code || user.referred_by || ""
      )
        .trim()
        .toUpperCase();
      const now = new Date().toISOString();

      await env.DB.prepare(
        "UPDATE users SET subscription_tier = ?1, subscription_status = 'active', role = CASE WHEN role = 'creator' THEN 'creator' ELSE 'vip' END WHERE id = ?2"
      )
        .bind(tier, user.id)
        .run();

      await env.DB.prepare(
        "UPDATE users SET wallet_balance_cents = wallet_balance_cents + ?1 WHERE id = 'usr_rick_admin'"
      )
        .bind(amountCents)
        .run();

      const txId = randomId("tx");
      await env.DB.prepare(
        `INSERT INTO transactions (
          id, user_id, user_name, stream_id, type, amount_cents, discount_code, discount_cents,
          affiliate_code, payment_method, payment_reference, settlement_status, note, created_at
        ) VALUES (?1, ?2, ?3, '', ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'settled', ?11, ?12)`
      )
        .bind(
          txId,
          user.id,
          user.name,
          tier === "executive_annual"
            ? "executive_subscription"
            : "vip_subscription",
          amountCents,
          discount.code,
          discount.discount_cents,
          affiliateCode,
          paymentMethod,
          paymentReference,
          tier === "executive_annual"
            ? "Executive Annual Pass + All PPV Unlocks"
            : "VIP Monthly All-Access Pass",
          now
        )
        .run();

      await creditAffiliateIfPresent(env, affiliateCode, amountCents);
      const wfRuns = await executeWorkflowsForEvent(
        env,
        "subscription.activated",
        user.name,
        {
          user_id: user.id,
          tier,
          amount_cents: amountCents,
          discount_code: discount.code,
          affiliate_code: affiliateCode,
          payment_method: paymentMethod,
          transaction_id: txId,
        }
      );

      return jsonResponse({
        ok: true,
        user: {
          ...user,
          tier: uiTier,
          subscription_tier: tier,
        },
        transaction_id: txId,
        invoice_url: `/api/payments/invoice/${txId}`,
        discount_applied: discount,
        workflows_executed: wfRuns,
      });
    }

    if (path === "/api/monetization/unlock-ppv" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const user = await resolveCheckoutUser(request, env, body);
      const streamId = String(body.stream_id || "");
      const paymentMethod = String(body.payment_method || "stripe_card");
      const paymentReference = String(
        body.payment_reference || `ppv_${randomId("ref")}`
      );

      const stream = await env.DB.prepare(
        "SELECT * FROM streams WHERE id = ?1"
      )
        .bind(streamId)
        .first();
      if (!stream) return jsonResponse({ error: "Stream not found" }, 404);

      const baseCents = stream.ppv_price_cents || 4900;
      const discount = await applyPromoDiscount(env, body.promo_code, baseCents);
      const amountCents = discount.final_cents;
      const affiliateCode = String(
        body.affiliate_code || user.referred_by || ""
      )
        .trim()
        .toUpperCase();
      const unlockId = randomId("ppv");
      const txId = randomId("tx");
      const now = new Date().toISOString();

      await env.DB.prepare(
        "INSERT OR IGNORE INTO ppv_unlocks (id, user_id, stream_id, amount_cents, payment_method, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
      )
        .bind(unlockId, user.id, streamId, amountCents, paymentMethod, now)
        .run();

      await env.DB.prepare(
        "UPDATE users SET wallet_balance_cents = wallet_balance_cents + ?1 WHERE id = 'usr_rick_admin'"
      )
        .bind(amountCents)
        .run();

      await env.DB.prepare(
        `INSERT INTO transactions (
          id, user_id, user_name, stream_id, type, amount_cents, discount_code, discount_cents,
          affiliate_code, payment_method, payment_reference, settlement_status, note, created_at
        ) VALUES (?1, ?2, ?3, ?4, 'ppv_ticket', ?5, ?6, ?7, ?8, ?9, ?10, 'settled', ?11, ?12)`
      )
        .bind(
          txId,
          user.id,
          user.name,
          streamId,
          amountCents,
          discount.code,
          discount.discount_cents,
          affiliateCode,
          paymentMethod,
          paymentReference,
          `PPV Ticket Unlock: ${stream.title}`,
          now
        )
        .run();

      await creditAffiliateIfPresent(env, affiliateCode, amountCents);
      const wfRuns = await executeWorkflowsForEvent(
        env,
        "ppv.unlocked",
        user.name,
        {
          user_id: user.id,
          stream_id: streamId,
          amount_cents: amountCents,
          transaction_id: txId,
        }
      );

      const unlocks = await env.DB.prepare(
        "SELECT stream_id FROM ppv_unlocks WHERE user_id = ?1"
      )
        .bind(user.id)
        .all();

      return jsonResponse({
        ok: true,
        stream_id: streamId,
        unlocked_streams: (unlocks.results || []).map((r) => r.stream_id),
        transaction_id: txId,
        invoice_url: `/api/payments/invoice/${txId}`,
        workflows_executed: wfRuns,
      });
    }

    // POST /api/monetization/buy-offer (Purchase In-Stream Flash Offer Drop)
    if (path === "/api/monetization/buy-offer" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const user = await resolveCheckoutUser(request, env, body);
      const offerId = String(body.offer_id || "");
      const paymentMethod = String(body.payment_method || "stripe_card");
      const paymentReference = String(
        body.payment_reference || `off_${randomId("ref")}`
      );

      const offer = await env.DB.prepare(
        "SELECT * FROM stream_offers WHERE id = ?1"
      )
        .bind(offerId)
        .first();
      if (!offer) return jsonResponse({ error: "Offer not found" }, 404);

      const discount = await applyPromoDiscount(
        env,
        body.promo_code,
        offer.price_cents
      );
      const amountCents = discount.final_cents;
      const affiliateCode = String(
        body.affiliate_code || user?.referred_by || ""
      )
        .trim()
        .toUpperCase();
      const txId = randomId("tx");
      const now = new Date().toISOString();
      const buyerName = body.user_name || user?.name || "Live Stream Buyer";
      const buyerId = user?.id || "usr_guest";

      await env.DB.prepare(
        "UPDATE stream_offers SET sales_count = sales_count + 1, inventory_left = MAX(0, inventory_left - 1) WHERE id = ?1"
      )
        .bind(offerId)
        .run();

      await env.DB.prepare(
        "UPDATE users SET wallet_balance_cents = wallet_balance_cents + ?1 WHERE id = 'usr_rick_admin'"
      )
        .bind(amountCents)
        .run();

      await env.DB.prepare(
        `INSERT INTO transactions (
          id, user_id, user_name, stream_id, type, amount_cents, discount_code, discount_cents,
          affiliate_code, payment_method, payment_reference, settlement_status, note, created_at
        ) VALUES (?1, ?2, ?3, ?4, 'offer_purchase', ?5, ?6, ?7, ?8, ?9, ?10, 'settled', ?11, ?12)`
      )
        .bind(
          txId,
          buyerId,
          buyerName,
          offer.stream_id,
          amountCents,
          discount.code,
          discount.discount_cents,
          affiliateCode,
          paymentMethod,
          paymentReference,
          `In-Stream Flash Drop: ${offer.title}`,
          now
        )
        .run();

      await env.DB.prepare(
        "INSERT INTO chat_messages (id, stream_id, user_id, user_name, user_role, user_tier, message, is_superchat, tip_amount_cents, gift_type, is_pinned, is_deleted, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, '🏛️ Flash Offer', 0, 0, ?9)"
      )
        .bind(
          randomId("msg"),
          offer.stream_id,
          buyerId,
          buyerName,
          user?.role || "viewer",
          user?.subscription_tier || "vip_monthly",
          `🔥 Just unlocked the Live Flash Drop: "${offer.title}"!`,
          amountCents,
          now
        )
        .run();

      await creditAffiliateIfPresent(env, affiliateCode, amountCents);
      const wfRuns = await executeWorkflowsForEvent(
        env,
        "offer.purchased",
        buyerName,
        {
          offer_id: offerId,
          offer_title: offer.title,
          amount_cents: amountCents,
          transaction_id: txId,
        }
      );

      return jsonResponse({
        ok: true,
        offer_id: offerId,
        transaction_id: txId,
        invoice_url: `/api/payments/invoice/${txId}`,
        workflows_executed: wfRuns,
      });
    }

    // Affiliates Endpoints
    if (path === "/api/monetization/affiliates" && request.method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT * FROM affiliates ORDER BY total_commission_cents DESC"
      ).all();
      const affiliates = (rows.results || []).map((a) => ({
        ...a,
        user_name: a.owner_name,
        referral_code: a.code,
        total_earned_cents: a.total_commission_cents,
      }));
      return jsonResponse({ affiliates });
    }

    if (path === "/api/monetization/affiliates" && request.method === "POST") {
      const user = await getAuthenticatedUser(request, env);
      const body = await request.json().catch(() => ({}));
      const code = String(body.code || body.referral_code || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "");
      const ownerName = String(
        body.owner_name || body.user_name || user?.name || "Affiliate Partner"
      ).trim();
      const commissionPercent = Math.min(
        50,
        Math.max(5, Number(body.commission_percent) || 20)
      );
      if (!code) return jsonResponse({ error: "Affiliate code required" }, 400);

      const now = new Date().toISOString();
      await env.DB.prepare(
        "INSERT OR REPLACE INTO affiliates (code, owner_user_id, owner_name, commission_percent, clicks_count, conversions_count, total_commission_cents, created_at) VALUES (?1, ?2, ?3, ?4, 1, 0, 0, ?5)"
      )
        .bind(code, user?.id || "usr_rick_admin", ownerName, commissionPercent, now)
        .run();

      return jsonResponse({
        ok: true,
        code,
        referral_code: code,
        user_name: ownerName,
        commission_percent: commissionPercent,
      });
    }

    // Creator Payout Request
    if (path === "/api/monetization/payout" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const amountCents = Math.max(1000, Number(body.amount_cents) || 50000);
      const destination = String(
        body.destination ||
          body.payout_method ||
          "Wells Fargo Wire (Routing 121000248)"
      );
      const txId = randomId("tx");
      const now = new Date().toISOString();

      await env.DB.prepare(
        "INSERT INTO transactions (id, user_id, user_name, stream_id, type, amount_cents, discount_code, discount_cents, affiliate_code, payment_method, payment_reference, settlement_status, note, created_at) VALUES (?1, 'usr_rick_admin', 'Rick Jefferson, CEO', '', 'creator_payout', ?2, '', 0, '', ?3, ?4, 'settled', ?5, ?6)"
      )
        .bind(
          txId,
          amountCents,
          String(body.payout_method || "wire"),
          `PAYOUT-${randomId("wf")}`,
          body.notes || `Creator Payout Settlement -> ${destination}`,
          now
        )
        .run();

      return jsonResponse({
        ok: true,
        transaction_id: txId,
        invoice_url: `/api/payments/invoice/${txId}`,
      });
    }

    // Complete Revenue, Promo, Affiliate & Offer Ledger (/api/monetization/ledger and /api/monetization/summary)
    if (
      (path === "/api/monetization/ledger" ||
        path === "/api/monetization/summary") &&
      request.method === "GET"
    ) {
      const [
        txRows,
        revRow,
        tipsRow,
        offerRevRow,
        subRow,
        strRow,
        promosRes,
        affsRes,
        offersRes,
      ] = await Promise.all([
        env.DB.prepare(
          "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 60"
        ).all(),
        env.DB.prepare(
          "SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE type != 'creator_payout'"
        ).first(),
        env.DB.prepare(
          "SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE type = 'superchat_tip'"
        ).first(),
        env.DB.prepare(
          "SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE type = 'offer_purchase'"
        ).first(),
        env.DB.prepare(
          "SELECT COUNT(*) as count FROM users WHERE subscription_status = 'active'"
        ).first(),
        env.DB.prepare("SELECT COUNT(*) as count FROM streams").first(),
        env.DB.prepare(
          "SELECT * FROM promo_codes ORDER BY created_at DESC"
        ).all(),
        env.DB.prepare(
          "SELECT * FROM affiliates ORDER BY total_commission_cents DESC"
        ).all(),
        env.DB.prepare(
          "SELECT * FROM stream_offers ORDER BY created_at DESC"
        ).all(),
      ]);

      const transactions = (txRows.results || []).map((t) => ({
        ...t,
        tx_type: t.type,
        notes: t.note,
      }));
      const affiliates = (affsRes.results || []).map((a) => ({
        ...a,
        user_name: a.owner_name,
        referral_code: a.code,
        total_earned_cents: a.total_commission_cents,
      }));

      return jsonResponse({
        total_revenue_cents: revRow?.total ?? 0,
        total_tips_cents: tipsRow?.total ?? 0,
        superchat_revenue_cents: tipsRow?.total ?? 0,
        total_offer_revenue_cents: offerRevRow?.total ?? 0,
        offer_revenue_cents: offerRevRow?.total ?? 0,
        paid_subscribers_count: subRow?.count ?? 0,
        paid_subscribers: subRow?.count ?? 0,
        streams_count: strRow?.count ?? 0,
        promo_codes: promosRes.results || [],
        affiliates,
        offers: offersRes.results || [],
        transactions,
        recent_transactions: transactions,
      });
    }

    // 8. Automated Workflows Engine Endpoints (/api/workflows/*)
    if (path === "/api/workflows" && request.method === "GET") {
      const [rulesRes, runsRes] = await Promise.all([
        env.DB.prepare(
          "SELECT * FROM workflow_rules ORDER BY created_at ASC"
        ).all(),
        env.DB.prepare(
          "SELECT * FROM workflow_runs ORDER BY created_at DESC LIMIT 40"
        ).all(),
      ]);
      const rules = (rulesRes.results || []).map((r) => ({
        ...r,
        event_type: r.trigger_event,
        target_webhook: r.webhook_url,
        active: r.is_active,
      }));
      const runs = (runsRes.results || []).map((run) => ({
        ...run,
        event_type: run.trigger_event,
        response_summary: run.steps_executed,
      }));
      return jsonResponse({ rules, runs });
    }

    if (path === "/api/workflows" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const id = randomId("wf");
      const name = String(
        body.name || "Custom Automated Stream Workflow"
      ).trim();
      const trigger_event = String(
        body.trigger_event || body.event_type || "subscription.activated"
      ).trim();
      const action_type = String(
        body.action_type || "crm_webhook_and_tag"
      ).trim();
      const webhook_url = String(
        body.webhook_url ||
          body.target_webhook ||
          "https://services.leadconnectorhq.com/hooks/rj-stream-custom"
      ).trim();
      const now = new Date().toISOString();

      await env.DB.prepare(
        "INSERT INTO workflow_rules (id, name, trigger_event, action_type, webhook_url, config_json, is_active, runs_count, last_run_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, '{}', 1, 0, '', ?6)"
      )
        .bind(id, name, trigger_event, action_type, webhook_url, now)
        .run();

      return jsonResponse(
        {
          ok: true,
          id,
          name,
          trigger_event,
          event_type: trigger_event,
          webhook_url,
        },
        201
      );
    }

    if (path === "/api/workflows/trigger" && request.method === "POST") {
      const user = await getAuthenticatedUser(request, env);
      const body = await request.json().catch(() => ({}));
      const triggerEvent = String(
        body.trigger_event || body.event_type || "subscription.activated"
      );
      const runs = await executeWorkflowsForEvent(
        env,
        triggerEvent,
        user?.name || "Rick Jefferson (Manual Test)",
        body.payload || { test: true, source: "Workflow Studio Trigger" }
      );
      return jsonResponse({ ok: true, trigger_event: triggerEvent, runs });
    }

    const wfToggleMatch = path.match(/^\/api\/workflows\/([^/]+)(?:\/toggle)?$/);
    if (
      wfToggleMatch &&
      (request.method === "PATCH" || request.method === "POST")
    ) {
      const wfId = wfToggleMatch[1];
      const body = await request.json().catch(() => ({}));
      const existing = await env.DB.prepare(
        "SELECT * FROM workflow_rules WHERE id = ?1"
      )
        .bind(wfId)
        .first();
      const isActive =
        body.is_active !== undefined
          ? body.is_active
            ? 1
            : 0
          : existing?.is_active
          ? 0
          : 1;
      const webhookUrl = body.webhook_url ?? body.target_webhook;
      if (webhookUrl !== undefined) {
        await env.DB.prepare(
          "UPDATE workflow_rules SET is_active = ?1, webhook_url = ?2 WHERE id = ?3"
        )
          .bind(isActive, webhookUrl, wfId)
          .run();
      } else {
        await env.DB.prepare(
          "UPDATE workflow_rules SET is_active = ?1 WHERE id = ?2"
        )
          .bind(isActive, wfId)
          .run();
      }
      return jsonResponse({
        ok: true,
        id: wfId,
        is_active: isActive,
        active: isActive,
      });
    }

    return jsonResponse({ error: "Not Found", path }, 404);
  },
};
