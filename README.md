# 🛡️ ImmunyAI: Multimodal Allergy & Health Ally

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![AWS Amplify](https://img.shields.io/badge/AWS_Amplify-FF9900?style=for-the-badge&logo=aws-amplify&logoColor=white)
![PyTorch](https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)
![Hugging Face](https://img.shields.io/badge/Hugging_Face-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black)

**ImmunyAI** is an advanced, AI-driven personal health tracker and advisor designed to bridge the gap between reactive symptom treatment and proactive health management. 

By combining **Vision-Language Models (VLMs)**, **Voice UI**, and **IoT Wearable Data**, ImmunyAI continuously monitors patient well-being, identifies visual symptoms, and provides actionable pathways to safely build allergen tolerance.

---

## 🚀 The Pitch: Why ImmunyAI?
Managing daily health, especially severe allergies, shouldn't be a guessing game. ImmunyAI replaces fragmented health apps with a unified, context-aware intelligence. It doesn't just log data; it *understands* it. 

Whether it's analyzing a photo of a sudden skin rash, passively monitoring a smartwatch for anaphylactic shock signatures (SpO2 drops, HR spikes), or generating micro-dosing schedules for exposure therapy, ImmunyAI processes complex, multi-dimensional health data in real-time.

---

## ✨ Core Features & Capabilities

### 1. 🤖 Ask Immuny (Multimodal AI Assistant)
Powered by Google's medical-grade **MedGemma 1.5 (4B)** model, this chat module goes far beyond text.
* **Computer Vision:** Upload photos of skin flare-ups for instant identification, scan prescription labels for dosage checks, or upload images of meals to generate an allergen "compatibility score."
* **Voice-Native Interface:** Fully hands-free operation using built-in Web Speech API for both speech-to-text recognition and natural text-to-speech responses.
* **Context-Aware:** The AI retains memory of the user's known allergens and historical reactions to provide highly personalized advice.

### 2. ⌚ Real-Time Health Logger & IoT Integration
A central medical diary that actively protects the user.
* **Continuous Vitals Ingest:** Polls simulated wearable data (Heart Rate, SpO2, Respiratory Rate, Skin Temperature).
* **Automated Threat Detection:** Algorithmically detects biometric anomalies (e.g., sudden heart rate spikes paired with oxygen drops).
* **AI SOS Triggers:** Automatically interrupts the UI with critical alerts and generates emergency intervention instructions (e.g., EpiPen protocols) when danger thresholds are crossed.
* **Voice Logging:** Users can log meals, medications, or symptoms effortlessly using voice dictation.

### 3. 🧪 Proactive Exposure Testing
Transforms the app from a passive tracker into an active clinical tool.
* **Guided Tolerance Building:** Generates structured, micro-dosing paths to help users safely build resistance to specific allergens.
* **Safety First:** Enforces a rigorous safety checklist (baseline symptoms, emergency meds proximity) before allowing tests to begin.
* **Clinical Monitoring:** Tracks serving context, precise dosages (down to milligrams), elapsed time, and subsequent reactions in a structured database.

---

## 🛠️ Tech Stack & Architecture

This application utilizes a decoupled architecture, separating the lightweight frontend from the heavy, GPU-bound inference engine.

**Frontend (Client)**
* **Framework:** React + TypeScript
* **State & Auth:** AWS Amplify (Gen 2)
* **Voice Services:** Browser-native `SpeechRecognition` and `SpeechSynthesis` APIs (Zero-cost, zero-latency voice UI).
* **Styling:** Custom CSS with dynamic alert rendering.

**Backend (AI Inference Engine)**
* **Server:** Python / Flask / Flask-CORS
* **Model:** `google/medgemma-1.5-4b-it` (Vision-Language Model)
* **ML Framework:** PyTorch, Hugging Face `transformers`, `accelerate` (using `bfloat16` precision for optimized VRAM usage).
* **Infrastructure:** Hosted on Google Colab (T4 GPU) using `pyngrok` to establish a secure, ephemeral tunnel to the AWS-hosted frontend. 

### Data Flow Diagram
1. **User Action:** User speaks a query or uploads an image.
2. **Frontend Processing:** React converts voice to text, or converts the image to a Base64 string.
3. **API Tunnel:** Payload is sent via HTTPS via Ngrok to the Colab GPU instance.
4. **Context Injection:** Python backend appends the user's latest wearable vitals and medical history to the prompt.
5. **Inference:** MedGemma processes the multimodal prompt and streams back clinical guidance.
6. **Response:** Frontend renders markdown text and speaks the response aloud.

---

## 💻 Getting Started (Local Development)

### 1. Start the AI Backend (Google Colab)
Because the MedGemma model requires a dedicated GPU (16GB+ VRAM), the backend is hosted in a Google Colab notebook.
1. Open the provided `Colab_Backend.ipynb` file in Google Colab.
2. Change the runtime type to **T4 GPU**.
3. Insert your Hugging Face Token and Ngrok Auth Token in the designated variables.
4. Run all cells. The final output will yield a public Ngrok URL (e.g., `https://xxxx.ngrok-free.app`).

### 2. Configure the Frontend
1. Clone this repository: `git clone https://github.com/yourusername/immuny-app.git`
2. Navigate to the project directory: `cd immuny-app`
3. Install dependencies: `npm install`
4. Open `src/App.tsx` and update the `COLAB_BASE_URL` constant with the Ngrok URL generated in step 1:
   ```typescript
   const COLAB_BASE_URL = "[https://YOUR-NGROK-URL.ngrok-free.app](https://YOUR-NGROK-URL.ngrok-free.app)";
