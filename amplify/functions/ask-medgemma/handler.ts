import type { Schema } from "../../data/resource";

// ─── 🔗 PASTE YOUR NGROK URL HERE (no trailing slash) ─────────────────────────
const COLAB_BASE_URL = "https://available-lifestyle-additional-hunting.trycloudflare.com";
// ──────────────────────────────────────────────────────────────────────────────

const GENERATE_URL = `${COLAB_BASE_URL}/generate`;
const AGENT_URL = `${COLAB_BASE_URL}/agent/ask`;

export const handler: Schema["askMedGemma"]["functionHandler"] = async (event) => {
  try {
    const { question } = event.arguments;

    if (!question) return "Error: No question provided";

    console.log("→ askMedGemma:", question);

    const response = await fetch(GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 503) return "⏳ Colab GPU is starting up. Try again in a moment.";
      if (response.status === 504) return "⏳ Request timed out. Model may be loading.";
      return `Error: Colab API returned ${response.status}. ${text}`;
    }

    const data = await response.json();
    return (data.response ?? "No response generated.").trim();

  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return "❌ Cannot connect to Colab. Make sure the notebook is running and ngrok URL is correct.";
    }
    return `Error: ${error instanceof Error ? error.message : "Unexpected error"}`;
  }
};