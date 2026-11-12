# Deployment

## Docker Compose

```powershell
$env:JWT_SECRET='use-a-long-random-secret'
docker compose up --build -d
docker compose ps
Invoke-WebRequest http://localhost:5000/api/health
```

The app is at http://localhost:8081. The `seed` Compose service automatically creates the admin account, moderator account, and starter categories. MongoDB persists in the `mongo-data` volume. Use `docker compose down` without `-v` to retain data.

For daily use from the project root, run `.\start.ps1`. To stop the application, run `.\stop.ps1`. Docker Desktop must be running; MongoDB does not need to be started separately. Kubernetes is not required for normal portal use.

## Minikube

```powershell
minikube start --driver=docker
docker build -t knowledgehub-backend:latest .\backend
docker build -t knowledgehub-frontend:latest .\frontend
minikube image load knowledgehub-backend:latest
minikube image load knowledgehub-frontend:latest
kubectl apply -f k8s\configmap.yaml -f k8s\secret.yaml -f k8s\mongo.yaml -f k8s\app.yaml
kubectl get pods,svc
kubectl rollout status deployment/backend
kubectl rollout status deployment/frontend
minikube service frontend --url
kubectl logs deployment/backend
kubectl scale deployment/frontend --replicas=2
kubectl delete pod -l app=frontend
```

Replace the placeholder secret in `k8s/secret.yaml` before deployment. Minikube must be installed and available on PATH.
