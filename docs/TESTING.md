# Testing checklist

Register two users. Verify login/logout, protected question creation, category selection, answers, comments, one-vote toggle behavior, accepted answers, profile activity, and owner-only update/delete actions. Use Postman with `Authorization: Bearer <token>` for protected endpoints. Admin/moderator users can access reports and moderation routes; regular users receive HTTP 403.

For moderation, update, hide, or delete one question and verify it appears in `/api/moderation/history`. Call the matching undo endpoint, confirm the original state is restored, then call redo and confirm the staff change returns. Verify `/api/admin/users` and `POST /api/admin/users` return HTTP 403 for a moderator, while `/api/moderation/users` and `/api/moderation/content` are available to both staff roles.

Check connectivity with `Invoke-WebRequest http://localhost:5000/api/health`. Search covers title, description, and tags. Report values are calculated from MongoDB records rather than hardcoded values.
