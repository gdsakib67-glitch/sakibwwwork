#!/usr/bin/env python3
"""Copy the static site to dist and inject public Supabase settings from env."""

import json
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
FILES = (
    "index.html",
    "404.html",
    "README.md",
    "styles.css",
    "app.js",
    "catalog.js",
    "resources.js",
    "explore-websites.html",
    "favicon.svg",
    "og-image.svg",
    "supabase-client.js",
    "admin/index.html",
    "admin/admin.css",
    "admin/auth.js",
    "admin/dashboard.js",
    "admin/catalog-admin.js",
    "admin/login/index.html",
    "admin/dashboard/index.html",
)


def main():
    url = os.environ.get("SUPABASE_URL", "").strip()
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    if bool(url) != bool(anon_key):
        raise SystemExit("Set both SUPABASE_URL and SUPABASE_ANON_KEY, or leave both unset.")
    if os.environ.get("REQUIRE_SUPABASE_CONFIG") == "1" and not (url and anon_key):
        raise SystemExit("Release build requires SUPABASE_URL and SUPABASE_ANON_KEY.")
    if url and not url.startswith("https://"):
        raise SystemExit("SUPABASE_URL must use HTTPS.")

    for relative in FILES:
        source = ROOT / relative
        target = DIST / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    for folder in ("downloads", "images"):
        source = ROOT / folder
        if source.is_dir():
            shutil.copytree(source, DIST / folder, dirs_exist_ok=True)
    for folder in ("supabase",):
        source = ROOT / folder
        if source.is_dir():
            shutil.copytree(source, DIST / folder, dirs_exist_ok=True)

    config = {
        "url": url,
        "anonKey": anon_key,
    }
    (DIST / "supabase-config.js").write_text(
        "window.SAKIB_SUPABASE_CONFIG = "
        + json.dumps(config, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Static site built to {DIST}")
    if not url:
        print("Warning: Supabase is not configured; admin login and database resources will be unavailable.")


if __name__ == "__main__":
    main()
