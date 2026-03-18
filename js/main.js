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
   Autocomplete dropdown
   =========================== */
let suggestTimer = null;

function hideDropdown() {
  $dropdown.classList.add('hidden');
  $dropdown.innerHTML = '';
}

function renderDropdown(results) {
  $dropdown.innerHTML = '';
  if (!results.length) {
    hideDropdown();
    return;
  }
  results.forEach(r => {
    const parts  = r.display_name.split(',');
    const main   = parts[0].trim();
    const sub    = parts.slice(1, 3).join(',').trim();

    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.setAttribute('role', 'option');
    item.innerHTML =
      `<div class="item-main">${main}</div>` +
      (sub ? `<div class="item-sub">${sub}</div>` : '');

    item.addEventListener('mousedown', e => {
      // mousedown fires before blur; prevent input losing focus first
      e.preventDefault();
      $searchInput.value = main;
      hideDropdown();
      centerMap(parseFloat(r.lat), parseFloat(r.lon), 15);
      showToast(`📍 ${main}`, 'success', 4000);
    });
    $dropdown.appendChild(item);
  });
  $dropdown.classList.remove('hidden');
}

async function fetchSuggestions(query) {
  if (query.length < 2) { hideDropdown(); return; }
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams({
        q: query, format: 'json', limit: '6',
        countrycodes: 'tw', addressdetails: '0',
      });
    const response = await fetch(url, {
      headers: { 'Accept-Language': currentLang === 'zh' ? 'zh-TW,zh' : 'en' },
    });
    if (!response.ok) return;
    renderDropdown(await response.json());
  } catch (_) {}
}

/* ===========================
   Search (Nominatim geocoding)
   =========================== */
async function searchLocation() {
  const query = $searchInput.value.trim();
  hideDropdown();
  if (!query) {
    showToast(t('emptyQuery'), 'info');
    $searchInput.focus();
    return;
  }

  // Update button state
  $searchBtn.textContent = t('searching');
  $searchBtn.disabled    = true;

  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams({
        q: query, format: 'json', limit: '1',
        countrycodes: 'tw', addressdetails: '0',
      });

    const response = await fetch(url, {
      headers: { 'Accept-Language': currentLang === 'zh' ? 'zh-TW,zh' : 'en' },
    });

    if (!response.ok) throw new Error('Network response was not ok');

    const results = await response.json();

    if (results.length === 0) {
      showToast(t('notFound'), 'error');
    } else {
      const { lat, lon, display_name } = results[0];
      centerMap(parseFloat(lat), parseFloat(lon), 15);
      showToast(`📍 ${display_name.split(',')[0]}`, 'success', 4000);
    }
  } catch (err) {
    console.error('Search error:', err);
    showToast(t('searchError'), 'error');
  } finally {
    $searchBtn.textContent = t('search');
    $searchBtn.disabled    = false;
  }
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

  // Live suggestions
  $searchInput.addEventListener('input', () => {
    clearTimeout(suggestTimer);
    const q = $searchInput.value.trim();
    if (q.length < 2) { hideDropdown(); return; }
    suggestTimer = setTimeout(() => fetchSuggestions(q), 300);
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

  // Restore language preference
  let savedLang = 'zh';
  try { savedLang = localStorage.getItem('smokemap-lang') || 'zh'; } catch (_) {}
  applyLanguage(savedLang);
});
