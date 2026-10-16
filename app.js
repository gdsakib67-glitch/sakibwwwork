(() => {
  "use strict";

  const config = window.SAKIB_SITE;
  const validUrl = (value) => {
    if (typeof value !== "string" || !value.trim()) return false;
    if (value.startsWith("/") && !value.startsWith("//")) return true;
    if (value.startsWith("./") || value.startsWith("../")) return true;
    try {
      return ["https:", "http:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  };
  const safeExternalUrl = (value) => {
    if (!validUrl(value)) return "";
    try {
      const url = new URL(value, window.location.href);
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const iconFor = (type) => {
    const normalized = String(type || "FILE").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) || "FILE";
    return `<span class="file-icon" aria-hidden="true"><svg viewBox="0 0 48 56"><path d="M6 2h23l13 13v35a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z"/><path d="M29 2v14h13"/></svg><b>${escapeHtml(normalized)}</b></span>`;
  };

  const grid = document.querySelector("#resource-grid");
  const filters = document.querySelector("#category-filters");
  const searchInput = document.querySelector("#resource-search");
  const sortSelect = document.querySelector("#resource-sort");
  const emptyState = document.querySelector("#empty-state");
  const toast = document.querySelector("#toast");
  let selectedCategory = "All files";
  let toastTimeout;

  function startCinematicIntro() {
    const intro = document.querySelector("#cinematic-intro");
    const skipButton = document.querySelector("#intro-skip");
    if (!intro || !skipButton) return;
    const motionAllowed = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    let alreadyShown = false;
    try { alreadyShown = sessionStorage.getItem("sakib-intro-seen") === "true"; } catch { /* The intro can still be skipped when storage is unavailable. */ }
    if (!motionAllowed || alreadyShown) return;

    document.querySelectorAll("body > :not(#cinematic-intro)").forEach((element) => { element.inert = true; });
    document.body.classList.add("intro-active");
    intro.hidden = false;
    intro.classList.add("intro-playing");
    const stars = intro.querySelector(".intro-stars");
    for (let index = 0; index < 24; index += 1) {
      const particle = document.createElement("i");
      particle.className = "intro-particle";
      particle.style.setProperty("--particle-x", `${(index * 47 + 11) % 100}%`);
      particle.style.setProperty("--particle-y", `${(index * 31 + 7) % 100}%`);
      particle.style.setProperty("--particle-delay", `${-((index * 13) % 40) / 10}s`);
      stars.append(particle);
    }

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      window.clearTimeout(timer);
      intro.classList.remove("intro-playing");
      intro.classList.add("intro-dismissed");
      document.querySelectorAll("body > :not(#cinematic-intro)").forEach((element) => { element.inert = false; });
      document.body.classList.remove("intro-active");
      try { sessionStorage.setItem("sakib-intro-seen", "true"); } catch { /* Do not block navigation if storage is disabled. */ }
      window.setTimeout(() => { intro.hidden = true; }, 600);
      document.querySelector("#hero-title").setAttribute("tabindex", "-1");
      document.querySelector("#hero-title").focus({ preventScroll: true });
    };
    const timer = window.setTimeout(dismiss, 3800);
    skipButton.addEventListener("click", dismiss, { once: true });
    intro.addEventListener("keydown", (event) => {
      if (event.key === "Escape") dismiss();
    });
    skipButton.focus({ preventScroll: true });
  }

  startCinematicIntro();

  function notify(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("toast-error", isError);
    toast.classList.add("toast-visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove("toast-visible"), 3600);
  }

  function setupChannels() {
    const channel = safeExternalUrl(config.channelUrl);
    const subscribeButton = document.querySelector(".subscribe-button");
    subscribeButton.hidden = !channel;
    document.querySelectorAll("[data-channel-link]").forEach((link) => {
      link.removeAttribute("target");
      link.removeAttribute("rel");
      if (channel) {
        link.href = channel;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      } else link.href = "#videos";
    });
    const footerLinks = document.querySelector(".footer-links");
    footerLinks.querySelectorAll("[data-configured-social]").forEach((link) => link.remove());
    (Array.isArray(config.socials) ? config.socials : []).forEach((social) => {
      const url = social && safeExternalUrl(social.url);
      if (!url || !social.name) return;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = social.name;
      link.dataset.configuredSocial = "true";
      footerLinks.append(link);
    });
  }

  function applySiteSettings(settings) {
    if (!settings || typeof settings !== "object") return;
    if (typeof settings.heroHeading === "string" && settings.heroHeading.trim()) {
      const heading = document.querySelector("#hero-title");
      if (["SAKIB — VIDEO RESOURCES", "SAKIB — GAMING RESOURCES"].includes(settings.heroHeading.trim())) {
        const outline = document.createElement("span");
        outline.className = "outline-text";
        outline.textContent = "GAMING";
        const period = document.createElement("span");
        period.className = "hero-period";
        period.textContent = ".";
        heading.replaceChildren(
          document.createTextNode("SAKIB —"),
          document.createElement("br"),
          outline,
          document.createTextNode(" RESOURCES"),
          period
        );
      } else {
        heading.textContent = settings.heroHeading;
      }
      const pageHeading = settings.heroHeading.trim() === "SAKIB — VIDEO RESOURCES"
        ? "SAKIB — Gaming Resource Hub"
        : settings.heroHeading;
      document.title = `${pageHeading} | SAKIB`;
      document.querySelector('meta[property="og:title"]').content = document.title;
    }
    if (typeof settings.heroDescription === "string") {
      const legacyDescription = "Watched my tutorial? Download all the files you need right here!";
      const description = settings.heroDescription === legacyDescription
        ? "Minecraft builds, Free Fire guides, OBS tools, and PC gaming resources from my tutorials."
        : settings.heroDescription;
      document.querySelector("#hero-description").textContent = description;
      document.querySelector('meta[name="description"]').content = description;
      document.querySelector('meta[property="og:description"]').content = description;
    }
    if (Array.isArray(settings.categories) && settings.categories.length) {
      const previousDefaults = ["Minecraft", "Free Fire", "PC Tutorials", "Gaming Tools", "Software Guides", "Other Resources"];
      config.categories = settings.categories.length === previousDefaults.length &&
        previousDefaults.every((category, index) => settings.categories[index] === category)
        ? ["Minecraft", "Free Fire", "PC Tutorials", "OBS & Streaming", "Gaming Tools", "Software Guides", "Other Resources"]
        : settings.categories;
    }
    if (typeof settings.channelUrl === "string" && settings.channelUrl.trim()) config.channelUrl = settings.channelUrl;
    if (Array.isArray(settings.socials)) config.socials = settings.socials;
    if (Array.isArray(settings.videos)) config.videos = settings.videos;
    if (Array.isArray(settings.featuredResourceIds)) config.featuredResourceIds = settings.featuredResourceIds;
    if (typeof settings.weeklyResourceId === "string") config.weeklyResourceId = settings.weeklyResourceId;
    if (typeof settings.footerText === "string") document.querySelector("#footer-copy").textContent = settings.footerText;
    setupChannels();
  }

  function renderFilters() {
    const categories = ["All files", ...(Array.isArray(config.categories) ? config.categories : [])];
    filters.innerHTML = categories.map((category) => `
      <button type="button" class="filter-chip${category === selectedCategory ? " active" : ""}" aria-pressed="${category === selectedCategory}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
    `).join("");
  }

  function resourceMarkup(resource) {
    const title = escapeHtml(resource.name);
    const type = escapeHtml(resource.fileType || "FILE");
    const size = escapeHtml(resource.fileSize || "Size not listed");
    const description = escapeHtml(resource.description || "");
    const category = escapeHtml(resource.category || "Other Resources");
    const videoUrl = safeExternalUrl(resource.videoUrl);
    const thumbnail = validUrl(resource.thumbnail) ? resource.thumbnail : "";
    const thumbnailMarkup = thumbnail
      ? `<img class="resource-thumbnail" src="${escapeHtml(thumbnail)}" alt="" loading="lazy">`
      : iconFor(type);
    const videoMarkup = videoUrl
      ? `<a class="resource-video-link" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer">Watch tutorial <span aria-hidden="true">↗</span></a>`
      : `<span class="resource-video-link resource-video-missing">Tutorial link not added</span>`;
    const path = validUrl(resource.filePath) ? resource.filePath : "";
    const downloadMarkup = resource.storagePath
      ? `<button class="download-button" type="button" data-download-id="${escapeHtml(resource.id)}">Download <span aria-hidden="true">↓</span></button>`
      : path
      ? `<a class="download-button" href="${escapeHtml(path)}" download>Download <span aria-hidden="true">↓</span></a>`
      : `<button class="download-button download-disabled" type="button" disabled>File unavailable</button>`;
    return `<article class="resource-card reveal">
      <div class="resource-card-top">${thumbnailMarkup}<span class="resource-category">${category}</span></div>
      <div class="resource-card-body"><h3>${title}</h3><p>${description}</p>
        <div class="resource-meta"><span>${type}</span><span class="meta-separator"></span><span>${size}</span></div>
        <div class="resource-card-actions">${videoMarkup}${downloadMarkup}</div>
      </div>
    </article>`;
  }

  function renderResourceDiscoveries() {
    const resources = (Array.isArray(config.resources) ? config.resources : [])
      .filter((resource) => resource && resource.published !== false);
    const featuredIds = Array.isArray(config.featuredResourceIds) ? config.featuredResourceIds : [];
    const byId = new Map(resources.map((resource) => [String(resource.id), resource]));
    const curated = featuredIds.map((id) => byId.get(String(id))).filter(Boolean);
    const weekly = config.weeklyResourceId
      ? byId.get(String(config.weeklyResourceId))
      : curated[0];
    const weeklySection = document.querySelector("#weekly-feature-section");
    weeklySection.hidden = !weekly;
    document.querySelector("#weekly-feature").innerHTML = weekly ? resourceMarkup(weekly) : "";

    const trendingSection = document.querySelector("#trending-resources-section");
    trendingSection.hidden = curated.length === 0;
    document.querySelector("#trending-grid").innerHTML = curated.slice(0, 3).map(resourceMarkup).join("");

    const recent = resources.filter((resource) => {
      const createdAt = Date.parse(resource.created_at || resource.createdAt || "");
      return Number.isFinite(createdAt);
    }).sort((a, b) =>
      Date.parse(b.created_at || b.createdAt) - Date.parse(a.created_at || a.createdAt)
    ).slice(0, 3);
    const recentSection = document.querySelector("#recent-resources-section");
    recentSection.hidden = recent.length === 0;
    document.querySelector("#recent-grid").innerHTML = recent.map(resourceMarkup).join("");
    observeReveals();
  }

  function renderResources() {
    const resources = (Array.isArray(config.resources) ? config.resources : [])
      .filter((resource) => resource && resource.published !== false);
    const query = searchInput.value.trim().toLocaleLowerCase();
    let matches = resources.filter((resource) => {
      if (!resource || typeof resource.name !== "string") return false;
      const categoryMatch = selectedCategory === "All files" || resource.category === selectedCategory;
      const searchable = [resource.name, resource.description, resource.category, resource.fileType].join(" ").toLocaleLowerCase();
      return categoryMatch && searchable.includes(query);
    });
    if (sortSelect.value === "name") matches = [...matches].sort((a, b) => a.name.localeCompare(b.name));
    if (sortSelect.value === "type") matches = [...matches].sort((a, b) => String(a.fileType || "").localeCompare(String(b.fileType || "")));
    if (sortSelect.value === "featured" && Array.isArray(config.featuredResourceIds) && config.featuredResourceIds.length) {
      const rank = new Map(config.featuredResourceIds.map((id, index) => [id, index]));
      matches.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
    }

    grid.innerHTML = matches.map(resourceMarkup).join("");
    document.querySelector("#result-count").textContent = resources.length
      ? `${matches.length} ${matches.length === 1 ? "resource" : "resources"}${query || selectedCategory !== "All files" ? " found" : " available"}`
      : "";
    emptyState.hidden = matches.length > 0;
    document.querySelector("#empty-title").textContent = resources.length ? "No matching resources." : "No resources yet.";
    document.querySelector("#empty-message").textContent = resources.length
      ? "Try a different search or category."
      : "New files are on the way. Check back after the next tutorial.";
    document.querySelector("#clear-filters").hidden = !resources.length;
    renderResourceDiscoveries();
    observeReveals();
  }

  async function loadPublicResources() {
    if (!window.SAKIB_DB) {
      renderResources();
      const clientConfig = window.SAKIB_SUPABASE_CONFIG || {};
      if (clientConfig.url || clientConfig.anonKey) {
        document.querySelector("#empty-title").textContent = "Resources couldn't load.";
        document.querySelector("#empty-message").textContent = window.SAKIB_DB_ERROR || "The resource service could not be initialized. Please try again later.";
        notify("The resource service could not be connected.", true);
      }
      return;
    }
    document.querySelector("#result-count").textContent = "Loading published resources…";
    emptyState.hidden = true;
    grid.setAttribute("aria-busy", "true");
    grid.innerHTML = Array.from({ length: 3 }, () => `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-block skeleton-cover"></div>
        <div class="skeleton-block skeleton-line"></div>
        <div class="skeleton-block skeleton-line short"></div>
        <div class="skeleton-block skeleton-action"></div>
      </div>`).join("");
    try {
      const { data, error } = await window.SAKIB_DB
        .from("site_resources")
        .select("id,name,description,category,file_path,file_name,file_size,mime_type,video_url,thumbnail_path,created_at")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const resources = await Promise.all(data.map(async (resource) => {
        let thumbnail = "";
        if (resource.thumbnail_path) {
          const thumbnailResult = await window.SAKIB_DB.storage
            .from(window.SAKIB_BUCKET)
            .createSignedUrl(resource.thumbnail_path, 3600);
          if (thumbnailResult.error) console.error(`Could not prepare thumbnail ${resource.id}:`, thumbnailResult.error);
          else thumbnail = thumbnailResult.data.signedUrl;
        }
        return {
          ...resource,
          storagePath: resource.file_path,
          fileType: resource.file_name.split(".").pop(),
          fileSize: formatBytes(resource.file_size),
          videoUrl: resource.video_url,
          thumbnail
        };
      }));
      config.resources = resources;
      renderResources();
    } catch (error) {
      console.error("Could not load published resources:", error);
      config.resources = [];
      document.querySelector("#result-count").textContent = "";
      document.querySelector("#empty-title").textContent = "Resources couldn't load.";
      document.querySelector("#empty-message").textContent = "Please refresh in a moment. The download library could not connect to its storage service.";
      emptyState.hidden = false;
      notify("The resource library is temporarily unavailable.", true);
    } finally {
      grid.removeAttribute("aria-busy");
    }
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return "Size not listed";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const amount = bytes / (1024 ** index);
    return `${amount.toFixed(index > 0 && amount < 10 ? 1 : 0)} ${units[index]}`;
  }

  async function loadPublicSettings() {
    if (!window.SAKIB_DB) return;
    const { data, error } = await window.SAKIB_DB.from("site_settings_public")
      .select("settings").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (data && data.settings) applySiteSettings(data.settings);
  }

  async function loadAnnouncements() {
    const banner = document.querySelector("#announcement-banner");
    if (!window.SAKIB_DB) return;
    const { data, error } = await window.SAKIB_DB.from("site_announcements")
      .select("id,title,message,link_url,created_at")
      .eq("published", true).order("created_at", { ascending: false }).limit(4);
    if (error) throw error;
    let dismissed = [];
    try { dismissed = JSON.parse(sessionStorage.getItem("sakib-dismissed-announcements") || "[]"); } catch { dismissed = []; }
    const announcements = (data || []).filter((item) => !dismissed.includes(item.id));
    banner.innerHTML = announcements.map((item) => {
      const link = safeExternalUrl(item.link_url);
      return `<article class="announcement-item" data-announcement-id="${escapeHtml(item.id)}">
        <span class="announcement-icon" aria-hidden="true">✳</span>
        <div class="announcement-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div>
        ${link ? `<a class="announcement-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Learn more ↗</a>` : ""}
        <button class="announcement-dismiss" type="button" aria-label="Dismiss ${escapeHtml(item.title)}">×</button>
      </article>`;
    }).join("");
    banner.hidden = announcements.length === 0;
  }

  function renderVideos() {
    const videos = Array.isArray(config.videos) ? config.videos.filter((video) => video && video.title && safeExternalUrl(video.url)) : [];
    const videoGrid = document.querySelector("#video-grid");
    document.querySelector("#video-empty").hidden = videos.length > 0;
    videoGrid.innerHTML = videos.map((video) => {
      const thumbnail = validUrl(video.thumbnail) ? `<img src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy">` : "";
      return `<article class="video-card reveal"><a class="video-thumb" href="${escapeHtml(safeExternalUrl(video.url))}" target="_blank" rel="noopener noreferrer">${thumbnail}<span class="play-button" aria-label="Watch video">▶</span></a><div class="video-card-info"><div><h3>${escapeHtml(video.title)}</h3><p>${escapeHtml(video.description || "SAKIB · gdsakib67")}</p></div><a class="video-arrow" href="${escapeHtml(safeExternalUrl(video.url))}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${escapeHtml(video.title)}">↗</a></div></article>`;
    }).join("");
    observeReveals();
  }

  function setupFeedback() {
    const form = document.querySelector("#feedback-form");
    const notice = document.querySelector("#feedback-not-configured");
    const status = document.querySelector("#feedback-status");
    const endpoint = typeof config.feedbackEndpoint === "string" ? config.feedbackEndpoint.trim() : "";
    if (!endpoint) return;
    let parsedEndpoint;
    try { parsedEndpoint = new URL(endpoint); } catch { parsedEndpoint = null; }
    if (!parsedEndpoint || parsedEndpoint.protocol !== "https:" || parsedEndpoint.hostname !== "formspree.io" ||
      !/^\/f\/[A-Za-z0-9]+$/.test(parsedEndpoint.pathname)) {
      const error = new Error("Feedback endpoint must use the format https://formspree.io/f/YOUR_FORM_ID.");
      console.error("Invalid feedback endpoint configuration:", error);
      document.querySelector("#feedback-endpoint-note").textContent = error.message;
      notify("Feedback form configuration is invalid.", true);
      return;
    }
    form.hidden = false;
    notice.hidden = true;
    document.querySelector("#feedback-endpoint-note").textContent =
      "Protected by Formspree’s server-side spam filtering and this form’s honeypot field.";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (form.elements.namedItem("_gotcha").value) {
        form.reset();
        status.textContent = "Thanks for your feedback.";
        return;
      }
      const submit = document.querySelector("#feedback-submit");
      submit.disabled = true;
      status.textContent = "Sending your message…";
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          body: new FormData(form),
          headers: { Accept: "application/json" }
        });
        if (!response.ok) throw new Error(`Feedback service returned HTTP ${response.status}.`);
        form.reset();
        status.textContent = "Thanks! Your message was sent.";
        notify("Your feedback was sent.");
      } catch (error) {
        console.error("Could not send site feedback:", error);
        status.textContent = "Your message could not be sent. Please try again later.";
        notify("Feedback could not be sent. Please try again later.", true);
      } finally {
        submit.disabled = false;
      }
    });
  }

  let revealObserver;
  function observeReveals() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
      return;
    }
    if (!revealObserver) revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal:not(.is-visible)").forEach((element) => revealObserver.observe(element));
  }

  searchInput.addEventListener("input", renderResources);
  sortSelect.addEventListener("change", renderResources);
  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    selectedCategory = button.dataset.category;
    renderFilters();
    renderResources();
  });
  document.querySelector("#downloads").addEventListener("click", async (event) => {
    const storageButton = event.target.closest("button[data-download-id]");
    if (storageButton) {
      const resource = config.resources.find((item) => item.id === storageButton.dataset.downloadId);
      if (!resource || !window.SAKIB_DB) return;
      storageButton.disabled = true;
      storageButton.classList.add("download-checking");
      storageButton.textContent = "Preparing download…";
      try {
        const { data, error } = await window.SAKIB_DB.storage
          .from(window.SAKIB_BUCKET)
          .createSignedUrl(resource.storagePath, 300, { download: resource.file_name });
        if (error) throw error;
        notify("Your download is starting. Check your browser’s downloads.");
        window.location.assign(data.signedUrl);
      } catch (error) {
        console.error(`Could not prepare download for ${resource.id}:`, error);
        storageButton.classList.remove("download-checking");
        storageButton.classList.add("download-disabled");
        storageButton.textContent = "File unavailable";
        notify("This file is unavailable right now. Please try again later.", true);
      }
      return;
    }
    const link = event.target.closest("a[download]");
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;

    event.preventDefault();
    link.setAttribute("aria-disabled", "true");
    link.classList.add("download-checking");
    link.innerHTML = "Checking file…";
    try {
      const response = await fetch(url.href, { method: "HEAD" });
      if (!response.ok) throw new Error(`File returned HTTP ${response.status}`);
      const download = document.createElement("a");
      download.href = url.href;
      download.download = "";
      document.body.append(download);
      download.click();
      download.remove();
      link.removeAttribute("aria-disabled");
      link.classList.remove("download-checking");
      link.innerHTML = 'Download <span aria-hidden="true">↓</span>';
      notify("Your download is starting. Check your browser’s downloads.");
    } catch (error) {
      link.removeAttribute("download");
      link.removeAttribute("href");
      link.removeAttribute("aria-disabled");
      link.classList.remove("download-checking");
      link.classList.add("download-disabled");
      link.textContent = "File unavailable";
      notify("This file is unavailable right now. Please try again later.", true);
      console.error("Resource download check failed:", error);
    }
  });
  document.querySelector("#clear-filters").addEventListener("click", () => {
    searchInput.value = "";
    selectedCategory = "All files";
    renderFilters();
    renderResources();
    searchInput.focus();
  });
  document.querySelector("#announcement-banner").addEventListener("click", (event) => {
    const button = event.target.closest(".announcement-dismiss");
    if (!button) return;
    const article = button.closest("[data-announcement-id]");
    article.remove();
    if (!document.querySelector("#announcement-banner .announcement-item")) {
      document.querySelector("#announcement-banner").hidden = true;
    }
    try {
      const dismissed = JSON.parse(sessionStorage.getItem("sakib-dismissed-announcements") || "[]");
      dismissed.push(article.dataset.announcementId);
      sessionStorage.setItem("sakib-dismissed-announcements", JSON.stringify([...new Set(dismissed)]));
    } catch {
      notify("Announcement dismissed for this page only.");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      searchInput.focus();
    }
    if (event.key === "Escape" && document.activeElement === searchInput) searchInput.blur();
  });

  const themeToggle = document.querySelector(".theme-toggle");
  const themeIcon = document.querySelector(".theme-icon");
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === "dark";
    themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
    themeIcon.innerHTML = dark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>'
      : '<path d="M20.1 15.6A8.7 8.7 0 0 1 8.4 3.9 8.8 8.8 0 1 0 20.1 15.6Z"/>';
  }
  let savedTheme = null;
  try { savedTheme = localStorage.getItem("sakib-theme"); } catch { /* Storage can be disabled by the browser. */ }
  setTheme(savedTheme === "dark" ? "dark" : "light");
  themeToggle.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(theme);
    try { localStorage.setItem("sakib-theme", theme); } catch { notify("Theme changed for this visit only."); }
  });

  const menuToggle = document.querySelector(".menu-toggle");
  const navLinks = document.querySelector("#nav-links");
  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!expanded));
    menuToggle.setAttribute("aria-label", expanded ? "Open navigation" : "Close navigation");
    navLinks.classList.toggle("nav-open", !expanded);
  });
  navLinks.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Open navigation");
      navLinks.classList.remove("nav-open");
    }
  });

  const finePointer = window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");
  if (finePointer.matches) {
    document.addEventListener("pointermove", (event) => {
      const button = event.target.closest(".button, .download-button");
      if (!button || button.matches(":disabled")) return;
      const bounds = button.getBoundingClientRect();
      const x = (event.clientX - bounds.left - bounds.width / 2) / bounds.width;
      const y = (event.clientY - bounds.top - bounds.height / 2) / bounds.height;
      button.style.setProperty("--magnetic-x", `${(x * 4).toFixed(1)}px`);
      button.style.setProperty("--magnetic-y", `${(y * 4).toFixed(1)}px`);
    }, { passive: true });
    document.addEventListener("pointerout", (event) => {
      const button = event.target.closest(".button, .download-button");
      if (button && !button.contains(event.relatedTarget)) {
        button.style.removeProperty("--magnetic-x");
        button.style.removeProperty("--magnetic-y");
      }
    });

    document.addEventListener("pointermove", (event) => {
      const card = event.target.closest(".resource-card, .video-card");
      if (!card) return;
      const bounds = card.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      card.style.setProperty("--tilt-x", `${((.5 - y) * 5).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${((x - .5) * 6).toFixed(2)}deg`);
    }, { passive: true });
    document.addEventListener("pointerout", (event) => {
      const card = event.target.closest(".resource-card, .video-card");
      if (card && !card.contains(event.relatedTarget)) {
        card.style.removeProperty("--tilt-x");
        card.style.removeProperty("--tilt-y");
      }
    });
  }

  if (window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
    let parallaxFrame = 0;
    window.addEventListener("scroll", () => {
      if (parallaxFrame) return;
      parallaxFrame = window.requestAnimationFrame(() => {
        parallaxFrame = 0;
        const art = document.querySelector(".hero-art");
        const bounds = art.getBoundingClientRect();
        const offset = Math.max(-12, Math.min(12, (bounds.top + bounds.height / 2 - window.innerHeight / 2) * -0.018));
        art.style.setProperty("--parallax-y", `${offset.toFixed(1)}px`);
      });
    }, { passive: true });
  }

  const backToTop = document.querySelector("#back-to-top");
  window.addEventListener("scroll", () => backToTop.classList.toggle("back-to-top-visible", window.scrollY > 600), { passive: true });
  backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.querySelector("#current-year").textContent = String(new Date().getFullYear());
  async function initializePublicSite() {
    if (window.SAKIB_DB) {
      try {
        await loadPublicSettings();
      } catch (error) {
        console.error("Could not load published website settings:", error);
        notify("Some website settings could not be loaded.", true);
      }
      try {
        await loadAnnouncements();
      } catch (error) {
        console.error("Could not load published announcements:", error);
        notify("Announcements are temporarily unavailable.", true);
      }
    }
    setupChannels();
    renderFilters();
    renderResources();
    renderVideos();
    setupFeedback();
    observeReveals();
    await loadPublicResources();
  }
  initializePublicSite();

  if (window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)").matches) {
    const cursor = document.querySelector(".cursor-glow");
    window.addEventListener("pointermove", (event) => {
      cursor.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
      cursor.classList.add("cursor-active");
    }, { passive: true });
    document.addEventListener("pointerleave", () => cursor.classList.remove("cursor-active"));
  }
})();
