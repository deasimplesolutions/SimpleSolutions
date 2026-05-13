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

const app = express();
const PORT = process.env.PORT || 3000;

// ── Configuration ──

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

// ── Vapi configuration ──
const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID =
  process.env.VAPI_ASSISTANT_ID || "4cfa1ff1-af8a-4285-8f78-2b397ca3effb";

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

// ── Vapi: agent profile ──

app.get("/api/vapi/agent", async (_req, res) => {
  if (!VAPI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured — VAPI_API_KEY not set." });
  }
  if (!VAPI_ASSISTANT_ID) {
    return res.status(500).json({ error: "Server misconfigured — VAPI_ASSISTANT_ID not set." });
  }

  try {
    const r = await fetch(`https://api.vapi.ai/assistant/${VAPI_ASSISTANT_ID}`, {
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
    console.error("Vapi agent fetch failed:", err);
    res.status(500).json({ error: "Failed to reach Vapi." });
  }
});

// ── Vapi: call list ──

app.get("/api/vapi/calls", async (req, res) => {
  if (!VAPI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured — VAPI_API_KEY not set." });
  }
  if (!VAPI_ASSISTANT_ID) {
    return res.status(500).json({ error: "Server misconfigured — VAPI_ASSISTANT_ID not set." });
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  try {
    const url = `https://api.vapi.ai/call?assistantId=${VAPI_ASSISTANT_ID}&limit=${limit}`;
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

// ── Start ──

app.listen(PORT, () => {
  console.log(`Chat proxy running on port ${PORT}`);
});
