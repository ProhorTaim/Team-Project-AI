"""
Локальный сервер для работы с Ollama (qwen3:4b).
Запуск: python3 server.py
Открой: http://localhost:8080
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import urllib.request

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen3:4b"


class RequestHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/api/chat":
            content_length = int(self.headers["Content-Length"])
            body = self.rfile.read(content_length)
            data = json.loads(body)

            messages = data.get("messages", [])
            model = data.get("model", MODEL)

            ollama_payload = json.dumps({
                "model": model,
                "messages": messages,
                "stream": False,
                "think": False
            }).encode("utf-8")

            try:
                req = urllib.request.Request(
                    OLLAMA_URL,
                    data=ollama_payload,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=120) as resp:
                    result = json.loads(resp.read().decode("utf-8"))

                content = result.get("message", {}).get("content", "")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"content": content}).encode("utf-8"))

            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")


if __name__ == "__main__":
    port = 8080
    server = HTTPServer(("localhost", port), RequestHandler)
    print(f"Сервер запущен: http://localhost:{port}")
    print(f"Ollama URL: {OLLAMA_URL}")
    print(f"Модель: {MODEL}")
    print("Нажми Ctrl+C для остановки")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен")
        server.server_close()
