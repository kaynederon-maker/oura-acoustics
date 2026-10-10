// Hardware bridge: pushes the current tuning to DSP dongles, DACs and headphones through
// devicePEQ (jeromeof/devicePEQ, 0BSD) over WebHID, Web Serial, Web Bluetooth or the local network.
import { peq, update, correctionSpecs } from './peq-state.js';
import { makeBand, toDeviceFilters, fromDeviceFilters } from './peq.js';
import { safePreamp } from './eq.js';
import { $, h, toast } from './ui.js';

const PLUGIN_URL = '/vendor/devicePEQ/plugin.js';
const CONSTRAINTS_URL = '/vendor/devicePEQ/peqConstraintsConfig.json';

const supported = () => 'hid' in navigator || 'serial' in navigator || 'bluetooth' in navigator;

// What the device receives: the AutoEq correction (if on) followed by your own bands.
function bandsToPush() {
  const correction = correctionSpecs().map((s) => makeBand({ type: s.type, fc: s.fc, gain: s.gain, q: s.q }));
  return [...correction, ...peq.bands];
}

let loaded = false;
async function enable() {
  const button = $('#hw-enable');
  if (loaded) return;
  button.disabled = true;
  button.textContent = 'Loading the hardware bridge…';
  try {
    const { default: initializeDeviceEqPlugin } = await import(PLUGIN_URL);
    await initializeDeviceEqPlugin({
      elemToFilters: () => toDeviceFilters(bandsToPush()),
      filtersToElem: (filters) => {
        update({ bands: fromDeviceFilters(filters), correctionOn: false, selected: null });
        toast(`Pulled ${filters.length} filters from the device. AutoEq correction turned off so they are not doubled.`);
      },
      applyEQ: () => {},
      calcEqDevPreamp: (filters) => safePreamp(fromDeviceFilters(filters).map((b) => ({ type: b.type, fc: b.fc, gain: b.gain, q: b.q }))),
      config: { advanced: true, showExtras: true, debugLogs: false, peqConstraintsUrl: CONSTRAINTS_URL },
    });
    loaded = true;
    button.hidden = true;
    $('#hw-status').textContent = 'Bridge ready. Choose your device below; the browser will ask for permission.';
  } catch (err) {
    console.error('[hardware]', err);
    button.disabled = false;
    button.textContent = 'Try again';
    $('#hw-status').textContent = `The hardware bridge could not start: ${err.message}`;
  }
}

export function initHardware() {
  if (!supported()) {
    $('#hw-enable').hidden = true;
    $('#hw-status').replaceChildren(h('strong', {}, 'This browser cannot talk to audio hardware. '),
      'Open the Lab in desktop Chrome or Edge (WebHID, Web Serial and Web Bluetooth are not available in Safari, Firefox or on iPhone).');
    return;
  }
  $('#hw-enable').addEventListener('click', enable);
}
