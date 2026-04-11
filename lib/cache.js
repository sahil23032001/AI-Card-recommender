const { supabase } = require("./supabase");
const config = require("./config");
const { stableStringify, sha256 } = require("./hash");

function requestHash(profile) {
  return sha256(stableStringify(profile));
}

function isFresh(row) {
  const updatedAt = row?.updated_at ? new Date(row.updated_at).getTime() : 0;
  const ageSeconds = (Date.now() - updatedAt) / 1000;
  return ageSeconds <= config.cacheTtlSeconds;
}

async function getCachedRecommendation(profile) {
  const hash = requestHash(profile);

  const { data, error } = await supabase
    .from("recommendation_cache")
    .select("*")
    .eq("request_hash", hash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { hit: false, hash };
  if (!isFresh(data)) return { hit: false, hash };

  await supabase.rpc("bump_recommendation_cache_hit", { p_request_hash: hash }).catch(() => null);
  return { hit: true, hash, row: data };
}

async function putCachedRecommendation(profile, responseJson, llmMeta = {}) {
  const hash = requestHash(profile);
  const payload = {
    request_hash: hash,
    normalized_profile: profile,
    response_json: responseJson,
    llm_provider: llmMeta.provider || null,
    llm_model: llmMeta.model || null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("recommendation_cache")
    .upsert(payload, { onConflict: "request_hash" });

  if (error) throw error;
  return hash;
}

module.exports = { requestHash, getCachedRecommendation, putCachedRecommendation };
