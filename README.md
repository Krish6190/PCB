# PCB Defect Detection

This repository contains the code and frontend for a PCB defect detection project.

Dataset: The dataset used for training the model is from DeepPCB (https://github.com/Arthur151/DeepPCB). The trained model weights are NOT included in this repository.

Contents
- `backend/` : Flask backend (model loading / inference / API)
- `frontend/` : React frontend

Note about the model
- The repository does not include the trained model (`*.pt`) to keep the repo lightweight.
- To reproduce a model, download the DeepPCB dataset and train using the training instructions below.

How to train your own model
1. Clone DeepPCB or download the dataset from the DeepPCB project.
2. Prepare the dataset in the same structure expected by the training scripts (refer to DeepPCB docs).
3. Use your preferred training script (PyTorch). Example minimal steps:

```bash
# create a python env
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt

# run your training script (example)
python train.py --data /path/to/DeepPCB --output ./weights/best.pt
```

How to integrate your trained model into this project
1. Place your trained `best.pt` (or chosen checkpoint) in the `backend/` directory locally.
2. Ensure `backend/app.py` loads the correct checkpoint path (update the filename if necessary).
3. Run the backend and frontend:

```bash
# backend
cd backend
pip install -r requirements.txt
python app.py

# frontend (in another terminal)
cd frontend
npm install
npm start
```

Security & privacy
- Do not commit model weights or large binaries to GitHub. Add them to `.gitignore` (already included).

License
- This repository is licensed under the MIT License. See `LICENSE`.
