import sys
import json
import requests
import time
import os
import hashlib
from typing import List
from dataclasses import dataclass

# --- CONSTANTS ---
# API URLs
OVERPASS_SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
]
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
STATIC_MAP_BASE_URL = "https://staticmap.openstreetmap.de/staticmap.php"

# Header keys and values
HEADER_USER_AGENT = "User-Agent"
USER_AGENT_VALUE = "VectorVibeAnimator/1.0"

# Query Parameters
PARAM_Q = "q"
PARAM_FORMAT = "format"
PARAM_LIMIT = "limit"
PARAM_DATA = "data"
VALUE_JSON = "json"

# Fields
_FIELD_LAT = "lat"
_FIELD_LON = "lon"
_FIELD_BOUNDINGBOX = "boundingbox"
_FIELD_CENTER = "center"
_FIELD_BBOX = "bbox"
_FIELD_ERROR = "error"
_FIELD_ELEMENTS = "elements"
_FIELD_TYPE = "type"
_FIELD_ID = "id"
_FIELD_TAGS = "tags"
_FIELD_NAME = "name"
_FIELD_CATEGORY = "category"
_FIELD_SUB_CATEGORY = "sub_category"
_FIELD_NODES = "nodes"
_FIELD_GEOMETRY = "geometry"
_FIELD_RAW_GEOMETRY = "raw_geometry"
_FIELD_DISTANCE = "distance"
_FIELD_LOCATION = "location"
_FIELD_FEATURES = "features"
_FIELD_STATIC_MAP_URL = "static_map_url"

# Values & Tags
ELEM_NODE = "node"
ELEM_WAY = "way"

LAYER_TRANSPORT = "transport"
LAYER_WATER = "water"
LAYER_GREENERY = "greenery"

CATEGORY_OTHER = "other"
CATEGORY_TRANSPORT = "transport"
CATEGORY_WATER = "water"
CATEGORY_GREENERY = "greenery"

SUB_CATEGORY_NONE = "none"

TAG_RAILWAY = "railway"
TAG_NATURAL = "natural"
TAG_WATERWAY = "waterway"
TAG_LEISURE = "leisure"
TAG_LANDUSE = "landuse"

DEFAULT_FEATURE_NAME = "Feature"
PREFIX_MERGED = "merged_"

# Templates
TEMPLATE_TRANSPORT = 'way["railway"~"tram|rail"]({0},{1},{2},{3});'
TEMPLATE_WATER_NATURAL = 'way["natural"="water"]({0},{1},{2},{3});'
TEMPLATE_WATER_WATERWAY = 'way["waterway"]({0},{1},{2},{3});'
TEMPLATE_GREENERY_PARK = 'way["leisure"="park"]({0},{1},{2},{3});'
TEMPLATE_GREENERY_FOREST = 'way["landuse"="forest"]({0},{1},{2},{3});'

QUERY_FULL = """
[out:json][timeout:25];
(
  {0}
);
out body;
>;
out skel qt;
"""

TEMPLATE_STATIC_URL = "{0}?center={1},{2}&zoom=15&size=800x800&maptype=mapnik"

# Log & Error Messages
MSG_ERR_GEOCODING_FAILED = "Geocoding failed: {0}"
MSG_ERR_LOC_NOT_FOUND = "Location not found"
MSG_ERR_OVERPASS_ALL = "Overpass query failed on all servers. Last error: {0}"
MSG_ERR_JSON_PARSE = "JSON parse error from {0}"
MSG_ERR_STATUS = "Status {0}"
MSG_ERR_USAGE = "Usage: map_processor.py <location> <layers_comma_sep>"

LOG_GEOCODE_BBOX = "Geocode raw bbox: w={0}, s={1}, e={2}, n={3}\n"
LOG_CLAMP_LAT = "Clamping Latitude span ({0}) to {1} around Center Lat ({2})\n"
LOG_CLAMP_LON = "Clamping Longitude span ({0}) to {1} around Center Lon ({2})\n"
LOG_FINAL_BBOX = "Final restricted bbox: w={0}, s={1}, e={2}, n={3}\n"
LOG_TRY_OVERPASS = "Trying Overpass server: {0}\n"
LOG_OVERPASS_RESP = "Response from {0} in {1:.1f}s (Status: {2})\n"
LOG_JSON_PARSE_ERR = "Failed to parse JSON from {0}: {1}\n"
LOG_CONN_ERR = "Error connecting to {0}: {1}\n"
LOG_GEOCODING = "Geocoding {0}...\n"
LOG_GEOCODE_SUCCESS = "Geocoding successful. Fetching map data for layers: {0}...\n"
LOG_OVERPASS_DOWNLOADED = "Overpass data fully downloaded. Merging lines...\n"
LOG_PROCESSED_FEATURES = "Processed {0} features for {1}\n"
LOG_CACHE_HIT = "Using cached data for {0}...\n"
LOG_CACHE_WRITE_ERR = "Failed to write cache: {0}\n"

SPACE_SEPARATOR = " "
COMMA_SEPARATOR = ","

CACHE_DIR = os.path.join(os.path.dirname(__file__), ".osm_cache")

# -----------------

HEADERS = {HEADER_USER_AGENT: USER_AGENT_VALUE}

@dataclass
class RawWay:
    name: str
    category: str
    sub_category: str
    node_ids: List[int]

def geocode(query):
    params = {PARAM_Q: query, PARAM_FORMAT: VALUE_JSON, PARAM_LIMIT: 1}
    try:
        response = requests.get(NOMINATIM_URL, params=params, headers=HEADERS, timeout=15)
        data = response.json()
        if data:
            center_lat = float(data[0][_FIELD_LAT])
            center_lon = float(data[0][_FIELD_LON])
            bb = data[0][_FIELD_BOUNDINGBOX]
            w, s, e, n = float(bb[2]), float(bb[0]), float(bb[3]), float(bb[1])
            
            sys.stderr.write(LOG_GEOCODE_BBOX.format(w, s, e, n))
            
            # Restrict bounding box to max 0.3 degrees (~30km) to balance map detail and Overpass query timeouts
            MAX_SPAN = 0.3
            if (n - s) > MAX_SPAN:
                sys.stderr.write(LOG_CLAMP_LAT.format(n - s, MAX_SPAN, center_lat))
                s = center_lat - MAX_SPAN / 2.0
                n = center_lat + MAX_SPAN / 2.0
            if (e - w) > MAX_SPAN:
                sys.stderr.write(LOG_CLAMP_LON.format(e - w, MAX_SPAN, center_lon))
                w = center_lon - MAX_SPAN / 2.0
                e = center_lon + MAX_SPAN / 2.0

            sys.stderr.write(LOG_FINAL_BBOX.format(w, s, e, n))

            # Return as [W, S, E, N]
            return {
                _FIELD_LAT: center_lat,
                _FIELD_LON: center_lon,
                _FIELD_CENTER: {_FIELD_LAT: center_lat, _FIELD_LON: center_lon},
                _FIELD_BBOX: [w, s, e, n]
            }
    except Exception as e:
        return {_FIELD_ERROR: MSG_ERR_GEOCODING_FAILED.format(str(e))}
    return {_FIELD_ERROR: MSG_ERR_LOC_NOT_FOUND}

def fetch_overpass(bbox, layers):
    # bbox is [W, S, E, N]
    w, s, e, n = bbox
    
    # Map requested layers to Overpass queries
    queries: List[str] = []
    if LAYER_TRANSPORT in layers:
        queries.append(TEMPLATE_TRANSPORT.format(s, w, n, e))
    if LAYER_WATER in layers:
        queries.append(TEMPLATE_WATER_NATURAL.format(s, w, n, e))
        queries.append(TEMPLATE_WATER_WATERWAY.format(s, w, n, e))
    if LAYER_GREENERY in layers:
        queries.append(TEMPLATE_GREENERY_PARK.format(s, w, n, e))
        queries.append(TEMPLATE_GREENERY_FOREST.format(s, w, n, e))
    
    if not queries:
        return {_FIELD_ELEMENTS: []}

    full_query = QUERY_FULL.format(SPACE_SEPARATOR.join(queries))
    
    last_error = ""

    for server in OVERPASS_SERVERS:
        try:
            sys.stderr.write(LOG_TRY_OVERPASS.format(server))
            sys.stderr.flush()
            start_time = time.time()
            resp = requests.post(server, data={PARAM_DATA: full_query}, timeout=60)
            elapsed = time.time() - start_time
            sys.stderr.write(LOG_OVERPASS_RESP.format(server, elapsed, resp.status_code))
            sys.stderr.flush()
            
            if resp.status_code == 200:
                try:
                    return resp.json()
                except Exception as e:
                    sys.stderr.write(LOG_JSON_PARSE_ERR.format(server, str(e)))
                    last_error = MSG_ERR_JSON_PARSE.format(server)
                    continue
            last_error = MSG_ERR_STATUS.format(resp.status_code)
        except Exception as e:
            sys.stderr.write(LOG_CONN_ERR.format(server, str(e)))
            sys.stderr.flush()
            last_error = str(e)
            
    return {_FIELD_ERROR: MSG_ERR_OVERPASS_ALL.format(last_error)}

def get_cache_key(query, layers):
    key_str = f"{query}_{','.join(sorted(layers))}"
    return hashlib.md5(key_str.encode('utf-8')).hexdigest() + ".json"

def process_osm(query, layers):
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        cache_key = get_cache_key(query, layers)
        cache_path = os.path.join(CACHE_DIR, cache_key)
        
        if os.path.exists(cache_path):
            sys.stderr.write(LOG_CACHE_HIT.format(query))
            sys.stderr.flush()
            with open(cache_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        sys.stderr.write(LOG_CACHE_WRITE_ERR.format(str(e)))

    sys.stderr.write(LOG_GEOCODING.format(query))
    sys.stderr.flush()
    geo = geocode(query)
    if _FIELD_ERROR in geo: return geo
    sys.stderr.write(LOG_GEOCODE_SUCCESS.format(layers))
    sys.stderr.flush()
    
    bbox = geo[_FIELD_BBOX] # [W, S, E, N]
    data = fetch_overpass(bbox, layers)
    if _FIELD_ERROR in data: return data

    sys.stderr.write(LOG_OVERPASS_DOWNLOADED)
    sys.stderr.flush()
    elements = data.get(_FIELD_ELEMENTS, [])
    if not isinstance(elements, list):
        elements = []
        
    nodes = {n[_FIELD_ID]: (n[_FIELD_LON], n[_FIELD_LAT]) for n in elements if isinstance(n, dict) and n.get(_FIELD_TYPE) == ELEM_NODE}
    
    # 1. Collect all ways
    raw_ways: List[RawWay] = []
    for el in elements:
        if isinstance(el, dict) and el.get(_FIELD_TYPE) == ELEM_WAY:
            tags = el.get(_FIELD_TAGS, {})
            f_name = tags.get(_FIELD_NAME, tags.get(TAG_RAILWAY, tags.get(TAG_NATURAL, DEFAULT_FEATURE_NAME)))
            
            category = CATEGORY_OTHER; sub_category = SUB_CATEGORY_NONE
            if TAG_RAILWAY in tags:
                category = CATEGORY_TRANSPORT; sub_category = tags.get(TAG_RAILWAY, CATEGORY_OTHER)
            elif TAG_NATURAL in tags or TAG_WATERWAY in tags:
                category = CATEGORY_WATER
            elif TAG_LEISURE in tags or TAG_LANDUSE in tags:
                category = CATEGORY_GREENERY
            
            node_ids = el.get(_FIELD_NODES, [])
            if len(node_ids) < 2: continue
            
            raw_ways.append(RawWay(
                name=str(f_name),
                category=category,
                sub_category=sub_category,
                node_ids=node_ids,
            ))

    # 2. Greedy Merging
    merged_features = []
    processed_indices = set()
    raw_ways.sort(key=lambda x: (x.category, x.sub_category, x.name))
    
    for i in range(len(raw_ways)):
        if i in processed_indices: continue
        current_chain = list(raw_ways[i].node_ids)
        current_meta = raw_ways[i]
        processed_indices.add(i)
        
        changed = True
        while changed:
            changed = False
            for j in range(len(raw_ways)):
                if j in processed_indices: continue
                other = raw_ways[j]
                if (other.category, other.sub_category, other.name) != \
                   (current_meta.category, current_meta.sub_category, current_meta.name):
                    continue
                
                other_nodes = other.node_ids
                if current_chain[-1] == other_nodes[0]:
                    current_chain.extend(other_nodes[1:]); processed_indices.add(j); changed = True
                elif current_chain[-1] == other_nodes[-1]:
                    current_chain.extend(reversed(other_nodes[:-1])); processed_indices.add(j); changed = True
                elif current_chain[0] == other_nodes[-1]:
                    current_chain = other_nodes[:-1] + current_chain; processed_indices.add(j); changed = True
                elif current_chain[0] == other_nodes[0]:
                    current_chain = list(reversed(other_nodes[1:])) + current_chain; processed_indices.add(j); changed = True
                    
        merged_features.append({
            _FIELD_NAME: current_meta.name,
            _FIELD_CATEGORY: current_meta.category,
            _FIELD_SUB_CATEGORY: current_meta.sub_category,
            _FIELD_NODES: current_chain
        })

    # 3. Normalize to [0, 1]
    # bbox is [W, S, E, N]
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    w_min = bbox[0]
    s_min = bbox[1]
    
    if width == 0: width = 0.0001
    if height == 0: height = 0.0001
    
    final_features = []
    for i, f in enumerate(merged_features):
        coords = []; raw_coords = []
        for node_id in f[_FIELD_NODES]:
            node = nodes.get(node_id)
            if node:
                # node[0]=lon, node[1]=lat
                nx = (node[0] - w_min) / width
                ny = 1.0 - (node[1] - s_min) / height
                coords.append([nx, ny])
                raw_coords.append([node[1], node[0]]) # [lat, lon]
        
        if len(coords) < 2: continue
        
        avg_x = sum(p[0] for p in coords) / len(coords)
        avg_y = sum(p[1] for p in coords) / len(coords)
        dist = ((avg_x - 0.5)**2 + (avg_y - 0.5)**2)**0.5

        final_features.append({
            _FIELD_ID: f"{PREFIX_MERGED}{i}",
            _FIELD_NAME: f[_FIELD_NAME],
            _FIELD_CATEGORY: f[_FIELD_CATEGORY],
            _FIELD_SUB_CATEGORY: f[_FIELD_SUB_CATEGORY],
            _FIELD_GEOMETRY: coords,
            _FIELD_RAW_GEOMETRY: raw_coords,
            _FIELD_DISTANCE: dist
        })

    static_url = TEMPLATE_STATIC_URL.format(STATIC_MAP_BASE_URL, geo[_FIELD_LAT], geo[_FIELD_LON])
    
    sys.stderr.write(LOG_PROCESSED_FEATURES.format(len(final_features), query))
    result = {
        _FIELD_LOCATION: query,
        _FIELD_CENTER: geo[_FIELD_CENTER],
        _FIELD_BBOX: bbox,
        _FIELD_FEATURES: final_features,
        _FIELD_STATIC_MAP_URL: static_url
    }
    
    try:
        if 'cache_path' in locals():
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(result, f)
    except Exception as e:
        sys.stderr.write(LOG_CACHE_WRITE_ERR.format(str(e)))

    return result

if __name__ == "__main__":
    try:
        if len(sys.argv) < 3:
            sys.stdout.write(json.dumps({_FIELD_ERROR: MSG_ERR_USAGE}))
            sys.exit(1)
            
        query = sys.argv[1]
        layers = sys.argv[2].split(COMMA_SEPARATOR)
        result = process_osm(query, layers)
        sys.stdout.write(json.dumps(result))
    except Exception as e:
        sys.stdout.write(json.dumps({_FIELD_ERROR: str(e)}))
