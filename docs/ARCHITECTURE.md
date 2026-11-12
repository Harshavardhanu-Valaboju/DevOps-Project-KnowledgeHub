# Architecture and database design

The browser uses React Router and Axios. The backend exposes REST endpoints under `/api`, validates JWTs, enforces RBAC, and uses Mongoose to query MongoDB. Docker Compose provides MongoDB, Express, and Nginx-served React. Kubernetes uses separate deployments and services.

Collections are linked with ObjectId references: questions belong to users and categories; answers belong to questions; comments and votes point to questions or answers; reports point to any content type; moderation logs record moderator actions. Contributions equal questions + answers + comments. Profile `votes` means votes cast by that user, while `votesReceived` is a separate helpfulness metric.

The profile endpoint returns both the summary and activity lists. Owner APIs allow a user to update or soft-delete their own questions, answers, and comments and remove their own votes. Staff content actions use a reversible soft-delete (`hidden`) and store `before` and `after` snapshots in `ModerationLog`. Undo and redo restore one of those snapshots, so moderation does not destroy the original record.

`GET /api/moderation/users` returns each member's questions, answers, comments, votes, contributions, and received-vote totals. `GET /api/moderation/content` includes the content author and category/domain. `POST /api/admin/users` is intentionally protected by the admin role; moderators have no user creation or removal route.

Discussion activity is answers + comments, never votes. Category activity is answers + comments. Unanswered questions have zero visible answers. Registration always creates a regular user; only admin endpoints can change roles.

For lecturer demonstrations, `backend/seed.js` creates synthetic but realistic activity so reports and feeds are not empty. Related-question suggestions are available through `GET /api/recommendations/:id`, matching shared categories or tags and ranking recent activity. The accepted answer is stored in `questions.acceptedAnswer`; this is the platform's data-backed “best answer” mechanism, while votes and discussion activity provide helpfulness signals. It is not an AI answer generator and does not use real personal data.
