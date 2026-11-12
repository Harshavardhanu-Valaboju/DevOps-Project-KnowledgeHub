# KnowledgeHub Discussion Forum

KnowledgeHub is a MERN-based online discussion forum and knowledge-sharing portal. Users can ask questions, provide answers, add comments, vote on helpful content, accept answers, search discussions, and receive related-question suggestions.

The project also includes role-based Admin and Moderator workspaces, MongoDB-backed reports, Docker Compose deployment, and Kubernetes manifests.

## Main features

- User registration and JWT-based login
- Admin, Moderator, and Registered User roles
- Questions, answers, comments, helpful votes, and accepted answers
- Categories/domains including Web Development, DevOps, Database, Career & Learning, AI and ML, Python, and Software Development
- Search by question title, description, and tags
- User profile dashboards showing questions, answers, comments, votes, and contributions
- Users can update/delete their own questions, answers, and comments
- Users can remove their own votes
- Admin can add, restore, deactivate, and change user roles
- Admin and Moderator can view member contribution details
- Admin and Moderator can update, hide, delete, restore, undo, and redo content changes
- Moderators can resolve reports but cannot add or remove users
- CSV reports for most-discussed topics, user contributions, unanswered questions, and category activity
- Seeded demonstration data for lecturer presentations

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React, React Router, Axios, Vite |
| Backend | Node.js, Express.js, JWT, bcryptjs |
| Database | MongoDB with Mongoose |
| Web server | Nginx |
| Containers | Docker and Docker Compose |
| Orchestration | Kubernetes and Minikube |

## Application architecture

```text
Browser
  ↓
React frontend served by Nginx
  ↓ Axios REST requests
Express REST API
  ↓ Mongoose
MongoDB
```

The frontend sends requests to `/api`. Nginx forwards those requests to the backend container. The backend validates authentication and permissions, performs database operations through Mongoose, and returns JSON responses to React.

## Project structure

```text
backend/       Express API, Mongoose models, seed script, Dockerfile
frontend/      React application, Vite build, Nginx configuration
docs/          Architecture, deployment, and testing documentation
k8s/           Kubernetes ConfigMap, Secret, MongoDB, backend, and frontend manifests
docker-compose.yml
start.ps1      Starts Docker services and opens the application
stop.ps1       Stops Docker services without deleting database data
```

## Prerequisites

For the recommended setup, install:

- Docker Desktop with Linux containers enabled
- Git, if you want to upload the project to GitHub

Node.js and MongoDB do not need to be installed separately when using Docker Compose.

Kubernetes and Minikube are optional and are only required for the Kubernetes demonstration.

## Recommended startup with Docker

Open PowerShell and run:

```powershell
cd "C:\DevOps Project"
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

The script starts Docker Desktop if necessary, builds the images, starts MongoDB, starts the backend and frontend, runs the seed service, and opens the application.

Open the portal manually at:

```text
http://localhost:8081
```

Check the containers:

```powershell
docker compose ps
```

Check the backend and database connection:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:5000/api/health
```

Expected response:

```json
{"ok":true,"database":true}
```

MongoDB is started automatically by Docker Compose. You do not need to start MongoDB separately. Kubernetes is not required for normal portal use.

## Stopping the application

```powershell
cd "C:\DevOps Project"
powershell -ExecutionPolicy Bypass -File .\stop.ps1
```

This stops the containers but preserves the MongoDB data volume.

To stop manually:

```powershell
docker compose down
```

Do not use `docker compose down -v` unless you intentionally want to delete the stored MongoDB data.

## Demo login accounts

```text
Admin:
Email: admin@knowledgehub.local
Password: Admin@12345

Moderator:
Email: moderator@knowledgehub.local
Password: Moderator@12345

Seeded users:
user01@knowledgehub.local through user24@knowledgehub.local
Password: Demo@12345
```

## How to use each role

### Registered user

1. Log in or create an account.
2. Browse categories and questions.
3. Ask a question.
4. Add answers and comments.
5. Click **helpful** to vote. Clicking again removes the vote.
6. Accept the best answer on your own question.
7. Open **Profile** to view and manage your own contributions.

### Moderator

1. Log in using the Moderator account.
2. Open **Moderate**.
3. View every member's question, answer, comment, vote, and contribution totals.
4. Select a member to see that person's detailed content.
5. Review question categories/domains, authors, answers, comments, and reports.
6. Update, hide, delete, restore, undo, or redo content changes.

Moderators cannot add users, remove users, deactivate accounts, or change user roles.

### Admin

1. Log in using the Admin account.
2. Open **Admin**.
3. Add new users or restore/deactivate existing users.
4. Change user roles.
5. View all users' contribution summaries and detailed content.
6. Update, hide, delete, restore, undo, or redo questions, answers, and comments.

User removal is implemented as safe deactivation so the account history is retained and the user can be restored.

## Demonstration data and suggestions

The Compose seed service creates categories, users, questions, answers, comments, votes, and reports. It is safe to run repeatedly because existing seeded records are checked before being created again.

Related-question suggestions are provided by:

```text
GET /api/recommendations/:id
```

Suggestions are based on shared categories, tags, recent activity, answer counts, and helpful votes. This is a data-backed recommendation feature; it is not a generative AI answer service.

## Local development without Docker

Use this only if you already have MongoDB running locally.

Terminal 1:

```powershell
cd "C:\DevOps Project\backend"
Copy-Item .env.example .env
npm install
npm run dev
```

Terminal 2:

```powershell
cd "C:\DevOps Project\frontend"
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Kubernetes deployment with Minikube

Kubernetes is optional for normal use. Use these commands when demonstrating the Kubernetes rubric.

```powershell
cd "C:\DevOps Project"

minikube start --driver=docker

docker build -t knowledgehub-backend:latest .\backend
docker build -t knowledgehub-frontend:latest .\frontend

minikube image load knowledgehub-backend:latest
minikube image load knowledgehub-frontend:latest

kubectl apply -f k8s\configmap.yaml
kubectl apply -f k8s\secret.yaml
kubectl apply -f k8s\mongo.yaml
kubectl apply -f k8s\app.yaml

kubectl get pods,svc
kubectl rollout status deployment/backend
kubectl rollout status deployment/frontend
```

Seed the Kubernetes database if it is empty:

```powershell
kubectl exec deployment/backend -- node seed.js
```

Open the Kubernetes frontend:

```powershell
minikube service frontend --url
```

View backend logs:

```powershell
kubectl logs deployment/backend
```

Demonstrate scaling:

```powershell
kubectl scale deployment/frontend --replicas=2
kubectl get pods
```

Stop Minikube when finished:

```powershell
minikube stop
```

## GitHub upload

Create an empty GitHub repository first. Then run:

```powershell
cd "C:\DevOps Project"

git init
git branch -M main
git remote add origin "https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git"

git add .gitignore
git commit -m "Add Git ignore rules"

git add README.md
git commit -m "Add project documentation"

git add docker-compose.yml start.ps1 stop.ps1
git commit -m "Add Docker startup configuration"

git add backend
git commit -m "Add backend application"

git add frontend
git commit -m "Add frontend application"

git add k8s
git commit -m "Add Kubernetes deployment files"

git add docs
git commit -m "Add project documentation"

git push -u origin main
```

If `origin` already exists, update it instead of adding it again:

```powershell
git remote set-url origin "https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git"
git push -u origin main
```

Never upload real `.env` files, passwords, JWT secrets, `node_modules`, or generated build folders. The root `.gitignore` excludes the usual local-only files.

## Documentation

- `docs/ARCHITECTURE.md` explains the application and database design.
- `docs/DEPLOYMENT.md` explains Docker Compose and Kubernetes deployment.
- `docs/TESTING.md` contains the validation checklist.
