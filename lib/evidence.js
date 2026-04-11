const { supabase } = require("./supabase");

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

async function fetchEvidenceForCards(cardIds, profile) {
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
      .slice(0, 10);
  });

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

  return { docsByCard, chunksByCard };
}

module.exports = { fetchEvidenceForCards };
