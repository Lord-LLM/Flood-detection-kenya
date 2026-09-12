/**
 * Optional Mapbox address lookup. Every operation is best-effort so the
 * county fallback remains usable without a key or network access.
 */
(() => {
  "use strict";

  const key = () => {
    const value = window.FLOOD_CONFIG_KEYS && window.FLOOD_CONFIG_KEYS.MAPBOX_ACCESS_TOKEN;
    return value && !value.startsWith("PASTE_") ? value : null;
  };

  const addressLevel = (types) => {
    if (types.includes("premise") || types.includes("street_address") || types.includes("address")) return "building";
    if (types.includes("route") || types.includes("sublocality")) return "street";
    return "area";
  };

  async function request(url) {
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  }

  async function reverseGeocode(lat, lng) {
    const apiKey = key();
    if (!apiKey) return null;
    const data = await request(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(`${lng},${lat}`)}.json?types=address,place,locality,neighborhood&limit=1&access_token=${encodeURIComponent(apiKey)}`);
    const result = data && data.features && data.features[0];
    if (!result) return null;
    // Precision is surfaced in the UI so a user can judge an address, rather
    // than treating every returned string as an exact building location.
    return {
      formattedAddress: result.place_name,
      placeId: result.id,
      addressLevel: addressLevel(result.properties && result.properties.accuracy ? [result.properties.accuracy] : result.place_type || []),
    };
  }

  function createSessionToken() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function autocomplete(inputText, sessionToken) {
    const apiKey = key();
    if (!apiKey || !inputText.trim()) return null;
    // A session token groups keystrokes into one billable search session,
    // instead of billing the user for every autocomplete request.
    const token = sessionToken || createSessionToken();
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(inputText.trim())}.json?autocomplete=true&country=ke&limit=5&session_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(apiKey)}`;
    const data = await request(url);
    return data && data.features ? data.features.map((feature) => ({
      description: feature.place_name,
      place_id: feature.id,
      center: feature.center,
    })) : null;
  }

  async function getPlaceDetails(placeId, sessionToken) {
    const apiKey = key();
    if (!apiKey || !placeId) return null;
    const token = sessionToken || createSessionToken();
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(placeId)}.json?limit=1&session_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(apiKey)}`;
    const data = await request(url);
    const result = data && data.features && data.features[0];
    if (!result || !result.center) return null;
    return {
      lat: result.center[1],
      lng: result.center[0],
      formattedAddress: result.place_name,
      addressLevel: "building",
    };
  }

  window.FloodGeocoding = { reverseGeocode, autocomplete, getPlaceDetails, createSessionToken };
})();
