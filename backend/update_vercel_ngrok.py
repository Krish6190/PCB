import requests
import os
import time

# 🚀 Add your actual Vercel API token and project name here
VERCEL_TOKEN = os.getenv("VERCEL_TOKEN") or "hDHCLr34csCldcYiWzI96yJh"
PROJECT_NAME = os.getenv("VERCEL_PROJECT_NAME") or "pcbprojectbyak"

# ✅ Correct API endpoint (note the formatted project name)
API_URL = f"https://api.vercel.com/v9/projects/{PROJECT_NAME}/env"

def update_backend_url(new_url):
    print(f"🌍 Updating Vercel environment variable to: {new_url}")

    headers = {"Authorization": f"Bearer {VERCEL_TOKEN}", "Content-Type": "application/json"}

    # 🧩 Get all current environment variables
    response = requests.get(API_URL, headers=headers)
    response.raise_for_status()
    envs = response.json()["envs"]

    # 🗑️ Delete old variable if exists
    for env in envs:
        if env["key"] == "REACT_APP_API_URL":
            requests.delete(f"{API_URL}/{env['id']}", headers=headers)
            print("🗑️ Deleted old REACT_APP_API_URL")

    # ➕ Create new env var
    data = {
        "key": "REACT_APP_API_URL",
        "value": new_url,
        "target": ["production"],
        "type": "plain"
    }
    response = requests.post(API_URL, headers=headers, json=data)
    response.raise_for_status()
    print("✅ Updated REACT_APP_API_URL on Vercel")

if __name__ == "__main__":
    print("🔄 Waiting for ngrok to start...")
    time.sleep(5)

    try:
        # 💡 Ngrok provides an API that gives the current public URL
        tunnels = requests.get("http://127.0.0.1:4040/api/tunnels").json()
        new_url = tunnels["tunnels"][0]["public_url"]
        update_backend_url(new_url)
        print("🎉 Successfully updated Vercel environment variable!")
    except Exception as e:
        print(f"❌ Failed to update Vercel: {e}")