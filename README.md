# Ṣarf Class Resources

A lightweight static website for weekly Arabic class study tools and accessible homework.

## Local preview

The landing page loads `data/resources.json`, so preview it through a local web server rather than opening `index.html` directly:

```sh
python3 -m http.server 8000
```

Then visit <http://localhost:8000/>.

The teacher interface is available at <http://localhost:8000/admin/>. It can be
tested now, but publishing remains disabled until `admin/config.js` contains the
deployed Cloudflare Worker URL.

Teacher-created resources remain self-contained HTML files under `resources/week-NNN/`. The public landing page reads `data/resources.json` and groups both resource types by week.
