(() => {
  "use strict";
  const config = window.SAKIB_SUPABASE_CONFIG || {};
  if (!config.url || !config.anonKey) {
    window.SAKIB_DB_ERROR = "Supabase is not configured. Follow the setup steps in README.md.";
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    window.SAKIB_DB_ERROR = "The Supabase client did not load. Check your internet connection and reload.";
    return;
  }
  try {
    window.SAKIB_DB = window.supabase.createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.SAKIB_BUCKET = "tutorial-resources";
  } catch (error) {
    console.error("Supabase client configuration is invalid:", error);
    window.SAKIB_DB_ERROR = `Supabase client configuration is invalid: ${error.message}`;
  }
})();
