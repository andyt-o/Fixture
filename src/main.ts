// ==============================================================================
// Imports
// ==============================================================================
import { mountTitlebar }   from "./components/Titlebar";
import { mountOnboarding } from "./components/Onboarding";
import "./components/Dashboard";
import "./components/SettingsModal";
import "./components/OverlayController";

// ==============================================================================
// Bootstrap
// ==============================================================================
const titlebar = document.getElementById("titlebar");
const content  = document.getElementById("content");

if (titlebar) {
  mountTitlebar(titlebar);
}

if (content) {
  mountOnboarding(content);
}
