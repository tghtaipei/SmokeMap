'use strict';

/* ===========================
   i18n Translations
   =========================== */
const TRANSLATIONS = {
  zh: {
    title:           '吸菸地圖',
    subtitle:        '合法吸菸區查詢',
    searchPlaceholder: '搜尋地點、地址...',
    search:          '搜尋',
    searching:       '搜尋中...',
    myLocation:      '我的位置',
    footerText:      `© ${new Date().getFullYear()} 吸菸地圖 SmokeMap｜資料來源：Google 地圖｜`,
    healthWarning:   '⚠ 吸菸有害健康，請在合法吸菸區吸菸',
    locating:        '正在取得位置...',
    locateSuccess:   '已定位到您的位置',
    locateDenied:    '位置存取被拒絕，請檢查瀏覽器設定',
    locateError:     '無法取得位置，請稍後再試',
    locateUnsupported: '您的瀏覽器不支援定位功能',
    notFound:        '找不到該地點，請嘗試其他關鍵字',
    searchError:     '搜尋失敗，請稍後再試',
    emptyQuery:      '請輸入搜尋地點',
    mapLoading:      '地圖定位中...',
  },
  en: {
    title:           'SmokeMap',
    subtitle:        'Legal Smoking Area Finder',
    searchPlaceholder: 'Search location, address...',
    search:          'Search',
    searching:       'Searching...',
    myLocation:      'My Location',
    footerText:      `© ${new Date().getFullYear()} SmokeMap｜Data: Google Maps｜`,
    healthWarning:   '⚠ Smoking is harmful to health. Please smoke in designated areas.',
    locating:        'Getting your location...',
    locateSuccess:   'Located your position',
    locateDenied:    'Location access denied. Check your browser settings.',
    locateError:     'Unable to retrieve location. Please try again.',
    locateUnsupported: 'Geolocation is not supported by your browser.',
    notFound:        'Location not found. Try a different keyword.',
    searchError:     'Search failed. Please try again.',
    emptyQuery:      'Please enter a location to search.',
    mapLoading:      'Centering map...',
  },
};

/* ===========================
   State
   =========================== */
const BASE_MAP_URL =
  'https://www.google.com/maps/d/u/0/embed?mid=1A9MhjU-EbBghtXae0MewBZMFnrQzwxE&ehbc=2E312F';

let currentLang  = 'zh';
let toastTimeout = null;

/* ===========================
   DOM References (set on DOMContentLoaded)
   =========================== */
let $map, $overlay, $searchInput, $searchBtn, $locationBtn, $langToggle, $toast, $dropdown;

/* ===========================
   Language / i18n
   =========================== */
function t(key) {
  return TRANSLATIONS[currentLang][key] || key;
}

function applyLanguage(lang) {
  currentLang = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-TW' : 'en';

  // Text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = TRANSLATIONS[lang][key];
    if (val !== undefined) el.textContent = val;
  });

  // Placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = TRANSLATIONS[lang][key];
    if (val !== undefined) el.placeholder = val;
  });

  // Toggle button label
  $langToggle.textContent = lang === 'zh' ? 'EN' : '中';
  $langToggle.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切換為中文');

  // Persist preference
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
  toastTimeout = setTimeout(() => {
    $toast.className = 'toast';
  }, duration);
}

/* ===========================
   Map helpers
   =========================== */
function showOverlay(msg) {
  $overlay.textContent = msg;
  $overlay.classList.add('visible');
}

function hideOverlay() {
  $overlay.classList.remove('visible');
  $overlay.textContent = '';
}

/**
 * Update the embedded map to center on given coordinates.
 * Google My Maps embed supports ll=lat,lng and z=zoom.
 */
function centerMap(lat, lng, zoom = 15) {
  showOverlay(t('mapLoading'));
  const newSrc = `${BASE_MAP_URL}&ll=${lat},${lng}&z=${zoom}`;
  $map.src = newSrc;
}

/* ===========================
   Location data (loaded from data/locations.json at startup)
   =========================== */
let mapLocations = [];

async function loadLocations() {
  try {
    const resp = await fetch('data/locations.json');
    if (resp.ok) mapLocations = await resp.json();
  } catch (_) {}
}

function filterLocations(query) {
  const q = query.toLowerCase();
  return mapLocations.filter(loc =>
    loc.name.toLowerCase().includes(q) ||
    loc.address.toLowerCase().includes(q)
  ).slice(0, 8);
}

/* ===========================
   Autocomplete dropdown
   =========================== */
let suggestTimer = null;

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

      if (error.code === error.PERMISSION_DENIED) {
        showToast(t('locateDenied'), 'error', 5000);
      } else {
        showToast(t('locateError'), 'error');
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

/* ===========================
   Init
   =========================== */
document.addEventListener('DOMContentLoaded', () => {
  // Grab DOM references
  $map         = document.getElementById('smoke-map');
  $overlay     = document.getElementById('map-overlay');
  $searchInput = document.getElementById('search-input');
  $searchBtn   = document.getElementById('search-btn');
  $locationBtn = document.getElementById('location-btn');
  $langToggle  = document.getElementById('lang-toggle');
  $toast       = document.getElementById('toast');
  $dropdown    = document.getElementById('search-dropdown');

  // Attach map load event to hide overlay
  $map.addEventListener('load', hideOverlay);

  // Search events
  $searchBtn.addEventListener('click', searchLocation);
  $searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchLocation();
    if (e.key === 'Escape') hideDropdown();
  });

  // Live suggestions (instant, local data)
  $searchInput.addEventListener('input', () => {
    showSuggestions($searchInput.value.trim());
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-container')) hideDropdown();
  });

  // Location
  $locationBtn.addEventListener('click', getMyLocation);

  // Language toggle
  $langToggle.addEventListener('click', toggleLanguage);

  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Load map locations for search
  loadLocations();

  // Restore language preference
  let savedLang = 'zh';
  try { savedLang = localStorage.getItem('smokemap-lang') || 'zh'; } catch (_) {}
  applyLanguage(savedLang);
});
