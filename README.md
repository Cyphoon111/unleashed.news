# unleashed.news

The splash page for UNLEASHED.NEWS, a real-time news network. A static site: `index.html`, `assets/site.css`, `assets/site.js`, the logo in `assets/`.

Hosted on GitHub Pages from the `main` branch (the `CNAME` file names the domain); the domain's DNS is at GoDaddy, pointed at GitHub Pages the same way theciaasset.com is.

The "Get the first alert" box files sign-ups under `site: unleashed.news` in PitchZing (route `/public/book-site/notify`); the list is at `GET /admin/book-site/signups`.

To preview locally: `python3 -m http.server 8643 --bind 127.0.0.1` in this folder, then open http://127.0.0.1:8643/.
