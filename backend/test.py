import requests

# API endpoints
HEALTH_URL = "http://127.0.0.1:5000/health"
DETECT_URL = "http://127.0.0.1:5000/detect"

# Check health
res = requests.get(HEALTH_URL)
print("✅ Health check:", res.status_code, res.text)

# Send an image
with open("printed-circuit-board.jpg", "rb") as img:
    files = {"image": img}
    detect_res = requests.post(DETECT_URL, files=files)

print("✅ Detect response:", detect_res.status_code)

if detect_res.status_code == 200:
    with open("result.png", "wb") as f:
        f.write(detect_res.content)
    print("💾 Saved result as result.png")
else:
    print("❌ Error:", detect_res.text)
