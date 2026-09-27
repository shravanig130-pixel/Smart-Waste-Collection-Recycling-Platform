# Smart-Waste-Collection-Recycling-Platform
A lightweight platform for residents to submit and track waste pickup requests, and for collection teams to manage the queue from an admin dashboard.  Built as a dependency-free Node.js app (no `npm install` needed) so it builds and deploys fast — a good fit for a 4-hour MVP scope and a quick Cloud Run push.
# CleanRoute — Waste Collection Request Platform
A lightweight platform for residents to submit and track waste pickup requests,
and for collection teams to manage the queue from an admin dashboard.

Built as a dependency-free Node.js app (no `npm install` needed) so it builds
and deploys fast — a good fit for a 4-hour MVP scope and a quick Cloud Run push.


## Features

- **Waste category selection** — organic, recyclable, e-waste, hazardous, bulky, general
- **Pickup request form** — name, phone, email, address, city, pincode, landmark, quantity, description
- **Pickup scheduling** — preferred date + time slot from the resident; admin can set a confirmed scheduled date
- **Request status & tracking** — resident looks up a request by ticket ID or phone number and sees a status timeline (Pending → Scheduled → Collected, or Cancelled)
- **Admin dashboard** — table of all requests with inline status updates and notes
- **Collection statistics** — totals, breakdown by status and category, requests in the last 7 days
- **Search & filtering** — by status, category, or free-text search (name/phone/ID/address)
- **Pickup history** — filtered view of completed (Collected) requests

## Project structure

```
waste-collection-platform/
├── server.js              # HTTP server + API (Node built-ins only, zero deps)
├── package.json
├── Dockerfile
├── .dockerignore
├── data/                  # requests.json is created here at runtime
└── public/
    ├── index.html         # Resident portal: new request + tracking
    ├── admin.html         # Admin dashboard
    ├── css/style.css
    └── js/
        ├── common.js      # shared helpers (ticket rendering, API wrapper)
        ├── app.js         # resident portal logic
        └── admin.js       # admin dashboard logic
```

## Data storage

Requests are stored in `data/requests.json` on the container's local disk via
plain `fs` calls — intentionally simple for an MVP, with no native modules or
external services to configure.

**Know the limitation:** Cloud Run's filesystem is ephemeral and not shared
across instances. Data will persist for the life of a single running
container, but a redeploy, restart, or scale-out to multiple instances will
reset or fragment it. For the hackathon demo this is fine (and can be pinned
to one instance — see below). For production use, swap `readAll()` /
`writeAll()` in `server.js` for Firestore, Cloud SQL, or another managed
store; every other function is already isolated behind those two calls.

## Run locally

Requires Node.js 18+.

```bash
node server.js
# CleanRoute server listening on port 8080
```

Visit `http://localhost:8080` for the resident portal and
`http://localhost:8080/admin.html` for the admin dashboard.

## API reference

| Method | Path                              | Purpose                                  |
|--------|-----------------------------------|-------------------------------------------|
| POST   | `/api/requests`                   | Create a new pickup request               |
| GET    | `/api/requests`                   | List requests (`status`, `category`, `search`, `from`, `to` query params) |
| GET    | `/api/requests/:id`                | Get a single request                      |
| PATCH  | `/api/requests/:id`                | Update `status`, `scheduledDate`, `adminNotes` |
| DELETE | `/api/requests/:id`                | Remove a request                          |
| GET    | `/api/requests/track?query=`      | Look up requests by ticket ID or phone    |
| GET    | `/api/stats`                       | Totals, by-status and by-category counts |
| GET    | `/api/health`                      | Health check                              |

## Deploy to Google Cloud Run

The fastest path uses Cloud Build to build and deploy directly from source —
you don't need Docker installed locally.

1. **Install and authenticate the gcloud CLI** (skip if already set up):
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Enable the required APIs** (one-time per project):
   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com
   ```

3. **Deploy from the project folder:**
   ```bash
   cd waste-collection-platform
   gcloud run deploy cleanroute \
     --source . \
     --region asia-south1 \
     --allow-unauthenticated \
     --min-instances=1 \
     --max-instances=1
   ```
   - `--source .` tells Cloud Run to build the `Dockerfile` in this folder via Cloud Build and deploy it — no manual `docker build`/`push` needed.
   - `--allow-unauthenticated` makes the URL publicly reachable for the jury.
   - `--min-instances=1 --max-instances=1` pins the app to a single always-on instance, which keeps the JSON-file store consistent for the demo (omit `--min-instances` if you'd rather let it scale to zero and don't mind losing data between cold starts).
   - Pick any `--region` close to you (e.g. `us-central1`, `asia-south1`).

4. **Grab the URL.** On success, gcloud prints a `Service URL` — that's the link to submit to the jury. You can re-fetch it anytime with:
   ```bash
   gcloud run services describe cleanroute --region asia-south1 --format='value(status.url)'
   ```

5. **Redeploying after changes:** re-run the same `gcloud run deploy` command from step 3.

### Alternative: build and push the image manually

If you prefer explicit Docker control:

```bash
gcloud auth configure-docker
docker build -t gcr.io/YOUR_PROJECT_ID/cleanroute .
docker push gcr.io/YOUR_PROJECT_ID/cleanroute
gcloud run deploy cleanroute \
  --image gcr.io/YOUR_PROJECT_ID/cleanroute \
  --region asia-south1 \
  --allow-unauthenticated
```

## Notes for judges / reviewers

- Resident flow: open the Service URL → **New request** tab → fill the form → submit → a ticket card with a `CR-XXXX-XXXX` ID appears, plus a shortcut to track it immediately.
- Admin flow: open `/admin.html` from the same URL → see live stats, filter/search the queue, change a request's status inline, and view completed pickups under **Pickup history**.
- No login is implemented for the admin view in this MVP (out of scope for the 4-hour build) — anyone with the `/admin.html` link can manage requests. Adding auth (e.g. Identity-Aware Proxy in front of the Cloud Run service, or a simple shared token) would be the first production hardening step.
