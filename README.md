# Shaalix — School ERP Website

**Your whole school. One smart platform.**

Marketing website and demo portal for Shaalix, a school/college ERP by JJH Global Solutions.

## What's inside
- `index.html` — single-file, hash-routed site (110+ pages: Products, Solutions, Integrations, Pricing, Blog, Parent Help, About, legal pages).
- Demo portal: `#/portal` — college registration, student registration (needs college approval), college admin dashboard (students, fees, attendance, marks, notices) and read-only student dashboard.
- `hark.css`, `hark-hero.css`, `hark.js` — styles and UI helpers.
- `vl_*.jpg` — images.
- `work/selfcheck.js` — route/link self-check (`node work/selfcheck.js`).

## Demo logins (password `Demo@1234`)
- admin@srividya.demo — Sri Vidya Junior College (SHX-1001)
- admin@greenvalley.demo — Green Valley Degree College (SHX-1002)
- ravi@srividya.demo — approved student
- anil@srividya.demo — student pending approval

> Demo mode: portal data is in memory and resets on refresh. All data access goes through the `DB` module in `index.html` (see `TODO: replace with Supabase`) so a real backend can be plugged in after deployment.

## Run locally
Open `index.html` in a browser, or serve the folder: `npx serve .`

## Deploy
Works on any static host (GitHub Pages, Netlify, Vercel). For GitHub Pages: Settings → Pages → Deploy from branch `main`, folder `/`.

## Contact
E. Kiran Kumar, Founder & President — +91 97032 22544 — president@jjhglobalsolutions.com
