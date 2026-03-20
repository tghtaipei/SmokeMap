#!/usr/bin/env python3
"""
Fetch Taipei City legal smoking areas from open data API.
Used by GitHub Actions before deploying to GitHub Pages.
Always exits with code 0 so deployment is never blocked.

API: https://data.taipei.gov.tw (Taipei Open Data Platform)
Dataset: 臺北市合法吸菸區 (dataset id: 46619)
"""
import urllib.request
import urllib.error
import json
import sys
import os

# Taipei Open Data API — fetch up to 200 records at once
TAIPEI_API = (
    'https://data.taipei.gov.tw/api/v1/dataset/'
    'edbc4a42-5bfd-462a-9c64-3cd7f5c0b4db'   # 臺北市合法吸菸區 resource UUID
    '/resource/edbc4a42-5bfd-462a-9c64-3cd7f5c0b4db'
    '/preview?limit=200&offset=0'
)
# Fallback URL using numeric dataset id seen in photo URLs
TAIPEI_API_ALT = (
    'https://data.taipei.gov.tw/opendata/query/preview'
    '?id=46619&limit=200&offset=0'
)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'locations.json')


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
            lat = float(r.get('緯度') or 0)
            lng = float(r.get('經度') or 0)
        except ValueError:
            continue
        if not lat or not lng:
            continue
        name    = (r.get('地點') or '').strip()
        address = (r.get('地址') or '').strip()
        district = (r.get('行政區') or '').strip()
        kind    = (r.get('樣態') or '').strip()
        hours   = (r.get('開放時間') or '').strip()
        sub     = (r.get('相對位置') or '').strip()
        notes   = (r.get('備註') or '').strip()
        if not name:
            continue
        entry = {'name': name, 'address': address, 'lat': lat, 'lng': lng}
        if district: entry['district'] = district
        if kind:     entry['type']     = kind
        if hours:    entry['hours']    = hours
        if sub:      entry['sub']      = sub
        if notes:    entry['notes']    = notes
        out.append(entry)
    return out


def main():
    records = []
    for url in [TAIPEI_API, TAIPEI_API_ALT]:
        try:
            data = fetch_json(url)
            # Support both {"result":{"results":[...]}} and {"results":[...]}
            res = data.get('result', data)
            raw = res.get('results', res.get('data', []))
            if raw:
                print(f'[ok] Got {len(raw)} records from {url}', file=sys.stderr)
                records = raw
                break
        except Exception as e:
            print(f'[warn] {url}: {e}', file=sys.stderr)

    locations = convert(records) if records else []
    print(f'[parse] {len(locations)} valid locations', file=sys.stderr)

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
