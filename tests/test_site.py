import importlib.util
import os
import re
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("site_build", ROOT / "scripts" / "build.py")
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)


class LocalAssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ("src", "href") and value:
                self.assets.append(value)


class IdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        self.ids.update(value for name, value in attrs if name == "id")


class SiteTests(unittest.TestCase):
    def test_local_html_assets_exist(self):
        pages = (
            ROOT / "index.html",
            ROOT / "explore-websites.html",
            ROOT / "404.html",
            ROOT / "og-image.svg",
            ROOT / "admin" / "index.html",
            ROOT / "admin" / "login" / "index.html",
            ROOT / "admin" / "dashboard" / "index.html",
        )
        for page in pages:
            parser = LocalAssetParser()
            parser.feed(page.read_text(encoding="utf-8"))
            for asset in parser.assets:
                parsed = urlsplit(asset)
                if parsed.scheme or parsed.netloc or asset.startswith(("#", "data:")):
                    continue
                target = (page.parent / parsed.path).resolve()
                if target.is_dir():
                    target = target / "index.html"
                self.assertTrue(target.is_file(), f"{page.relative_to(ROOT)} references missing {asset}")

    def test_script_id_selectors_exist_on_their_pages(self):
        page_scripts = (
            (ROOT / "index.html", ROOT / "app.js"),
            (ROOT / "admin" / "login" / "index.html", ROOT / "admin" / "auth.js"),
            (ROOT / "admin" / "dashboard" / "index.html", ROOT / "admin" / "dashboard.js"),
            (ROOT / "admin" / "dashboard" / "index.html", ROOT / "admin" / "catalog-admin.js"),
        )
        for page, script in page_scripts:
            parser = IdParser()
            parser.feed(page.read_text(encoding="utf-8"))
            selectors = set(re.findall(r'(?:querySelector|\$)\("#([A-Za-z0-9_-]+)"\)', script.read_text(encoding="utf-8")))
            self.assertEqual(selectors - parser.ids, set(), f"{script.name} has selectors missing from {page}")

    def test_build_injects_only_public_supabase_settings(self):
        with tempfile.TemporaryDirectory() as output:
            with patch.object(BUILD, "DIST", Path(output)):
                with patch.dict(os.environ, {
                    "SUPABASE_URL": "https://example.supabase.co",
                    "SUPABASE_ANON_KEY": "public-anon-test-value",
                    "REQUIRE_SUPABASE_CONFIG": "1",
                }, clear=False):
                    BUILD.main()
            generated = (Path(output) / "supabase-config.js").read_text(encoding="utf-8")
            self.assertIn("https://example.supabase.co", generated)
            self.assertIn("public-anon-test-value", generated)
            self.assertNotIn("service_role", generated)
            self.assertTrue((Path(output) / "admin" / "index.html").is_file())
            self.assertTrue((Path(output) / "admin" / "login" / "index.html").is_file())
            self.assertTrue((Path(output) / "admin" / "dashboard" / "index.html").is_file())
            self.assertTrue((Path(output) / "supabase" / "setup.sql").is_file())
            self.assertTrue((Path(output) / "supabase" / "grant-owner-admin.sql").is_file())
            self.assertTrue((Path(output) / "README.md").is_file())
            self.assertTrue((Path(output) / "og-image.svg").is_file())
            self.assertTrue((Path(output) / "catalog.js").is_file())
            self.assertTrue((Path(output) / "explore-websites.html").is_file())
            self.assertTrue((Path(output) / "admin" / "catalog-admin.js").is_file())

    def test_release_build_requires_both_environment_variables(self):
        with tempfile.TemporaryDirectory() as output:
            with patch.object(BUILD, "DIST", Path(output)):
                with patch.dict(os.environ, {
                    "SUPABASE_URL": "",
                    "SUPABASE_ANON_KEY": "",
                    "REQUIRE_SUPABASE_CONFIG": "1",
                }, clear=False):
                    with self.assertRaises(SystemExit):
                        BUILD.main()

    def test_backend_schema_enforces_private_uploads_and_published_reads(self):
        sql = (ROOT / "supabase" / "setup.sql").read_text(encoding="utf-8").lower()
        self.assertIn("'tutorial-resources',\n  'tutorial-resources',\n  false", sql)
        self.assertIn("alter table public.site_resources enable row level security", sql)
        self.assertIn("select public.is_site_admin()", sql)
        self.assertIn("published", sql)
        self.assertIn("5242880", sql)
        self.assertIn("104857600", sql)
        self.assertIn("gdsakib67@gmail.com", sql)
        self.assertIn("i.provider = 'google'", sql)
        self.assertIn("email_verified", sql)
        self.assertIn("site_announcements", sql)
        self.assertIn("site_settings_drafts", sql)
        self.assertIn("lower(u.email) = 'gdsakib67@gmail.com'", sql)
        self.assertNotIn("service_role", sql)

    def test_real_youtube_channel_is_configured_without_substitution(self):
        config = (ROOT / "resources.js").read_text(encoding="utf-8")
        schema = (ROOT / "supabase" / "setup.sql").read_text(encoding="utf-8")
        self.assertIn('channelUrl: "https://www.youtube.com/@gdsakib67"', config)
        self.assertIn('"channelUrl": "https://www.youtube.com/@gdsakib67"', schema)
        self.assertNotIn("youtube.com/channel/", config)

    def test_cinematic_intro_is_skippable_and_respects_reduced_motion(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        css = (ROOT / "styles.css").read_text(encoding="utf-8")
        self.assertIn('id="cinematic-intro"', html)
        self.assertIn('id="intro-skip"', html)
        self.assertIn('querySelector("#intro-skip")', app)
        self.assertIn('prefers-reduced-motion: no-preference', app)
        self.assertIn(".cinematic-intro { display: none !important; }", css)

    def test_gaming_discovery_uses_published_resource_data_and_admin_weekly_choice(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        dashboard = (ROOT / "admin" / "dashboard.js").read_text(encoding="utf-8")
        admin_html = (ROOT / "admin" / "dashboard" / "index.html").read_text(encoding="utf-8")
        config = (ROOT / "resources.js").read_text(encoding="utf-8")
        self.assertIn("OBS & Streaming", config)
        self.assertIn('id="weekly-feature"', html)
        self.assertIn('id="trending-grid"', html)
        self.assertIn('id="recent-grid"', html)
        self.assertIn("resource.published !== false", app)
        self.assertIn("resource.created_at || resource.createdAt", app)
        self.assertIn("weeklyResourceId", dashboard)
        self.assertIn('id="settings-weekly-resource"', admin_html)
        self.assertIn("Featured resource of the week", admin_html)
        self.assertIn('document.querySelector("#downloads").addEventListener("click"', app)

    def test_feedback_is_off_until_server_spam_filter_endpoint_is_configured(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        config = (ROOT / "resources.js").read_text(encoding="utf-8")
        self.assertIn('feedbackEndpoint: ""', config)
        self.assertIn('id="feedback-not-configured"', html)
        self.assertIn('name="_gotcha"', html)
        self.assertIn("formspree.io", app)
        self.assertIn('headers: { Accept: "application/json" }', app)

    def test_apps_and_website_directory_have_owner_only_rls_and_safe_public_reads(self):
        sql = (ROOT / "supabase" / "setup.sql").read_text(encoding="utf-8").lower()
        self.assertIn("create table if not exists public.site_apps", sql)
        self.assertIn("create table if not exists public.site_links", sql)
        self.assertIn("using (published or (select public.is_site_admin()))", sql)
        self.assertIn("admins can create apps", sql)
        self.assertIn("admins can update apps", sql)
        self.assertIn("admins can delete apps", sql)
        self.assertIn("admins can create links", sql)
        self.assertIn("admins can update links", sql)
        self.assertIn("admins can delete links", sql)
        self.assertIn("application/vnd.android.package-archive", sql)
        self.assertIn("application/vnd.microsoft.portable-executable", sql)
        self.assertIn("104857600", sql)
        self.assertIn("5242880", sql)
        self.assertIn("url ~* '^https://", sql)
        self.assertIn("storage.objects.name = any(a.screenshot_paths)", sql)
        self.assertIn("public.is_site_admin()", sql)

    def test_public_catalog_and_dashboard_controls_are_wired_without_fake_entries(self):
        home = (ROOT / "index.html").read_text(encoding="utf-8")
        directory = (ROOT / "explore-websites.html").read_text(encoding="utf-8")
        public_catalog = (ROOT / "catalog.js").read_text(encoding="utf-8")
        admin_catalog = (ROOT / "admin" / "catalog-admin.js").read_text(encoding="utf-8")
        dashboard = (ROOT / "admin" / "dashboard" / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="apps-grid"', home)
        self.assertIn('id="hub-search"', home)
        self.assertIn('id="featured-apps"', home)
        self.assertIn('id="recent-apps"', home)
        self.assertIn('data-catalog-page="websites"', directory)
        self.assertIn('id="website-grid"', directory)
        self.assertIn(".eq(\"published\", true)", public_catalog)
        self.assertIn('rel="noopener noreferrer"', public_catalog)
        self.assertIn("safeHttps", public_catalog)
        self.assertIn("createSignedUrl", public_catalog)
        self.assertIn("verifyOwner", admin_catalog)
        self.assertIn("OWNER_EMAIL = \"gdsakib67@gmail.com\"", admin_catalog)
        self.assertIn("crypto.randomUUID()", admin_catalog)
        self.assertIn('data-panel="apps"', dashboard)
        self.assertIn('data-panel="websites"', dashboard)
        self.assertIn('id="app-upload-progress"', dashboard)
        self.assertIn('name="publish"', dashboard)
        html_ids = IdParser()
        html_ids.feed(home)
        html_ids.feed(directory)
        selectors = set(re.findall(r'(?:querySelector|\$)\("#([A-Za-z0-9_-]+)"\)', public_catalog))
        self.assertEqual(selectors - html_ids.ids, set(), "catalog.js references IDs missing from its public pages")


if __name__ == "__main__":
    unittest.main()
