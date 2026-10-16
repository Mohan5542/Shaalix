# Shaalix — School ERP Website

**Your whole school. One smart platform.**

Marketing website and demo portal for Shaalix, a school/college ERP by JJH Global Solutions.

## What's inside
- `index.html` — single-file, hash-routed site (110+ pages: Products, Solutions, Integrations, Pricing, Blog, Parent Help, About, legal pages).
- Demo portal: `#/portal` — college registration, student registration (needs college approval), college admin dashboard (students, fees, attendance, marks, notices) and read-only student dashboard.
- `styles.css`, `hero.css`, `app.js` — styles and UI helpers.
- `vl_*.jpg` — images.
- `work/selfcheck.js` — route/link self-check (`node work/selfcheck.js`).

## Demo logins (password `Demo@1234`)
- admin@srividya.demo — Sri Vidya Junior College (SHX-1001)
- admin@greenvalley.demo — Green Valley Degree College (SHX-1002)
- ravi@srividya.demo — approved student
- anil@srividya.demo — student pending approval

> Demo mode: portal data is saved in the browser's localStorage, so payments and imports survive a refresh. College admins can clear it with **Reset demo data**. All data access goes through the `DB` module in `index.html` (see `TODO: replace with Supabase`) so a real backend can be plugged in after deployment.

## Student fee payment (UPI)
- Student login (e.g. ravi@srividya.demo): fees are grouped by semester / year with total, paid and balance. **Pay Fee** opens a modal: Full or Partial amount, then a UPI QR (`upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`), then payer name, UPI app and the 12-digit UTR. The balance updates at once and a receipt is shown. Payments appear in the student's payment history and in the admin's **Payments** tab.
- **Set your UPI ID:** in `index.html`, search for `UPI PAYMENT SETTINGS` and replace `shaalix@upi` (a placeholder) with the college's UPI ID.
- Demo only: there is no payment-gateway verification; the college checks UTRs against its bank statement.

## Excel import / export (.xlsx)
- Admin login → **Import / Export** tab. **Export Data** downloads `Shaalix_<College>_Data_<YYYY-MM-DD>.xlsx` with sheets College (info), Students, Fees, Payments, Attendance, Marks, Notices.
- **Import Data** accepts .xlsx/.xls only and shows a preview first: sheets found, row counts, columns, first 5 rows, validation problems, new vs matching. Choose **Add into existing data** (merge by ID; roll number or email for students) or **Completely replace existing data**, then **Confirm Import**.
- **Download template** gives an empty workbook with an Instructions sheet. Exporting and re-importing the same file with Replace gives identical data.

## Run locally
Open `index.html` in a browser, or serve the folder: `npx serve .`

## Deploy
Works on any static host (GitHub Pages, Netlify, Vercel). For GitHub Pages: Settings → Pages → Deploy from branch `main`, folder `/`.

## Contact
E. Kiran Kumar, Founder & President — +91 97032 22544 — info@shaalix.com
