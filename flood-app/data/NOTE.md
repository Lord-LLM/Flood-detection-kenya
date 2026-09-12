# Administrative unit data

`admin-units.json` contains sample entries for three counties only. The full
47-county, 290-constituency, and approximately 1,450-ward dataset must be
sourced from IEBC or `opendata.go.ke` before production use. Do not infer or
fabricate coordinates for the missing areas.

The app keeps county-only selection working when a county has no entry here or
when this file cannot be loaded. It uses the most precise available
coordinates: ward, then constituency, then county.