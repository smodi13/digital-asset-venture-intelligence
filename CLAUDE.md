
## Digital Asset Venture Intelligence local artifact policy

All temporary, generated, QA, review, screenshot, PDF, export, and scratch artifacts for this project must be saved under:

~/digital-asset-venture-intelligence/local-artifacts/

Use these subfolders as appropriate:

- local-artifacts/qa/
- local-artifacts/screenshots/
- local-artifacts/pdfs/
- local-artifacts/exports/
- local-artifacts/scratch/

Do not save project artifacts to Desktop or Downloads.

Do not store credentials, bearer tokens, API keys, secrets, cookies, .env contents, or other sensitive values in local-artifacts.

Do not add local-artifacts to Git.

Tracked source code, application assets, documentation, tests, and intentional repository files should remain in their normal repository paths.

When a task requests temporary screenshots, browser QA files, generated PDFs, Playwright artifacts, visual-review packs, downloaded test fixtures, or scratch output, place them under local-artifacts rather than Desktop, Downloads, or the repository root.

This project is a standalone product and must remain completely isolated from the OriginationIQ repository, its GitHub remote, and its Vercel deployment. Never read, write, or modify anything under ~/origination-iq.
