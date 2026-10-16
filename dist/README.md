# SAKIB — Gaming Resource Hub

Responsive Minecraft, Free Fire, OBS/streaming, and PC-gaming resource library for the **gdsakib67** channel, with a private Google-authenticated owner dashboard. The static HTML/CSS/JavaScript site is served by GitHub Pages or another static host. Supabase supplies authentication, resource records, private file storage, and database-enforced access policies.

## One-time Supabase setup

### 1. Create the project and database schema

1. Create a Supabase project at <https://supabase.com/dashboard>.
2. In **SQL Editor**, run `supabase/setup.sql`. It creates the resources, announcements, settings, and administrator tables; row-level-security policies; and a private `tutorial-resources` storage bucket with server-enforced MIME/extension and file-size limits.
3. In **Authentication → Providers**, enable **Google**. Disable email/password sign-in and other providers if they are not needed. This website contains no public signup or password form. Supabase may create Auth records for Google users, but Google sign-in alone never creates an administrator grant.
4. In **Authentication → URL Configuration**, set your deployed website as the **Site URL**. Add the full callback/redirect URLs to **Redirect URLs**, including:
   - `https://YOUR-SITE.example/admin/dashboard/`
   - `https://YOUR-SITE.example/admin/login/`
   - `http://localhost:8000/admin/dashboard/` for local testing
5. Create a Google OAuth client in Google Cloud Console:
   - Add the Supabase callback URI shown by your Supabase Google provider settings (usually `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`) as an **Authorized redirect URI**.
   - Configure the OAuth consent screen and add `gdsakib67@gmail.com` as an authorized test user while the app is in testing mode, if applicable.
   - Copy the Google OAuth client ID and client secret into **Supabase → Authentication → Providers → Google**. They are provider credentials, not website environment variables; do not paste them into this repository.
6. Visit `/admin/login/` on your deployed site and sign in with the verified Google account **gdsakib67@gmail.com**. This first login creates the Supabase Auth identity.
7. In Supabase SQL Editor, run `supabase/grant-owner-admin.sql`. It grants admin membership only if that exact email is confirmed and its Google identity has `email_verified = true`. This is the only initial owner grant; there is no frontend admin signup, and the database has no policy permitting users to add themselves as admins.

The database authorization function checks the current Supabase user ID, exact email, verified email, verified Google identity, and owner-membership row on privileged resource, announcement, settings, and Storage operations. RLS—not hidden links or client-side checks—enforces access. Unrelated Google accounts and unverified identities are denied.

### 2. Configure the public Supabase connection

Find the **Project URL** and **publishable/anon key** in Supabase **Project Settings → API**. These two values are intentionally public client configuration; authorization depends on RLS. **Never use or publish a Supabase service-role/secret key.**

Local production-style build, in PowerShell:

```powershell
$env:SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co"
$env:SUPABASE_ANON_KEY = "YOUR-PUBLISHABLE-OR-ANON-KEY"
python scripts\build.py
python -m http.server 8000 --directory dist
```

Visit <http://localhost:8000>. `dist/supabase-config.js` is generated from environment variables and git-ignored. The source `supabase-config.js` is an empty placeholder, so the dashboard reports that setup is required until configured. No administrator secret is injected into the website.

### 3. Deploy on GitHub Pages

The workflow `.github/workflows/deploy-pages.yml` builds and publishes to GitHub Pages on pushes to `main`.

1. Push this project to a GitHub repository.
2. In **Repository → Settings → Secrets and variables → Actions**, add repository secrets named `SUPABASE_URL` and `SUPABASE_ANON_KEY` using the public project URL/key. **Do not add a service-role key.**
3. In **Repository → Settings → Pages**, select **GitHub Actions** as the deployment source.
4. Push to `main` and wait for the Pages workflow in the **Actions** tab.
5. Add the deployed site URLs to Supabase Auth's **Redirect URLs** and set the Supabase **Site URL**.
6. Open `https://YOUR-SITE/admin/login/`, choose **Continue with Google**, and use `gdsakib67@gmail.com`. The authorized session continues to `/admin/dashboard/`.

Cloudflare Pages and Netlify also work: define `SUPABASE_URL` and `SUPABASE_ANON_KEY` as build environment variables, run `python scripts/build.py`, and publish `dist`.

## Use the dashboard

- **Sign-in:** `/admin/login/`
- **Dashboard:** `/admin/dashboard/` (checks the authenticated owner identity before showing any dashboard controls)
- **Overview:** actual database counts for total/published/draft resources and published announcements
- **Downloads:** upload, search, edit, publish, unpublish, or delete files and metadata
- **Announcements:** create/update private drafts, publish/unpublish homepage notices, add optional HTTPS links, or delete
- **Website settings:** edit the homepage heading/description, channel/social links, resource categories, curated featured resources, the separate “Featured resource of the week,” and footer text; preview edits privately, save a private draft, then publish
- **Logout:** available in the dashboard header and sidebar

After the one-time provider/database/deployment setup, file uploads and website edits are saved in Supabase from any browser. Adding or changing resources, announcements, and website settings does **not** require VS Code, GitHub edits, a build, or a redeploy.

Accepted file types are PDF, ZIP, PNG, JPG/JPEG, WEBP, TXT, JSON, CSV, MD, and LOG, up to 100 MB; thumbnails are PNG/JPG/WEBP up to 5 MB. The private Storage bucket, server-side bucket restrictions, and Storage RLS validate owner authorization, object paths, file extensions, declared MIME types, and byte limits. They do not perform antivirus scanning or inspect file signatures; only upload files that you trust and are permitted to publish. Visitors can query only published resources/announcements and get a short-lived signed URL only for a currently published file.

## Public content and YouTube links

The supplied channel URL `https://www.youtube.com/@gdsakib67` was checked and resolves to “GD Sakib.” It is configured in `resources.js` and as the initial public setting in `supabase/setup.sql`. Change it in `resources.js` for the static fallback and in Website settings on the dashboard for the published site. The dashboard can also manage social links and manually selected YouTube videos/thumbnails. Add only real video URLs and thumbnails; the site does not invent them. Do not add API keys or private information to `resources.js`.

The game resource categories include Minecraft, Free Fire, PC Tutorials, OBS & Streaming, Gaming Tools, Software Guides, and Other Resources. In **Website settings**, choose curated featured resources and a separate currently published resource for “Featured resource of the week.” The previous default category list is automatically upgraded to add OBS & Streaming in the public page and dashboard editor. If existing Supabase settings use older categories, save and publish the updated settings to store them.

“Trending downloads” shows SAKIB’s curated featured resources; it is not a view/download ranking because the site does not collect those statistics. “Recently added” uses each resource’s actual Supabase `created_at` timestamp. Featured, trending, recent, and main-library cards use the same working resource links.

For videos, use one line per item in the dashboard: `title | https://www.youtube.com/watch?v=REAL_ID | optional-https-thumbnail-url`.

### Optional feedback form and spam protection

The feedback form remains unavailable until a real Formspree endpoint is configured. Create a form with Formspree, complete its verification/activation, then set the public endpoint in `resources.js`:

```js
feedbackEndpoint: "https://formspree.io/f/YOUR_FORM_ID",
```

The site accepts only that HTTPS Formspree endpoint format, sends form submissions to Formspree, and includes Formspree’s `_gotcha` honeypot. Formspree applies server-side spam filtering; the honeypot and client-side validation are not treated as the security boundary. No form ID or endpoint is invented in this project. If you do not configure one, visitors see a clear “not connected” notice and cannot send messages. The form ID is public configuration, not a secret; never add private API keys or tokens to the frontend.

The social-sharing card is the custom `og-image.svg`, copied to the production build. Social crawlers may require an absolute `og:image` URL with the final site domain after deployment.

Downloads show a checking/preparing animation and a notification when the browser is asked to start downloading. A static website cannot observe whether the browser completed a download, so it does not display a fabricated progress percentage or claim the file finished.

`downloads/` is an optional folder for static files; dashboard uploads are stored privately in Supabase. Do not put confidential or non-public files in either public static hosting or a published resource.

## Checks and known setup dependency

```powershell
python -m unittest discover -s tests
python scripts\build.py
```

Tests use Python's standard library. A real Google OAuth login, authorization-policy check, and upload require your own Supabase project and the one-time manual setup above. Until configured, no demo credentials or fake uploads are provided.

## Main project files

- `index.html`, `styles.css`, `app.js` — public website, download center, announcements, and published settings
- `resources.js` — channel/video defaults and fallback categories
- `admin/login/` and `admin/dashboard/` — separate owner sign-in and private dashboard routes
- `admin/auth.js`, `admin/dashboard.js`, `admin/admin.css` — OAuth flow, dashboard operations, responsive UI
- `supabase/setup.sql` — RLS schema, private Storage policies, and published/draft data tables
- `supabase/grant-owner-admin.sql` — one-time verified owner Google identity grant
- `supabase-client.js` and `supabase-config.js` — browser Supabase client and safe public config placeholder
- `scripts/build.py` — static build and environment-variable injection
- `.github/workflows/deploy-pages.yml` — GitHub Pages build and deployment
