import os
import time
import requests
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Simple in-memory cache
feed_cache = {
    'entries': None,
    'last_updated': 0
}
CACHE_EXPIRY = 1800  # 30 minutes in seconds

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def fetch_and_parse_feed():
    try:
        response = requests.get(FEED_URL, timeout=15)
        response.raise_for_status()
        
        # Parse XML
        root = ET.fromstring(response.content)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        entries = []
        for entry in root.findall('atom:entry', ns):
            title_el = entry.find('atom:title', ns)
            id_el = entry.find('atom:id', ns)
            updated_el = entry.find('atom:updated', ns)
            link_el = entry.find('atom:link[@rel="alternate"]', ns)
            if link_el is None:
                link_el = entry.find('atom:link', ns)
            content_el = entry.find('atom:content', ns)
            
            title = title_el.text if title_el is not None else ""
            entry_id = id_el.text if id_el is not None else ""
            updated = updated_el.text if updated_el is not None else ""
            link = link_el.attrib.get('href', '') if link_el is not None else ""
            content = content_el.text if content_el is not None else ""
            
            entries.append({
                'title': title,
                'id': entry_id,
                'updated': updated,
                'link': link,
                'content': content
            })
            
        return {
            'success': True,
            'entries': entries
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    current_time = time.time()
    
    global feed_cache
    if force_refresh or feed_cache['entries'] is None or (current_time - feed_cache['last_updated'] > CACHE_EXPIRY):
        res = fetch_and_parse_feed()
        if res['success']:
            feed_cache['entries'] = res['entries']
            feed_cache['last_updated'] = current_time
            return jsonify({
                'success': True,
                'entries': feed_cache['entries'],
                'source': 'fresh',
                'last_updated': feed_cache['last_updated']
            })
        else:
            # Fallback to cache if available
            if feed_cache['entries'] is not None:
                return jsonify({
                    'success': True,
                    'entries': feed_cache['entries'],
                    'source': 'cache_fallback_error',
                    'error': res['error'],
                    'last_updated': feed_cache['last_updated']
                })
            return jsonify({
                'success': False,
                'error': f"Failed to fetch feed: {res['error']}"
            }), 500
    else:
        return jsonify({
            'success': True,
            'entries': feed_cache['entries'],
            'source': 'cache',
            'last_updated': feed_cache['last_updated']
        })

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
