# Flood Watch Kenya

Flood Watch Kenya is a browser-based flood risk and preparedness app for Kenya.
It combines a user's location, rainfall forecasts, mapped flood zones, nearby
terrain, and mapped waterways to provide a simple current risk level and
practical next steps.

## Live app

Open Flood Watch Kenya at [flood-terrain-aware.vercel.app](https://flood-terrain-aware.vercel.app/).

## What the app does

- Checks flood risk using your location or a manually selected area.
- Uses the next 24 hours of rainfall forecasts to inform the risk level.
- Adds local flood-zone, terrain, and nearby-waterway context where available.
- Explains the factors behind the result in plain language.
- Provides preparedness actions for before, during, and after flooding.
- Includes an El Niño seasonal rainfall outlook for planning.
- Works as an installable progressive web app and supports offline app-shell use.

## Using it

Choose **Use my location** or select your county, constituency, and ward. After
the risk check completes, review the result, recommendations, local context,
and preparedness checklist. Always follow current guidance from official Kenyan
weather and emergency authorities.

## Run locally

The app is a static site. Serve this folder over HTTP, for example:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Then open `http://localhost:8080` in a browser.
