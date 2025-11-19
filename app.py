"""
Squadrats Navigator - Optional Development Server

This Flask server is OPTIONAL. The application works as a standalone PWA
without any backend by opening static/index.html directly in a browser.

This server is provided for:
- Local development convenience (auto-reload on changes)
- Testing with a local web server
- Backward compatibility with existing workflows

To run the app WITHOUT this server:
1. Open static/index.html directly in your browser, OR
2. Deploy static/ folder to any static host (GitHub Pages, Netlify, etc.)
"""

from flask import Flask, send_from_directory, jsonify
import os
from typing import cast

app = Flask(__name__, static_folder="static")
static_dir = cast(str, app.static_folder)
# --- Routes -----------------------------------------------------

@app.route("/")
def serve_index():
    """Liefert die Startseite"""
    return send_from_directory(static_dir, "index.html")

@app.route("/<path:path>")
def serve_static(path):
    """Liefert statische Dateien (JS, CSS, KML usw.)"""
    return send_from_directory(static_dir, path)

@app.route("/data/<path:filename>")
def serve_kml(filename):
    """Liefert KML-Dateien aus dem data-Verzeichnis"""
    kml_dir = os.path.join(os.getcwd(), "data")
    return send_from_directory(kml_dir, filename)

@app.route("/api/kmlfiles")
def list_kml_files():
    """Listet verfügbare KML-Dateien im data-Verzeichnis"""
    kml_dir = os.path.join(os.getcwd(), "data")
    files = [f for f in os.listdir(kml_dir) if f.lower().endswith(".kml")]
    return jsonify(files)

# Optional: Erweiterung für spätere Optimierungs-API
@app.route("/api/optimize")
def optimize_endpoint():
    # TODO: JSON-Input verarbeiten, Optimierung ausführen
    return jsonify({"status": "not yet implemented"})

# ---------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True, port=8080)
