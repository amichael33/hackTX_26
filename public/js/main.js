import { store, movementEnabled } from './store.js';

window.store = store; // console debugging

const scene = document.querySelector('a-scene');
const intro = document.getElementById('intro');
const enterBtn = document.getElementById('enter-btn');

function applyState(state) {
  const rig = document.getElementById('rig');
  const clerk = document.getElementById('clerk');
  if (rig) rig.setAttribute('wasd-controls', 'enabled', movementEnabled(state));
  if (clerk) clerk.setAttribute('clerk', 'state', state.status);
}

function boot() {
  applyState(store.get());
  store.on('change', (state) => applyState(state));
}

if (scene.hasLoaded) boot();
else scene.addEventListener('loaded', boot, { once: true });

enterBtn.addEventListener('click', () => {
  try { window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* unsupported */ }
  intro.classList.add('hidden');
  store.setPhase('LOCATION');
});
