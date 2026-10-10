// Runs before first paint (classic script in <head>) so the page never flashes the wrong theme.
(function () {
  var THEMES = ['dark', 'light', 'burgundy', 'earth', 'soft'];
  var theme = null;
  try {
    theme = JSON.parse(localStorage.getItem('aura.theme')); // written by ui.js store (JSON)
  } catch (e) {
    // storage blocked or unreadable: fall back to the system preference
  }
  if (THEMES.indexOf(theme) < 0) theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.add('js');
})();
