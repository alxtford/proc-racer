# Deploying SHARDLINE On Vercel

SHARDLINE deploys to Vercel as a plain static site. Do not add a framework just to host it.

The deployable app is the repository root:

- `index.html`
- `style.css`
- `src/`
- `assets/`

There is no backend, no serverless function layer, and no required environment variable in the current project. Vercel should serve the root files directly.

## What To Choose At Import

At the Vercel import/configuration step, use these settings:

- Framework Preset: `Other`
- Root Directory: repository root
- Build Command: leave blank
- Output Directory: leave blank
- Install Command: default is fine
- Environment Variables: none required

If Vercel auto-detects a framework, override it back to `Other`.

## Why These Settings Match This Repo

This repo does not build into `dist/`, `build/`, or another generated output folder. The app already lives at the root and runs directly in the browser.

Local development confirms the shape:

```bash
npm install
npm start
```

That starts a simple static server for the root files and serves the game at `http://127.0.0.1:4173`.

## Recommended Deploy Flow

1. Import the Git repository into your Vercel project.
2. Set the import values listed above.
3. Trigger the first deployment.
4. After deploy finishes, open the deployment URL and smoke-test the game.
5. Keep `main` as the production branch unless you intentionally release from another branch.

## Smoke Check After The First Deploy

At minimum, verify:

1. The splash screen loads with styles, icons, and fonts.
2. `Hit The Grid` opens the setup hub.
3. Starting a race renders the canvas and HUD correctly.
4. Refreshing the same deployment keeps progression data for that deployment origin.

## Project-Specific Notes

- Save data uses browser `localStorage`, not a backend. Preview deployments, the default production `vercel.app` URL, and custom domains do not share saves with each other.
- The app pulls typography from Google Fonts. If that request is blocked, the game still runs with fallback fonts.
- This deployment should point at the repository root, not a generated folder.
- If the repo later adds a build step or API routes, revisit the Vercel settings instead of assuming this static setup still applies.

## CLI Alternative

If you want to link the local directory to the same Vercel project later:

```bash
npx vercel login
npx vercel link
npx vercel
```

For a production deployment from the CLI:

```bash
npx vercel --prod
```

The CLI creates a local `.vercel/` directory with project metadata. That directory should stay untracked.

## Custom Domain

After the first successful deployment:

1. Open the project in Vercel.
2. Go to `Settings` -> `Domains`.
3. Add the domain.
4. Apply the DNS records Vercel tells you to use.
5. Wait for domain verification and SSL provisioning.

CLI equivalents:

```bash
vercel domains add yourdomain.com
vercel domains inspect yourdomain.com
```

## Troubleshooting

### 404s or missing assets

The usual cause is the wrong root or output directory. This project must deploy from the repository root.

### Blank page after a successful deploy

Usually the wrong directory was imported or the framework/build settings were changed away from the static-root setup.

### Save data appears missing

Check the exact URL you are on. Different origins keep different `localStorage` data.

## Official References

- [Import an existing project](https://vercel.com/docs/getting-started-with-vercel/import)
- [Deploying with Git](https://vercel.com/docs/git)
- [Deploying a project from the CLI](https://vercel.com/docs/projects/deploy-from-cli)
- [Project settings](https://vercel.com/docs/project-configuration/project-settings)
- [Setting up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain)
