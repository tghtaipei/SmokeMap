#!/usr/bin/env python3
"""
Fetch Google My Maps KML and convert to data/locations.json
Used by GitHub Actions before deploying to GitHub Pages.
"""
import urllib.request
import json
import sys
import os
import xml.etree.ElementTree as ET

MAP_ID  = '1A9MhjU-EbBghtXae0MewBZMFnrQzwxE'
KML_URL = f'https://www.google.com/maps/d/u/0/kml?mid={MAP_ID}&forcekml=1'
NS      = 'http://www.opengis.net/kml/2.2'
OUT     = os.path.join(os.path.dirname(__file__), '..', 'data', 'locations.json')

ADDRESS_KEYS = {'地址', 'address', 'addr', '地址/address', '地址 / address'}

def tag(name):
    return f'{{{NS}}}{name}'

def fetch_kml():
    req = urllib.request.Request(KML_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()

def get_address(placemark):
    # SimpleData (newer My Maps export)
    for sd in placemark.iter(tag('SimpleData')):
        if sd.get('name', '').strip().lower() in ADDRESS_KEYS:
            return (sd.text or '').strip()
    # Data/value (older format)
    for d in placemark.iter(tag('Data')):
        if d.get('name', '').strip().lower() in ADDRESS_KEYS:
            val = d.find(tag('value'))
            if val is not None and val.text:
                return val.text.strip()
    return ''

def parse_kml(data):
    root = ET.fromstring(data)
    locations = []
    for pm in root.iter(tag('Placemark')):
        name_el = pm.find(tag('name'))
        name = (name_el.text or '').strip() if name_el is not None else ''
        if not name:
            continue

        address = get_address(pm)

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
    return locations

def main():
    print(f'Fetching KML from {KML_URL}', file=sys.stderr)
    try:
        kml_data = fetch_kml()
    except Exception as e:
        print(f'ERROR fetching KML: {e}', file=sys.stderr)
        sys.exit(1)

    locations = parse_kml(kml_data)
    print(f'Parsed {len(locations)} locations', file=sys.stderr)

    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(locations, f, ensure_ascii=False, indent=2)
    print(f'Wrote {OUT}', file=sys.stderr)

if __name__ == '__main__':
    main()
