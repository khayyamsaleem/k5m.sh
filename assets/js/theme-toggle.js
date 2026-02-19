// Light/Dark mode theme toggle with localStorage persistence
// Default theme: dark mode (on first load and fallback)

(function() {
  // Safe localStorage wrapper with fallback
  const storage = {
    get: function(key, defaultValue) {
      try {
        return localStorage.getItem(key) || defaultValue;
      } catch (e) {
        // localStorage disabled or blocked (privacy mode, etc)
        return defaultValue;
      }
    },
    set: function(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        // Silently fail if localStorage unavailable
        // Theme will reset on page reload but toggle still works
      }
    }
  };

  // Check for saved theme preference or default to dark mode
  const savedTheme = storage.get('theme', 'dark');
  
  // Apply theme on load
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    // Default to dark mode on first load
    document.documentElement.setAttribute('data-theme', 'dark');
    storage.set('theme', 'dark');
  }

  // Create toggle button
  const toggleButton = document.createElement('button');
  toggleButton.id = 'theme-toggle';
  toggleButton.setAttribute('aria-label', 'Toggle theme');
  toggleButton.setAttribute('aria-pressed', savedTheme === 'dark' ? 'true' : 'false');
  toggleButton.title = savedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  toggleButton.innerHTML = savedTheme === 'dark' ? '☀️' : '🌙';
  document.body.appendChild(toggleButton);

  // Toggle theme on click
  toggleButton.addEventListener('click', function() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // Update theme
    if (newTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      toggleButton.innerHTML = '☀️';
      toggleButton.title = 'Switch to light mode';
      toggleButton.setAttribute('aria-pressed', 'true');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      toggleButton.innerHTML = '🌙';
      toggleButton.title = 'Switch to dark mode';
      toggleButton.setAttribute('aria-pressed', 'false');
    }
    
    // Save preference (gracefully fails if localStorage unavailable)
    storage.set('theme', newTheme);
  });
})();
