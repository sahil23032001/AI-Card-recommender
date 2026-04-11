const { supabase } = require("./supabase");

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

  if (card.is_active === false) score -= 100;
  return score;
}

async function shortlistCards(profile, limit = 10) {
  let query = supabase
    .from("credit_cards")
    .select("*")
    .eq("is_active", true);

  if (profile.preferred_bank) query = query.eq("issuer", profile.preferred_bank);
  if (profile.preferred_network) query = query.eq("network", profile.preferred_network);

  const { data, error } = await query.limit(80);
  if (error) throw error;

  return (data || [])
    .map((card) => ({ ...card, _score: scoreCard(card, profile) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

module.exports = { shortlistCards };
