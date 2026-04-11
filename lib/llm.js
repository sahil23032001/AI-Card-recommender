const config = require("./config");

async function callOpenRouter(messages, { model, temperature = 0.2, responseFormatJson = false } = {}) {
  if (!config.openrouterApiKey) throw new Error("OPENROUTER_API_KEY is missing");

  const payload = {
    model: model || config.llmModel || "openrouter/free",
    messages,
    temperature
  };

  if (responseFormatJson) payload.response_format = { type: "json_object" };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://vercel.app",
      "X-Title": "clever-card-finder"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return {
    provider: "openrouter",
    model: data.model || payload.model,
    text: data.choices?.[0]?.message?.content || ""
  };
}

async function callGroq(messages, { model, temperature = 0.2, responseFormatJson = false } = {}) {
  if (!config.groqApiKey) throw new Error("GROQ_API_KEY is missing");

  const payload = { model: model || config.llmModel, messages, temperature };
  if (responseFormatJson) payload.response_format = { type: "json_object" };

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.groqApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return {
    provider: "groq",
    model: data.model || payload.model,
    text: data.choices?.[0]?.message?.content || ""
  };
}

async function callLlm(messages, options = {}) {
  const provider = (options.provider || config.llmProvider || "openrouter").toLowerCase();
  if (provider === "groq") return callGroq(messages, options);
  return callOpenRouter(messages, options);
}

module.exports = { callLlm };
