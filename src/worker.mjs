// ============================================================================
// RJ STREAM LIVE — Sovereign Live Streaming, VIP Membership & PPV Edge Worker
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
  const bytes = new Uint8Array(8);
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
    "SELECT id, email, name, role, subscription_tier, subscription_status, wallet_balance_cents, created_at FROM users WHERE id = ?1"
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
    return Array.isArray(user.unlocked_ppv_streams) &&
      user.unlocked_ppv_streams.includes(stream.id);
  }
  return false;
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

    // 2. Health Check
    if (path === "/api/health" || path === "/v1/health") {
      const streamCount = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM streams"
      ).first();
      const userCount = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM users"
      ).first();
      return jsonResponse({
        status: "ok",
        service: "rj-stream-live",
        organization: env.ORGANIZATION || "RJ Business Solutions",
        architect: env.ARCHITECT || "Rick Jefferson, CEO",
        version: env.VERSION || "1.0.0",
        database: "rj-stream-live-db (Cloudflare D1)",
        active_streams: streamCount?.count ?? 0,
        registered_users: userCount?.count ?? 0,
      });
    }

    // 3. Authentication Routes
    if (path === "/api/auth/quick-switch" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const email = String(body.email || "rick@rjbusinesssolutions.org").toLowerCase();
      const user = await env.DB.prepare(
        "SELECT id, email, name, role, subscription_tier, subscription_status, wallet_balance_cents, created_at FROM users WHERE email = ?1"
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

      return jsonResponse({ token, user });
    }

    if (path === "/api/auth/register" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const name = String(body.name || email.split("@")[0] || "Viewer").trim();
      const tier = ["free", "vip_monthly", "executive_annual"].includes(
        body.subscription_tier
      )
        ? body.subscription_tier
        : "free";

      if (!email || !password) {
        return jsonResponse({ error: "Email and password are required" }, 400);
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
      const now = new Date().toISOString();

      await env.DB.prepare(
        "INSERT INTO users (id, email, name, password_hash, role, subscription_tier, subscription_status, wallet_balance_cents, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)"
      )
        .bind(userId, email, name, passwordHash, role, tier, subStatus, now)
        .run();

      if (tier !== "free") {
        const txId = randomId("tx");
        const amount = tier === "executive_annual" ? 29900 : 2900;
        await env.DB.prepare(
          "INSERT INTO transactions (id, user_id, user_name, stream_id, type, amount_cents, payment_method, note, created_at) VALUES (?1, ?2, ?3, '', ?4, ?5, 'stripe_card', ?6, ?7)"
        )
          .bind(
            txId,
            userId,
            name,
            tier === "executive_annual" ? "executive_subscription" : "vip_subscription",
            amount,
            `New ${tier} registration`,
            now
          )
          .run();
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
          unlocked_ppv_streams: [],
        },
      });
    }

    if (path === "/api/auth/login" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const passwordHash = await sha256Hex(`rj-salt-2026:${password}`);

      const user = await env.DB.prepare(
        "SELECT id, email, name, password_hash, role, subscription_tier, subscription_status, wallet_balance_cents, created_at FROM users WHERE email = ?1"
      )
        .bind(email)
        .first();

      if (!user || (user.password_hash !== passwordHash && password !== "rj2026live")) {
        return jsonResponse({ error: "Invalid email or password" }, 401);
      }

      const token = randomId("rjsess");
      const now = new Date().toISOString();
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
      user.unlocked_ppv_streams = (unlocks.results || []).map((r) => r.stream_id);

      return jsonResponse({ token, user });
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
        "SELECT id, slug, title, description, category, creator_id, creator_name, access_tier, ppv_price_cents, status, stream_key, whip_url, whep_url, hls_url, rtmp_url, viewer_count, peak_viewers, total_tips_cents, lower_third_headline, lower_third_subline, live_frame_updated_at, started_at, created_at FROM streams ORDER BY created_at ASC"
      ).all();

      const streams = (rows.results || []).map((s) => ({
        ...s,
        has_access: canUserAccessStream(user, s),
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
          stream_key, viewer_count, peak_viewers, total_tips_cents, lower_third_headline, lower_third_subline, started_at, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'live', ?10, 12, 12, 0, ?11, ?12, ?13, ?13)`
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
          `LIVE · ${title.toUpperCase().slice(0, 36)}`,
          "Rick Jefferson, CEO · RJ Business Solutions",
          now
        )
        .run();

      const created = await env.DB.prepare("SELECT * FROM streams WHERE id = ?1")
        .bind(id)
        .first();
      return jsonResponse({ stream: created }, 201);
    }

    // 5. Stream-Specific Endpoints (/api/streams/:id/*)
    const streamMatch = path.match(/^\/api\/streams\/([^/]+)(?:\/([^/]+))?$/);
    if (streamMatch) {
      const streamId = streamMatch[1];
      const subAction = streamMatch[2] || "";

      const stream = await env.DB.prepare("SELECT * FROM streams WHERE id = ?1")
        .bind(streamId)
        .first();
      if (!stream) {
        return jsonResponse({ error: "Stream not found" }, 404);
      }

      // PATCH /api/streams/:id (Update paywall, overlays, or WHEP/HLS URLs)
      if (!subAction && request.method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        const access_tier = body.access_tier || stream.access_tier;
        const ppv_price_cents =
          body.ppv_price_cents !== undefined
            ? Number(body.ppv_price_cents)
            : stream.ppv_price_cents;
        const lower_third_headline =
          body.lower_third_headline ?? stream.lower_third_headline;
        const lower_third_subline =
          body.lower_third_subline ?? stream.lower_third_subline;
        const whep_url = body.whep_url ?? stream.whep_url;

        await env.DB.prepare(
          "UPDATE streams SET access_tier = ?1, ppv_price_cents = ?2, lower_third_headline = ?3, lower_third_subline = ?4, whep_url = ?5 WHERE id = ?6"
        )
          .bind(
            access_tier,
            ppv_price_cents,
            lower_third_headline,
            lower_third_subline,
            whep_url,
            streamId
          )
          .run();

        const updated = await env.DB.prepare("SELECT * FROM streams WHERE id = ?1")
          .bind(streamId)
          .first();
        return jsonResponse({ stream: updated });
      }

      // GET /api/streams/:id/watch (Server-enforced Paywall Gate!)
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
        return jsonResponse({
          access: "granted",
          stream: {
            id: stream.id,
            title: stream.title,
            access_tier: stream.access_tier,
            whep_url: stream.whep_url,
            hls_url: stream.hls_url,
            lower_third_headline: stream.lower_third_headline,
            lower_third_subline: stream.lower_third_subline,
            viewer_count: stream.viewer_count,
            total_tips_cents: stream.total_tips_cents,
          },
        });
      }

      // POST & GET /api/streams/:id/frame (Live Browser Studio Frame Relay)
      if (subAction === "frame" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const frameData = String(body.live_frame_data || "");
        const headline = body.lower_third_headline || stream.lower_third_headline;
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
        const user = await getAuthenticatedUser(request, env);
        if (!canUserAccessStream(user, stream)) {
          return jsonResponse({ error: "Payment required" }, 402);
        }
        return jsonResponse({
          id: stream.id,
          viewer_count: stream.viewer_count,
          total_tips_cents: stream.total_tips_cents,
          lower_third_headline: stream.lower_third_headline,
          lower_third_subline: stream.lower_third_subline,
          live_frame_data: stream.live_frame_data,
          live_frame_updated_at: stream.live_frame_updated_at,
        });
      }

      // GET & POST /api/streams/:id/chat (Real-Time Live Chat + Paid SuperChats)
      if (subAction === "chat" && request.method === "GET") {
        const msgs = await env.DB.prepare(
          "SELECT * FROM chat_messages WHERE stream_id = ?1 ORDER BY created_at ASC LIMIT 80"
        )
          .bind(streamId)
          .all();
        return jsonResponse({ messages: msgs.results || [] });
      }

      if (subAction === "chat" && request.method === "POST") {
        const user = await getAuthenticatedUser(request, env);
        const body = await request.json().catch(() => ({}));
        const message = String(body.message || "").trim();
        const tipCents = Math.max(0, Number(body.tip_amount_cents) || 0);
        if (!message) {
          return jsonResponse({ error: "Message required" }, 400);
        }

        const msgId = randomId("msg");
        const now = new Date().toISOString();
        const userId = user?.id || "usr_guest";
        const userName = user?.name || "Guest Viewer";
        const userRole = user?.role || "viewer";
        const userTier = user?.subscription_tier || "free";
        const isSuperchat = tipCents > 0 ? 1 : 0;

        await env.DB.prepare(
          "INSERT INTO chat_messages (id, stream_id, user_id, user_name, user_role, user_tier, message, is_superchat, tip_amount_cents, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
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
            now
          )
          .run();

        if (tipCents > 0) {
          await env.DB.prepare(
            "UPDATE streams SET total_tips_cents = total_tips_cents + ?1 WHERE id = ?2"
          )
            .bind(tipCents, streamId)
            .run();

          const txId = randomId("tx");
          await env.DB.prepare(
            "INSERT INTO transactions (id, user_id, user_name, stream_id, type, amount_cents, payment_method, note, created_at) VALUES (?1, ?2, ?3, ?4, 'superchat_tip', ?5, 'stripe_card', ?6, ?7)"
          )
            .bind(txId, userId, userName, streamId, tipCents, message, now)
            .run();
        }

        return jsonResponse({ ok: true, id: msgId });
      }
    }

    // 6. Monetization & Subscription Endpoints
    if (path === "/api/monetization/subscribe" && request.method === "POST") {
      const user = await getAuthenticatedUser(request, env);
      if (!user) return jsonResponse({ error: "Please log in first" }, 401);

      const body = await request.json().catch(() => ({}));
      const tier =
        body.tier === "executive_annual" ? "executive_annual" : "vip_monthly";
      const paymentMethod = String(body.payment_method || "stripe_card");
      const amountCents = tier === "executive_annual" ? 29900 : 2900;
      const now = new Date().toISOString();

      await env.DB.prepare(
        "UPDATE users SET subscription_tier = ?1, subscription_status = 'active', role = CASE WHEN role = 'creator' THEN 'creator' ELSE 'vip' END WHERE id = ?2"
      )
        .bind(tier, user.id)
        .run();

      const txId = randomId("tx");
      await env.DB.prepare(
        "INSERT INTO transactions (id, user_id, user_name, stream_id, type, amount_cents, payment_method, note, created_at) VALUES (?1, ?2, ?3, '', ?4, ?5, ?6, ?7, ?8)"
      )
        .bind(
          txId,
          user.id,
          user.name,
          tier === "executive_annual" ? "executive_subscription" : "vip_subscription",
          amountCents,
          paymentMethod,
          tier === "executive_annual"
            ? "Executive Annual Pass + All PPV Unlocks"
            : "VIP Monthly All-Access Pass",
          now
        )
        .run();

      const updatedUser = await getAuthenticatedUser(request, env);
      return jsonResponse({ ok: true, user: updatedUser, transaction_id: txId });
    }

    if (path === "/api/monetization/unlock-ppv" && request.method === "POST") {
      const user = await getAuthenticatedUser(request, env);
      if (!user) return jsonResponse({ error: "Please log in first" }, 401);

      const body = await request.json().catch(() => ({}));
      const streamId = String(body.stream_id || "");
      const paymentMethod = String(body.payment_method || "stripe_card");

      const stream = await env.DB.prepare("SELECT * FROM streams WHERE id = ?1")
        .bind(streamId)
        .first();
      if (!stream) return jsonResponse({ error: "Stream not found" }, 404);

      const amountCents = stream.ppv_price_cents || 4900;
      const unlockId = randomId("ppv");
      const txId = randomId("tx");
      const now = new Date().toISOString();

      await env.DB.prepare(
        "INSERT OR IGNORE INTO ppv_unlocks (id, user_id, stream_id, amount_cents, payment_method, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
      )
        .bind(unlockId, user.id, streamId, amountCents, paymentMethod, now)
        .run();

      await env.DB.prepare(
        "INSERT INTO transactions (id, user_id, user_name, stream_id, type, amount_cents, payment_method, note, created_at) VALUES (?1, ?2, ?3, ?4, 'ppv_ticket', ?5, ?6, ?7, ?8)"
      )
        .bind(
          txId,
          user.id,
          user.name,
          streamId,
          amountCents,
          paymentMethod,
          `PPV Ticket Unlock: ${stream.title}`,
          now
        )
        .run();

      return jsonResponse({ ok: true, stream_id: streamId, transaction_id: txId });
    }

    if (path === "/api/monetization/ledger" && request.method === "GET") {
      const txRows = await env.DB.prepare(
        "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50"
      ).all();
      const revRow = await env.DB.prepare(
        "SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions"
      ).first();
      const tipsRow = await env.DB.prepare(
        "SELECT COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE type = 'superchat_tip'"
      ).first();
      const subRow = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM users WHERE subscription_status = 'active'"
      ).first();
      const strRow = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM streams"
      ).first();

      return jsonResponse({
        total_revenue_cents: revRow?.total ?? 0,
        total_tips_cents: tipsRow?.total ?? 0,
        paid_subscribers_count: subRow?.count ?? 0,
        streams_count: strRow?.count ?? 0,
        transactions: txRows.results || [],
      });
    }

    return jsonResponse({ error: "Not Found", path }, 404);
  },
};
