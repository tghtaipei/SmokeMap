'use strict';

/* ===========================
   i18n Translations
   =========================== */
const TRANSLATIONS = {
  zh: {
    title:             '吸菸地圖',
    subtitle:          '合法吸菸區查詢',
    searchPlaceholder: '搜尋地點、地址、行政區...',
    search:            '搜尋',
    myLocation:        '我的位置',
    footerText:        `© ${new Date().getFullYear()} 吸菸地圖 SmokeMap｜資料來源：台北市政府開放資料｜`,
    healthWarning:     '⚠ 吸菸有害健康，請在合法吸菸區吸菸',
    locating:          '正在取得位置...',
    locateSuccess:     '已定位到您的位置',
    locateDenied:      '位置存取被拒絕，請檢查瀏覽器設定',
    locateError:       '無法取得位置，請稍後再試',
    locateUnsupported: '您的瀏覽器不支援定位功能',
    notFound:          '找不到該地點，請嘗試其他關鍵字',
    emptyQuery:        '請輸入搜尋地點',
    popupHours:        '開放時間',
    popupSub:          '位置',
    popupType:         '類型',
  },
  en: {
    title:             'SmokeMap',
    subtitle:          'Legal Smoking Area Finder',
    searchPlaceholder: 'Search location, address, district...',
    search:            'Search',
    myLocation:        'My Location',
    footerText:        `© ${new Date().getFullYear()} SmokeMap｜Data: Taipei City Gov Open Data｜`,
    healthWarning:     '⚠ Smoking is harmful to health. Please smoke in designated areas.',
    locating:          'Getting your location...',
    locateSuccess:     'Located your position',
    locateDenied:      'Location access denied. Check your browser settings.',
    locateError:       'Unable to retrieve location. Please try again.',
    locateUnsupported: 'Geolocation is not supported by your browser.',
    notFound:          'Location not found. Try a different keyword.',
    emptyQuery:        'Please enter a location to search.',
    popupHours:        'Hours',
    popupSub:          'Location',
    popupType:         'Type',
  },
};

/* ===========================
   State
   =========================== */
let currentLang  = 'zh';
let toastTimeout = null;
let leafletMap   = null;

/* ===========================
   DOM References
   =========================== */
let $searchInput, $searchBtn, $locationBtn, $langToggle, $toast, $dropdown;

/* ===========================
   Language / i18n
   =========================== */
function t(key) {
  return TRANSLATIONS[currentLang][key] || key;
}

function applyLanguage(lang) {
  currentLang = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-TW' : 'en';

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = TRANSLATIONS[lang][el.getAttribute('data-i18n')];
    if (val !== undefined) el.textContent = val;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const val = TRANSLATIONS[lang][el.getAttribute('data-i18n-placeholder')];
    if (val !== undefined) el.placeholder = val;
  });

  $langToggle.textContent = lang === 'zh' ? 'EN' : '中';
  $langToggle.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切換為中文');

  switchMapLanguage(lang);

  try { localStorage.setItem('smokemap-lang', lang); } catch (_) {}
}

function toggleLanguage() {
  applyLanguage(currentLang === 'zh' ? 'en' : 'zh');
}

/* ===========================
   Toast
   =========================== */
function showToast(message, type = 'info', duration = 3000) {
  $toast.textContent = message;
  $toast.className   = `toast ${type} show`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { $toast.className = 'toast'; }, duration);
}

/* ===========================
   MapLibre GL Map
   =========================== */
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

function buildPopup(loc) {
  let html = `<strong style="font-size:1em">${loc.name}</strong>`;
  if (loc.address) html += `<br><small>📍 ${loc.address}</small>`;
  if (loc.type)    html += `<br><small>🏷 ${loc.type}</small>`;
  if (loc.hours)   html += `<br><small>🕐 ${loc.hours}</small>`;
  if (loc.sub)     html += `<br><small>↳ ${loc.sub}</small>`;
  if (loc.photo && loc.photo.startsWith('http'))
    html += `<br><img src="${loc.photo}" alt="照片" loading="lazy" style="width:100%;margin-top:8px;border-radius:4px;max-height:160px;object-fit:cover;display:block;" onerror="this.style.display='none'">`;
  return html;
}

function switchMapLanguage(lang) {
  if (!leafletMap || !leafletMap.isStyleLoaded()) return;
  const nameField = lang === 'en'
    ? ['coalesce', ['get', 'name_en'], ['get', 'name']]
    : ['get', 'name'];
  leafletMap.getStyle().layers
    .filter(l => {
      if (l.type !== 'symbol') return false;
      const tf = JSON.stringify(l.layout && l.layout['text-field']);
      return tf && (tf.includes('"name"') || tf.includes('"name_en"'));
    })
    .forEach(l => {
      try { leafletMap.setLayoutProperty(l.id, 'text-field', nameField); } catch (_) {}
    });
}

function initMap() {
  leafletMap = new maplibregl.Map({
    container: 'smoke-map',
    style: OPENFREEMAP_STYLE,
    center: [121.5170, 25.0478],
    zoom: 13,
  });
  leafletMap.addControl(new maplibregl.NavigationControl(), 'top-left');
  return new Promise(resolve => leafletMap.once('load', resolve));
}

let mapMarkers = [];

function addMarkers() {
  mapMarkers.forEach(m => m.remove());
  mapMarkers = [];
  mapLocations.forEach(loc => {
    if (!isFinite(loc.lat) || !isFinite(loc.lng) ||
        loc.lat < -90 || loc.lat > 90 ||
        loc.lng < -180 || loc.lng > 180) return;
    const el = document.createElement('div');
    el.style.cssText = 'background:#8B1A1A;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4);font-size:15px;cursor:pointer;';
    el.textContent = '🚬';
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([loc.lng, loc.lat])
      .setPopup(new maplibregl.Popup({ maxWidth: '280px', offset: 18 }).setHTML(buildPopup(loc)))
      .addTo(leafletMap);
    mapMarkers.push(marker);
  });
}

function centerMap(lat, lng, zoom = 16) {
  leafletMap.flyTo({ center: [lng, lat], zoom });
}

/* ===========================
   Location data
   =========================== */
let mapLocations = [];

async function loadLocations() {
  try {
    const resp = await fetch('data/locations.json');
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) mapLocations = data;
    }
  } catch (_) {}
}

function filterLocations(query) {
  const q = query.toLowerCase();
  return mapLocations.filter(loc =>
    loc.name.toLowerCase().includes(q) ||
    (loc.address  || '').toLowerCase().includes(q) ||
    (loc.district || '').toLowerCase().includes(q) ||
    (loc.type     || '').toLowerCase().includes(q)
  ).slice(0, 8);
}

/* ===========================
   Autocomplete dropdown
   =========================== */
function hideDropdown() {
  $dropdown.classList.add('hidden');
  $dropdown.innerHTML = '';
}

function renderDropdown(locations) {
  $dropdown.innerHTML = '';

  if (!locations.length) {
    const empty = document.createElement('div');
    empty.className = 'dropdown-item dropdown-empty';
    empty.textContent = '無對應關鍵字之地點';
    $dropdown.appendChild(empty);
    $dropdown.classList.remove('hidden');
    return;
  }

  locations.forEach(loc => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.setAttribute('role', 'option');
    item.innerHTML =
      `<div class="item-main">${loc.name}</div>` +
      (loc.address ? `<div class="item-sub">${loc.address}</div>` : '');

    item.addEventListener('mousedown', e => {
      e.preventDefault();
      $searchInput.value = loc.name;
      hideDropdown();
      centerMap(loc.lat, loc.lng, 17);
      showToast(`📍 ${loc.name}`, 'success', 4000);
    });
    $dropdown.appendChild(item);
  });
  $dropdown.classList.remove('hidden');
}

function showSuggestions(query) {
  if (!query) { hideDropdown(); return; }
  renderDropdown(filterLocations(query));
}

/* ===========================
   Search
   =========================== */
function searchLocation() {
  const query = $searchInput.value.trim();
  hideDropdown();
  if (!query) {
    showToast(t('emptyQuery'), 'info');
    $searchInput.focus();
    return;
  }

  const results = filterLocations(query);
  if (!results.length) {
    showToast(t('notFound'), 'error');
    return;
  }

  const loc = results[0];
  centerMap(loc.lat, loc.lng, 17);
  showToast(`📍 ${loc.name}`, 'success', 4000);
}

/* ===========================
   Geolocation
   =========================== */
function getMyLocation() {
  if (!navigator.geolocation) {
    showToast(t('locateUnsupported'), 'error');
    return;
  }

  $locationBtn.classList.add('loading');
  $locationBtn.disabled = true;
  showToast(t('locating'), 'info', 10000);

  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude: lat, longitude: lng } = position.coords;
      centerMap(lat, lng, 15);
      showToast(t('locateSuccess'), 'success');
      $locationBtn.classList.remove('loading');
      $locationBtn.disabled = false;
    },
    error => {
      $locationBtn.classList.remove('loading');
      $locationBtn.disabled = false;
      showToast(
        error.code === error.PERMISSION_DENIED ? t('locateDenied') : t('locateError'),
        'error', 5000
      );
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

/* ===========================
   Init
   =========================== */
document.addEventListener('DOMContentLoaded', async () => {
  $searchInput = document.getElementById('search-input');
  $searchBtn   = document.getElementById('search-btn');
  $locationBtn = document.getElementById('location-btn');
  $langToggle  = document.getElementById('lang-toggle');
  $toast       = document.getElementById('toast');
  $dropdown    = document.getElementById('search-dropdown');

  // Init MapLibre map (await style load)
  await initMap();

  // Load location data then place markers
  await loadLocations();
  addMarkers();

  // Search events
  $searchBtn.addEventListener('click', searchLocation);
  $searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchLocation();
    if (e.key === 'Escape') hideDropdown();
  });
  $searchInput.addEventListener('input', () => {
    showSuggestions($searchInput.value.trim());
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-container')) hideDropdown();
  });

  $locationBtn.addEventListener('click', getMyLocation);
  $langToggle.addEventListener('click', toggleLanguage);

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  let savedLang = 'zh';
  try { savedLang = localStorage.getItem('smokemap-lang') || 'zh'; } catch (_) {}
  applyLanguage(savedLang);
});
