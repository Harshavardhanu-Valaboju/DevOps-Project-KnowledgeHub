# KnowledgeHub Discussion Forum

MERN discussion forum for SR University with users, moderators, administrators, questions, answers, comments, votes, accepted answers, moderation, and MongoDB-backed reports.

## Run locally

```powershell
Copy-Item backend/.env.example backend/.env
cd backend; npm install; npm run dev
cd ../frontend; npm install; npm run dev
```

Open http://localhost:5173. MongoDB must be running locally.

To create the initial admin and categories, run `cd backend; npm run seed` with MongoDB available. The default admin is `admin@knowledgehub.local` with password `Admin@12345`; set `SEED_ADMIN_PASSWORD` first for a different password.

## Docker

```powershell
$env:JWT_SECRET='use-a-long-random-secret'
docker compose up --build
```

Open http://localhost:8081. Compose automatically creates the demo admin, moderator, and categories. See `docs/DEPLOYMENT.md` for Kubernetes commands.

Demo accounts:

- Admin: `admin@knowledgehub.local` / `Admin@12345`
- Moderator: `moderator@knowledgehub.local` / `Moderator@12345`

The first Compose startup also creates synthetic demonstration activity for multiple contributors. It is safe to run repeatedly; seeded records are upserted or checked by title, and MongoDB persists them in the `mongo-data` volume.

The seeded categories include Web Development, DevOps, Database, Career & Learning, AI and ML, Python, and Software Development. Existing `demo.userXX` accounts are migrated to lowercase `userXX` accounts with emails such as `user01@knowledgehub.local` while retaining their existing content.

Admin users can access `/#/admin` to add, restore, deactivate, and change the roles of accounts. They can also view every user's question, answer, comment, vote, and contribution totals, and update, hide, delete, restore, undo, or redo any discussion content. Moderators can access `/#/moderation` to view the same contribution summaries and category-aware content, and can update, hide, delete, restore, undo, or redo discussion content and resolve reports. Moderators have no account add/remove API or UI access.

Each user's profile is a dashboard rather than a count-only page. The owner can see their questions, answers, comments, votes, and contribution total, update or delete their own questions/answers/comments, and remove their own votes. Staff actions are stored in `ModerationLog` with before/after state so the management workspace can undo or redo them.

