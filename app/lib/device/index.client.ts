const darkModeKey = "mollulog::darkMode";

export function isDarkMode(): boolean {
  const stored = localStorage.getItem(darkModeKey);
  if (stored) {
    return stored === "true";
  }

  const deviceConfig = window.matchMedia("(prefers-color-scheme: dark)").matches;
  localStorage.setItem(darkModeKey, deviceConfig ? "true" : "false");
  return deviceConfig;
}

export function toggleDarkMode() {
  const current = isDarkMode();
  localStorage.setItem(darkModeKey, current ? "false" : "true");
  document.documentElement.classList.toggle("dark");
}
