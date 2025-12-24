import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Add error boundary for better error reporting
try {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }
  
  createRoot(rootElement).render(<App />);
} catch (error) {
  console.error("Failed to render app:", error);
  document.body.innerHTML = `
    <div style="padding: 2rem; font-family: system-ui; max-width: 800px; margin: 0 auto;">
      <h1 style="color: #dc2626;">Application Error</h1>
      <p style="margin: 1rem 0;">The application failed to start. Please check the console for more details.</p>
      <pre style="background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow: auto;">${error instanceof Error ? error.message : String(error)}</pre>
      <p style="margin-top: 1rem;">
        <strong>Common fixes:</strong><br/>
        1. Restart the development server (Ctrl+C, then run <code>npm run dev</code>)<br/>
        2. Clear browser cache and hard reload (Ctrl+Shift+R)<br/>
        3. Check that .env file exists with required variables<br/>
        4. Run <code>npm install</code> to ensure dependencies are installed
      </p>
    </div>
  `;
}
