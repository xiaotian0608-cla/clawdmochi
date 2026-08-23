#include <WiFi.h>
#include <WebServer.h>

const char* ssid = "Tenda_223680";
const char* password = "83385796";

WebServer server(80);

const int FSR_PIN = 4;
int threshold = 500;

void handleRoot() {
  int val = analogRead(FSR_PIN);
  String html = "<html><body>";
  html += "<h1>ClawdMochi</h1>";
  html += "<p>压力值: " + String(val) + "</p>";
  if (val > threshold) {
    html += "<p>✓ 被抱住了</p>";
  } else {
    html += "<p>等待拥抱中...</p>";
  }
  html += "<meta http-equiv='refresh' content='2'>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
  server.on("/", handleRoot);
  server.begin();
}

void loop() {
  server.handleClient();
}
