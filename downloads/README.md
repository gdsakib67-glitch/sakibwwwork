# Optional static downloads

The recommended way to add or manage viewer downloads is through the private `/admin/dashboard/` after Supabase is configured. Dashboard uploads live in a private Supabase Storage bucket and do not require edits or redeployment.

This folder is only for optional files intentionally hosted as public static assets. Files placed here are public to anyone who knows their URL. Do not put private material here. If you add static resources to `resources.js`, check that each relative `filePath` points to a real file before publishing.
