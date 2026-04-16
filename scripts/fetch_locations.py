#!/usr/bin/env python3
"""
Fetch Taipei City legal smoking areas from open data API.
Used by GitHub Actions before deploying to GitHub Pages.
Always exits with code 0 so deployment is never blocked.

API: https://data.taipei (Taipei Open Data Platform)
Dataset: 臺北市合法吸菸區 (uuid: acaa0f43-3b92-4241-b5eb-3f7fdd76b74f)
"""
import urllib.request
import urllib.error
import urllib.parse
import json
import sys
import os
import time

# Taipei Open Data API
TAIPEI_API = (
    'https://data.taipei/api/v1/dataset/'
    'acaa0f43-3b92-4241-b5eb-3f7fdd76b74f'
    '?scope=resourceAquire&limit=1000&offset=0'
)
TAIPEI_API_ALT = (
    'https://data.taipei.gov.tw/api/v1/dataset/'
    'acaa0f43-3b92-4241-b5eb-3f7fdd76b74f'
    '?scope=resourceAquire&limit=1000&offset=0'
)

_BASE = os.path.dirname(os.path.abspath(__file__))
OUT        = os.path.join(_BASE, '..', 'data', 'locations.json')
TRANS_FILE = os.path.join(_BASE, '..', 'data', 'translations.json')

# ── Translation cache ────────────────────────────────────────────────────────
_cache: dict = {}
_cache_dirty = False


def load_cache():
    global _cache
    try:
        with open(TRANS_FILE, encoding='utf-8') as f:
            _cache = json.load(f)
        print(f'[cache] Loaded {len(_cache)} cached translations from {TRANS_FILE}',
              file=sys.stderr)
    except Exception as e:
        print(f'[cache] Could not load cache ({e}) — starting fresh', file=sys.stderr)
        _cache = {}


def save_cache():
    global _cache_dirty
    if not _cache_dirty:
        print('[cache] No new translations — cache unchanged', file=sys.stderr)
        return
    path = os.path.abspath(TRANS_FILE)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(_cache, f, ensure_ascii=False, indent=2, sort_keys=True)
    print(f'[cache] Saved {len(_cache)} translations → {path}', file=sys.stderr)
    _cache_dirty = False


def translate(text: str) -> str:
    """Return English translation, reading cache first and calling API only for new text."""
    global _cache_dirty
    if not text:
        return ''
    if text in _cache:
        return _cache[text]   # cache hit — no API call
    # Cache miss — call MyMemory free API (no key required)
    result = ''
    try:
        url = ('https://api.mymemory.translated.net/get?q='
               + urllib.parse.quote(text)
               + '&langpair=zh-TW%7Cen')
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        translated = (data.get('responseData') or {}).get('translatedText', '')
        if translated and translated != text and 'MYMEMORY' not in translated.upper():
            result = translated
    except Exception as e:
        print(f'[translate] error for "{text}": {e}', file=sys.stderr)
    time.sleep(0.15)   # rate-limit: stay within free tier (~6 req/s)
    _cache[text] = result
    _cache_dirty = True
    print(f'[translate] {text!r} → {result!r}', file=sys.stderr)
    return result


# ── Data fetch ───────────────────────────────────────────────────────────────
def fetch_json(url):
    import subprocess
    try:
        r = subprocess.run(
            ['curl', '-sL', '--max-time', '20',
             '-H', 'User-Agent: Mozilla/5.0',
             '-H', 'Accept: application/json',
             url],
            capture_output=True, timeout=25
        )
        print(f'[curl] exit={r.returncode} size={len(r.stdout)} url={url}', file=sys.stderr)
        if r.returncode == 0 and len(r.stdout) > 10:
            return json.loads(r.stdout)
    except Exception as e:
        print(f'[curl] error: {e}', file=sys.stderr)

    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def convert(records):
    """Convert Taipei Open Data records to locations.json format."""
    out = []
    for r in records:
        try:
            a = float(r.get('緯度') or r.get('WGS84緯度') or 0)
            b = float(r.get('經度') or r.get('WGS84經度') or 0)
        except ValueError:
            continue
        if not a or not b:
            continue
        # 自動偵測並修正欄位對調：緯度應介於 ±90，經度介於 ±180
        if abs(a) <= 90 and abs(b) <= 180:
            lat, lng = a, b
        elif abs(b) <= 90 and abs(a) <= 180:
            lat, lng = b, a
        else:
            continue

        name     = (r.get('地點') or r.get('地點名稱') or '').strip()
        address  = (r.get('地址') or '').strip()
        district = (r.get('行政區') or '').strip()
        kind     = (r.get('樣態') or r.get('類型') or '').strip()
        hours    = (r.get('開放時間') or '').strip()
        sub      = (r.get('相對位置') or '').strip()
        notes    = (r.get('備註') or '').strip()
        photo    = (r.get('照片連結') or r.get('照片') or
                    r.get('圖片連結') or r.get('圖片') or '').strip()
        if not name:
            continue

        # Translate fields (cache hit = no API call; miss = 1 call + 0.15 s delay)
        name_en    = translate(name)
        address_en = translate(address) if address else ''
        hours_en   = translate(hours)   if hours   else ''
        sub_en     = translate(sub)     if sub     else ''

        entry = {'name': name, 'address': address, 'lat': lat, 'lng': lng}
        if name_en:    entry['name_en']    = name_en
        if address_en: entry['address_en'] = address_en
        if district:   entry['district']   = district
        if kind:       entry['type']       = kind
        if hours:      entry['hours']      = hours
        if hours_en:   entry['hours_en']   = hours_en
        if sub:        entry['sub']        = sub
        if sub_en:     entry['sub_en']     = sub_en
        if notes:      entry['notes']      = notes
        if photo:      entry['photo']      = photo
        out.append(entry)
    return out


def main():
    load_cache()

    records = []
    for url in [TAIPEI_API, TAIPEI_API_ALT]:
        try:
            data = fetch_json(url)
            res = data.get('result', data)
            raw = res.get('results', res.get('data', []))
            if raw:
                print(f'[ok] Got {len(raw)} records from {url}', file=sys.stderr)
                print(f'[fields] {list(raw[0].keys())}', file=sys.stderr)
                records = raw
                break
        except Exception as e:
            print(f'[warn] {url}: {e}', file=sys.stderr)

    locations = convert(records) if records else []
    print(f'[parse] {len(locations)} valid locations', file=sys.stderr)

    save_cache()   # write translations.json (only if new entries were added)

    out_path = os.path.abspath(OUT)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    if locations:
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(locations, f, ensure_ascii=False, indent=2)
        print(f'[done] Wrote {len(locations)} locations → {out_path}', file=sys.stderr)
    else:
        print(f'[done] Fetch returned 0 locations — existing file preserved', file=sys.stderr)

    sys.exit(0)


if __name__ == '__main__':
    main()
