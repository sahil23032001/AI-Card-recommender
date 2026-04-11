function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name, fallback = null) {
  return process.env[name] ?? fallback;
}

module.exports = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  llmProvider: optional("LLM_PROVIDER", "openrouter"),
  llmModel: optional("LLM_MODEL", "openrouter/free"),
  openrouterApiKey: optional("OPENROUTER_API_KEY"),
  groqApiKey: optional("GROQ_API_KEY"),
  cacheTtlSeconds: Number(optional("CACHE_TTL_SECONDS", "86400")),
  githubToken: optional("GITHUB_TOKEN"),
  githubRepoOwner: optional("GITHUB_REPO_OWNER"),
  githubRepoName: optional("GITHUB_REPO_NAME"),
  githubCachePath: optional("GITHUB_CACHE_PATH", "cache/recommendation-cache.json"),
  githubBranch: optional("GITHUB_BRANCH", "main"),
  githubCommitterName: optional("GITHUB_COMMITTER_NAME", "Clever Card Finder Bot"),
  githubCommitterEmail: optional("GITHUB_COMMITTER_EMAIL", "bot@example.com"),
  adminSyncSecret: optional("ADMIN_SYNC_SECRET")
};
