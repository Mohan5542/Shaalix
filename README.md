# Shaalix — School ERP Website

**Your whole school. One smart platform.**

Shaalix by BrandiQue Web Solutions — designed and developed by K. Mohan Rao, Founder of BrandiQue Web Solutions.

Marketing website and demo portal for Shaalix, a school/college ERP by JJH Global Solutions.

## What's inside
- `index.html` — single-file, hash-routed site (110+ pages: Products, Solutions, Integrations, Pricing, Blog, Parent Help, About, legal pages).
- Demo portal: `#/portal` — college registration, student registration (needs college approval), college admin dashboard (students, fees, attendance, marks, notices) and read-only student dashboard.
- `styles.css`, `hero.css`, `app.js` — styles and UI helpers.
- `vl_*.jpg` — images.
- `work/selfcheck.js` — route/link self-check (`node work/selfcheck.js`).

## Demo logins (password `Demo@1234`)
- admin@srividya.demo — Sri Vidya Institute of Technology (SHX-1001)
- admin@greenvalley.demo — Green Valley College of Engineering (SHX-1002)
- ravi@srividya.demo — regular B.Tech student (CSE, Year 3, fees Year 1–4)
- lakshmi@srividya.demo — lateral entry B.Tech student (ECE, Year 3, joined in Year 2, fees Year 2–4)
- anil@srividya.demo — student pending approval

> Demo mode: portal data is saved in the browser's localStorage (key `shaalix-demo-db-v2`; older v1 data is discarded and replaced by the new seed). College admins can clear it with **Reset demo data**. All data access goes through the `DB` module in `index.html` (see `TODO: replace with Supabase`).

## B.Tech year-wise fees
- Regular students have a 4-year course (Year 1–4). Lateral entry students join directly in Year 2 (Year 2–4 only).
- Every year has two fee lines: **Tuition Fee (Full fee)** and **Affiliation Fee** (university affiliation). Defaults come from the college's fee structure (Sri Vidya ₹85,000 + ₹6,000; Green Valley ₹78,000 + ₹5,500). A new or newly approved student gets lines for every year of their course.
- The student sees a per-year summary (Year 1–4, academic year, total, paid, balance, status) with a course total, then one table per year. Past years are paid in the demo, the current year is partly or wholly unpaid, future years show **Upcoming** but can still be paid.
- **Pay Fee** on any line: Full or Partial, then a UPI QR (`upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`), then payer name, UPI app and the 12-digit UTR. The balance updates at once and a receipt is shown. **Set your UPI ID:** in `index.html`, search for `UPI PAYMENT SETTINGS` and replace the placeholder `shaalix@upi`. Demo only: no gateway verification.

## Student profile
- Personal (name, parents, DOB, gender, blood group, mobile, email, address), Identity (Aadhaar, always shown masked as XXXX XXXX 1234 with a Show/Hide toggle, validated to 12 digits; optional APAAR/ABC ID), Category/caste (religion, category OC/BC-A…BC-E/SC/ST/EWS, caste, caste certificate no.), Income (annual family income, income certificate no. and validity), Scholarship (eligible, scheme, status) and Academic (roll, branch, admission type, admission year, current year, previous qualification Inter/Diploma with marks %). All demo values are fake.
- Students see everything and can edit only mobile, email and address. College admins view (Students → Profile) and edit every field.

## Excel import / export (.xlsx)
- Admin login → **Import / Export**. **Export Data** downloads `Shaalix_<College>_Data_<YYYY-MM-DD>.xlsx` with sheets College (info), Students (all profile columns), Fees (Year, Fee Type = Tuition/Affiliation), Payments, Attendance, Marks, Notices.
- **Import Data** (.xlsx/.xls) shows a preview first: sheets, row counts, columns, first rows, validation problems (Aadhaar 12 digits, category from the list, numeric income, lateral entry cannot be in Year 1 or have Year 1 fees), new vs matching. Choose **Add into existing data** or **Completely replace existing data**, then **Confirm Import**. A Students sheet without the profile columns keeps each student's existing profile.
- **Download template** gives an empty workbook with an Instructions sheet. Export then replace-import of the same file gives identical data.

## Tests
- `node work/selfcheck.js` — routes, links and the portal DB/rendering checks.
- An end-to-end Playwright test (desktop + mobile) is kept outside the repo.

## Run locally
Open `index.html` in a browser, or serve the folder: `npx serve .`

## Deploy
Works on any static host (GitHub Pages, Netlify, Vercel). For GitHub Pages: Settings → Pages → Deploy from branch `main`, folder `/`.

## Contact
E. Kiran Kumar, Founder & President — +91 97032 22544 — info@shaalix.com

## Ownership
Shaalix is a child company of BrandiQue Web Solutions (https://brandique.in) — designed and developed by K. Mohan Rao, Founder of BrandiQue Web Solutions. The product is publicly presented by JJH Global Solutions.
