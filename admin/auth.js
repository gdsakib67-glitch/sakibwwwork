(() => {
  "use strict";
  const ownerEmail = "gdsakib67@gmail.com";
  const db = window.SAKIB_DB;
  const message = document.querySelector("#login-message");
  const button = document.querySelector("#google-sign-in");
  const configNotice = document.querySelector("#config-notice");

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
    message.classList.toggle("success", !isError && Boolean(text));
  }

  function hasVerifiedOwnerGoogleIdentity(user) {
    const identityMatches = Array.isArray(user.identities) && user.identities.some((identity) =>
      identity.provider === "google" &&
      String(identity.identity_data && identity.identity_data.email || "").toLowerCase() === ownerEmail &&
      String(identity.identity_data.email_verified).toLowerCase() === "true"
    );
    return String(user.email || "").toLowerCase() === ownerEmail &&
      Boolean(user.email_confirmed_at) && identityMatches;
  }

  async function checkOwnerSession(session) {
    if (!session) return;
    if (!hasVerifiedOwnerGoogleIdentity(session.user)) {
      await db.auth.signOut();
      showMessage(`Only the verified Google account ${ownerEmail} can sign in here.`, true);
      return;
    }
    const { data, error } = await db.from("site_admins")
      .select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (error) {
      console.error("Owner authorization check failed:", error);
      await db.auth.signOut();
      showMessage("Could not verify owner authorization. Confirm the Supabase policies and owner grant.", true);
      return;
    }
    if (!data) {
      await db.auth.signOut();
      showMessage("Google verified, but this account has not been granted dashboard access. Follow grant-owner-admin.sql in the setup guide.", true);
      return;
    }
    window.location.replace(new URL("../dashboard/", window.location.href).href);
  }

  button.addEventListener("click", async () => {
    if (!db) return;
    button.disabled = true;
    showMessage("Connecting to Google…");
    try {
      const redirectTo = new URL("../dashboard/", window.location.href).href;
      const { error } = await db.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams: { prompt: "select_account" } }
      });
      if (error) throw error;
    } catch (error) {
      console.error("Google sign-in could not start:", error);
      showMessage(`Google sign-in could not start: ${error.message}`, true);
      button.disabled = false;
    }
  });

  document.querySelector("#current-year").textContent = String(new Date().getFullYear());
  try {
    const pendingMessage = sessionStorage.getItem("sakib-admin-login-message");
    if (pendingMessage) {
      showMessage(pendingMessage, true);
      sessionStorage.removeItem("sakib-admin-login-message");
    }
  } catch { /* Session storage is optional. */ }
  if (!db) {
    configNotice.hidden = false;
    document.querySelector("#config-message").textContent = window.SAKIB_DB_ERROR || "Supabase is not configured.";
    button.disabled = true;
  } else {
    db.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      return checkOwnerSession(data.session);
    }).catch((error) => {
      console.error("Could not restore the owner session:", error);
      showMessage(`Could not check your sign-in: ${error.message}`, true);
    });
  }
})();
