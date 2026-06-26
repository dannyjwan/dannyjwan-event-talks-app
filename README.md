# BigQuery Release Pulse

A beautiful, modern web application built with Python Flask and vanilla HTML, CSS, and JavaScript that fetches, parses, and formats the Google Cloud BigQuery Release Notes feed. It also provides a sleek, interactive X/Twitter composer mockup to easily share selected updates.

## Features

- **Automated RSS Feed Processing**: Fetches the official [BigQuery Release Notes](https://docs.cloud.google.com/feeds/bigquery-release-notes.xml) and splits grouped daily entries into individual, category-specific update cards.
- **Smart Category Tagging**: Automatically detects and badges updates by type (e.g. `Feature`, `Change`, `Announcement`, `Issue`, `Deprecation`) with distinct glowing aesthetics.
- **Interactive Dashboard**:
  - Live counters for each category.
  - Real-time search by keyword, date, or category.
  - One-click sidebar filters.
- **Manual Sync & Cache Control**: A manual refresh button with spinner state, backed by an server-side intelligent caching layer (30-min default cache expiry).
- **Interactive X (Twitter) Composer Mockup**:
  - Live preview card styled like a dark-mode X post.
  - Auto-generated tweet text optimized for X's 280-character limit.
  - Toggle switch to append/remove the official anchor link.
  - Real-time character counter (with caution alerts for warnings and limits).
  - One-click copy-to-clipboard button with visual feedback.
  - "Share on X" button that launches the official X web intent.
- **Responsive Layout**: Adapts gracefully from massive desktop screens down to tablets and mobile phones (using a smooth bottom-sheet drawer for the composer).

## Tech Stack

- **Backend**: Python, Flask, Requests
- **Frontend**: Vanilla HTML5, CSS3 (Flexbox/Grid, Glassmorphism, CSS Custom Properties), JavaScript (ES6, DOMParser, Async/Await)

## Getting Started

### Prerequisites

- Python 3.8+ (tested with Python 3.14.5)

### Installation & Run

1. Clone or navigate to the project directory:
   ```powershell
   cd C:\Users\DW-HOME\agy-cli-projects\bq-release-notes
   ```

2. Create a Python virtual environment:
   ```powershell
   python -m venv venv
   ```

3. Activate the virtual environment:
   - **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   - **Windows (CMD)**:
     ```cmd
     .\venv\Scripts\activate.bat
     ```
   - **macOS/Linux**:
     ```bash
     source venv/bin/activate
     ```

4. Install the required libraries:
   ```powershell
   pip install -r requirements.txt
   ```

5. Run the Flask application:
   ```powershell
   python app.py
   ```

6. Open your browser and navigate to:
   ```
   http://127.0.0.1:5000/
   ```

## Project Structure

- `app.py`: Flask application script with feed parsing and caching logic.
- `requirements.txt`: Python package requirements.
- `templates/index.html`: Main HTML template file.
- `static/css/style.css`: Custom vanilla CSS stylesheet implementing the design.
- `static/js/app.js`: Client-side logic for timeline processing, filters, and composer integration.
