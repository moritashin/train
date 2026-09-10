#!/usr/bin/env python3
"""本地预览服务器 — 与 python3 -m http.server 相同,但禁用缓存。

ES Modules 按文件分多请求加载,浏览器启发式缓存可能把新旧模块
混在一起导致整个模块图加载失败;no-cache 让每次刷新都重新校验
(未变 304、已变 200),改动后刷新即生效。
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8000


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    print(f'Serving at http://localhost:{PORT} (缓存已禁用,Ctrl+C 停止)')
    ThreadingHTTPServer(('', PORT), NoCacheHandler).serve_forever()
