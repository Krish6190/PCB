from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import cv2
import numpy as np
from PIL import Image
import io
import os
import base64
import requests
import time
import threading
from dotenv import load_dotenv

# Load environment variables from .env file (explicit path ensures correct directory)
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
# override=True ensures .env values replace any existing OS/env values
load_dotenv(dotenv_path, override=True)
print("DEBUG: loaded .env from", dotenv_path)
print("DEBUG: NGROK_AUTHTOKEN from os.getenv=", repr(os.getenv("NGROK_AUTHTOKEN")))
print("DEBUG: VERCEL_PROJECT_NAME from os.getenv=", repr(os.getenv("VERCEL_PROJECT_NAME")))
print("DEBUG: VERCEL_TOKEN starts with:", repr(os.getenv("VERCEL_TOKEN")[:10] if os.getenv("VERCEL_TOKEN") else None))
print("DEBUG: VERCEL_TEAM_ID from os.getenv=", repr(os.getenv("VERCEL_TEAM_ID")))

# we'll use the ngrok CLI installed on the system
import subprocess

PYNGROK_AVAILABLE = False  # no longer using the Python package

app = Flask(__name__)
CORS(app,
     resources={r"/*": {"origins": ["https://pcb-rose.vercel.app", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5000"]}},
     supports_credentials=True,
     allow_headers=["Content-Type", "ngrok-skip-browser-warning", "Authorization", "X-Requested-With"],
     expose_headers=["Content-Type"],
     methods=["GET", "POST", "OPTIONS"])

MODEL_FILE = "best.pt"
MODEL_URL = "https://huggingface.co/datasets/Krish619/pcb-model/resolve/main/best.pt"

if not os.path.exists(MODEL_FILE):
    print("Downloading model from Hugging Face...")
    response = requests.get(MODEL_URL)
    if response.status_code == 200:
        with open(MODEL_FILE, "wb") as f:
            f.write(response.content)
        print("Model downloaded successfully!")
    else:
        raise Exception(f"Failed to download model: {response.status_code} - {response.text}")

print("Loading model...")
model = YOLO(MODEL_FILE)
print("Model loaded successfully!")

# Severity mapping for PCB defect types
DEFECT_SEVERITY = {
    "missing_hole":     {"weight": 8,  "impact": "High",     "description": "Missing drill hole — affects connectivity"},
    "mouse_bite":       {"weight": 5,  "impact": "Medium",   "description": "Irregular rough edge — may cause shorts"},
    "open_circuit":     {"weight": 10, "impact": "Critical", "description": "Broken trace — circuit will not function"},
    "short":            {"weight": 10, "impact": "Critical", "description": "Unintended connection — risk of damage"},
    "spur":             {"weight": 6,  "impact": "Medium",   "description": "Unwanted copper projection — potential short"},
    "spurious_copper":  {"weight": 7,  "impact": "High",     "description": "Extra copper residue — risk of bridging"},
}

def compute_grading(detections):
    """Compute PCB health report from detection results."""
    if not detections:
        return {
            "total_defects": 0,
            "defect_summary": [],
            "severity_score": 0,
            "max_severity": "None",
            "grade": "A+",
            "grade_label": "Excellent — No defects detected",
            "health_percentage": 100,
        }

    # Count defects by class
    class_counts = {}
    total_confidence = 0
    for d in detections:
        cls = d["class_name"]
        class_counts[cls] = class_counts.get(cls, 0) + 1
        total_confidence += d["confidence"]

    # Build defect summary
    defect_summary = []
    weighted_score = 0
    max_impact_level = 0  # 0=None, 1=Medium, 2=High, 3=Critical

    impact_levels = {"Medium": 1, "High": 2, "Critical": 3}

    for cls, count in class_counts.items():
        info = DEFECT_SEVERITY.get(cls, {"weight": 5, "impact": "Medium", "description": "Unknown defect type"})
        weighted_score += info["weight"] * count
        level = impact_levels.get(info["impact"], 1)
        if level > max_impact_level:
            max_impact_level = level

        defect_summary.append({
            "class_name": cls,
            "count": count,
            "severity_impact": info["impact"],
            "severity_weight": info["weight"],
            "description": info["description"],
        })

    # Normalize severity score to 0–100
    severity_score = min(100, weighted_score * 2)
    health_percentage = max(0, 100 - severity_score)

    # Determine grade
    if severity_score == 0:
        grade, grade_label = "A+", "Excellent — No defects detected"
    elif severity_score <= 10:
        grade, grade_label = "A", "Very Good — Minor cosmetic issues only"
    elif severity_score <= 25:
        grade, grade_label = "B", "Good — Minor defects, likely functional"
    elif severity_score <= 45:
        grade, grade_label = "C", "Fair — Moderate defects, needs review"
    elif severity_score <= 65:
        grade, grade_label = "D", "Poor — Significant defects detected"
    else:
        grade, grade_label = "F", "Fail — Critical defects, not usable"

    max_severity_map = {0: "None", 1: "Medium", 2: "High", 3: "Critical"}

    return {
        "total_defects": len(detections),
        "unique_defect_types": len(class_counts),
        "defect_summary": sorted(defect_summary, key=lambda x: x["severity_weight"], reverse=True),
        "severity_score": round(severity_score, 1),
        "max_severity": max_severity_map[max_impact_level],
        "grade": grade,
        "grade_label": grade_label,
        "health_percentage": round(health_percentage, 1),
        "avg_confidence": round(total_confidence / len(detections) * 100, 1),
    }


def start_ngrok_and_update_vercel():
    """Start ngrok via system CLI and update Vercel environment variable."""
    ngrok_auth = os.getenv("NGROK_AUTHTOKEN")
    if not ngrok_auth:
        print("⚠️ NGROK_AUTHTOKEN not set. Skipping ngrok tunnel.")
        print("   To enable: put NGROK_AUTHTOKEN in your .env or system env")
        print("   Get a token at: https://dashboard.ngrok.com/get-started/your-authtoken")
        return None
    
    try:
        print("\n🚀 Launching ngrok CLI...")
        # start ngrok in background
        proc = subprocess.Popen(["ngrok", "authtoken", ngrok_auth], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        proc.wait(timeout=10)
    except Exception as e:
        print(f"⚠️ Failed to set ngrok authtoken: {e}")
    
    try:
        ngrok_proc = subprocess.Popen(["ngrok", "http", "5000"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError:
        print("⚠️ ngrok executable not found. Install ngrok from https://ngrok.com/download")
        return None
    except Exception as e:
        print(f"⚠️ Could not start ngrok: {e}")
        return None
    
    # wait briefly for tunnel to appear
    time.sleep(3)
    
    try:
        resp = requests.get("http://127.0.0.1:4040/api/tunnels", timeout=5)
        tunnels = resp.json()
        if tunnels.get("tunnels"):
            ngrok_url = tunnels["tunnels"][0]["public_url"]
            print(f"✅ ngrok tunnel started: {ngrok_url}")
            update_vercel_env(ngrok_url)
            return ngrok_url
    except Exception as e:
        print(f"⚠️ Could not obtain ngrok URL: {e}")
    
    return None


def update_vercel_env(ngrok_url):
    """Update Vercel environment variable with ngrok URL."""
    try:
        vercel_token = os.getenv("VERCEL_TOKEN")
        project_name = os.getenv("VERCEL_PROJECT_NAME")
        team_id = os.getenv("VERCEL_TEAM_ID")
        
        if not vercel_token or not project_name:
            print("⚠️ VERCEL_TOKEN or VERCEL_PROJECT_NAME not set in .env file")
            return

        api_url = f"https://api.vercel.com/v9/projects/{project_name}/env"
        if team_id:
            api_url = f"{api_url}?teamId={team_id}"

        headers = {
            "Authorization": f"Bearer {vercel_token}",
            "Content-Type": "application/json"
        }
        
        print(f"\n🌍 Updating Vercel environment variable to: {ngrok_url}")
        print(f"DEBUG: Vercel API URL: {api_url}")
        
        # Get all current environment variables
        response = requests.get(api_url, headers=headers, timeout=10)
        response.raise_for_status()
        envs = response.json()["envs"]
        
        # Delete old variable if exists
        for env in envs:
            if env["key"] == "REACT_APP_API_URL":
                delete_response = requests.delete(
                    f"{api_url}/{env['id']}", 
                    headers=headers,
                    timeout=10
                )
                delete_response.raise_for_status()
                print("🗑️ Deleted old REACT_APP_API_URL")
                break
        
        # Create new environment variable
        data = {
            "key": "REACT_APP_API_URL",
            "value": ngrok_url,
            "target": ["production"],
            "type": "plain"
        }
        post_response = requests.post(api_url, headers=headers, json=data, timeout=10)
        post_response.raise_for_status()
        print("✅ Updated REACT_APP_API_URL on Vercel")
        print("🔄 Vercel will redeploy with the new backend URL...")
        
    except requests.exceptions.RequestException as e:
        print(f"⚠️ Failed to update Vercel: {e}")
        print("Make sure your VERCEL_TOKEN is valid in .env file")
    except Exception as e:
        print(f"⚠️ Error updating Vercel: {e}")



@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "model_loaded": True})


@app.route('/detect', methods=['POST'])
def detect_faults():
    try:
        if 'image' not in request.files:
            return jsonify({"error": "No image file provided"}), 400

        file = request.files['image']
        image_bytes = file.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        original_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if original_image is None:
            return jsonify({"error": "Invalid image file"}), 400

        h, w = original_image.shape[:2]
        gray = cv2.cvtColor(original_image, cv2.COLOR_BGR2GRAY)
        resized = cv2.resize(gray, (640, 640))
        input_image = cv2.cvtColor(resized, cv2.COLOR_GRAY2BGR)

        results = model(input_image)
        result = results[0]

        # Extract detection data
        detections = []
        boxes = result.boxes
        total_image_area = 640 * 640  # model input size
        if boxes is not None and len(boxes) > 0:
            for i in range(len(boxes)):
                cls_id = int(boxes.cls[i].item())
                conf = float(boxes.conf[i].item())
                bbox = boxes.xyxy[i].tolist()
                class_name = result.names.get(cls_id, f"class_{cls_id}")
                # Calculate defect area
                box_w = bbox[2] - bbox[0]
                box_h = bbox[3] - bbox[1]
                area_pixels = round(box_w * box_h, 1)
                area_percentage = round((area_pixels / total_image_area) * 100, 2)
                detections.append({
                    "class_id": cls_id,
                    "class_name": class_name,
                    "confidence": conf,
                    "bbox": [round(v, 1) for v in bbox],
                    "area_pixels": area_pixels,
                    "area_percentage": area_percentage,
                })

        # Generate annotated image as base64
        annotated = result.plot()
        final = cv2.resize(annotated, (w, h))
        final_rgb = cv2.cvtColor(final, cv2.COLOR_BGR2RGB)

        img_io = io.BytesIO()
        Image.fromarray(final_rgb).save(img_io, 'PNG', quality=95)
        img_b64 = base64.b64encode(img_io.getvalue()).decode('utf-8')

        # Compute grading report
        report = compute_grading(detections)

        return jsonify({
            "image": img_b64,
            "detections": detections,
            "report": report,
        })

    except Exception as e:
        print(f"Error processing image: {e}")
        return jsonify({"error": f"Processing failed: {e}"}), 500


if __name__ == '__main__':
    print("\n" + "="*60)
    print("🎯 PCB Fault Detection API Starting")
    print("="*60)
    
    # Flask debug mode uses a reloader that runs your module twice.
    # Only start ngrok in the "main" reloader process to avoid duplicate tunnels/updates.
    debug_mode = os.getenv("FLASK_DEBUG", "1") == "1"
    is_reloader_child = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    if (not debug_mode) or is_reloader_child:
        def init_ngrok():
            try:
                start_ngrok_and_update_vercel()
            except Exception as e:
                print(f"⚠️ Ngrok initialization error: {e}")
        
        ngrok_thread = threading.Thread(target=init_ngrok, daemon=True)
        ngrok_thread.start()
    
    print("\n🚀 Flask server starting on http://0.0.0.0:5000")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=5000, debug=debug_mode)
