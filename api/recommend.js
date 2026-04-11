import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false }
  }
);

const BANKS = [
  "SBI Card",
  "HDFC Bank",
  "Axis Bank",
  "ICICI Bank",
  "Kotak Mahindra Bank",
  "IDFC FIRST Bank",
  "AU Small Finance Bank",
  "American Express India",
  "HSBC India",
  "IndusInd Bank",
  "RBL Bank",
  "YES BANK",
  "Standard Chartered India",
  "Bank of Baroda",
  "Federal Bank",
  "Punjab National Bank",
  "Union Bank of India",
  "Canara Bank"
];

const CATEGORY_KEYWORDS = {
  fuel: ["fuel", "petrol", "diesel", "hpcl", "bpcl", "indianoil", "iocl"],
  dining: ["dining", "restaurant", "food", "swiggy", "zomato"],
  groceries: ["groceries", "grocery", "supermarket"],
  online_shopping: ["online shopping", "amazon", "flipkart", "myntra", "shopping", "ecommerce"],
  travel: ["travel", "flight", "hotel", "vacation", "trip", "airport", "airline"],
  utilities: ["utilities", "bill", "electricity", "mobile", "recharge", "dth"],
  upi: ["upi", "rupay", "ru-pay"],
  movies: ["movie", "cinema", "bookmyshow"],
  forex: ["forex", "international", "abroad", "overseas"]
};

const BENEFIT_KEYWORDS = {
  cashback: ["cashback", "cash back"],
  reward_points: ["reward", "points"],
  lounge: ["lounge", "airport lounge"],
  travel_points: ["miles", "airmiles", "travel"],
  fuel_benefits: ["fuel", "petrol", "diesel"],
  low_annual_fee: ["low annual fee", "cheap fee", "low fee", "lifetime free", "no annual fee"],
  low_forex: ["low forex", "zero forex", "forex"],
  milestone_benefits: ["milestone", "voucher", "bonus", "spend threshold"],
  rupay_upi: ["upi", "rupay", "ru-pay"]
};

function parseRupeeAmount(text) {
  if (!text) return null;
  const cleaned = text.replace(/,/g, "");
  const lakh = cleaned.match(/(\d+(?:\.\d+)?)\s*lakh/i);
  if (lakh) return Math.round(Number(lakh[1]) * 100000);
  const k = cleaned.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (k) return Math.round(Number(k[1]) * 1000);
  const rs = cleaned.match(/₹\s*(\d+(?:\.\d+)?)/i) || cleaned.match(/rs\.?\s*(\d+(?:\.\d+)?)/i);
  if (rs) return Math.round(Number(rs[1]));
  const plain = cleaned.match(/\b(\d{4,7})\b/);
  if (plain) return Math.round(Number(plain[1]));
  return null;
}

function detectMonthlySpend(text, body) {
  if (body?.monthly_spend) return Number(body.monthly_spend);
  if (body?.annual_spend) return Math.round(Number(body.annual_spend) / 12);
  if (!text) return null;

  const p1 = /(?:monthly|per month|a month)\D{0,12}(₹\s*[\d,]+|\d+(?:\.\d+)?\s*lakh|\d+(?:\.\d+)?\s*k|\d{4,7})/i;
  const p2 = /(₹\s*[\d,]+|\d+(?:\.\d+)?\s*lakh|\d+(?:\.\d+)?\s*k|\d{4,7})\s*(?:monthly|per month|a month)/i;
  const pa = /(?:yearly|annual|per year|a year)\D{0,12}(₹\s*[\d,]+|\d+(?:\.\d+)?\s*lakh|\d+(?:\.\d+)?\s*k|\d{4,7})/i;

  const m = text.match(p1) || text.match(p2);
  if (m) return parseRupeeAmount(m[1]);

  const a = text.match(pa);
  if (a) {
    const annual = parseRupeeAmount(a[1]);
    return annual ? Math.round(annual / 12) : null;
  }
  return null;
}

function detectBank(text, body) {
  if (body?.preferred_bank) return body.preferred_bank;
  if (!text) return null;
  return BANKS.find((bank) => text.toLowerCase().includes(bank.toLowerCase())) || null;
}

function detectMatches(text, dict, fromBody = []) {
  const values = new Set((fromBody || []).map((x) => String(x).toLowerCase()));
  if (text) {
    const lower = text.toLowerCase();
    for (const [normalized, keywords] of Object.entries(dict)) {
      if (keywords.some((kw) => lower.includes(kw))) values.add(normalized);
    }
  }
  return [...values];
}

function normalizeProfile(body = {}) {
  const query = (body.query || body.notes || "").trim();
  const monthlySpend = detectMonthlySpend(query, body);
  const annualSpend = body.annual_spend ? Number(body.annual_spend) : (monthlySpend ? monthlySpend * 12 : null);
  const preferredBank = detectBank(query, body);

  const spendCategories = body.spend_categories?.length
    ? body.spend_categories
    : detectMatches(query, CATEGORY_KEYWORDS);

  const desiredBenefits = body.desired_benefits?.length
    ? body.desired_benefits
    : detectMatches(query, BENEFIT_KEYWORDS);

  return {
    query,
    monthly_spend: monthlySpend,
    annual_spend: annualSpend,
    spend_categories: spendCategories,
    desired_benefits: desiredBenefits,
    preferred_bank: preferredBank,
    preferred_network: body.preferred_network || null,
    max_annual_fee: body.max_annual_fee != null ? Number(body.max_annual_fee) : null,
    require_lounge: body.require_lounge ?? desiredBenefits.includes("lounge"),
    require_low_forex: body.require_low_forex ?? desiredBenefits.includes("low_forex"),
    notes: body.notes || null
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requestHash(profile) {
  return crypto.createHash("sha256").update(stableStringify(profile)).digest("hex");
}

function isFresh(row) {
  const updatedAt = row?.updated_at ? new Date(row.updated_at).getTime() : 0;
  const ageSeconds = (Date.now() - updatedAt) / 1000;
  return ageSeconds <= 86400;
}

function overlapCount(listA = [], listB = []) {
  const setB = new Set((listB || []).map((x) => String(x).toLowerCase()));
  return (listA || []).filter((x) => setB.has(String(x).toLowerCase())).length;
}

function scoreCard(card, profile) {
  let score = 0;

  if (profile.preferred_bank && card.issuer === profile.preferred_bank) score += 20;

  if (profile.max_annual_fee != null) {
    if (card.annual_fee == null) score += 2;
    else if (Number(card.annual_fee) <= profile.max_annual_fee) score += 15;
    else score -= 20;
  }

  if (profile.require_lounge) {
    const loungeCount = (card.lounge_domestic || 0) + (card.lounge_international || 0);
    if (loungeCount > 0) score += 18;
    else if ((card.reward_type || []).includes("lounge")) score += 10;
    else score -= 10;
  }

  if (profile.require_low_forex) {
    if (card.forex_markup_pct != null && Number(card.forex_markup_pct) <= 2) score += 15;
    else if (card.forex_markup_pct == null) score += 2;
    else score -= 8;
  }

  score += overlapCount(card.reward_type, profile.desired_benefits) * 10;

  const benefitsText = `${card.key_benefits || ""} ${card.card_type || ""}`.toLowerCase();
  for (const category of profile.spend_categories || []) {
    if (benefitsText.includes(category.replace("_", " "))) score += 5;
  }

  return score;
}

function buildKeywordTerms(profile) {
  const terms = [];
  if (profile.query) terms.push(...profile.query.toLowerCase().split(/\W+/));
  terms.push(...(profile.spend_categories || []).map((x) => x.replace("_", " ")));
  terms.push(...(profile.desired_benefits || []));
  if (profile.require_lounge) terms.push("lounge");
  if (profile.require_low_forex) terms.push("forex");
  terms.push("milestone", "annual fee", "waiver");
  return [...new Set(terms.filter((x) => x && x.length > 2))];
}

function scoreChunk(chunk, terms) {
  const text = `${chunk.section || ""} ${chunk.chunk_text || ""}`.toLowerCase();
  return terms.reduce((sum, t) => sum + (text.includes(t.toLowerCase()) ? 1 : 0), 0);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {
      summary: text,
      best_card: null,
      alternatives: [],
      raw_model_output: text
    };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY is not configured on the server." });
  }

  const debug = {
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasGroqKey: !!process.env.GROQ_API_KEY
  };

  try {
    const body = req.body || {};
    const profile = normalizeProfile(body);

    if (!profile.query && !profile.monthly_spend && !(profile.spend_categories || []).length) {
      return res.status(400).json({
        error: "Provide either a free-text query or structured spend preferences.",
        debug
      });
    }

    const hash = requestHash(profile);

    const { data: cachedRow, error: cacheError } = await supabase
      .from("recommendation_cache")
      .select("*")
      .eq("request_hash", hash)
      .maybeSingle();

    if (cacheError) throw cacheError;

    if (cachedRow && isFresh(cachedRow)) {
      await supabase.rpc("bump_recommendation_cache_hit", { p_request_hash: hash }).catch(() => null);
      return res.status(200).json({
        source: "cache",
        request_hash: hash,
        debug,
        ...cachedRow.response_json
      });
    }

    let cardQuery = supabase
      .from("credit_cards")
      .select("*")
      .eq("is_active", true);

    if (profile.preferred_bank) cardQuery = cardQuery.eq("issuer", profile.preferred_bank);
    if (profile.preferred_network) cardQuery = cardQuery.eq("network", profile.preferred_network);

    const { data: cards, error: cardsError } = await cardQuery.limit(80);
    if (cardsError) throw cardsError;

    const shortlisted = (cards || [])
      .map((card) => ({ ...card, _score: scoreCard(card, profile) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 10);

    if (!shortlisted.length) {
      return res.status(404).json({ error: "No matching active cards found.", debug });
    }

    const cardIds = shortlisted.map((c) => c.id);

    const { data: docs, error: docsError } = await supabase
      .from("card_documents")
      .select("id, card_id, document_type, title, source_url, raw_text")
      .in("card_id", cardIds)
      .limit(300);

    if (docsError) throw docsError;

    const { data: chunks, error: chunksError } = await supabase
      .from("card_chunks")
      .select("id, card_id, document_id, section, chunk_text, metadata")
      .in("card_id", cardIds)
      .limit(1200);

    if (chunksError) throw chunksError;

    const { data: facts, error: factsError } = await supabase
      .from("card_benefit_facts")
      .select("card_id, benefit_type, benefit_value, benefit_unit, condition_text")
      .in("card_id", cardIds)
      .limit(1000);

    if (factsError) throw factsError;

    const docsByCard = {};
    for (const doc of docs || []) {
      if (!docsByCard[doc.card_id]) docsByCard[doc.card_id] = [];
      docsByCard[doc.card_id].push({
        document_type: doc.document_type,
        title: doc.title,
        source_url: doc.source_url,
        raw_text: doc.raw_text ? String(doc.raw_text).slice(0, 6000) : null
      });
    }

    const terms = buildKeywordTerms(profile);
    const chunksByCard = {};
    for (const ch of chunks || []) {
      const score = scoreChunk(ch, terms);
      if (!chunksByCard[ch.card_id]) chunksByCard[ch.card_id] = [];
      chunksByCard[ch.card_id].push({ ...ch, _score: score });
    }

    Object.keys(chunksByCard).forEach((cardId) => {
      chunksByCard[cardId] = chunksByCard[cardId]
        .sort((a, b) => b._score - a._score)
        .slice(0, 10)
        .map(({ _score, ...rest }) => rest);
    });

    const factsByCard = {};
    for (const fact of facts || []) {
      if (!factsByCard[fact.card_id]) factsByCard[fact.card_id] = [];
      factsByCard[fact.card_id].push(fact);
    }

    const evidence = shortlisted.map((card) => ({
      card_slug: card.card_slug,
      card_name: card.card_name,
      documents: docsByCard[card.id] || [],
      chunks: chunksByCard[card.id] || [],
      benefit_facts: factsByCard[card.id] || []
    }));

    const finalMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          user_profile: profile,
          shortlisted_cards: shortlisted.map(({ _score, ...rest }) => rest),
          official_evidence: evidence
        })
      }
    ];

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 900,
        messages: finalMessages,
        response_format: { type: "json_object" }
      })
    });

    const raw = await groqRes.text();

    if (!groqRes.ok) {
      return res.status(groqRes.status).json({
        error: "Recommendation failed",
        details: raw,
        debug
      });
    }

    const data = JSON.parse(raw);
    const content = data.choices?.[0]?.message?.content || "";
    const recommendation = safeJsonParse(content);

    const responsePayload = {
      parsed_profile: profile,
      shortlisted_cards: shortlisted.map(({ _score, ...rest }) => rest),
      recommendation
    };

    await supabase
      .from("recommendation_cache")
      .upsert(
        {
          request_hash: hash,
          normalized_profile: profile,
          response_json: responsePayload,
          llm_provider: "groq",
          llm_model: "llama-3.3-70b-versatile",
          updated_at: new Date().toISOString()
        },
        { onConflict: "request_hash" }
      );

    return res.status(200).json({
      source: "llm",
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      debug,
      ...responsePayload
    });
  } catch (err) {
    console.error("Groq API error:", err);
    return res.status(500).json({
      error: "Recommendation failed",
      details: err.message,
      debug
    });
  }
}
