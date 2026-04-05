import json
import pytest
from unittest.mock import patch, MagicMock
import sys
import os

# Add the resources directory to sys.path so we can import map_processor
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import map_processor

def test_normalization():
    # Test coordinates normalization to [0, 1]
    # Bounding box: s=0, w=0, n=10, e=10
    bbox = [0, 0, 10, 10]
    
    # Mock data with a single way and two nodes
    data = {
        "elements": [
            {"type": "node", "id": 1, "lat": 0, "lon": 0},
            {"type": "node", "id": 2, "lat": 10, "lon": 10},
            {"type": "way", "id": 10, "nodes": [1, 2], "tags": {"railway": "tram"}}
        ]
    }
    
    # We need to mock geocode to return a valid bbox
    with patch("map_processor.geocode") as mock_geocode:
        mock_geocode.return_value = {
            "lat": 5, "lon": 5, "bbox": bbox
        }
        with patch("map_processor.fetch_overpass") as mock_overpass:
            mock_overpass.return_value = data
            
            result = map_processor.process_osm("Mock City", ["transport"])
            
            assert len(result["features"]) == 1
            feature = result["features"][0]
            assert feature["category"] == "transport"
            
            # (0, 0) in bbox [0,0,10,10] 
            # lat=0 -> ny = 1.0 - (0-0)/10 = 1.0
            # lon=0 -> nx = (0-0)/10 = 0.0
            # (10, 10) in bbox [0,0,10,10]
            # lat=10 -> ny = 1.0 - (10-0)/10 = 0.0
            # lon=10 -> nx = (10-0)/10 = 1.0
            
            expected_geom = [[0.0, 1.0], [1.0, 0.0]]
            assert feature["geometry"] == expected_geom

def test_feature_categorization():
    elements = [
        {"type": "way", "id": 1, "tags": {"railway": "tram"}, "nodes": [101, 102]},
        {"type": "way", "id": 2, "tags": {"natural": "water"}, "nodes": [101, 102]},
        {"type": "way", "id": 3, "tags": {"landuse": "forest"}, "nodes": [101, 102]},
        {"type": "node", "id": 101, "lat": 1, "lon": 1},
        {"type": "node", "id": 102, "lat": 1.1, "lon": 1.1}
    ]
    data = {"elements": elements}
    bbox = [0, 0, 2, 2]
    
    with patch("map_processor.geocode") as mock_geo:
        mock_geo.return_value = {"lat": 1, "lon": 1, "bbox": bbox}
        with patch("map_processor.fetch_overpass") as mock_ovr:
            mock_ovr.return_value = data
            result = map_processor.process_osm("Test", ["transport", "water", "greenery"])
            
            cats = {f["id"]: f["category"] for f in result["features"]}
            assert cats["1"] == "transport"
            assert cats["2"] == "water"
            assert cats["3"] == "greenery"

if __name__ == "__main__":
    # If run directly, execute the tests manually or via pytest if available
    import pytest
    pytest.main([__file__])
