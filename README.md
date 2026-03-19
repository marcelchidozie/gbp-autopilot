# GBP Autopilot 🚀
### Google Business Profile Automation Tool

Auto-generates local SEO blog posts and publishes them to Google Business Profile every **Monday, Wednesday & Friday** — fully hands-free.

---

## What It Does

- ✅ Connects to your Google Business Profile via Google OAuth
- ✅ AI generates 20 local SEO keywords based on your business
- ✅ Writes posts following YOUR content style guidelines
- ✅ Auto-publishes Mon/Wed/Fri at 9AM
- ✅ Keeps a queue of 3 upcoming posts at all times
- ✅ Dashboard to monitor all posts + history
- ✅ One-click reset for a new client

---

## Setup Guide (Simple — No Coding Needed)

### Step 1 — Get Your API Keys

**A) Google OAuth Credentials**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (name it "GBP Autopilot")
3. Go to **APIs & Services → Library**
4. Enable these APIs:
   - `My Business Account Management API`
   - `My Business Business Information API`
   - `My Business Notifications API`
5. Go to **APIs & Services → Credentials**
6. Click **Create Credentials → OAuth 2.0 Client ID**
7. Application type: **Web application**
8. Add Authorized redirect URI: `https://your-app.railway.app/auth/callback`
9. Copy your **Client ID** and **Client Secret**

> ⚠️ Note: GBP API access requires approval from Google. Submit a request at:
> https://support.google.com/business/workflow/16726127

**B) Anthropic API Key**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Copy it

---

### Step 2 — Deploy to Railway (Free Hosting)

1. Go to [railway.app](https://railway.app) and sign up (free)
2. Click **New Project → Deploy from GitHub repo**
   - Or use **Deploy from local** if you have the files
3. Upload this entire folder
4. Go to your project **Settings → Variables** and add:

```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://YOUR-APP-NAME.railway.app/auth/callback
GEMINI_API_KEY=your_gemini_api_key
SESSION_SECRET=any_random_string_minimum_32_characters
PORT=3000
POST_DAYS=1,3,5
POST_HOUR=9
POST_MINUTE=0
```

5. Railway will auto-deploy. Your app URL will be shown in the dashboard.

---

### Step 3 — First-Time Setup in the App

1. Open your app URL
2. Click **Connect with Google** — sign in with the Google account that manages the GBP
3. Go to **Configuration** → Load accounts → Select your GBP location
4. Fill in **Business Information** (name, services, location, USP)
5. Go to **Content Style** → Write your content guidelines → Save
6. Go to **Keywords** → Click **AI Generate Keywords**
7. Done! The automation is now active 🎉

---

### For a New Client

Click **New Client** in the sidebar. This clears all business data, keywords, and posts — your Google connection stays active so you don't need to re-authenticate.

---

## Local Development (Optional)

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env
# Fill in your values in .env

# Run locally
npm run dev
# Open: http://localhost:3000
```

---

## How The Automation Works

1. **Every Mon/Wed/Fri at 9AM** — the scheduler checks for due posts
2. If a post is due, it publishes it to GBP via the API
3. After publishing, it immediately generates the next post to refill the queue
4. The system always keeps 3 posts queued ahead
5. Each post targets a different keyword (least-used first, to keep content fresh)

---

## File Structure

```
gbp-autopilot/
├── src/
│   ├── server.js      ← Express server + all API routes
│   ├── database.js    ← SQLite database (posts, keywords, config)
│   ├── google.js      ← Google OAuth + GBP API integration
│   ├── ai.js          ← Claude AI content generation
│   └── scheduler.js   ← Auto-posting cron scheduler
├── public/
│   └── index.html     ← Full dashboard UI
├── data/              ← Auto-created (SQLite database stored here)
├── .env.example       ← Environment variables template
├── package.json
└── README.md
```
