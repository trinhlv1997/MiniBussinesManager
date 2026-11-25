// Runs before first paint so dark mode does not flash. Kept external for the CSP.
try {
  if (localStorage.getItem("mbm-theme") === "dark") {
    document.documentElement.classList.add("dark");
  }
} catch {
  // Storage can be unavailable; the default light theme still works.
}
