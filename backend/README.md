# PCB Fault Detection API

This is a Flask API that runs your YOLO model for PCB fault detection.

## Setup Instructions

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Add Your Model

Place your trained YOLO model file (`.pt`) in this folder and update the `MODEL_PATH` in `app.py`:

```python
MODEL_PATH = "your_model.pt"  # Change this to your model filename
```

### 3. Run Locally

```bash
python app.py
```

The API will run on `http://localhost:5000`

### 4. Test the API

```bash
curl -X POST -F "image=@test_pcb.jpg" http://localhost:5000/detect --output result.png
```

## Deployment Options

### Option 1: Render.com (Recommended - Free Tier Available)

1. Create account at [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repo (push this python-api folder to GitHub)
4. Configure:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
   - **Environment**: Python 3
5. Add your model file to the repo or use environment variable for model path
6. Deploy!

**Note**: Add `gunicorn` to requirements.txt:
```
gunicorn==21.2.0
```

### Option 2: Railway.app

1. Create account at [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub"
3. Select your repo with this folder
4. Railway auto-detects Flask and deploys
5. Copy the provided URL

### Option 3: AWS/GCP/Azure

Deploy as a standard Flask application on any cloud provider that supports Python.

## API Endpoints

### GET /health
Health check endpoint to verify the API is running.

**Response:**
```json
{
  "status": "healthy",
  "model_loaded": true
}
```

### POST /detect
Detect faults in PCB image.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Image file with key "image"

**Response:**
- Content-Type: image/png
- Body: PNG image with detected faults marked

## Environment Variables

After deployment, you'll get a URL like:
- Render: `https://your-app.onrender.com`
- Railway: `https://your-app.up.railway.app`

**Copy this URL and add it to your Lovable project's secrets as `PYTHON_API_URL`**

## Troubleshooting

### Model not loading
- Ensure your `.pt` file is in the correct location
- Check the MODEL_PATH in app.py matches your filename

### Out of memory
- Consider using a smaller model or optimize your deployment plan
- Some free tiers have memory limits

### Slow inference
- Free tiers may have limited CPU/GPU
- Consider upgrading to a paid plan for faster processing
