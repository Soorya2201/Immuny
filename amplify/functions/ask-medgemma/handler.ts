import type { Schema } from "../../data/resource";

// 🔗 REPLACE THIS URL with your ngrok URL from Colab
// Example: "https://abc123.ngrok-free.app"
const COLAB_API_URL = "insert.ngrok.url/generate";

export const handler: Schema["askMedGemma"]["functionHandler"] = async (event) => {
  try {
    const { question } = event.arguments;
    
    if (!question) {
      return "Error: No question provided";
    }

    console.log("Question:", question);
    console.log("Calling Colab API:", COLAB_API_URL);

    // Call your Colab-hosted MedGemma API
    const response = await fetch(COLAB_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: question
      })
    });

    console.log("Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Colab API Error:", response.status, errorText);
      
      if (response.status === 503) {
        return "⏳ The Colab GPU is starting up. Please try again in a moment.";
      } else if (response.status === 504) {
        return "⏳ Request timeout. The model might be loading. Please try again.";
      }
      
      return `Error: Unable to reach Colab API (Status: ${response.status}). Make sure Colab is running!`;
    }

    const data = await response.json();
    console.log("Colab Response:", data);

    if (data.response) {
      return data.response.trim();
    } else if (data.error) {
      return `Colab Error: ${data.error}`;
    }
    
    return "I apologize, but I couldn't generate a response. Please try again.";
    
  } catch (error) {
    console.error("Handler error:", error);
    
    // Check if it's a network error
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return "❌ Cannot connect to Colab. Please make sure:\n1. Colab notebook is running\n2. ngrok URL is correct in handler.ts\n3. Colab hasn't timed out";
    }
    
    return `Error: ${error instanceof Error ? error.message : 'An unexpected error occurred'}`;
  }
};