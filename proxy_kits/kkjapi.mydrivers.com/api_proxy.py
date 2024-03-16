import os
from urllib.parse import urlparse
from mitmproxy import http

CACHE_DIR = 'cache_files'
visited_endpoints = set()

if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

def cache_filepath(query_string):
    return os.path.join(CACHE_DIR, f"{query_string}.json")

def cache_get(query_string):
    filepath = cache_filepath(query_string)
    if os.path.exists(filepath):
        with open(filepath, 'r') as file:
            return file.read()
    return None

def cache_set(query_string, value):
    filepath = cache_filepath(query_string)
    with open(filepath, 'w') as file:
        file.write(value)

def request(flow: http.HTTPFlow) -> None:
    # Filter out unwanted traffic
    if "kkjapi.mydrivers.com/" not in flow.request.pretty_url:
        flow.kill()
        return

    # Record visited endpoint
    visited_endpoints.add(flow.request.path)

    # Use the URL's raw query parameters as the filename
    query_string = urlparse(flow.request.pretty_url).query

    # Check in cache
    cached_response = cache_get(query_string)
    if cached_response:
        # Modify the response to return the cached data
        flow.response = http.HTTPResponse.make(200, cached_response, {"Content-Type": "application/json"})

def response(flow: http.HTTPFlow) -> None:
    # Filter out unwanted traffic
    if "kkjapi.mydrivers.com/api/rank/data2.ashx" not in flow.request.pretty_url:
        return

    # Use the URL's raw query parameters as the filename
    query_string = urlparse(flow.request.pretty_url).query
    cache_set(query_string, str(flow.response.text))

def done():
    # Display all the visited endpoints when mitmproxy exits
    print("\nVisited Endpoints:")
    for endpoint in visited_endpoints:
        print(endpoint)
