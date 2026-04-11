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

  const maxAnnualFee = body.max_annual_fee != null ? Number(body.max_annual_fee) : null;

  return {
    query,
    monthly_spend: monthlySpend,
    annual_spend: annualSpend,
    spend_categories: spendCategories,
    desired_benefits: desiredBenefits,
    preferred_bank: preferredBank,
    preferred_network: body.preferred_network || null,
    max_annual_fee: maxAnnualFee,
    require_lounge: body.require_lounge ?? desiredBenefits.includes("lounge"),
    require_low_forex: body.require_low_forex ?? desiredBenefits.includes("low_forex"),
    notes: body.notes || null
  };
}

module.exports = { normalizeProfile };
