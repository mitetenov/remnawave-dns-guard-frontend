"""Check the built nginx UI and its API proxy against a local HTTP fixture."""
import re
import shlex
import subprocess
import sys
import time
import urllib.request
import uuid


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


def main(image):
    suffix = uuid.uuid4().hex[:12]
    network, upstream, frontend = ("guard-smoke-" + suffix + kind for kind in ("-net", "-upstream", "-ui"))
    try:
        docker("network", "create", network)
        fixture = '''events {}\nhttp { server { listen 8000; location /api/health {
            default_type application/json; return 200 '{"upstream":"fixture"}';
        } } }\n'''
        docker("run", "-d", "--name", upstream, "--network", network,
               "--network-alias", "backend", "--entrypoint", "sh", image, "-c",
               "printf %s " + shlex.quote(fixture) + " > /tmp/fixture.conf && exec nginx -c /tmp/fixture.conf -g 'daemon off;'")
        docker("run", "-d", "--name", frontend, "--network", network, "-p", "127.0.0.1::80", image)
        port = docker("port", frontend, "80/tcp").rsplit(":", 1)[1]
        base = "http://127.0.0.1:" + port

        def get(path):
            with urllib.request.urlopen(base + path, timeout=3) as response:
                return response.read(), response.headers

        deadline = time.monotonic() + 45
        while True:
            try:
                html, headers = get("/")
                proxy, proxy_headers = get("/api/health")
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise RuntimeError("Frontend did not become healthy")
                time.sleep(0.5)
        assert b'<div id="root">' in html
        assert headers["X-Content-Type-Options"] == "nosniff"
        assert headers["X-Frame-Options"] == "DENY"
        assert "default-src 'self'" in headers["Content-Security-Policy"]
        asset = re.search(rb'src="(/assets/[^" ]+\.js)"', html)
        assert asset, "Missing built JavaScript asset"
        body, asset_headers = get(asset.group(1).decode())
        assert len(body) > 1000
        assert "immutable" in ", ".join(asset_headers.get_all("Cache-Control", []))
        assert asset_headers["X-Content-Type-Options"] == "nosniff"
        fallback, _ = get("/client-side-route")
        assert fallback == html
        assert proxy == b'{"upstream":"fixture"}'
        assert proxy_headers["Cache-Control"] == "no-store"
        assert proxy_headers["X-Frame-Options"] == "DENY"
        print("Frontend image: HTML, assets, SPA fallback, security headers and API proxy passed")
    except Exception:
        subprocess.run(["docker", "logs", frontend], check=False)
        subprocess.run(["docker", "logs", upstream], check=False)
        raise
    finally:
        for name in (frontend, upstream):
            subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, check=False)
        subprocess.run(["docker", "network", "rm", network], stdout=subprocess.DEVNULL, check=False)


if __name__ == "__main__":
    main(sys.argv[1])
