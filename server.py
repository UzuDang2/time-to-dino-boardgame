#!/usr/bin/env python3
"""Local-only static server. No dependencies or external network requests."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
import argparse
import webbrowser

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8767)
parser.add_argument('--open', action='store_true')
args = parser.parse_args()
handler = partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parent))
for port in range(args.port, args.port + 10):
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), handler)
        break
    except OSError:
        continue
else:
    raise SystemExit('사용할 수 있는 로컬 포트가 없습니다.')
url = f'http://127.0.0.1:{port}/'
print(f'Time to Dino: {url}', flush=True)
if args.open:
    webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
