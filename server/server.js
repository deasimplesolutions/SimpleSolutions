// ============================================
// CHAT PROXY SERVER
// ============================================
// This server sits between your website and the
// Anthropic API so your API key stays private.
//
// The API key is read from an environment variable
// called ANTHROPIC_API_KEY (set in Render dashboard
// or in a .env file for local testing).
// ============================================

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Configuration ──

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

// ── Vapi configuration ──
const VAPI_API_KEY = process.env.VAPI_API_KEY;
// Optional shared secret. If set, every Vapi webhook request must include it
// in the X-Vapi-Secret header (configured in the Vapi assistant's serverUrlSecret).
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

// ── Resend (transactional email) ──
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Must be a verified sender on a verified domain in Resend (e.g. notifications@simplesolutionscompany.com).
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://simplesolutionscompany.com/dashboard.html";

// ── Supabase (server-side, used to verify user JWTs) ──
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// Verifies the Authorization: Bearer <token> header against Supabase and
// returns the user object (with app_metadata). Sends 401 and returns null
// if the token is missing/invalid.
async function requireUser(req, res) {
  if (!supabaseAdmin) {
    res
      .status(500)
      .json({ error: "Server misconfigured — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set." });
    return null;
  }
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing Authorization token." });
    return null;
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: "Invalid or expired session. Please log in again." });
    return null;
  }
  return data.user;
}

function getUserVapiConfig(user) {
  const meta = user.app_metadata || {};
  return {
    assistantId: meta.vapi_assistant_id || null,
    phoneNumber: meta.vapi_phone_number || null,
  };
}

// System prompt — edit this to change the chatbot's personality
const SYSTEM_PROMPT = `You are the AI assistant for Simple Solutions, an AI automation company. Your primary goal is to help visitors understand what we do and answer their questions.

## About Simple Solutions
We build AI-powered automation workflows inside the tools businesses already use (any CRM — HubSpot, ServiceTitan, Jobber, GoHighLevel, and more). We don't sell advice or strategy decks — we're the contractors who go in and wire your existing software to work smarter. No migrations, no rip-and-replace.

Tagline: "The Build is ours. The Results are yours."

## Services We Offer
- Speed to Lead
- Appointment Setting
- Website Chat Bot
- Website Creation

## Service Details (only share when the user asks about a specific service)
When a user asks for more info on a specific service, respond using the exact template below for that service. Do not add extra preamble, headings, or closing summaries. Keep it to the description paragraph + the "Book a demo by clicking the contact page and scheduling based on calendly" line. This booking line is ONLY to be included in responses about a specific service — never in any other type of response.

Speed to Lead template:
"Speed to Lead ensures no opportunity slips through the cracks — automatically following up via SMS and email the moment a call is missed, a message goes unanswered, or an inquiry comes in. By responding to leads instantly, our clients close more deals and stay ahead of the competition with response times that are hard to match manually.
Book a demo by clicking the contact page and scheduling based on calendly"

Appointment Setting template:
"Appointment Setting turns interest into booked meetings — with automated scheduling, constant follow-ups and reminders, and multi-channel outreach sequences that keep leads engaged until they're on your calendar. By nurturing prospects around the clock, our clients fill their pipelines without lifting a finger or losing leads to silence.
Book a demo by clicking the contact page and scheduling based on calendly"

Website Chat Bot template:
"Our Website Chat Bot turns every visitor into a potential lead — answering questions instantly, qualifying prospects, and booking appointments right from your site. By engaging visitors 24/7 with AI-powered conversations, our clients capture more leads and convert traffic into real opportunities around the clock.
Book a demo by clicking the contact page and scheduling based on calendly"

Website Creation template:
"Website Creation delivers clean, conversion-focused sites that are mobile-first, fast-loading, and built to turn visitors into customers — fully integrated with your CRM and tools. By pairing modern design with smart automations, our clients launch websites that don't just look good, they actively drive business.
Book a demo by clicking the contact page and scheduling based on calendly"

Timelines (only share if the user specifically asks "how long does it take?"):
- Speed to Lead: usually 2 to 3 weeks. First step is a quick intro call to hear about your current process.
- Appointment Setting: usually 2 to 3 weeks.
- Website Chat Bot: usually about 1 week.
- Website Creation: usually about 1 week.

## How to Present Services
- When a user asks "what services do you offer" or similar, ONLY list the service names (Speed to Lead, Appointment Setting, Website Chat Bot, Website Creation) and then ask a short follow-up question like "Would you like to know more about any of them?" Do NOT write a paragraph, intro, or descriptions — just the list and the short question.
- Keep the response to the services question very short: a quick list plus one brief follow-up question. No opening paragraph, no closing summary.
- When the user asks for more info about a specific service, respond using the exact template for that service from the "Service Details" section above. Do not add extra preamble, headings, or closing summaries.
- Do not mention timelines or "how long it takes" unless the user specifically asks.
- Never use markdown bold (**) or asterisks around service names. Write them in plain text.

## Industries We Serve
General Contractors, Roofing, Plumbing, Electricians, Cleaning Services, and Landscaping.

## Availability & Hours
- We operate 24/7 and respond to emails within 10 minutes.
- Yes, we offer same-day and emergency services.

## How to Get Started
- Visit our contact page to schedule a free consultation.
- Email: deasimplesolutions@gmail.com

## CRITICAL RULES
1. NEVER give specific pricing. If asked about cost, price, rates, or quotes, respond with something like: "Pricing depends on your specific needs and setup. The best way to get an accurate quote is a free consultation where we'll map out your workflows and give you a plain-English plan. You can schedule one from our contact page."
2. DO NOT include any Calendly link, any "book a meeting" nudge, or any booking CTA in responses EXCEPT when the user is asking about a specific service — in that case, use the exact template from the "Service Details" section (which already contains the booking line). No other response type should mention booking, scheduling, or Calendly.
3. Stay on-topic. Only answer questions about Simple Solutions, our services, and business automation. If asked about unrelated topics, politely redirect.
4. Be honest about what you don't know. If a visitor asks something you don't have information on, say so and offer to connect them with the team via email.
5. Never use markdown bold (**) or asterisks in responses. Write in plain text.

## Tone
Professional but approachable — somewhere between friendly and business-casual. Be concise (2-4 sentences typically). Use plain English, not jargon. Sound like a helpful person, not a corporate chatbot.

## Quick-Answer FAQs
- What services do you offer? Speed to Lead, Appointment Setting, Website Chat Bot, and Website Creation.
- What industries do you serve? General Contractors, Roofing, Plumbing, Electricians, Cleaning Services, and Landscaping.
- How long does a job take? (Only answer if asked directly) Speed to Lead: 2-3 weeks. Appointment Setting: 2-3 weeks. Website Creation: 1 week. Website Chat Bot: 1 week.
- Do you offer emergency/same-day service? Yes — we operate 24/7 and respond to emails within 10 minutes.
- What are your hours? 24/7.
- What CRMs do you work with? All major CRMs including HubSpot, ServiceTitan, Jobber, and GoHighLevel. We plug into whatever you already use.`;

// CORS — replace the wildcard with your actual domain in production
// e.g. "https://www.simplesolutions.com"
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "*";

// ── Middleware ──

app.use(express.json());
app.use(
  cors({
    origin: ALLOWED_ORIGINS === "*" ? "*" : ALLOWED_ORIGINS.split(","),
    methods: ["GET", "POST"],
  })
);

// ── Health check ──

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "Simple Solutions Chat Proxy" });
});

// ── Chat endpoint ──

app.post("/api/chat", async (req, res) => {
  // Validate API key is configured
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "Server misconfigured — ANTHROPIC_API_KEY not set.",
    });
  }

  // Validate request body
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: "Request must include a non-empty 'messages' array.",
    });
  }

  // Retry logic — retry up to 3 times on transient 529 (overloaded) errors
  const MAX_RETRIES = 3;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Exponential backoff: 0ms, 1000ms, 2000ms
      if (attempt > 0) {
        const delay = attempt * 1000;
        console.log(`Retry attempt ${attempt} after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: messages,
        }),
      });

      // If overloaded (529), retry
      if (response.status === 529) {
        const errBody = await response.json().catch(() => ({}));
        lastError = errBody?.error?.message || "Service is temporarily busy.";
        console.warn(`Anthropic API overloaded (attempt ${attempt + 1}/${MAX_RETRIES})`);
        continue; // retry
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = errBody?.error?.message || `Anthropic API error (${response.status})`;
        return res.status(response.status).json({ error: msg });
      }

      const data = await response.json();
      const reply = data.content?.[0]?.text || "";

      return res.json({ reply });
    } catch (err) {
      console.error(`Proxy error (attempt ${attempt + 1}):`, err);
      lastError = "Failed to reach the AI service.";
    }
  }

  // All retries exhausted
  console.error("All retries exhausted for Anthropic API call.");
  res.status(529).json({
    error: "Our AI assistant is temporarily busy. Please try again in a moment.",
  });
});

// ── Vapi: agent profile (per-user) ──

app.get("/api/vapi/agent", async (req, res) => {
  if (!VAPI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured — VAPI_API_KEY not set." });
  }
  const user = await requireUser(req, res);
  if (!user) return;

  const { assistantId, phoneNumber } = getUserVapiConfig(user);
  if (!assistantId) {
    return res.status(403).json({
      error: "no_assistant",
      message:
        "Your voice agent is not set up yet. Contact Simple Solutions to get assigned.",
    });
  }

  try {
    const r = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      const msg = errBody?.message || `Vapi API error (${r.status})`;
      return res.status(r.status).json({ error: msg });
    }
    const data = await r.json();
    // Pass the assigned phone number through so the dashboard does not need
    // to read it separately from the user session.
    if (phoneNumber) data.assignedPhoneNumber = phoneNumber;
    res.json(data);
  } catch (err) {
    console.error("Vapi agent fetch failed:", err);
    res.status(500).json({ error: "Failed to reach Vapi." });
  }
});

// ── Vapi: call list (per-user) ──

app.get("/api/vapi/calls", async (req, res) => {
  if (!VAPI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured — VAPI_API_KEY not set." });
  }
  const user = await requireUser(req, res);
  if (!user) return;

  const { assistantId } = getUserVapiConfig(user);
  if (!assistantId) {
    return res.status(403).json({
      error: "no_assistant",
      message:
        "Your voice agent is not set up yet. Contact Simple Solutions to get assigned.",
    });
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  try {
    const url = `https://api.vapi.ai/call?assistantId=${assistantId}&limit=${limit}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      const msg = errBody?.message || `Vapi API error (${r.status})`;
      return res.status(r.status).json({ error: msg });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("Vapi calls fetch failed:", err);
    res.status(500).json({ error: "Failed to reach Vapi." });
  }
});


// ── Vapi: single call detail (per-user) ──
//
// Also acts as the ownership gate for every artifact route below: a logged-in
// user may only touch calls that belong to *their* assistant.

const ARTIFACT_KINDS = {
  "mono-recording":      { ext: "wav",  type: "audio/wav" },
  "stereo-recording":    { ext: "wav",  type: "audio/wav" },
  "customer-recording":  { ext: "wav",  type: "audio/wav" },
  "assistant-recording": { ext: "wav",  type: "audio/wav" },
  "video-recording":     { ext: "mp4",  type: "video/mp4" },
  "call-logs":           { ext: "jsonl.gz", type: "application/gzip" },
  pcap:                  { ext: "pcap", type: "application/vnd.tcpdump.pcap" },
};

// Fetches the call from Vapi and confirms it belongs to the caller's assistant.
// Returns the call object, or null after having already sent an error response.
async function loadOwnedCall(req, res, callId) {
  if (!VAPI_API_KEY) {
    res.status(500).json({ error: "Server misconfigured — VAPI_API_KEY not set." });
    return null;
  }
  const user = await requireUser(req, res);
  if (!user) return null;

  const { assistantId } = getUserVapiConfig(user);
  if (!assistantId) {
    res.status(403).json({
      error: "no_assistant",
      message: "Your voice agent is not set up yet. Contact Simple Solutions to get assigned.",
    });
    return null;
  }
  if (!/^[A-Za-z0-9-]{10,64}$/.test(String(callId || ""))) {
    res.status(400).json({ error: "Invalid call id." });
    return null;
  }

  const r = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
  });
  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    res.status(r.status === 404 ? 404 : r.status)
       .json({ error: errBody?.message || `Vapi API error (${r.status})` });
    return null;
  }
  const call = await r.json();
  if (call.assistantId !== assistantId) {
    res.status(403).json({ error: "That call does not belong to your agent." });
    return null;
  }
  return call;
}

app.get("/api/vapi/calls/:id", async (req, res) => {
  try {
    const call = await loadOwnedCall(req, res, req.params.id);
    if (!call) return;

    const artifact = call.artifact || {};
    res.json({
      id: call.id,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      endedReason: call.endedReason,
      summary: call.analysis?.summary || "",
      structured: normalizeStructured(call),
      transcript: artifact.transcript || call.transcript || "",
      messages: (artifact.messages || call.messages || []).map((m) => ({
        role: m.role,
        message: m.message || m.content || "",
        secondsFromStart: m.secondsFromStart,
      })),
      // Recordings now live in Vapi's private bucket — the raw URLs are no
      // longer fetchable, so the dashboard asks for a signed URL on demand.
      hasRecording: !!(artifact.recordingUrl || artifact.recording || call.recordingUrl),
      hasStereoRecording: !!(artifact.stereoRecordingUrl || artifact.recording?.stereoUrl),
      hasVideo: !!(artifact.videoRecordingUrl || artifact.videoUrl),
    });
  } catch (err) {
    console.error("Vapi call detail fetch failed:", err);
    res.status(500).json({ error: "Failed to reach Vapi." });
  }
});

// ── Vapi: short-lived signed URL for a call artifact ──
//
// Vapi's artifact endpoints answer with a 302 to a short-lived signed URL. We
// resolve that redirect server-side (so the private key never leaves the
// server) and hand the signed URL to the dashboard, which can then stream it
// straight from Vapi's storage — no audio bytes through this server.

app.get("/api/vapi/calls/:id/artifact-url", async (req, res) => {
  const kind = String(req.query.kind || "mono-recording");
  if (!ARTIFACT_KINDS[kind]) {
    return res.status(400).json({ error: `Unknown artifact kind "${kind}".` });
  }
  try {
    const call = await loadOwnedCall(req, res, req.params.id);
    if (!call) return;

    const r = await fetch(`https://api.vapi.ai/call/${call.id}/${kind}`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      redirect: "manual",
    });

    const location = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && location) {
      return res.json({ url: location, kind, expiresInSeconds: 3600 });
    }
    if (r.status === 404) {
      return res.status(404).json({ error: "no_artifact", message: "No recording was saved for this call." });
    }
    const body = await r.text().catch(() => "");
    console.error(`Vapi artifact-url ${kind} returned ${r.status}: ${body.slice(0, 300)}`);
    return res.status(502).json({ error: `Vapi returned ${r.status} for ${kind}.` });
  } catch (err) {
    console.error("Vapi artifact-url failed:", err);
    res.status(500).json({ error: "Failed to reach Vapi." });
  }
});

// ── Vapi: proxy-download a call artifact ──
//
// Same data as /artifact-url, but streamed through this server so the browser
// gets a clean filename and a same-origin download. Used for the Download
// button; playback uses the signed URL directly.

app.get("/api/vapi/calls/:id/artifact", async (req, res) => {
  const kind = String(req.query.kind || "mono-recording");
  const spec = ARTIFACT_KINDS[kind];
  if (!spec) {
    return res.status(400).json({ error: `Unknown artifact kind "${kind}".` });
  }
  try {
    const call = await loadOwnedCall(req, res, req.params.id);
    if (!call) return;

    const headers = { Authorization: `Bearer ${VAPI_API_KEY}` };
    // Forward Range so <audio> can seek if this route is ever used for playback.
    if (req.headers.range) headers.Range = req.headers.range;

    const r = await fetch(`https://api.vapi.ai/call/${call.id}/${kind}`, { headers });
    if (!r.ok && r.status !== 206) {
      if (r.status === 404) {
        return res.status(404).json({ error: "no_artifact", message: "No recording was saved for this call." });
      }
      const body = await r.text().catch(() => "");
      console.error(`Vapi artifact ${kind} returned ${r.status}: ${body.slice(0, 300)}`);
      return res.status(502).json({ error: `Vapi returned ${r.status} for ${kind}.` });
    }

    res.status(r.status === 206 ? 206 : 200);
    res.setHeader("Content-Type", r.headers.get("content-type") || spec.type);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${kind}-${call.id}.${spec.ext}"`
    );
    ["content-length", "content-range"].forEach((h) => {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    if (!r.body) return res.end();
    const { Readable } = require("stream");
    Readable.fromWeb(r.body).pipe(res);
  } catch (err) {
    console.error("Vapi artifact proxy failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to reach Vapi." });
  }
});
// ── Vapi webhook: end-of-call notifications ──
//
// Configure this URL on your Vapi assistant (Vapi dashboard → Assistant →
// Server URL): https://simplesolutions-server.onrender.com/api/vapi/webhook
// And set Server URL Secret to whatever you put in VAPI_WEBHOOK_SECRET on Render.
//
// Vapi will POST end-of-call-report events here. We extract the booking
// info, find which user owns the assistant, and email them via Resend.

async function findUserByAssistantId(assistantId) {
  if (!supabaseAdmin || !assistantId) return null;
  // Paginate through users (page size 200 by default). For ~hundreds of users
  // this is fine; if you grow past a few thousand customers, replace this with
  // a `profiles` table indexed on assistant_id.
  let page = 1;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) return null;
    const match = data.users.find(
      (u) => u.app_metadata?.vapi_assistant_id === assistantId
    );
    if (match) return match;
    if (data.users.length < 200) return null;
    page++;
    if (page > 25) return null; // hard ceiling — refuse to paginate forever
  }
}

function gcalLinkFromCall(call) {
  // Best-effort parse of Vapi's structured appointmentDate. If unparseable,
  // default to "tomorrow at 9am local" so the user can still one-click create
  // an event and adjust the time inside Google Calendar.
  let start = null;
  if (call.appointmentDate) {
    const d = new Date(call.appointmentDate);
    if (!isNaN(d)) start = d;
  }
  if (!start) {
    start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour default

  const fmt = (d) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const title = `Job: ${call.customerName || "New customer"}`;
  const details = [
    call.customerName ? `Customer: ${call.customerName}` : "",
    call.phoneNumber ? `Phone: ${call.phoneNumber}` : "",
    call.email ? `Email: ${call.email}` : "",
    call.reasonForCalling ? `Reason: ${call.reasonForCalling}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details,
  });
  if (call.location) params.set("location", call.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function sendBookingEmail({ toEmail, toName, call }) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.warn("Resend not configured — skipping booking email.");
    return { skipped: true, reason: "no_resend_config" };
  }
  const gcalUrl = gcalLinkFromCall(call);
  const safe = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );

  const subject = `New booking — ${call.customerName || "voice agent"}`;
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;background:#faf9f7;margin:0;padding:24px;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #f0eee9;border-radius:14px;padding:28px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#16a34a;margin-bottom:8px;">New Booking</div>
    <h1 style="font-size:22px;color:#0f1a2e;margin:0 0 6px 0;font-weight:800;letter-spacing:-0.01em;">${safe(call.customerName || "New customer")}</h1>
    <p style="color:#6b7280;margin:0 0 20px 0;font-size:14px;">Your voice agent just booked a job for you.</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      ${call.phoneNumber ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px;">Phone</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:500;">${safe(call.phoneNumber)}</td></tr>` : ""}
      ${call.email ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Email</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:500;">${safe(call.email)}</td></tr>` : ""}
      ${call.location ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Location</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:500;">${safe(call.location)}</td></tr>` : ""}
      ${call.appointmentDate ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Appointment</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:500;">${safe(call.appointmentDate)}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">Reason</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:500;">${safe(call.reasonForCalling || "—")}</td></tr>
    </table>

    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <a href="${gcalUrl}" style="display:inline-block;background:#0f1a2e;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:14px;">Add to Google Calendar</a>
      <a href="${DASHBOARD_URL}" style="display:inline-block;background:#ffffff;color:#0f1a2e;text-decoration:none;padding:10px 18px;border:1.5px solid #e5e7eb;border-radius:8px;font-weight:600;font-size:14px;">View in dashboard</a>
    </div>

    <p style="color:#9ca3af;font-size:12px;margin-top:28px;border-top:1px solid #f0eee9;padding-top:16px;">Sent automatically by Simple Solutions when your voice agent books a job. If you didn't expect this, you can ignore the email.</p>
  </div>
</body></html>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [toEmail],
      subject,
      html,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error("Resend send failed:", r.status, body);
    return { ok: false, error: `Resend ${r.status}` };
  }
  const data = await r.json();
  return { ok: true, id: data.id };
}

// Normalize Vapi structured data across the legacy (name-keyed `structuredData`)
// and newer "Structured Outputs" (id-keyed `{name, result}`) shapes into one
// flat { fieldName: value } object.
function normalizeStructured(call) {
  const a = (call && call.analysis) || {};
  const out = {};
  const collect = (c) => {
    if (!c) return;
    if (Array.isArray(c)) {
      c.forEach((v) => { if (v && v.name) out[v.name] = v.result; });
      return;
    }
    if (typeof c === "object") {
      Object.keys(c).forEach((k) => {
        const v = c[k];
        if (v && typeof v === "object" && "name" in v) out[v.name] = v.result;
        else out[k] = v;
      });
    }
  };
  collect(a.structuredData);
  collect(a.structuredOutputs);
  return out;
}

app.post("/api/vapi/webhook", async (req, res) => {
  // Always 200 quickly so Vapi doesn't retry on transient failures.
  // Real failures get logged for inspection.
  try {
    if (VAPI_WEBHOOK_SECRET) {
      const provided = req.headers["x-vapi-secret"] || req.headers["x-vapi-signature"];
      if (provided !== VAPI_WEBHOOK_SECRET) {
        console.warn("Vapi webhook secret mismatch — ignoring request.");
        return res.status(401).json({ error: "Bad secret." });
      }
    }

    const message = req.body?.message || req.body;
    const type = message?.type;
    const call = message?.call || {};

    // Only act on the final report. Vapi sends many event types.
    if (type !== "end-of-call-report") {
      return res.status(200).json({ ok: true, ignored: type });
    }

    const structured = normalizeStructured(call);
    const booked = !!structured.bookedAppointment;
    if (!booked) {
      return res.status(200).json({ ok: true, ignored: "no_booking" });
    }

    const assistantId = call.assistantId;
    const user = await findUserByAssistantId(assistantId);
    if (!user) {
      console.warn("No user found for assistant", assistantId);
      return res.status(200).json({ ok: true, ignored: "no_user_for_assistant" });
    }

    const callPayload = {
      id: call.id,
      customerName: structured.customerName || call.customer?.name || "Unknown caller",
      phoneNumber: call.customer?.number || "",
      email: structured.email || "",
      location: structured.location || "",
      reasonForCalling:
        structured.reasonForCalling || call.analysis?.summary || "(no summary)",
      appointmentDate: structured.appointmentDate || "",
    };

    const result = await sendBookingEmail({
      toEmail: user.email,
      toName: user.user_metadata?.firstName || "",
      call: callPayload,
    });

    return res.status(200).json({ ok: true, sent: !!result.ok });
  } catch (err) {
    console.error("Vapi webhook handler error:", err);
    return res.status(200).json({ ok: false, error: "handler_error" });
  }
});

// ── Start ──

app.listen(PORT, () => {
  console.log(`Chat proxy running on port ${PORT}`);
});
