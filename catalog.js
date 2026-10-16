(() => {
  "use strict";

  const appCategories = ["Gaming Apps", "PC Tools", "Android Apps", "Minecraft Tools", "Video Editing", "Streaming Tools", "Other Apps"];
  const websiteCategories = ["Gaming", "AI Tools", "Minecraft", "Free Tools", "Learning", "Editing", "Developer Tools"];
  const db = window.SAKIB_DB;
  const bucket = window.SAKIB_BUCKET;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const safeHttps = (value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && parsed.hostname && !parsed.username && !parsed.password ? parsed.href : "";
    } catch {
      return "";
    }
  };
  const formatSize = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return "Size unavailable";
    const units = ["B", "KB", "MB", "GB"];
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** unit)).toFixed(unit ? 1 : 0)} ${units[unit]}`;
  };
  const signAsset = async (path) => {
    if (!path || !db) return "";
    const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 1800);
    if (error) throw error;
    return data.signedUrl;
  };
  let apps = [];
  let links = [];
  let resources = [];
  let selectedWebsiteCategory = "";

  async function appCard(app) {
    const icon = app.icon_path ? await signAsset(app.icon_path) : "";
    const official = safeHttps(app.official_url);
    const video = safeHttps(app.video_url);
    return `<article class="catalog-card reveal">
      <div class="catalog-card-visual">${icon ? `<img src="${escapeHtml(icon)}" alt="" loading="lazy">` : '<span class="catalog-monogram" aria-hidden="true">APP</span>'}<span class="catalog-category">${escapeHtml(app.category)}</span>${app.featured ? '<span class="catalog-featured">FEATURED</span>' : ""}</div>
      <div class="catalog-card-copy"><div class="catalog-title-row"><h3>${escapeHtml(app.name)}</h3>${app.version ? `<span class="catalog-version">${escapeHtml(app.version)}</span>` : ""}</div>
        <p>${escapeHtml(app.description)}</p><div class="catalog-meta"><span>${escapeHtml(app.file_name.split(".").pop().toUpperCase())}</span><span>${escapeHtml(formatSize(app.file_size))}</span></div>
        <div class="catalog-actions"><button class="download-button" type="button" data-app-download="${escapeHtml(app.id)}">Download <span aria-hidden="true">↓</span></button>${official ? `<a class="catalog-official" href="${escapeHtml(official)}" target="_blank" rel="noopener noreferrer">Official website ↗</a>` : ""}${video ? `<a class="catalog-video" href="${escapeHtml(video)}" target="_blank" rel="noopener noreferrer">Tutorial ↗</a>` : ""}</div>
      </div>
    </article>`;
  }

  function websiteCard(link) {
    const url = safeHttps(link.url);
    if (!url) return "";
    const thumbnail = link.thumbnail_url;
    return `<article class="website-card reveal">
      <div class="website-card-visual">${thumbnail ? `<img src="${escapeHtml(thumbnail)}" alt="" loading="lazy">` : '<span class="website-monogram" aria-hidden="true">↗</span>'}<span class="catalog-category">${escapeHtml(link.category)}</span>${link.featured ? '<span class="catalog-featured">FEATURED</span>' : ""}</div>
      <div class="website-card-copy"><h3>${escapeHtml(link.title)}</h3><p>${escapeHtml(link.description)}</p><a class="button button-dark" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Visit website <span aria-hidden="true">↗</span></a></div>
    </article>`;
  }

  function renderWebsiteFilters() {
    const target = document.querySelector("#website-categories");
    if (!target) return;
    target.innerHTML = ["All websites", ...websiteCategories].map((category) => {
      const value = category === "All websites" ? "" : category;
      const active = selectedWebsiteCategory === value;
      return `<button class="filter-chip${active ? " active" : ""}" type="button" data-website-category="${escapeHtml(value)}" aria-pressed="${active}">${escapeHtml(category)}</button>`;
    }).join("");
  }

  async function renderApps() {
    const grid = document.querySelector("#apps-grid");
    if (!grid) return;
    const query = document.querySelector("#app-search").value.trim().toLocaleLowerCase();
    const category = document.querySelector("#app-category").value;
    const matches = apps.filter((app) =>
      (!category || app.category === category) &&
      [app.name, app.description, app.category, app.version].join(" ").toLocaleLowerCase().includes(query));
    grid.innerHTML = (await Promise.all(matches.map(appCard))).join("");
    document.querySelector("#apps-empty").hidden = matches.length > 0;
    document.querySelector("#apps-grid").setAttribute("aria-busy", "false");
    const featured = apps.filter((app) => app.featured);
    document.querySelector("#featured-apps-section").hidden = featured.length === 0;
    document.querySelector("#featured-apps").innerHTML = (await Promise.all(featured.slice(0, 3).map(appCard))).join("");
    const recent = apps.slice(0, 3);
    document.querySelector("#recent-apps-section").hidden = recent.length === 0;
    document.querySelector("#recent-apps").innerHTML = (await Promise.all(recent.map(appCard))).join("");
    observeCatalogCards();
  }

  async function renderWebsites() {
    const grid = document.querySelector("#website-grid");
    if (!grid) return;
    const query = document.querySelector("#website-search").value.trim().toLocaleLowerCase();
    const matches = links.filter((link) =>
      (!selectedWebsiteCategory || link.category === selectedWebsiteCategory) &&
      [link.title, link.description, link.category, link.url].join(" ").toLocaleLowerCase().includes(query));
    grid.innerHTML = matches.map(websiteCard).join("");
    document.querySelector("#website-empty").hidden = matches.length > 0;
    grid.setAttribute("aria-busy", "false");
    const featured = links.filter((link) => link.featured);
    document.querySelector("#featured-websites-section").hidden = featured.length === 0;
    document.querySelector("#featured-websites").innerHTML = featured.map(websiteCard).join("");
    observeCatalogCards();
  }

  function observeCatalogCards() {
    if (!("IntersectionObserver" in window) || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      document.querySelectorAll(".catalog-card.reveal, .website-card.reveal").forEach((item) => item.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }), { threshold: 0.08 });
    document.querySelectorAll(".catalog-card.reveal:not(.is-visible), .website-card.reveal:not(.is-visible)")
      .forEach((item) => observer.observe(item));
  }

  function renderGlobalResults(query) {
    const target = document.querySelector("#hub-search-results");
    if (!target) return;
    const term = query.trim().toLocaleLowerCase();
    if (!term) {
      target.hidden = true;
      return;
    }
    const matches = [
      ...apps.filter((item) => [item.name, item.description, item.category].join(" ").toLocaleLowerCase().includes(term))
        .slice(0, 4).map((item) => ({ title: item.name, detail: `${item.category} · App`, href: "#apps", type: "app" })),
      ...resources.filter((item) => [item.name, item.description, item.category, item.fileType].join(" ").toLocaleLowerCase().includes(term))
        .slice(0, 4).map((item) => ({ title: item.name, detail: `${item.category} · Download`, href: "#downloads", type: "resource" })),
      ...links.filter((item) => [item.title, item.description, item.category].join(" ").toLocaleLowerCase().includes(term))
        .slice(0, 4).map((item) => ({ title: item.title, detail: `${item.category} · Website`, href: `./explore-websites.html?search=${encodeURIComponent(term)}`, type: "website" }))
    ].slice(0, 8);
    target.innerHTML = matches.length
      ? matches.map((item) => `<a href="${escapeHtml(item.href)}" data-global-result="${item.type}"><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.detail)}</small></a>`).join("")
      : '<p>No published apps, downloads, or websites match that search.</p>';
    target.hidden = false;
  }

  function initializeGlobalSearch() {
    const input = document.querySelector("#hub-search");
    const results = document.querySelector("#hub-search-results");
    if (!input || !results) return;
    input.addEventListener("input", () => renderGlobalResults(input.value));
    results.addEventListener("click", (event) => {
      const result = event.target.closest("a[data-global-result]");
      if (!result) return;
      const term = input.value;
      if (result.dataset.globalResult === "app") {
        const appSearch = document.querySelector("#app-search");
        appSearch.value = term;
        appSearch.dispatchEvent(new Event("input"));
      } else if (result.dataset.globalResult === "resource") {
        const resourceSearch = document.querySelector("#resource-search");
        resourceSearch.value = term;
        resourceSearch.dispatchEvent(new Event("input"));
      }
      results.hidden = true;
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".hub-search-wrap")) results.hidden = true;
    });
  }

  async function loadCatalog() {
    const page = document.body.dataset.catalogPage || "home";
    const needsApps = Boolean(document.querySelector("#apps-grid") || document.querySelector("#hub-search"));
    const needsLinks = page === "websites" || Boolean(document.querySelector("#hub-search"));
    if (!db) {
      const notice = document.querySelector("#website-error");
      if (notice) notice.textContent = "Website links could not load because Supabase is not configured.";
      const appEmpty = document.querySelector("#apps-empty");
      if (appEmpty) {
        appEmpty.textContent = "Apps are unavailable until the Supabase catalog is configured.";
        appEmpty.hidden = false;
        document.querySelector("#apps-grid").innerHTML = "";
        document.querySelector("#apps-grid").setAttribute("aria-busy", "false");
      }
      return;
    }
    try {
      const tasks = [];
      if (needsApps) tasks.push(db.from("site_apps").select("id,name,description,category,version,file_path,file_name,file_size,mime_type,icon_path,screenshot_paths,official_url,video_url,featured,published,created_at").eq("published", true).order("created_at", { ascending: false }));
      if (needsLinks) tasks.push(db.from("site_links").select("id,title,description,category,url,thumbnail_path,featured,published,created_at").eq("published", true).order("created_at", { ascending: false }));
      if (document.querySelector("#hub-search")) tasks.push(db.from("site_resources").select("id,name,description,category,file_name,file_size,mime_type,video_url,created_at").eq("published", true).order("created_at", { ascending: false }));
      const results = await Promise.all(tasks);
      for (const result of results) if (result.error) throw result.error;
      let index = 0;
      if (needsApps) apps = results[index++].data || [];
      if (needsLinks) {
        links = await Promise.all((results[index++].data || []).map(async (link) => ({
          ...link, thumbnail_url: link.thumbnail_path ? await signAsset(link.thumbnail_path) : ""
        })));
      }
      if (document.querySelector("#hub-search")) resources = results[index++].data || [];
      if (document.querySelector("#apps-grid")) {
        const select = document.querySelector("#app-category");
        select.innerHTML = '<option value="">All app categories</option>' + appCategories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
        await renderApps();
        document.querySelector("#app-search").addEventListener("input", renderApps);
        select.addEventListener("change", renderApps);
        document.querySelector("#apps-grid").addEventListener("click", downloadApp);
        document.querySelector("#featured-apps").addEventListener("click", downloadApp);
        document.querySelector("#recent-apps").addEventListener("click", downloadApp);
      }
      if (document.querySelector("#website-grid")) {
        renderWebsiteFilters();
        await renderWebsites();
        document.querySelector("#website-search").addEventListener("input", renderWebsites);
        document.querySelector("#website-categories").addEventListener("click", (event) => {
          const button = event.target.closest("[data-website-category]");
          if (!button) return;
          selectedWebsiteCategory = button.dataset.websiteCategory;
          renderWebsiteFilters();
          renderWebsites();
        });
      }
      renderGlobalResults(document.querySelector("#hub-search")?.value || "");
      const query = new URLSearchParams(window.location.search).get("search");
      const directorySearch = document.querySelector("#website-search");
      if (query && directorySearch) {
        directorySearch.value = query;
        renderWebsites();
      }
    } catch (error) {
      console.error("Catalog loading failed:", error);
      const notice = document.querySelector("#website-error");
      if (notice) notice.textContent = "The website directory is temporarily unavailable. Refresh and try again.";
      const appEmpty = document.querySelector("#apps-empty");
      if (appEmpty) {
        appEmpty.hidden = false;
        appEmpty.textContent = "The apps catalog is temporarily unavailable. Refresh and try again.";
        document.querySelector("#apps-grid").innerHTML = "";
        document.querySelector("#apps-grid").setAttribute("aria-busy", "false");
      }
    }
  }

  async function downloadApp(event) {
    const button = event.target.closest("[data-app-download]");
    if (!button) return;
    const app = apps.find((item) => item.id === button.dataset.appDownload);
    if (!app) return;
    button.disabled = true;
    button.classList.add("download-checking");
    button.textContent = "Preparing download…";
    try {
      const url = await signAsset(app.file_path);
      if (!url) throw new Error("No download URL was returned.");
      window.location.assign(url);
    } catch (error) {
      console.error("App download could not be prepared:", error);
      button.disabled = false;
      button.classList.remove("download-checking");
      button.textContent = "File unavailable";
    }
  }

  const mobileToggle = document.querySelector(".menu-toggle");
  if (mobileToggle) {
    const navLinks = document.querySelector("#nav-links");
    mobileToggle.addEventListener("click", () => {
      const expanded = mobileToggle.getAttribute("aria-expanded") === "true";
      mobileToggle.setAttribute("aria-expanded", String(!expanded));
      mobileToggle.setAttribute("aria-label", expanded ? "Open navigation" : "Close navigation");
      navLinks.classList.toggle("nav-open", !expanded);
    });
    navLinks.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        mobileToggle.setAttribute("aria-expanded", "false");
        mobileToggle.setAttribute("aria-label", "Open navigation");
        navLinks.classList.remove("nav-open");
      }
    });
  }
  const year = document.querySelector("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());
  const themeToggle = document.querySelector(".directory-theme-toggle");
  if (themeToggle) {
    let savedTheme = null;
    try { savedTheme = localStorage.getItem("sakib-theme"); } catch { /* Theme persistence is optional. */ }
    const applyTheme = (theme) => {
      document.documentElement.dataset.theme = theme;
      themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
    };
    applyTheme(savedTheme === "dark" ? "dark" : "light");
    themeToggle.addEventListener("click", () => {
      const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      try { localStorage.setItem("sakib-theme", theme); } catch { /* Current page theme still updates. */ }
    });
  }
  initializeGlobalSearch();
  loadCatalog();
})();
