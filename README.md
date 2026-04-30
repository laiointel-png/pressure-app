# Pressure

Mobile-first prototype for an accountability social app where friends keep each other consistent through check-ins, streaks, penalties, and group pressure.

## Preview locally

```bash
python3 -m http.server 5173
```

Open `http://localhost:5173`.

## Prototype assets

Real-photo fallback assets are stored in `assets/` and are sourced from Pexels while Nano Banana image generation is quota-blocked:

- `trace-athlete-lunge.jpg`: https://www.pexels.com/photo/focused-athlete-performing-lunges-with-dumbbells-33185468/
- `trace-athlete-squat.jpg`: https://www.pexels.com/photo/woman-performing-squats-in-modern-gym-setting-29259728/

## GitHub Pages

This repo is configured for GitHub Pages through `.github/workflows/pages.yml`.

After pushing to GitHub:

1. Open the repository on GitHub.
2. Go to `Settings` -> `Pages`.
3. Set `Source` to `GitHub Actions`.
4. The workflow will publish the static app.

The preview URL will look like:

```text
https://<username>.github.io/<repo-name>/
```

To connect a new empty GitHub repository from this local folder:

```bash
git remote add origin https://github.com/<username>/<repo-name>.git
git push -u origin main
```
