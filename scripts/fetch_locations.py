#!/usr/bin/env python3
"""
Fetch Google My Maps KML/KMZ and convert to data/locations.json.
Used by GitHub Actions before deploying to GitHub Pages.
Always exits with code 0 so deployment is never blocked.
"""
import urllib.request
import urllib.error
import json
import sys
import os
import io
import zipfile
import xml.etree.ElementTree as ET

MAP_ID  = '1A9MhjU-EbBghtXae0MewBZMFnrQzwxE'
KML_URL = f'https://www.google.com/maps/d/u/0/kml?mid={MAP_ID}&forcekml=1'
NS      = 'http://www.opengis.net/kml/2.2'
OUT     = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'locations.json')

ADDRESS_KEYS = {'地址', 'address', 'addr', '地址/address'}


def tag(name):
    return f'{{{NS}}}{name}'


def fetch_raw():
    """Try curl first (handles Google redirects better), fall back to urllib."""
    import subprocess
    try:
        result = subprocess.run([
            'curl', '-sL', '--max-time', '30',
            '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '-H', 'Accept: application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,*/*',
            '-H', 'Accept-Language: zh-TW,zh;q=0.9',
            '--compressed',
            KML_URL,
        ], capture_output=True, timeout=35)
        print(f'[curl] exit={result.returncode}  size={len(result.stdout)}  stderr={result.stderr[:300].decode(errors="replace")}', file=sys.stderr)
        if result.returncode == 0 and len(result.stdout) > 100:
            return result.stdout
        print(f'[curl] first 500 bytes: {result.stdout[:500]}', file=sys.stderr)
    except Exception as e:
        print(f'[curl] exception: {e}', file=sys.stderr)

    # Fallback: urllib
    req = urllib.request.Request(KML_URL, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; SmokeMap KML fetcher)',
        'Accept': 'application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,*/*',
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        ct = resp.headers.get('Content-Type', '')
        data = resp.read()
    print(f'[urllib] content-type={ct}  size={len(data)} bytes', file=sys.stderr)
    return data


def extract_kml(raw):
    """Return raw KML bytes, unwrapping KMZ (zip) if needed."""
    # KMZ is a ZIP file starting with PK
    if raw[:2] == b'PK':
        print('[parse] Detected KMZ — extracting inner KML', file=sys.stderr)
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            for name in zf.namelist():
                if name.endswith('.kml'):
                    kml = zf.read(name)
                    print(f'[parse] Extracted {name} ({len(kml)} bytes)', file=sys.stderr)
                    return kml
        raise ValueError('No .kml found inside KMZ')
    # Strip UTF-8 BOM if present
    return raw.lstrip(b'\xef\xbb\xbf')


def get_field(placemark, *keys):
    """Return first SimpleData or Data/value matching any of the given field names."""
    key_set = {k.lower() for k in keys}
    for sd in placemark.iter(tag('SimpleData')):
        if sd.get('name', '').strip().lower() in key_set:
            return (sd.text or '').strip()
    for d in placemark.iter(tag('Data')):
        if d.get('name', '').strip().lower() in key_set:
            val = d.find(tag('value'))
            if val is not None:
                return (val.text or '').strip()
    return ''


def parse_locations(kml_bytes):
    root = ET.fromstring(kml_bytes)
    placemarks = list(root.iter(tag('Placemark')))
    print(f'[parse] Found {len(placemarks)} Placemark(s)', file=sys.stderr)

    locations = []
    for pm in placemarks:
        # Primary name: <name> element (always present in My Maps KML)
        name_el = pm.find(tag('name'))
        name = (name_el.text or '').strip() if name_el is not None else ''
        # Fallback: check SimpleData "地點名稱"
        if not name:
            name = get_field(pm, '地點名稱', 'name', '名稱')
        if not name:
            continue

        address = get_field(pm, '地址', 'address', 'addr', '地址/address')

        coords_el = pm.find(f'.//{tag("coordinates")}')
        if coords_el is None or not coords_el.text:
            continue
        parts = coords_el.text.strip().split(',')
        if len(parts) < 2:
            continue
        try:
            lng, lat = float(parts[0]), float(parts[1])
        except ValueError:
            continue

        locations.append({'name': name, 'address': address, 'lat': lat, 'lng': lng})
        print(f'  [+] {name}  ({lat:.5f}, {lng:.5f})', file=sys.stderr)

    return locations


def main():
    print(f'[start] Fetching {KML_URL}', file=sys.stderr)

    raw = None
    try:
        raw = fetch_raw()
    except urllib.error.HTTPError as e:
        print(f'[warn] HTTP {e.code}: {e.reason}', file=sys.stderr)
    except Exception as e:
        print(f'[warn] Fetch failed: {e}', file=sys.stderr)

    locations = []
    if raw:
        try:
            kml_bytes = extract_kml(raw)
            locations = parse_locations(kml_bytes)
        except ET.ParseError as e:
            print(f'[warn] XML parse error: {e}', file=sys.stderr)
            print(f'[debug] First 500 bytes: {raw[:500]}', file=sys.stderr)
        except Exception as e:
            print(f'[warn] Parse failed: {e}', file=sys.stderr)

    out_path = os.path.abspath(OUT)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    if locations:
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(locations, f, ensure_ascii=False, indent=2)
        print(f'[done] Wrote {len(locations)} location(s) → {out_path}', file=sys.stderr)
    else:
        # Keep existing file intact (may contain hardcoded fallback data)
        print(f'[done] KML fetch returned 0 locations — existing {out_path} preserved', file=sys.stderr)
    # Always exit 0 so deployment is never blocked
    sys.exit(0)


if __name__ == '__main__':
    main()
