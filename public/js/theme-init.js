(function () {
  var THEMES = ['dark', 'light', 'burgundy', 'earth', 'soft'];
  var theme = null;
  try {
    theme = JSON.parse(localStorage.getItem('aura.theme'));
  } catch (e) {
  }
  if (THEMES.indexOf(theme) < 0) theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.add('js');
})();
