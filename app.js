const locationForm = document.getElementById("location-form");
const locationInput = document.getElementById("location-input");
const myLocationBtn = document.getElementById("my-location-btn");
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const installAppBtn = document.getElementById("install-app-btn");
const formMessage = document.getElementById("form-message");
const locationList = document.getElementById("location-list");
const clearAllBtn = document.getElementById("clear-all");

const emptyState = document.getElementById("empty-state");
const weatherContent = document.getElementById("weather-content");
const cityName = document.getElementById("city-name");
const localTime = document.getElementById("local-time");
const weatherType = document.getElementById("weather-type");
const skyIndicator = document.getElementById("sky-indicator");
const moodIndicator = document.getElementById("mood-indicator");
const temperature = document.getElementById("temperature");
const feelsLike = document.getElementById("feels-like");
const weatherNote = document.getElementById("weather-note");
const lastUpdated = document.getElementById("last-updated");
const metrics = document.getElementById("metrics");

const STORAGE_KEY = "skywatch.savedLocations.v2";
const THEME_KEY = "skywatch.theme.v1";
const REFRESH_MS = 2 * 60 * 1000;

const state = {
  locations: [],
  selectedId: null,
  refreshTimer: null,
  installPrompt: null
};

const weatherCodeMap = {
  0: "Clear",
  1: "Mostly Clear",
  2: "Partly Cloudy",
  3: "Cloudy",
  45: "Fog",
  48: "Rime Fog",
  51: "Light Drizzle",
  53: "Drizzle",
  55: "Dense Drizzle",
  61: "Light Rain",
  63: "Rain",
  65: "Heavy Rain",
  71: "Light Snow",
  73: "Snow",
  75: "Heavy Snow",
  80: "Rain Showers",
  81: "Showers",
  82: "Heavy Showers",
  95: "Thunderstorm",
  96: "Thunder + Hail",
  99: "Severe Storm"
};

function setMessage(msg, isError = false) {
  formMessage.textContent = msg;
  formMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  themeToggleBtn.textContent = theme === "dark" ? "Switch To Light" : "Switch To Dark";
}

function setupAppInstallation() {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (isStandalone) {
    installAppBtn.hidden = true;
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    installAppBtn.textContent = "Add to Home Screen";
    installAppBtn.hidden = false;
    installAppBtn.addEventListener("click", () => {
      setMessage("To install SkyWatch, tap Share in your browser, then choose Add to Home Screen.");
    });
    return;
  }

  installAppBtn.hidden = false;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
  });

  installAppBtn.addEventListener("click", async () => {
    if (!state.installPrompt) {
      setMessage("To install SkyWatch, open your browser menu and choose Install app or Add to Home Screen.");
      return;
    }

    await state.installPrompt.prompt();
    const { outcome } = await state.installPrompt.userChoice;
    state.installPrompt = null;
    installAppBtn.hidden = true;
    setMessage(outcome === "accepted" ? "SkyWatch was installed." : "You can install SkyWatch from your browser menu.");
  });

  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    installAppBtn.hidden = true;
    setMessage("SkyWatch was installed.");
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("SkyWatch service worker registration failed:", error);
    });
  }
}

function loadTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === "light" || savedTheme === "dark") {
    applyTheme(savedTheme);
    return;
  }

  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

function saveLocations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.locations));
}

function loadLocations() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    state.locations = [];
    return;
  }

  try {
    state.locations = JSON.parse(saved);
  } catch {
    state.locations = [];
  }
}

function renderLocationList() {
  locationList.innerHTML = "";

  if (state.locations.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No locations saved yet.";
    li.style.color = "var(--muted)";
    locationList.appendChild(li);
    return;
  }

  state.locations.forEach((location) => {
    const li = document.createElement("li");
    li.className = "location-item";

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "location-select";
    if (location.id === state.selectedId) {
      selectBtn.classList.add("active");
    }
    selectBtn.textContent = `${location.name}, ${location.country}`;
    selectBtn.addEventListener("click", () => selectLocation(location.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.title = "Delete location";
    deleteBtn.textContent = "x";
    deleteBtn.addEventListener("click", () => removeLocation(location.id));

    li.append(selectBtn, deleteBtn);
    locationList.appendChild(li);
  });
}

function showWeatherPanel(show) {
  emptyState.classList.toggle("hidden", show);
  weatherContent.classList.toggle("hidden", !show);
}

function metricCard(label, value) {
  const card = document.createElement("article");
  card.className = "metric";

  const heading = document.createElement("h4");
  heading.textContent = label;

  const valueNode = document.createElement("p");
  valueNode.textContent = value;

  card.append(heading, valueNode);
  return card;
}

function formatClock(dateValue, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone
  }).format(new Date(dateValue));
}

function conditionNote(code) {
  if (code === 0 || code === 1) {
    return "Sunny vibes right now. Great time to be outside.";
  }
  if (code >= 51 && code <= 65) {
    return "Rainy update: carry an umbrella before you head out.";
  }
  if (code >= 71 && code <= 75) {
    return "Snow update: dress warm and plan safe travel.";
  }
  if (code >= 95) {
    return "Storm alert: better to stay cautious outdoors.";
  }
  return "Weather is shifting. Keep checking for fresh updates.";
}

function skyLabel(isDay) {
  return isDay ? "☀️ Day" : "🌙 Night";
}

function weatherMood(code) {
  if (code === 0 || code === 1 || code === 2) {
    return "😄 Great Weather";
  }
  if (code >= 51 && code <= 65) {
    return "🌧️ Rain Mood";
  }
  if (code >= 71 && code <= 75) {
    return "❄️ Snow Mood";
  }
  if (code >= 95) {
    return "⛈️ Storm Alert";
  }
  return "🙂 Calm Weather";
}

function renderWeather(place, weather) {
  showWeatherPanel(true);

  cityName.textContent = `${place.name}, ${place.country}`;
  localTime.textContent = `Local time: ${formatClock(weather.current.time, weather.timezone)}`;

  const code = weather.current.weather_code;
  const isDay = Boolean(weather.current.is_day);
  weatherType.textContent = weatherCodeMap[code] || "Unknown";
  skyIndicator.textContent = skyLabel(isDay);
  moodIndicator.textContent = weatherMood(code);
  temperature.textContent = Math.round(weather.current.temperature_2m);
  feelsLike.textContent = `Feels like ${Math.round(weather.current.apparent_temperature)} deg C`;
  weatherNote.textContent = conditionNote(code);

  const now = new Date();
  lastUpdated.textContent = `Last updated: ${now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;

  metrics.innerHTML = "";
  metrics.append(
    metricCard("Weather", weatherCodeMap[code] || "Unknown"),
    metricCard("Wind Speed", `${Math.round(weather.current.wind_speed_10m)} km/h`),
    metricCard("Humidity", `${weather.current.relative_humidity_2m}%`),
    metricCard("Visibility", `${Math.round(weather.current.visibility / 1000)} km`)
  );
}

async function geocodeLocation(query) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to search location.");
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error("Location not found.");
  }

  const top = data.results[0];
  return {
    id: `${top.latitude},${top.longitude}`,
    name: top.name,
    country: top.country,
    latitude: top.latitude,
    longitude: top.longitude
  };
}

async function reverseGeocode(latitude, longitude) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not identify your location.");
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error("Could not identify your location.");
  }

  const place = data.results[0];
  return {
    id: `${place.latitude},${place.longitude}`,
    name: place.name,
    country: place.country,
    latitude: place.latitude,
    longitude: place.longitude
  };
}

async function fetchWeather(latitude, longitude) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,visibility,weather_code,is_day"
  );
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Weather service is unavailable right now.");
  }

  return response.json();
}

function scheduleRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }

  state.refreshTimer = setInterval(async () => {
    if (!state.selectedId) {
      return;
    }
    const selected = state.locations.find((item) => item.id === state.selectedId);
    if (!selected) {
      return;
    }

    try {
      const weather = await fetchWeather(selected.latitude, selected.longitude);
      renderWeather(selected, weather);
      setMessage("Weather auto-updated.");
    } catch {
      setMessage("Auto-refresh failed. Check network and try again.", true);
    }
  }, REFRESH_MS);
}

async function selectLocation(id) {
  state.selectedId = id;
  renderLocationList();

  const selected = state.locations.find((item) => item.id === id);
  if (!selected) {
    return;
  }

  setMessage("Loading weather...");
  try {
    const weather = await fetchWeather(selected.latitude, selected.longitude);
    renderWeather(selected, weather);
    setMessage("Weather updated.");
    scheduleRefresh();
  } catch (err) {
    setMessage(err.message || "Unable to fetch weather.", true);
  }
}

function removeLocation(id) {
  state.locations = state.locations.filter((location) => location.id !== id);

  if (state.selectedId === id) {
    state.selectedId = null;
    showWeatherPanel(false);
  }

  saveLocations();
  renderLocationList();
  setMessage("Location removed.");
}

function upsertLocation(newLocation) {
  const alreadyExists = state.locations.some((item) => item.id === newLocation.id);
  if (alreadyExists) {
    return false;
  }

  state.locations.unshift(newLocation);
  saveLocations();
  renderLocationList();
  return true;
}

locationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = locationInput.value.trim();
  if (!query) {
    return;
  }

  setMessage("Searching location...");
  try {
    const found = await geocodeLocation(query);
    const added = upsertLocation(found);
    if (!added) {
      setMessage("Location already exists.");
      locationInput.value = "";
      return;
    }

    locationInput.value = "";
    setMessage("Location added.");
    await selectLocation(found.id);
  } catch (err) {
    setMessage(err.message || "Could not add location.", true);
  }
});

myLocationBtn.addEventListener("click", async () => {
  if (!navigator.geolocation) {
    setMessage("Geolocation is not supported in this browser.", true);
    return;
  }

  setMessage("Getting your location...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const place = await reverseGeocode(position.coords.latitude, position.coords.longitude);
        const added = upsertLocation(place);

        if (!added) {
          setMessage("Your location is already saved.");
        } else {
          setMessage("Your location was added.");
        }

        await selectLocation(place.id);
      } catch (err) {
        setMessage(err.message || "Could not load your location.", true);
      }
    },
    () => {
      setMessage("Location access was denied.", true);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
});

clearAllBtn.addEventListener("click", () => {
  state.locations = [];
  state.selectedId = null;

  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }

  saveLocations();
  renderLocationList();
  showWeatherPanel(false);
  setMessage("All locations cleared.");
});

themeToggleBtn.addEventListener("click", () => {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
});

function init() {
  setupAppInstallation();
  registerServiceWorker();
  loadTheme();
  loadLocations();
  renderLocationList();

  if (state.locations.length > 0) {
    selectLocation(state.locations[0].id);
  } else {
    showWeatherPanel(false);
  }
}

init();
