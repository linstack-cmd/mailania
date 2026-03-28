import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App.js";
import { MobileDebugOverlay, RootErrorBoundary, installMobileDebugGlobalHandlers, updateMobileDebug } from "./mobileDebug.js";

installMobileDebugGlobalHandlers();
updateMobileDebug({ bootedJs: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MobileDebugOverlay />
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
);
