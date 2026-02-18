// Light/Dark mode theme toggle with localStorage persistence

(function() {
  // Check for saved theme preference or default to light mode
  const savedTheme = localStorage.getItem('theme') || 'light';
  
  // Apply theme on load
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  // Create toggle button
  const toggleButton = document.createElement('button');
  toggleButton.id = 'theme-toggle';
  toggleButton.setAttribute('aria-label', 'Toggle theme');
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
    } else {
      document.documentElement.removeAttribute('data-theme');
      toggleButton.innerHTML = '🌙';
      toggleButton.title = 'Switch to dark mode';
    }
    
    // Save preference
    localStorage.setItem('theme', newTheme);
  });
})();
