(() => {
  "use strict";

  const OWNER_EMAIL = "gdsakib67@gmail.com";
  const db = window.SAKIB_DB;
  const bucket = window.SAKIB_BUCKET;
  const maxFileSize = 100 * 1024 * 1024;
  const maxImageSize = 5 * 1024 * 1024;
  const appCategories = ["Gaming Apps", "PC Tools", "Android Apps", "Minecraft Tools", "Video Editing", "Streaming Tools", "Other Apps"];
  const websiteCategories = ["Gaming", "AI Tools", "Minecraft", "Free Tools", "Learning", "Editing", "Developer Tools"];
  const uploadTypes = {
    pdf: ["application/pdf"], zip: ["application/zip", "application/x-zip-compressed"],
    png: ["image/png"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], webp: ["image/webp"],
    txt: ["text/plain"], json: ["application/json", "application/octet-stream"],
    csv: ["text/csv", "application/octet-stream"], md: ["text/markdown"], log: ["text/plain"],
    apk: ["application/vnd.android.package-archive", "application/octet-stream"],
    msi: ["application/x-msi", "application/octet-stream"],
    exe: ["application/vnd.microsoft.portable-executable", "application/x-msdownload", "application/octet-stream"]
  };
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  let apps = [];
  let links = [];
  let toastTimer;

  function notify(text, error = false) {
    const toast = $("#admin-toast");
    toast.textContent = text;
    toast.classList.toggle("toast-error", error);
    toast.classList.add("toast-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("toast-visible"), 4000);
  }

  function setMessage(id, text, type = "") {
    const target = $(id);
    target.textContent = text;
    target.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function setBusy(form, busy) {
    form.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return "Size unavailable";
    const unit = bytes >= 1024 * 1024 ? 1024 * 1024 : 1024;
    return `${(bytes / unit).toFixed(1)} ${unit === 1024 * 1024 ? "MB" : "KB"}`;
  }

  function safeHttps(value, label) {
    if (!value) return "";
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid HTTPS URL.`); }
    if (parsed.protocol !== "https:" || !parsed.hostname) throw new Error(`${label} must use HTTPS.`);
    return parsed.href;
  }

  function safeUploadFile(file) {
    const pieces = file.name.split(".");
    const extension = pieces.pop().toLowerCase();
    const acceptedMimes = uploadTypes[extension];
    if (!acceptedMimes || (file.type && !acceptedMimes.includes(file.type))) {
      throw new Error("File extension and detected type do not match an allowed file type.");
    }
    if (!file.size || file.size > maxFileSize) throw new Error("Choose a file from 1 byte to 100 MB.");
    const base = pieces.join(".").normalize("NFKD").replace(/[^A-Za-z0-9._ -]/g, "-")
      .replace(/^[^A-Za-z0-9]+/, "").slice(0, 140) || "app";
    const mimeByExtension = {
      apk: "application/vnd.android.package-archive",
      msi: "application/x-msi",
      exe: "application/vnd.microsoft.portable-executable",
      zip: "application/zip"
    };
    return { name: `${base}.${extension}`, mime: mimeByExtension[extension] || file.type || acceptedMimes[0] };
  }

  function validateImage(file) {
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["png", "jpg", "jpeg", "webp"].includes(extension) ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      !file.size || file.size > maxImageSize) {
      throw new Error("Images must be PNG, JPG, or WEBP and no larger than 5 MB.");
    }
  }

  function setProgress(text, percent) {
    $("#app-upload-status").hidden = false;
    $("#app-upload-message").textContent = text;
    $("#app-upload-percent").textContent = `${Math.round(percent)}%`;
    $("#app-upload-progress").value = percent;
    $("#app-upload-progress").setAttribute("aria-label", text);
  }

  async function uploadFile(file, path, mime, offset, total) {
    const config = window.SAKIB_SUPABASE_CONFIG;
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error("Your administrator session has expired. Sign in again.");
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      request.open("POST", `${config.url.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`);
      request.setRequestHeader("apikey", config.anonKey);
      request.setRequestHeader("Authorization", `Bearer ${data.session.access_token}`);
      request.setRequestHeader("Content-Type", mime);
      request.setRequestHeader("x-upsert", "false");
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) setProgress("Uploading catalog files…", ((offset + event.loaded) / total) * 100);
      });
      request.addEventListener("load", () => {
        let body = {};
        try { body = JSON.parse(request.responseText || "{}"); } catch { /* HTTP status remains authoritative. */ }
        if (request.status >= 200 && request.status < 300) resolve();
        else reject(new Error(body.message || `Storage rejected the upload (HTTP ${request.status}).`));
      });
      request.addEventListener("error", () => reject(new Error("Network error while uploading. Check your connection.")));
      request.addEventListener("abort", () => reject(new Error("Upload was cancelled.")));
      request.send(file);
    });
  }

  async function removeFiles(paths) {
    const existing = paths.filter(Boolean);
    if (!existing.length) return;
    const { error } = await db.storage.from(bucket).remove(existing);
    if (error) throw error;
  }

  async function uploadImage(file, id, prefix) {
    if (!file) return "";
    validateImage(file);
    const extension = file.name.split(".").pop().toLowerCase();
    const mime = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
    const path = `${id}/${prefix}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
    await uploadFile(file, path, mime, 0, file.size);
    return path;
  }

  function renderAppList() {
    const query = $("#admin-app-search").value.trim().toLocaleLowerCase();
    const filtered = apps.filter((app) => [app.name, app.description, app.category, app.file_name].join(" ").toLocaleLowerCase().includes(query));
    $("#admin-app-list").innerHTML = filtered.length ? filtered.map((app) => `
      <article class="admin-resource-row" data-app-id="${escapeHtml(app.id)}">
        <div class="admin-resource-row-top"><div><h3>${escapeHtml(app.name)}</h3><p>${escapeHtml(app.description)}</p></div><span class="resource-state${app.published ? " published" : ""}">${app.published ? "PUBLISHED" : "DRAFT"}</span></div>
        <p class="admin-resource-meta">${escapeHtml(app.category)} · ${escapeHtml(app.version || "No version")} · ${escapeHtml(app.file_name)} · ${formatBytes(app.file_size)}${app.featured ? " · FEATURED" : ""}</p>
        <div class="admin-resource-actions"><button type="button" data-action="edit">Edit</button><button type="button" data-action="toggle">${app.published ? "Unpublish" : "Publish"}</button><button type="button" class="delete-resource" data-action="delete">Delete</button></div>
      </article>`).join("") : `<p class="admin-list-message">${apps.length ? "No matching apps." : "No apps yet. Add your first app above."}</p>`;
  }

  function renderWebsiteList() {
    const query = $("#admin-website-search").value.trim().toLocaleLowerCase();
    const filtered = links.filter((link) => [link.title, link.description, link.category, link.url].join(" ").toLocaleLowerCase().includes(query));
    $("#admin-website-list").innerHTML = filtered.length ? filtered.map((link) => `
      <article class="admin-resource-row" data-website-id="${escapeHtml(link.id)}">
        <div class="admin-resource-row-top"><div><h3>${escapeHtml(link.title)}</h3><p>${escapeHtml(link.description)}</p></div><span class="resource-state${link.published ? " published" : ""}">${link.published ? "PUBLISHED" : "DRAFT"}</span></div>
        <p class="admin-resource-meta">${escapeHtml(link.category)} · ${escapeHtml(link.url)}${link.featured ? " · FEATURED" : ""}</p>
        <div class="admin-resource-actions"><button type="button" data-action="edit">Edit</button><button type="button" data-action="toggle">${link.published ? "Unpublish" : "Publish"}</button><button type="button" class="delete-resource" data-action="delete">Delete</button></div>
      </article>`).join("") : `<p class="admin-list-message">${links.length ? "No matching websites." : "No website links yet. Add your first link above."}</p>`;
  }

  async function refreshApps() {
    $("#admin-app-list").innerHTML = '<p class="admin-list-message">Loading apps…</p>';
    const { data, error } = await db.from("site_apps").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    apps = data || [];
    renderAppList();
  }

  async function refreshLinks() {
    $("#admin-website-list").innerHTML = '<p class="admin-list-message">Loading websites…</p>';
    const { data, error } = await db.from("site_links").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    links = data || [];
    renderWebsiteList();
  }

  function resetAppForm() {
    $("#app-form").reset();
    $("#app-id").value = "";
    $("#app-form-title").textContent = "Add an app";
    $("#app-form-mode").textContent = "NEW APP";
    $("#app-file-required").textContent = "* required";
    $("#app-current-file").textContent = "ZIP, APK, MSI, EXE and supported tutorial files · max 100 MB.";
    $("#app-cancel-edit").hidden = true;
    $("#app-upload-status").hidden = true;
    setMessage("#app-form-message", "");
    updateAppPreview();
  }

  function editApp(app) {
    $("#app-id").value = app.id;
    $("#app-name").value = app.name;
    $("#app-description").value = app.description;
    $("#app-category").value = app.category;
    $("#app-version").value = app.version || "";
    $("#app-official-url").value = app.official_url || "";
    $("#app-video-url").value = app.video_url || "";
    $("#app-featured").checked = app.featured;
    $("#app-file-required").textContent = "leave empty to keep current file";
    $("#app-current-file").textContent = `Current: ${app.file_name} (${formatBytes(app.file_size)}). Select a replacement if needed.`;
    $("#app-form-title").textContent = "Edit app";
    $("#app-form-mode").textContent = "EDIT APP";
    $("#app-cancel-edit").hidden = false;
    updateAppPreview();
    $("#app-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateAppPreview() {
    $("#app-preview-title").textContent = $("#app-name").value.trim() || "Your app title";
    $("#app-preview-description").textContent = $("#app-description").value.trim() || "Your description will appear here.";
  }

  function updateWebsitePreview() {
    $("#website-preview-title").textContent = $("#website-title").value.trim() || "Your website title";
    $("#website-preview-description").textContent = $("#website-description").value.trim() || "Description and safe destination preview.";
  }

  async function saveApp(event) {
    event.preventDefault();
    const form = $("#app-form");
    const submitter = event.submitter;
    const current = apps.find((app) => app.id === $("#app-id").value);
    const file = $("#app-file").files[0];
    const icon = $("#app-icon").files[0];
    const screenshots = [...$("#app-screenshots").files];
    const uploaded = [];
    const obsolete = [];
    setBusy(form, true);
    setMessage("#app-form-message", "");
    try {
      const name = $("#app-name").value.trim();
      const description = $("#app-description").value.trim();
      const category = $("#app-category").value;
      const version = $("#app-version").value.trim();
      const officialUrl = safeHttps($("#app-official-url").value.trim(), "Official website");
      const videoUrl = safeHttps($("#app-video-url").value.trim(), "Tutorial video");
      if (videoUrl && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(videoUrl)) throw new Error("Tutorial links must point to YouTube.");
      if (!name || !description || !appCategories.includes(category)) throw new Error("Enter a name, description, and valid app category.");
      if (!current && !file) throw new Error("Choose the installer or ZIP file.");
      if (screenshots.length > 5) throw new Error("Choose up to five screenshots.");
      screenshots.forEach(validateImage);
      validateImage(icon);
      const safeFile = file ? safeUploadFile(file) : null;
      const id = current?.id || crypto.randomUUID();
      const filePath = safeFile ? `${id}/app-${Date.now()}-${safeFile.name}` : current.file_path;
      const previousAssets = [];
      let iconPath = current?.icon_path || null;
      let screenshotPaths = current?.screenshot_paths || [];
      if (file) {
        setProgress("Uploading app file…", 0);
        await uploadFile(file, filePath, safeFile.mime, 0, file.size + (icon?.size || 0) + screenshots.reduce((sum, item) => sum + item.size, 0));
        uploaded.push(filePath);
      }
      if (icon) {
        if (iconPath) previousAssets.push(iconPath);
        const path = await uploadImage(icon, id, "icon");
        uploaded.push(path);
        iconPath = path;
      }
      if (screenshots.length) {
        previousAssets.push(...screenshotPaths);
        screenshotPaths = [];
        for (const [index, image] of screenshots.entries()) {
          const path = await uploadImage(image, id, `screenshot-${index + 1}`);
          uploaded.push(path);
          screenshotPaths.push(path);
        }
      }
      let published = current?.published || false;
      if (submitter?.value === "true") published = true;
      if (submitter?.value === "false") published = false;
      const row = {
        id, name, description, category, version, file_path: filePath,
        file_name: safeFile?.name || current.file_name,
        file_size: file ? file.size : current.file_size,
        mime_type: safeFile?.mime || current.mime_type,
        icon_path: iconPath, screenshot_paths: screenshotPaths,
        official_url: officialUrl, video_url: videoUrl,
        featured: $("#app-featured").checked, published, updated_at: new Date().toISOString()
      };
      const result = current
        ? await db.from("site_apps").update(row).eq("id", id).select().single()
        : await db.from("site_apps").insert(row).select().single();
      if (result.error) throw result.error;
      uploaded.length = 0;
      if (file && current) obsolete.push(current.file_path);
      obsolete.push(...previousAssets);
      if (obsolete.length) {
        try { await removeFiles(obsolete); }
        catch (error) { console.error("App saved, but an old Storage object could not be deleted:", error); notify("Saved, but an old image/file could not be removed.", true); }
      }
      setProgress(published ? "Published successfully." : "Draft saved.", 100);
      await refreshApps();
      resetAppForm();
      setMessage("#app-form-message", published ? "Published. Visitors can now see and download this app." : "Saved privately as a draft.", "success");
      notify(published ? "App published." : "App draft saved.");
    } catch (error) {
      console.error("App save failed:", error);
      if (uploaded.length) {
        try { await removeFiles(uploaded); } catch (cleanupError) { console.error("Failed-upload cleanup failed:", cleanupError); }
      }
      setMessage("#app-form-message", error.message || "Could not save this app.", "error");
      notify(error.message || "Could not save this app.", true);
    } finally {
      setBusy(form, false);
    }
  }

  async function saveWebsite(event) {
    event.preventDefault();
    const form = $("#website-form");
    const submitter = event.submitter;
    const current = links.find((link) => link.id === $("#website-id").value);
    const image = $("#website-thumbnail").files[0];
    let uploaded = "";
    setBusy(form, true);
    setMessage("#website-form-message", "");
    try {
      const title = $("#website-title").value.trim();
      const description = $("#website-description").value.trim();
      const category = $("#website-category").value;
      const url = safeHttps($("#website-url").value.trim(), "Website URL");
      if (!title || !description || !websiteCategories.includes(category)) throw new Error("Enter a title, description, and valid website category.");
      validateImage(image);
      const id = current?.id || crypto.randomUUID();
      let thumbnailPath = current?.thumbnail_path || null;
      if (image) {
        uploaded = await uploadImage(image, id, "thumbnail");
        thumbnailPath = uploaded;
      }
      let published = current?.published || false;
      if (submitter?.value === "true") published = true;
      if (submitter?.value === "false") published = false;
      const row = { id, title, description, category, url, thumbnail_path: thumbnailPath, featured: $("#website-featured").checked, published, updated_at: new Date().toISOString() };
      const result = current
        ? await db.from("site_links").update(row).eq("id", id).select().single()
        : await db.from("site_links").insert(row).select().single();
      if (result.error) throw result.error;
      const obsolete = image && current?.thumbnail_path ? [current.thumbnail_path] : [];
      uploaded = "";
      if (obsolete.length) {
        try { await removeFiles(obsolete); }
        catch (error) { console.error("Website saved, but old thumbnail cleanup failed:", error); notify("Saved, but the old thumbnail could not be removed.", true); }
      }
      await refreshLinks();
      resetWebsiteForm();
      setMessage("#website-form-message", published ? "Published and visible in the website directory." : "Saved privately as a draft.", "success");
      notify(published ? "Website link published." : "Website link saved as a draft.");
    } catch (error) {
      console.error("Website link save failed:", error);
      if (uploaded) {
        try { await removeFiles([uploaded]); } catch (cleanupError) { console.error("Thumbnail cleanup failed:", cleanupError); }
      }
      setMessage("#website-form-message", error.message || "Could not save this website.", "error");
      notify(error.message || "Could not save this website.", true);
    } finally {
      setBusy(form, false);
    }
  }

  function resetWebsiteForm() {
    $("#website-form").reset();
    $("#website-id").value = "";
    $("#website-form-title").textContent = "Add a website";
    $("#website-form-mode").textContent = "NEW WEBSITE LINK";
    $("#website-cancel-edit").hidden = true;
    setMessage("#website-form-message", "");
    updateWebsitePreview();
  }

  function editWebsite(link) {
    $("#website-id").value = link.id;
    $("#website-title").value = link.title;
    $("#website-description").value = link.description;
    $("#website-category").value = link.category;
    $("#website-url").value = link.url;
    $("#website-featured").checked = link.featured;
    $("#website-form-title").textContent = "Edit website link";
    $("#website-form-mode").textContent = "EDIT WEBSITE";
    $("#website-cancel-edit").hidden = false;
    updateWebsitePreview();
    $("#website-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function manageItem(event, type) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = button.closest(type === "app" ? "[data-app-id]" : "[data-website-id]");
    const items = type === "app" ? apps : links;
    const item = items.find((candidate) => candidate.id === row?.dataset[type === "app" ? "appId" : "websiteId"]);
    if (!item) return;
    if (button.dataset.action === "edit") {
      if (type === "app") editApp(item); else editWebsite(item);
      return;
    }
    button.disabled = true;
    try {
      const table = type === "app" ? "site_apps" : "site_links";
      if (button.dataset.action === "toggle") {
        const { error } = await db.from(table).update({ published: !item.published, updated_at: new Date().toISOString() }).eq("id", item.id);
        if (error) throw error;
        if (type === "app") await refreshApps(); else await refreshLinks();
        notify(item.published ? "Item unpublished." : "Item published.");
      } else if (button.dataset.action === "delete") {
        const label = type === "app" ? item.name : item.title;
        if (!window.confirm(`Permanently delete "${label}" and its stored files?`)) { button.disabled = false; return; }
        const { error } = await db.from(table).delete().eq("id", item.id);
        if (error) throw error;
        if (type === "app") {
          await refreshApps();
          if ($("#app-id").value === item.id) resetAppForm();
          try { await removeFiles([item.file_path, item.icon_path, ...(item.screenshot_paths || [])]); }
          catch (cleanupError) { console.error("App removed but Storage cleanup failed:", cleanupError); notify("Removed from public catalog, but Storage cleanup failed.", true); return; }
        } else {
          await refreshLinks();
          if ($("#website-id").value === item.id) resetWebsiteForm();
          try { await removeFiles([item.thumbnail_path]); }
          catch (cleanupError) { console.error("Website removed but thumbnail cleanup failed:", cleanupError); notify("Removed from public directory, but thumbnail cleanup failed.", true); return; }
        }
        notify("Entry and stored files deleted.");
      }
    } catch (error) {
      console.error("Catalog management action failed:", error);
      notify(error.message || "Catalog action failed.", true);
      button.disabled = false;
    }
  }

  async function verifyOwner() {
    if (!db) throw new Error(window.SAKIB_DB_ERROR || "Supabase is not configured.");
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    const verifiedGoogle = user && String(user.email || "").toLowerCase() === OWNER_EMAIL &&
      Boolean(user.email_confirmed_at) && Array.isArray(user.identities) &&
      user.identities.some((identity) => identity.provider === "google" &&
        String(identity.identity_data?.email || "").toLowerCase() === OWNER_EMAIL &&
        String(identity.identity_data?.email_verified).toLowerCase() === "true");
    if (!verifiedGoogle) throw new Error("Only the verified owner Google account can manage catalog entries.");
    const { data: membership, error: membershipError } = await db.from("site_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new Error("This Google account does not have administrator access.");
  }

  function showAdminError(error) {
    console.error("Catalog dashboard authorization or setup failed:", error);
    const alert = $("#dashboard-error");
    alert.hidden = false;
    alert.textContent = `Apps and website links could not load: ${error.message || "Unknown error"}`;
  }

  $("#app-form").addEventListener("submit", saveApp);
  $("#website-form").addEventListener("submit", saveWebsite);
  $("#app-cancel-edit").addEventListener("click", resetAppForm);
  $("#website-cancel-edit").addEventListener("click", resetWebsiteForm);
  $("#app-form").addEventListener("input", updateAppPreview);
  $("#app-form").addEventListener("change", updateAppPreview);
  $("#website-form").addEventListener("input", updateWebsitePreview);
  $("#website-form").addEventListener("change", updateWebsitePreview);
  $("#admin-app-search").addEventListener("input", renderAppList);
  $("#admin-website-search").addEventListener("input", renderWebsiteList);
  $("#admin-app-list").addEventListener("click", (event) => manageItem(event, "app"));
  $("#admin-website-list").addEventListener("click", (event) => manageItem(event, "website"));
  Promise.resolve().then(verifyOwner).then(() => Promise.all([refreshApps(), refreshLinks()])).catch(showAdminError);
})();
