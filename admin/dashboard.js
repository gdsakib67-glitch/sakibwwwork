(() => {
  "use strict";

  const OWNER_EMAIL = "gdsakib67@gmail.com";
  const db = window.SAKIB_DB;
  const bucket = window.SAKIB_BUCKET;
  const maxFileSize = 100 * 1024 * 1024;
  const maxImageSize = 5 * 1024 * 1024;
  const allowedTypes = {
    pdf: ["application/pdf", "application/pdf"],
    zip: ["application/zip", "application/zip"],
    png: ["image/png", "image/png"],
    jpg: ["image/jpeg", "image/jpeg"],
    jpeg: ["image/jpeg", "image/jpeg"],
    webp: ["image/webp", "image/webp"],
    txt: ["text/plain", "text/plain"],
    json: ["application/json", "application/json"],
    csv: ["text/csv", "text/csv"],
    md: ["text/markdown", "text/markdown"],
    log: ["text/plain", "text/plain"]
  };
  let session = null;
  let authorized = false;
  let resources = [];
  let announcements = [];
  let publicSettings = {};
  let draftSettings = {};
  let toastTimer;

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const bytesLabel = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return "Size unavailable";
    const divisor = bytes >= 1024 * 1024 ? 1024 * 1024 : 1024;
    return `${(bytes / divisor).toFixed(1)} ${divisor === 1024 ? "KB" : "MB"}`;
  };

  function notify(message, isError = false) {
    const toast = $("#admin-toast");
    toast.textContent = message;
    toast.classList.toggle("toast-error", isError);
    toast.classList.add("toast-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("toast-visible"), 4000);
  }

  function message(element, text, type = "") {
    element.textContent = text;
    element.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function setBusy(form, busy) {
    form.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  }

  function ownerHasGoogleIdentity(user) {
    return String(user.email || "").toLowerCase() === OWNER_EMAIL &&
      Boolean(user.email_confirmed_at) &&
      Array.isArray(user.identities) &&
      user.identities.some((identity) => identity.provider === "google" &&
        String(identity.identity_data?.email || "").toLowerCase() === OWNER_EMAIL &&
        String(identity.identity_data?.email_verified).toLowerCase() === "true");
  }

  async function authorize(sessionData) {
    if (!db || !sessionData || !ownerHasGoogleIdentity(sessionData.user)) return false;
    const { data, error } = await db.from("site_admins")
      .select("user_id").eq("user_id", sessionData.user.id).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  function redirectToLogin(errorText = "") {
    if (errorText) {
      try { sessionStorage.setItem("sakib-admin-login-message", errorText); } catch { /* Session storage is optional. */ }
    }
    window.location.replace(new URL("../login/", window.location.href).href);
  }

  async function refreshResources() {
    $("#admin-resource-list").innerHTML = '<div class="admin-loading" aria-label="Loading resources"><div class="skeleton-block skeleton-line"></div><div class="skeleton-block skeleton-line short"></div></div>';
    const { data, error } = await db.from("site_resources")
      .select("*").order("created_at", { ascending: false });
    if (error) throw error;
    resources = data || [];
    $("#stat-total").textContent = String(resources.length);
    $("#stat-published").textContent = String(resources.filter((item) => item.published).length);
    $("#stat-drafts").textContent = String(resources.filter((item) => !item.published).length);
    $("#nav-resource-count").textContent = String(resources.length);
    renderResources();
    renderRecentResources();
    renderFeaturedOptions();
    populateCategorySelect();
  }

  function renderResources() {
    const target = $("#admin-resource-list");
    const query = $("#admin-resource-search").value.trim().toLowerCase();
    const filtered = resources.filter((resource) =>
      [resource.name, resource.description, resource.category, resource.file_name].join(" ").toLowerCase().includes(query));
    if (!filtered.length) {
      target.innerHTML = `<p class="admin-list-message">${resources.length ? "No matching files." : "No resources yet. Upload a file to get started."}</p>`;
      return;
    }
    target.innerHTML = filtered.map((resource) => `
      <article class="admin-resource-row" data-resource-id="${escapeHtml(resource.id)}">
        <div class="admin-resource-row-top"><div><h3>${escapeHtml(resource.name)}</h3><p>${escapeHtml(resource.description)}</p></div><span class="resource-state${resource.published ? " published" : ""}">${resource.published ? "PUBLISHED" : "DRAFT"}</span></div>
        <p class="admin-resource-meta">${escapeHtml(resource.category)} · ${escapeHtml(resource.file_name)} · ${bytesLabel(resource.file_size)}</p>
        <div class="admin-resource-actions"><button type="button" data-action="edit">Edit</button><button type="button" data-action="toggle">${resource.published ? "Unpublish" : "Publish"}</button><button type="button" class="delete-resource" data-action="delete">Delete</button></div>
      </article>`).join("");
  }

  function renderRecentResources() {
    const recent = resources.slice(0, 5);
    $("#recent-resources").innerHTML = recent.length ? recent.map((resource) => `
      <div class="recent-row"><div><strong>${escapeHtml(resource.name)}</strong><p>${escapeHtml(resource.category)} · ${bytesLabel(resource.file_size)}</p></div><span class="resource-state${resource.published ? " published" : ""}">${resource.published ? "PUBLISHED" : "DRAFT"}</span></div>
    `).join("") : '<p class="admin-list-message">No resources yet. Upload your first tutorial file.</p>';
  }

  function renderFeaturedOptions() {
    const target = $("#featured-resource-options");
    const chosen = new Set(Array.isArray(draftSettings.featuredResourceIds) ? draftSettings.featuredResourceIds : []);
    target.innerHTML = resources.length ? resources.map((resource) => `
      <label class="featured-resource-option"><input type="checkbox" data-featured-resource value="${escapeHtml(resource.id)}"${chosen.has(resource.id) ? " checked" : ""}><span>${escapeHtml(resource.name)}${resource.published ? "" : " · draft"}</span></label>
    `).join("") : '<p class="field-hint">Upload resources before featuring them.</p>';
    const weeklySelect = $("#settings-weekly-resource");
    const weeklyId = draftSettings.weeklyResourceId || "";
    const published = resources.filter((resource) => resource.published);
    const options = ['<option value="">No weekly feature</option>', ...published.map((resource) =>
      `<option value="${escapeHtml(resource.id)}">${escapeHtml(resource.name)}</option>`)];
    if (weeklyId && !published.some((resource) => resource.id === weeklyId)) {
      const retained = resources.find((resource) => resource.id === weeklyId);
      if (retained) options.push(`<option value="${escapeHtml(weeklyId)}">${escapeHtml(retained.name)} · not published</option>`);
    }
    weeklySelect.innerHTML = options.join("");
    weeklySelect.value = weeklyId;
  }

  function populateCategorySelect() {
    const category = $("#resource-category");
    const categories = Array.isArray(draftSettings.categories) && draftSettings.categories.length
      ? draftSettings.categories
      : (Array.isArray(window.SAKIB_SITE?.categories) ? window.SAKIB_SITE.categories : []);
    const selected = category.value;
    category.innerHTML = '<option value="">Choose a category</option>' +
      categories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
    if (categories.includes(selected)) category.value = selected;
  }

  function updateOverview() {
    $("#stat-announcements").textContent = String(announcements.filter((item) => item.published).length);
    $("#settings-draft-reminder").hidden = JSON.stringify(draftSettings) === JSON.stringify(publicSettings);
    $("#settings-status").textContent = JSON.stringify(draftSettings) === JSON.stringify(publicSettings)
      ? "PUBLISHED SETTINGS"
      : "UNPUBLISHED DRAFT";
  }

  async function refreshAnnouncements() {
    $("#announcement-list").innerHTML = '<div class="admin-loading" aria-label="Loading announcements"><div class="skeleton-block skeleton-line"></div><div class="skeleton-block skeleton-line short"></div></div>';
    const { data, error } = await db.from("site_announcements")
      .select("*").order("created_at", { ascending: false });
    if (error) throw error;
    announcements = data || [];
    $("#stat-announcements").textContent = String(announcements.filter((item) => item.published).length);
    renderAnnouncements();
  }

  function renderAnnouncements() {
    const target = $("#announcement-list");
    if (!announcements.length) {
      target.innerHTML = '<p class="admin-list-message">No announcements yet. Create one when you have news to share.</p>';
      return;
    }
    target.innerHTML = announcements.map((item) => `
      <article class="admin-resource-row" data-announcement-id="${escapeHtml(item.id)}">
        <div class="admin-resource-row-top"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.message)}</p></div><span class="resource-state${item.published ? " published" : ""}">${item.published ? "PUBLISHED" : "DRAFT"}</span></div>
        ${item.link_url ? `<p class="admin-resource-meta">${escapeHtml(item.link_url)}</p>` : ""}
        <div class="admin-resource-actions"><button type="button" data-action="edit">Edit</button><button type="button" data-action="toggle">${item.published ? "Unpublish" : "Publish"}</button><button type="button" class="delete-resource" data-action="delete">Delete</button></div>
      </article>`).join("");
  }

  function resetResourceForm() {
    $("#resource-form").reset();
    $("#resource-id").value = "";
    $("#resource-form-title").textContent = "Add a resource";
    $("#resource-form-mode").textContent = "NEW FILE";
    $("#file-required-hint").textContent = "* required";
    $("#current-file-hint").textContent = "PDF, ZIP, PNG, JPG, TXT, JSON, CSV, WEBP, MD, LOG · max 100 MB.";
    $("#current-thumbnail-hint").textContent = "PNG, JPG, WEBP · max 5 MB.";
    $("#remove-thumbnail-wrap").hidden = true;
    $("#cancel-edit-button").hidden = true;
    $("#upload-status").hidden = true;
    $("#publish-button").textContent = "Publish resource ↗";
    $("#save-draft-button").textContent = "Save draft";
    message($("#resource-message"), "");
  }

  function editResource(resource) {
    $("#resource-id").value = resource.id;
    $("#resource-name").value = resource.name;
    $("#resource-description").value = resource.description;
    populateCategorySelect();
    $("#resource-category").value = resource.category;
    $("#resource-video").value = resource.video_url || "";
    $("#file-required-hint").textContent = "leave empty to keep current file";
    $("#current-file-hint").textContent = `Current: ${resource.file_name} (${bytesLabel(resource.file_size)}). Choose a file to replace it.`;
    $("#current-thumbnail-hint").textContent = resource.thumbnail_path ? "Choose an image to replace the existing thumbnail." : "No thumbnail set. PNG, JPG, WEBP · max 5 MB.";
    $("#remove-thumbnail-wrap").hidden = !resource.thumbnail_path;
    $("#cancel-edit-button").hidden = false;
    $("#resource-form-title").textContent = "Edit resource";
    $("#resource-form-mode").textContent = "EDIT FILE";
    $("#publish-button").textContent = resource.published ? "Save & keep published ↗" : "Publish resource ↗";
    $("#save-draft-button").textContent = resource.published ? "Save & unpublish" : "Save draft";
    $("#resource-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function safeUploadName(file) {
    const pieces = file.name.split(".");
    const extension = pieces.length > 1 ? pieces.pop().toLowerCase() : "";
    const mapping = allowedTypes[extension];
    if (!mapping) throw new Error("Allowed file types: PDF, ZIP, PNG, JPG, WEBP, TXT, JSON, CSV, MD, and LOG.");
    if (!file.size || file.size > maxFileSize) throw new Error("Choose a file from 1 byte to 100 MB.");
    if (file.type && file.type !== mapping[0] &&
      !(extension === "zip" && file.type === "application/x-zip-compressed")) {
      throw new Error("This file's detected MIME type does not match the selected extension.");
    }
    const base = pieces.join(".").normalize("NFKD").replace(/[^A-Za-z0-9._ -]/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 140) || "resource";
    return { name: `${base}.${extension}`, mime: mapping[1] };
  }

  function validateThumbnail(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["png", "jpg", "jpeg", "webp"].includes(extension) ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      !file.size || file.size > maxImageSize) {
      throw new Error("Choose a PNG, JPG, or WEBP thumbnail no larger than 5 MB.");
    }
  }

  function uploadProgress(text, percent) {
    $("#upload-status").hidden = false;
    $("#upload-message").textContent = text;
    $("#upload-percent").textContent = `${Math.round(percent)}%`;
    $("#upload-progress").value = percent;
    $("#upload-progress").setAttribute("aria-label", text);
  }

  function uploadToStorage(file, path, mime, offset, total) {
    const config = window.SAKIB_SUPABASE_CONFIG;
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      request.open("POST", `${config.url.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`);
      request.setRequestHeader("apikey", config.anonKey);
      request.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
      request.setRequestHeader("Content-Type", mime);
      request.setRequestHeader("x-upsert", "false");
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) uploadProgress("Uploading file…", ((offset + event.loaded) / total) * 100);
      });
      request.addEventListener("load", () => {
        let body = {};
        try { body = JSON.parse(request.responseText || "{}"); } catch { /* The status code still describes upload failure. */ }
        if (request.status >= 200 && request.status < 300) resolve();
        else reject(new Error(body.message || body.error_description || `Storage rejected the file (HTTP ${request.status}).`));
      });
      request.addEventListener("error", () => reject(new Error("Network error while uploading. Check your connection and try again.")));
      request.addEventListener("abort", () => reject(new Error("The upload was cancelled.")));
      request.send(file);
    });
  }

  async function removeStoredFiles(paths) {
    const existing = paths.filter(Boolean);
    if (!existing.length) return;
    const { error } = await db.storage.from(bucket).remove(existing);
    if (error) throw error;
  }

  $("#admin-resource-search").addEventListener("input", renderResources);
  $("#resource-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = $("#resource-form");
    const output = $("#resource-message");
    const submitter = event.submitter;
    const current = resources.find((item) => item.id === $("#resource-id").value);
    const file = $("#resource-file").files[0];
    const image = $("#resource-thumbnail").files[0];
    const uploaded = [];
    const obsolete = [];
    setBusy(form, true);
    message(output, "");
    try {
      const name = $("#resource-name").value.trim();
      const description = $("#resource-description").value.trim();
      const category = $("#resource-category").value;
      const videoUrl = $("#resource-video").value.trim();
      if (!name || !description || !category) throw new Error("Add a title, description, and category.");
      if (!current && !file) throw new Error("Choose the file you want to upload.");
      if (videoUrl && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(videoUrl)) {
        throw new Error("Use a valid HTTPS YouTube video URL, or leave the field blank.");
      }
      const safeFile = file ? safeUploadName(file) : null;
      if (image) validateThumbnail(image);
      const id = current ? current.id : crypto.randomUUID();
      const newFilePath = safeFile ? `${id}/resource-${Date.now()}-${safeFile.name}` : current.file_path;
      let thumbnailPath = current ? current.thumbnail_path : null;
      const combinedBytes = (file ? file.size : 0) + (image ? image.size : 0);

      if (file) {
        uploadProgress("Uploading resource file…", 0);
        await uploadToStorage(file, newFilePath, safeFile.mime, 0, combinedBytes);
        uploaded.push(newFilePath);
      }
      if (image) {
        const extension = image.name.split(".").pop().toLowerCase();
        const imageMime = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
        const imagePath = `${id}/thumbnail-${Date.now()}.${extension}`;
        uploadProgress("Uploading thumbnail…", file ? (file.size / combinedBytes) * 100 : 0);
        await uploadToStorage(image, imagePath, imageMime, file ? file.size : 0, combinedBytes);
        uploaded.push(imagePath);
        thumbnailPath = imagePath;
      } else if ($("#remove-thumbnail").checked) thumbnailPath = null;

      if (current && file) obsolete.push(current.file_path);
      if (current && (image || $("#remove-thumbnail").checked) && current.thumbnail_path) obsolete.push(current.thumbnail_path);
      let published = current ? current.published : false;
      if (submitter?.value === "true") published = true;
      if (submitter?.value === "false") published = false;
      const row = {
        id, name, description, category, video_url: videoUrl,
        file_path: newFilePath,
        file_name: safeFile ? safeFile.name : current.file_name,
        file_size: safeFile ? file.size : current.file_size,
        mime_type: safeFile ? safeFile.mime : current.mime_type,
        thumbnail_path: thumbnailPath,
        published,
        updated_at: new Date().toISOString()
      };
      const result = current
        ? await db.from("site_resources").update(row).eq("id", id).select().single()
        : await db.from("site_resources").insert(row).select().single();
      if (result.error) throw result.error;
      uploaded.length = 0;
      if (obsolete.length) {
        try { await removeStoredFiles(obsolete); }
        catch (error) {
          console.error("Resource saved, but an old object could not be deleted:", error);
          notify("Saved, but an old file could not be removed from Storage.", true);
        }
      }
      uploadProgress(published ? "Published successfully." : "Draft saved.", 100);
      await refreshResources();
      resetResourceForm();
      message(output, published ? "Published. Visitors can now see and download this file." : "Saved privately as a draft.", "success");
      notify(published ? "Resource published." : "Resource saved as a draft.");
    } catch (error) {
      console.error("Resource save failed:", error);
      if (uploaded.length) {
        try { await removeStoredFiles(uploaded); }
        catch (cleanupError) {
          console.error("Failed-upload cleanup failed:", cleanupError);
          notify("Save failed and an uploaded object needs manual Storage cleanup.", true);
        }
      }
      message(output, error.message || "Could not save this resource.", "error");
      notify(error.message || "Could not save this resource.", true);
    } finally {
      setBusy(form, false);
    }
  });

  $("#admin-resource-list").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const rowElement = button.closest("[data-resource-id]");
    const resource = resources.find((item) => item.id === rowElement.dataset.resourceId);
    if (!resource) return;
    if (button.dataset.action === "edit") {
      editResource(resource);
      return;
    }
    button.disabled = true;
    try {
      if (button.dataset.action === "toggle") {
        const { error } = await db.from("site_resources")
          .update({ published: !resource.published, updated_at: new Date().toISOString() })
          .eq("id", resource.id);
        if (error) throw error;
        await refreshResources();
        notify(resource.published ? "Resource unpublished." : "Resource published.");
      } else if (button.dataset.action === "delete") {
        if (!window.confirm(`Permanently delete "${resource.name}" and its stored files?`)) {
          button.disabled = false;
          return;
        }
        const { error } = await db.from("site_resources").delete().eq("id", resource.id);
        if (error) throw error;
        await refreshResources();
        if ($("#resource-id").value === resource.id) resetResourceForm();
        try { await removeStoredFiles([resource.file_path, resource.thumbnail_path]); }
        catch (error) {
          console.error("Resource deleted, but Storage cleanup failed:", error);
          notify("Removed from the public library, but stored-file cleanup failed.", true);
          return;
        }
        notify("Resource and stored files deleted.");
      }
    } catch (error) {
      console.error("Resource management action failed:", error);
      notify(error.message || "Resource action failed.", true);
      button.disabled = false;
    }
  });

  $("#cancel-edit-button").addEventListener("click", resetResourceForm);

  function resetAnnouncementForm() {
    $("#announcement-form").reset();
    $("#announcement-id").value = "";
    $("#announcement-form-mode").textContent = "NEW ANNOUNCEMENT";
    $("#announcement-form-title").textContent = "Write an update";
    $("#cancel-announcement-edit").hidden = true;
    message($("#announcement-form-message"), "");
  }

  $("#announcement-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = $("#announcement-form");
    const submitter = event.submitter;
    const id = $("#announcement-id").value;
    const existing = announcements.find((item) => item.id === id);
    const title = $("#announcement-title").value.trim();
    const announcementMessage = $("#announcement-message").value.trim();
    const linkUrl = $("#announcement-link").value.trim();
    const output = $("#announcement-form-message");
    setBusy(form, true);
    try {
      if (!title || !announcementMessage) throw new Error("Add both a title and message.");
      if (linkUrl && !/^https:\/\/[^\s]+$/i.test(linkUrl)) throw new Error("The optional link must be a valid HTTPS URL.");
      const published = submitter?.value === "true";
      const row = { title, message: announcementMessage, link_url: linkUrl, published, updated_at: new Date().toISOString() };
      const result = existing
        ? await db.from("site_announcements").update(row).eq("id", id).select().single()
        : await db.from("site_announcements").insert(row).select().single();
      if (result.error) throw result.error;
      await refreshAnnouncements();
      resetAnnouncementForm();
      message(output, published ? "Announcement published on the public homepage." : "Announcement saved as a private draft.", "success");
      notify(published ? "Announcement published." : "Announcement saved as draft.");
    } catch (error) {
      console.error("Announcement save failed:", error);
      message(output, error.message || "Could not save this announcement.", "error");
      notify(error.message || "Could not save announcement.", true);
    } finally {
      setBusy(form, false);
    }
  });

  $("#announcement-list").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = button.closest("[data-announcement-id]");
    const item = announcements.find((announcement) => announcement.id === row.dataset.announcementId);
    if (!item) return;
    if (button.dataset.action === "edit") {
      $("#announcement-id").value = item.id;
      $("#announcement-title").value = item.title;
      $("#announcement-message").value = item.message;
      $("#announcement-link").value = item.link_url || "";
      $("#announcement-form-mode").textContent = "EDIT ANNOUNCEMENT";
      $("#announcement-form-title").textContent = "Update announcement";
      $("#cancel-announcement-edit").hidden = false;
      $("#announcement-form").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    button.disabled = true;
    try {
      if (button.dataset.action === "toggle") {
        const { error } = await db.from("site_announcements")
          .update({ published: !item.published, updated_at: new Date().toISOString() }).eq("id", item.id);
        if (error) throw error;
        await refreshAnnouncements();
        notify(item.published ? "Announcement unpublished." : "Announcement published.");
      } else if (button.dataset.action === "delete") {
        if (!window.confirm(`Delete the announcement "${item.title}"?`)) {
          button.disabled = false;
          return;
        }
        const { error } = await db.from("site_announcements").delete().eq("id", item.id);
        if (error) throw error;
        await refreshAnnouncements();
        if ($("#announcement-id").value === item.id) resetAnnouncementForm();
        notify("Announcement deleted.");
      }
    } catch (error) {
      console.error("Announcement action failed:", error);
      notify(error.message || "Announcement action failed.", true);
      button.disabled = false;
    }
  });

  $("#cancel-announcement-edit").addEventListener("click", resetAnnouncementForm);

  function parseSocials(value) {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.map((line) => {
      const separator = line.indexOf("|");
      if (separator < 1) throw new Error("For social links, use one line per link in the format: name | https://link");
      const name = line.slice(0, separator).trim();
      const url = line.slice(separator + 1).trim();
      let parsed;
      try { parsed = new URL(url); } catch { throw new Error(`The social link for "${name}" is not a valid URL.`); }
      if (!name || name.length > 40 || parsed.protocol !== "https:") {
        throw new Error("Social links need a short name and an HTTPS URL.");
      }
      return { name, url: parsed.href };
    });
  }

  function parseVideos(value) {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.map((line) => {
      const [title, url, thumbnail, ...extra] = line.split("|").map((part) => part.trim());
      if (extra.length || !title || title.length > 120 ||
        !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url || "")) {
        throw new Error("Videos need the format: title | https://youtube.com/... | optional HTTPS thumbnail URL");
      }
      if (thumbnail) {
        let parsedThumbnail;
        try { parsedThumbnail = new URL(thumbnail); } catch { throw new Error(`The thumbnail for "${title}" is not a valid URL.`); }
        if (parsedThumbnail.protocol !== "https:") throw new Error("Video thumbnail links must use HTTPS.");
      }
      return {
        title,
        url,
        description: "SAKIB · gdsakib67",
        ...(thumbnail ? { thumbnail } : {})
      };
    });
  }

  function readSettingsForm() {
    const heroHeading = $("#settings-heading").value.trim();
    const heroDescription = $("#settings-description").value.trim();
    const channelUrl = $("#settings-channel").value.trim();
    const footerText = $("#settings-footer").value.trim();
    const categories = $("#settings-categories").value.split(/\r?\n/)
      .map((item) => item.trim()).filter(Boolean);
    if (!heroHeading || !heroDescription || !categories.length || categories.length > 12 ||
      categories.some((item) => item.length > 80) ||
      new Set(categories.map((item) => item.toLowerCase())).size !== categories.length) {
      throw new Error("Add a heading, description, and 1–12 unique categories (80 characters each max).");
    }
    if (channelUrl && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(channelUrl)) {
      throw new Error("Use your real HTTPS YouTube channel URL, or leave the field blank.");
    }
    const featuredResourceIds = [...document.querySelectorAll("[data-featured-resource]:checked")].map((input) => input.value);
    return {
      heroHeading,
      heroDescription,
      channelUrl,
      socials: parseSocials($("#settings-socials").value),
      videos: parseVideos($("#settings-videos").value),
      footerText,
      categories,
      featuredResourceIds,
      weeklyResourceId: $("#settings-weekly-resource").value
    };
  }

  function renderSettingsPreview() {
    $("#preview-heading").textContent = $("#settings-heading").value || "Your homepage heading";
    $("#preview-description").textContent = $("#settings-description").value || "Your homepage description.";
    const categories = $("#settings-categories").value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    $("#preview-categories").innerHTML = categories.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
    const channel = $("#settings-channel").value.trim() ? "YouTube channel configured" : "YouTube channel not set";
    const socialCount = $("#settings-socials").value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).length;
    $("#preview-links").textContent = `${channel} · ${socialCount} social link${socialCount === 1 ? "" : "s"}`;
    $("#preview-footer").textContent = $("#settings-footer").value || "";
    const weeklySelect = $("#settings-weekly-resource");
    $("#preview-weekly").textContent = weeklySelect.selectedOptions[0]?.textContent === "No weekly feature"
      ? "No weekly resource selected."
      : `Weekly feature: ${weeklySelect.selectedOptions[0]?.textContent || "not selected"}`;
    const videoCount = $("#settings-videos").value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).length;
    $("#preview-videos").textContent = videoCount
      ? `${videoCount} configured channel video${videoCount === 1 ? "" : "s"}`
      : "No channel videos configured yet.";
  }

  function fillSettings(settings) {
    $("#settings-heading").value = settings.heroHeading === "SAKIB — VIDEO RESOURCES"
      ? "SAKIB — GAMING RESOURCES"
      : (settings.heroHeading || "");
    $("#settings-description").value = settings.heroDescription === "Watched my tutorial? Download all the files you need right here!"
      ? "Minecraft builds, Free Fire guides, OBS tools, and PC gaming resources from my tutorials."
      : (settings.heroDescription || "");
    $("#settings-channel").value = settings.channelUrl || window.SAKIB_SITE?.channelUrl || "";
    $("#settings-socials").value = (settings.socials || []).map((item) => `${item.name} | ${item.url}`).join("\n");
    $("#settings-videos").value = (settings.videos || []).map((item) =>
      [item.title, item.url, item.thumbnail || ""].filter(Boolean).join(" | ")).join("\n");
    const previousCategories = ["Minecraft", "Free Fire", "PC Tutorials", "Gaming Tools", "Software Guides", "Other Resources"];
    const categories = settings.categories || [];
    const effectiveCategories = categories.length === previousCategories.length &&
      previousCategories.every((category, index) => categories[index] === category)
      ? ["Minecraft", "Free Fire", "PC Tutorials", "OBS & Streaming", "Gaming Tools", "Software Guides", "Other Resources"]
      : categories;
    $("#settings-categories").value = effectiveCategories.join("\n");
    $("#settings-footer").value = settings.footerText || "";
    draftSettings.weeklyResourceId = settings.weeklyResourceId || "";
    renderFeaturedOptions();
    renderSettingsPreview();
    updateOverview();
  }

  async function refreshSettings() {
    const [publishedResult, draftResult] = await Promise.all([
      db.from("site_settings_public").select("settings").eq("id", 1).maybeSingle(),
      db.from("site_settings_drafts").select("settings").eq("id", 1).maybeSingle()
    ]);
    if (publishedResult.error) throw publishedResult.error;
    if (draftResult.error) throw draftResult.error;
    publicSettings = publishedResult.data?.settings || {};
    draftSettings = draftResult.data?.settings || publicSettings;
    fillSettings(draftSettings);
    populateCategorySelect();
  }

  $("#settings-form").addEventListener("input", renderSettingsPreview);
  $("#settings-form").addEventListener("change", renderSettingsPreview);
  $("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = $("#settings-form");
    setBusy(form, true);
    try {
      const settings = readSettingsForm();
      const { error } = await db.from("site_settings_drafts").upsert({
        id: 1, settings, updated_at: new Date().toISOString()
      });
      if (error) throw error;
      draftSettings = settings;
      renderFeaturedOptions();
      populateCategorySelect();
      updateOverview();
      message($("#settings-message"), "Draft saved privately. Review the preview, then publish when ready.", "success");
      notify("Website draft saved privately.");
    } catch (error) {
      console.error("Could not save website settings draft:", error);
      message($("#settings-message"), error.message || "Could not save settings.", "error");
      notify(error.message || "Could not save settings.", true);
    } finally {
      setBusy(form, false);
    }
  });

  $("#publish-settings").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const settings = readSettingsForm();
      const timestamp = new Date().toISOString();
      const draftResult = await db.from("site_settings_drafts")
        .upsert({ id: 1, settings, updated_at: timestamp });
      if (draftResult.error) throw draftResult.error;
      const publishResult = await db.from("site_settings_public")
        .upsert({ id: 1, settings, updated_at: timestamp });
      if (publishResult.error) throw publishResult.error;
      draftSettings = settings;
      publicSettings = settings;
      updateOverview();
      message($("#settings-message"), "Settings published. Visitors will see these changes on their next page load.", "success");
      notify("Website settings published.");
    } catch (error) {
      console.error("Could not publish website settings:", error);
      message($("#settings-message"), error.message || "Could not publish settings.", "error");
      notify(error.message || "Could not publish settings.", true);
    } finally {
      button.disabled = false;
    }
  });

  function showPanel(name) {
    document.querySelectorAll(".studio-panel").forEach((panel) => {
      const active = panel.id === `panel-${name}`;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    document.querySelectorAll(".studio-nav-link[data-panel]").forEach((button) => {
      const active = button.dataset.panel === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    if (name === "settings") renderSettingsPreview();
  }

  document.querySelectorAll(".studio-nav-link[data-panel], [data-go-panel]").forEach((button) =>
    button.addEventListener("click", () => showPanel(button.dataset.panel || button.dataset.goPanel)));

  const themeToggle = $("#theme-toggle");
  const themeIcon = themeToggle.querySelector(".theme-icon");
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === "dark";
    themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
    themeIcon.innerHTML = dark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>'
      : '<path d="M20.1 15.6A8.7 8.7 0 0 1 8.4 3.9 8.8 8.8 0 1 0 20.1 15.6Z"/>';
  }
  let savedTheme = null;
  try { savedTheme = localStorage.getItem("sakib-theme"); } catch { /* Browser storage is optional. */ }
  setTheme(savedTheme === "dark" ? "dark" : "light");
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("sakib-theme", next); } catch { notify("Theme changed for this session only."); }
  });

  async function logout() {
    const { error } = await db.auth.signOut();
    if (error) {
      console.error("Could not sign out:", error);
      notify(`Sign-out failed: ${error.message}`, true);
      return;
    }
    redirectToLogin();
  }
  $("#logout-button").addEventListener("click", logout);
  $("#sidebar-logout").addEventListener("click", logout);

  async function startDashboard() {
    $("#current-year").textContent = String(new Date().getFullYear());
    if (!db) {
      redirectToLogin(window.SAKIB_DB_ERROR || "Supabase is not configured.");
      return;
    }
    try {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      session = data.session;
      if (!await authorize(session)) {
        await db.auth.signOut();
        redirectToLogin("Only the verified owner Google account can access this dashboard.");
        return;
      }
      authorized = true;
      $("#owner-email").textContent = OWNER_EMAIL;
      $("#logout-button").hidden = false;
      $("#dashboard-content").hidden = false;
      await Promise.all([refreshResources(), refreshAnnouncements(), refreshSettings()]);
      db.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") redirectToLogin();
      });
    } catch (error) {
      console.error("Dashboard authorization or data loading failed:", error);
      if (!authorized) {
        await db.auth.signOut();
        redirectToLogin("Owner access could not be verified. Sign in again with the verified Google account.");
        return;
      }
      $("#dashboard-error").hidden = false;
      $("#dashboard-error").textContent = `Dashboard data could not be loaded: ${error.message}`;
      $("#dashboard-content").hidden = false;
    }
  }

  startDashboard();
})();
