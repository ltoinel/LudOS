---
name: weather
desc: current weather — e.g. weather, weather Tokyo
demo: weather
seo_title: Current weather for your location or any city
man: |
  # WEATHER(1)

  ## NAME
  weather — show the current weather

  ## SYNOPSIS
  weather [city]

  ## DESCRIPTION
  Shows the current weather for the given city: the conditions with an
  icon, the temperature and how it feels, the wind speed and direction,
  and the humidity. With no argument, uses your approximate location
  (IP geolocation). Data from wttr.in.

  ## HOW IT WORKS
  The browser asks wttr.in for its JSON report (`format=j1`) directly,
  over HTTPS. Without a city, wttr.in locates you from the address your
  request comes from, like `geoip` does. The request gives up after 7
  seconds, and Ctrl+C cancels it.

  ## USE CASES
  - check the weather before going out, without opening a weather site;
  - compare the conditions in two cities (weather Paris, weather Tokyo);
  - see what place your IP address is located in (behind a VPN, the
    weather is the exit server's).

  ## NOTES
  City names can be written in most languages (weather München, weather
  Genève); an airport code works too (weather CDG). Your own location is
  approximate: it is usually your provider's nearest network hub.

  ## EXAMPLES
  weather
  weather Tokyo
  weather "New York"

  ## SEE ALSO
  geoip, checkip, date
js: |
  const city = ctx.args
    .filter((arg) => !arg.startsWith('-'))
    .join(' ')
    .trim();
  const label = city || 'your location';
  ctx.line(`weather · ${label} …`);
  // wttr.in's `j1` format is CORS-enabled JSON (cleaner than scraping its text
  // output) and ships English descriptions via `weatherDesc`. Empty city = geo-IP.
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=en`;
  // WWO weather codes -> emoji (grouped; anything unknown gets a thermometer).
  const icon = (code) => {
    const weatherCode = Number(code);
    if (weatherCode === 113) return '☀️'; // clear
    if (weatherCode === 116) return '⛅'; // partly cloudy
    if ([119, 122].includes(weatherCode)) return '☁️'; // cloudy, overcast
    if ([143, 248, 260].includes(weatherCode)) return '🌫️'; // mist, fog
    if ([176, 263, 266, 293, 296, 353].includes(weatherCode)) return '🌦️'; // drizzle, light rain
    if ([299, 302, 305, 308, 356, 359].includes(weatherCode)) return '🌧️'; // moderate to heavy rain
    if ([200, 386, 389, 392, 395].includes(weatherCode)) return '⛈️'; // thunder
    // What is left of this range is snow, sleet and ice (the rain codes above
    // were returned already).
    if (weatherCode >= 179 && weatherCode <= 377) return '🌨️';
    return '🌡️';
  };
  const TIMEOUT_MS = 7000;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    if (ctx.signal) ctx.signal.addEventListener('abort', () => controller.abort()); // Ctrl+C
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const report = await res.json();
    const current = report.current_condition && report.current_condition[0];
    if (!current) {
      ctx.error(`weather: ${label}: location not found`);
      return;
    }
    const area = (report.nearest_area && report.nearest_area[0]) || {};
    // wttr.in wraps its texts as [{ value: '…' }].
    const firstValue = (wrapped) => (wrapped && wrapped[0] && wrapped[0].value) || '';
    const place =
      [firstValue(area.areaName), firstValue(area.country)].filter(Boolean).join(', ') || label;
    const description = firstValue(current.weatherDesc) || '';
    const E = ctx.escape;
    // One append per row: a pipe or a redirection records each append as one
    // line (`weather Tokyo | grep wind`).
    const rows = [
      `<span class="accent text-glow">${E(place)}</span>  ${icon(current.weatherCode)} <span class="out">${E(description)}</span>`,
      `<span class="comment">🌡️  temperature </span><span class="out">${E(current.temp_C)}°C</span><span class="comment"> (feels like ${E(current.FeelsLikeC)}°C)</span>`,
      `<span class="comment">💨  wind </span><span class="out">${E(current.windspeedKmph)} km/h ${E(current.winddir16Point)}</span>`,
      `<span class="comment">💧  humidity </span><span class="out">${E(current.humidity)}%</span>`,
    ];
    for (const row of rows) ctx.append(`<div class="ln">${row}</div>`);
    ctx.append('<div class="ln comment">via wttr.in</div>');
  } catch (e) {
    ctx.error(`weather: service unavailable (${e.message || e.name})`);
  }
---
