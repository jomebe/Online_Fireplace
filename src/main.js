import './style.css';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import { audio } from './audio.js';
import { FireplaceRenderer } from './fire.js';

// ==========================================================================
// Application & Room Setup
// ==========================================================================

// Generate readable cozy room names
function generateCozyRoomId() {
  const adjectives = ['cozy', 'warm', 'snug', 'silent', 'peaceful', 'misty', 'soft', 'dreamy', 'glassy', 'amber'];
  const nouns = ['cabin', 'hearth', 'forest', 'fireplace', 'valley', 'shelter', 'retreat', 'cove', 'nook', 'lodge'];
  const num = Math.floor(1000 + Math.random() * 9000);
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}-${noun}-${num}`;
}

// Get or create Room ID from hash
let roomId = window.location.hash.slice(1);
if (!roomId) {
  roomId = generateCozyRoomId();
  window.location.hash = roomId;
}

// Update Room Name display
const roomDisplay = document.getElementById('room-name-display');
roomDisplay.textContent = roomId;

// Copy Room Link Button
const copyBtn = document.getElementById('copy-room-link');
copyBtn.addEventListener('click', () => {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    // Show copy feedback
    const originalHTML = copyBtn.innerHTML;
    copyBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" style="fill: #22c55e;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
    setTimeout(() => {
      copyBtn.innerHTML = originalHTML;
    }, 1500);
  });
});

// ==========================================================================
// Yjs Realtime Sync Initialization
// ==========================================================================
const ydoc = new Y.Doc();

// Connect WebRTC signaling servers (redundancy check)
const webrtcProvider = new WebrtcProvider('online-fireplace-' + roomId, ydoc, {
  signaling: [
    'wss://signaling.yjs.dev',
    'wss://y-webrtc-signaling-us.herokuapp.com',
    'wss://y-webrtc-signaling-de.herokuapp.com'
  ]
});

// Connect WebSocket fallback server
const websocketProvider = new WebsocketProvider('wss://demos.yjs.dev', 'online-fireplace-' + roomId, ydoc);

const awareness = webrtcProvider.awareness;

// Connection Status HUD Indicator
const statusIndicator = document.querySelector('.room-status-indicator');
let isConnected = false;

function updateConnectionStatus() {
  isConnected = webrtcProvider.connected || websocketProvider.connected;
  if (isConnected) {
    statusIndicator.className = 'room-status-indicator';
  } else {
    statusIndicator.className = 'room-status-indicator connecting';
  }
}

webrtcProvider.on('status', updateConnectionStatus);
websocketProvider.on('status', updateConnectionStatus);
setInterval(updateConnectionStatus, 3000);

// Shared States
const fireMap = ydoc.getMap('fire');
const logsArray = ydoc.getArray('logs');
const chatArray = ydoc.getArray('chat');
const sfxMap = ydoc.getMap('sfx');
const worryMap = ydoc.getMap('worry');

// Initialize Fire Map if empty
if (!fireMap.has('intensity')) {
  fireMap.set('intensity', 50);
  fireMap.set('lastUpdate', Date.now());
}

// ==========================================================================
// Fireplace Canvas & Setup
// ==========================================================================
const fireCanvas = document.getElementById('fire-canvas');
const fireplace = new FireplaceRenderer(fireCanvas);
fireplace.start();

// Local player profile variables
let nickname = localStorage.getItem('cozy-nickname') || '따뜻한 불멍객';
let userColor = localStorage.getItem('cozy-color') || '#ff7e33';
let currentTool = 'pointer'; // 'pointer', 'marshmallow'
let marshmallowRoastLevel = 0; // 0 to 100
let marshmallowState = 'raw';  // 'raw', 'toasted', 'burnt', 'fire', 'eaten'
let isRoastingNearFire = false;

// Profile DOM binding
const nameInput = document.getElementById('nickname-input');
const colorPicker = document.getElementById('user-color-picker');

nameInput.value = nickname;
colorPicker.value = userColor;

// Update local awareness settings
function updateLocalAwareness() {
  awareness.setLocalStateField('user', {
    name: nickname,
    color: userColor,
    tool: currentTool,
    marshmallowState: marshmallowState,
    marshmallowRoastLevel: marshmallowRoastLevel,
    x: -100, // hidden initially
    y: -100
  });
}

// Set up event listeners for inputs
nameInput.addEventListener('input', (e) => {
  nickname = e.target.value || '불멍객';
  localStorage.setItem('cozy-nickname', nickname);
  updateLocalAwareness();
  renderVisitorsList();
});

colorPicker.addEventListener('change', (e) => {
  userColor = e.target.value;
  localStorage.setItem('cozy-color', userColor);
  updateLocalAwareness();
  renderVisitorsList();
});

// Welcome Modal Setup
const welcomeModal = document.getElementById('welcome-modal');
const startAppBtn = document.getElementById('start-app-btn');
const welcomeNameInput = document.getElementById('welcome-name');

welcomeNameInput.value = nickname;

startAppBtn.addEventListener('click', () => {
  nickname = welcomeNameInput.value || '따뜻한 불멍객';
  localStorage.setItem('cozy-nickname', nickname);
  nameInput.value = nickname;
  
  // Close Welcome screen
  welcomeModal.classList.add('hidden');
  
  // Init Audio Context (Consent given)
  audio.init();
  
  // Connect and announce join in chat
  updateLocalAwareness();
  sendSystemChatMessage(`${nickname}님이 아늑한 방에 들어왔습니다.`);
});

// ==========================================================================
// Leader-less Fire State Decay & Ticker (Synced)
// ==========================================================================

function getSortedClients() {
  return Array.from(awareness.getStates().keys()).sort();
}

function checkIsLeader() {
  const clients = getSortedClients();
  return clients[0] === ydoc.clientID;
}

// Synced loop checking fire decay (ticking every 1.5s)
setInterval(() => {
  if (!checkIsLeader()) return; // Only the leader updates CRDT

  const intensity = fireMap.get('intensity');
  const lastUpdate = fireMap.get('lastUpdate') || Date.now();
  const now = Date.now();
  const elapsed = (now - lastUpdate) / 1000;

  if (elapsed < 1.0) return;

  // 1. Decay fire intensity slowly (1.2 points per second)
  let newIntensity = intensity - (elapsed * 1.2);
  
  // Decay even faster if there are no logs left!
  const activeLogs = logsArray.toArray();
  if (activeLogs.length === 0) {
    newIntensity -= (elapsed * 2.5); // decay faster if empty
  }
  
  newIntensity = Math.max(10, Math.round(newIntensity));

  // 2. Age logs and calculate burn progress
  const updatedLogs = [];
  let logsChanged = false;

  activeLogs.forEach((log) => {
    // A log burns completely in 150 seconds (0.0067 progress per second)
    const burnSpeed = 0.0067;
    const nextProgress = log.burnProgress + (elapsed * burnSpeed);
    
    if (nextProgress < 1.0) {
      updatedLogs.push({
        ...log,
        burnProgress: nextProgress
      });
    } else {
      logsChanged = true; // log burned out completely, deleted
    }
  });

  // Write changes back to transaction
  ydoc.transact(() => {
    fireMap.set('intensity', newIntensity);
    fireMap.set('lastUpdate', now);
    
    if (logsChanged || updatedLogs.length !== activeLogs.length) {
      logsArray.delete(0, logsArray.length);
      logsArray.insert(0, updatedLogs);
    } else {
      // Just update progress
      logsArray.delete(0, logsArray.length);
      logsArray.insert(0, updatedLogs);
    }
  });
}, 1500);

// Observe changes to fire maps
fireMap.observe(() => {
  const intensity = fireMap.get('intensity') || 50;
  fireplace.syncState(logsArray.toArray(), intensity);
  audio.adjustFireIntensity(intensity);
});

logsArray.observe(() => {
  const intensity = fireMap.get('intensity') || 50;
  fireplace.syncState(logsArray.toArray(), intensity);
});

// ==========================================================================
// User Interaction Controls (Toss Wood, Roast, SFX, Worries)
// ==========================================================================

// 1. Toss Wood / Add Log
const addLogBtn = document.getElementById('add-log-btn');
addLogBtn.addEventListener('click', () => {
  audio.init(); // safety resume
  
  const intensity = fireMap.get('intensity') || 50;
  const currentLogs = logsArray.toArray();
  
  if (currentLogs.length >= 10) {
    // Room is full of logs, don't allow infinite pile
    return;
  }

  const newLog = {
    id: Math.random().toString(),
    addedBy: nickname,
    addedAt: Date.now(),
    burnProgress: 0
  };

  ydoc.transact(() => {
    logsArray.push([newLog]);
    // Boost fire intensity (15 points per log)
    fireMap.set('intensity', Math.min(100, intensity + 15));
    fireMap.set('lastUpdate', Date.now());
  });

  // Visual burst on all clients via canvas spark effect trigger
  fireplace.burstSparks(15);
  audio.triggerSFX('crackle-pop');
});

// 2. Roast Marshmallow Toggle
const roastBtn = document.getElementById('roast-marshmallow-btn');
roastBtn.addEventListener('click', () => {
  audio.init();
  if (currentTool === 'marshmallow') {
    currentTool = 'pointer';
    roastBtn.classList.remove('active');
  } else {
    currentTool = 'marshmallow';
    roastBtn.classList.add('active');
  }
  updateLocalAwareness();
});

// Marshmallow Roasting Ticker Loop (Local ticking, synced to awareness)
setInterval(() => {
  if (currentTool !== 'marshmallow') return;

  if (isRoastingNearFire && marshmallowState !== 'eaten') {
    marshmallowRoastLevel += 1.5;

    // Transition state
    if (marshmallowRoastLevel >= 150) {
      if (marshmallowState !== 'fire') {
        marshmallowState = 'fire';
        audio.triggerSFX('crackle-pop'); // crackle sound when catches fire!
      }
    } else if (marshmallowRoastLevel >= 95) {
      marshmallowState = 'burnt';
    } else if (marshmallowRoastLevel >= 45) {
      marshmallowState = 'toasted';
    } else {
      marshmallowState = 'raw';
    }
  }

  // Update local awareness coordinates and details
  updateLocalAwareness();
}, 200);

// Eat Marshmallow handler (click anywhere or on stick when roasted)
window.addEventListener('mousedown', (e) => {
  if (currentTool === 'marshmallow' && marshmallowState !== 'raw') {
    // Eat it!
    audio.init();
    
    // Munch sound synthesized
    audio.triggerSFX('crackle-pop');
    
    marshmallowState = 'raw';
    marshmallowRoastLevel = 0;
    updateLocalAwareness();
    
    // Spawn floating "Munch!" text
    spawnFloatingMunch(e.clientX, e.clientY);
  }
});

function spawnFloatingMunch(x, y) {
  const munch = document.createElement('div');
  munch.className = 'floating-reaction';
  munch.style.left = `${x}px`;
  munch.style.top = `${y}px`;
  munch.innerText = '😋 바삭!';
  document.body.appendChild(munch);
  setTimeout(() => munch.remove(), 1800);
}

// 3. Burn Your Worries Modal
const burnWorryBtn = document.getElementById('burn-worry-btn');
const worryModal = document.getElementById('worry-modal');
const closeWorryBtn = document.getElementById('close-worry-modal');
const submitWorryBtn = document.getElementById('submit-worry-btn');
const worryTextArea = document.getElementById('worry-text');

burnWorryBtn.addEventListener('click', () => {
  audio.init();
  worryModal.classList.remove('hidden');
  worryTextArea.value = '';
  worryTextArea.focus();
});

closeWorryBtn.addEventListener('click', () => {
  worryModal.classList.add('hidden');
});

submitWorryBtn.addEventListener('click', () => {
  const text = worryTextArea.value.trim();
  if (!text) return;

  // Sync animation start coordinates (from bottom/side randomly)
  const animPayload = {
    id: Math.random().toString(),
    text: text,
    startX: Math.random() < 0.5 ? -150 : window.innerWidth + 50,
    startY: window.innerHeight - 200 + Math.random() * 100,
    timestamp: Date.now()
  };

  // Broadcast worry events
  worryMap.set('lastWorry', animPayload);
  
  worryModal.classList.add('hidden');
});

// Observe worry event to play animation on all screens
worryMap.observe((event) => {
  const lastWorry = worryMap.get('lastWorry');
  if (!lastWorry || Date.now() - lastWorry.timestamp > 3000) return;

  triggerWorryAnimation(lastWorry.text, lastWorry.startX, lastWorry.startY);
});

function triggerWorryAnimation(text, startX, startY) {
  const worryLayer = document.getElementById('worry-animation-layer');
  
  // Find fireplace coordinates for destination
  const fRect = fireCanvas.getBoundingClientRect();
  const destX = fRect.left + fRect.width / 2 - 70; // half worry-paper width
  const destY = fRect.top + fRect.height / 2 + 30;

  const paper = document.createElement('div');
  paper.className = 'worry-paper';
  paper.innerText = text;

  // Set randomized rotation angles for physics feeling
  const startRot = Math.floor(Math.random() * 60 - 30);
  const midRot = Math.floor(Math.random() * 180 - 90);
  const destRot = Math.floor(Math.random() * 360 - 180);

  // Set CSS keyframe variables
  paper.style.setProperty('--start-x', `${startX}px`);
  paper.style.setProperty('--start-y', `${startY}px`);
  paper.style.setProperty('--start-rot', `${startRot}deg`);
  
  // Arching flight path
  const midX = (startX + destX) / 2;
  const midY = Math.min(startY, destY) - 150;
  paper.style.setProperty('--mid-x', `${midX}px`);
  paper.style.setProperty('--mid-y', `${midY}px`);
  paper.style.setProperty('--mid-rot', `${midRot}deg`);

  paper.style.setProperty('--dest-x', `${destX}px`);
  paper.style.setProperty('--dest-y', `${destY}px`);
  paper.style.setProperty('--dest-rot', `${destRot}deg`);

  worryLayer.appendChild(paper);

  // Trigger spark bursts when it hits the fire (around 3.0s)
  setTimeout(() => {
    fireplace.burstSparks(18);
    audio.triggerSFX('crackle-pop');
  }, 2800);

  // Cleanup
  setTimeout(() => {
    paper.remove();
  }, 4600);
}

// 4. Collaborative Soundboard Buttons
const sfxButtons = document.querySelectorAll('.btn-sfx');
sfxButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.init();
    const sfxName = btn.dataset.sfx;
    sfxMap.set('trigger', {
      name: sfxName,
      timestamp: Date.now(),
      sender: ydoc.clientID
    });
  });
});

// Observe soundboard triggers
sfxMap.observe(() => {
  const trigger = sfxMap.get('trigger');
  if (!trigger) return;
  // Play locally
  audio.triggerSFX(trigger.name);
  
  // Draw small floating instrument icon over sender's cursor if found
  const senderId = trigger.sender;
  if (senderId !== ydoc.clientID) {
    const states = awareness.getStates();
    const senderState = states.get(senderId);
    if (senderState && senderState.user) {
      const emojiMap = { guitar: '🎸', chime: '🔔', owl: '🦉', 'crackle-pop': '💥' };
      spawnFloatingEmojiAtCursor(senderId, emojiMap[trigger.name] || '🎵');
    }
  }
});

// 5. Sound Mixer volumes mapping
const muteBtn = document.getElementById('global-mute-btn');
const volFire = document.getElementById('volume-fire');
const volRain = document.getElementById('volume-rain');
const volWind = document.getElementById('volume-wind');
const volMusic = document.getElementById('volume-music');

let isMuted = false;

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  audio.setMute(isMuted);
  muteBtn.style.borderColor = isMuted ? '#ef4444' : 'rgba(255, 255, 255, 0.08)';
  
  const muteIcon = document.getElementById('mute-icon');
  if (isMuted) {
    muteIcon.innerHTML = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
  } else {
    muteIcon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
  }
});

// Connect range controllers
volFire.addEventListener('input', (e) => audio.setVolume('fire', e.target.value / 100));
volRain.addEventListener('input', (e) => audio.setVolume('rain', e.target.value / 100));
volWind.addEventListener('input', (e) => audio.setVolume('wind', e.target.value / 100));
volMusic.addEventListener('input', (e) => audio.setVolume('music', e.target.value / 100));

// ==========================================================================
// Cursors, Hover Sync, Emoji Reactions awareness mapping
// ==========================================================================

const cursorLayer = document.getElementById('cursor-layer');

// Update mouse coordinates relative to window viewport
window.addEventListener('mousemove', (e) => {
  const xPercent = (e.clientX / window.innerWidth) * 100;
  const yPercent = (e.clientY / window.innerHeight) * 100;
  
  // Detect if marshmallow is roasting near the fireplace canvas
  if (currentTool === 'marshmallow') {
    const fRect = fireCanvas.getBoundingClientRect();
    isRoastingNearFire = (
      e.clientX >= fRect.left &&
      e.clientX <= fRect.right &&
      e.clientY >= fRect.top &&
      e.clientY <= fRect.bottom
    );
  } else {
    isRoastingNearFire = false;
  }

  awareness.setLocalStateField('user', {
    name: nickname,
    color: userColor,
    tool: currentTool,
    marshmallowState: marshmallowState,
    marshmallowRoastLevel: marshmallowRoastLevel,
    x: xPercent,
    y: yPercent
  });
});

// Render remote cursors on awareness change
awareness.on('change', () => {
  // Clear other cursors DOM
  const existingCursors = cursorLayer.querySelectorAll('.multi-cursor');
  existingCursors.forEach(c => c.remove());

  const states = awareness.getStates();
  states.forEach((clientState, clientId) => {
    if (clientId === ydoc.clientID) return; // skip self

    const user = clientState.user;
    if (!user || user.x === undefined || user.x < 0) return;

    // Build remote cursor representation
    const cursorEl = document.createElement('div');
    cursorEl.className = 'multi-cursor';
    cursorEl.dataset.clientid = clientId;

    const absX = (user.x / 100) * window.innerWidth;
    const absY = (user.y / 100) * window.innerHeight;
    cursorEl.style.transform = `translate(${absX}px, ${absY}px)`;

    // Colored pointer SVG
    const pointer = document.createElement('div');
    pointer.className = 'cursor-pointer';
    pointer.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M4 4l5 16 3-6 6-3z" fill="${user.color}" stroke="#000" stroke-width="2"/>
      </svg>
    `;
    cursorEl.appendChild(pointer);

    // Name tag
    const label = document.createElement('div');
    label.className = 'cursor-label';
    label.style.backgroundColor = user.color;
    label.innerText = user.name;
    
    // Add equipped badge details
    if (user.tool === 'marshmallow') {
      const badge = document.createElement('span');
      badge.className = 'cursor-badge';
      
      const stateLabels = { raw: '🍡 굽는 중', toasted: '😋 노릇노릇', burnt: '💀 태움', fire: '🔥 불붙음!' };
      badge.innerText = stateLabels[user.marshmallowState] || '🍡';
      label.appendChild(badge);

      // Render actual stick visual stretching into fireplace
      const stick = document.createElement('div');
      stick.className = 'marshmallow-stick-held';
      
      const mHead = document.createElement('div');
      mHead.className = `marshmallow-head ${user.marshmallowState}`;
      stick.appendChild(mHead);
      
      cursorEl.appendChild(stick);
    }
    
    cursorEl.appendChild(label);
    cursorLayer.appendChild(cursorEl);
  });

  renderVisitorsList();
});

// Render Visitors list in HUD
function renderVisitorsList() {
  const visitorsList = document.getElementById('visitors-list');
  const countDisplay = document.getElementById('visitor-count');
  
  visitorsList.innerHTML = '';
  const states = awareness.getStates();
  
  // Render Self profile
  const selfItem = document.createElement('div');
  selfItem.className = 'visitor-item';
  selfItem.innerHTML = `
    <span class="visitor-color-dot" style="background-color: ${userColor};"></span>
    <span class="visitor-name is-me">${nickname}</span>
  `;
  visitorsList.appendChild(selfItem);

  let count = 1;
  
  // Render others
  states.forEach((clientState, clientId) => {
    if (clientId === ydoc.clientID) return;
    const user = clientState.user;
    if (!user) return;
    
    count++;
    const item = document.createElement('div');
    item.className = 'visitor-item';
    item.innerHTML = `
      <span class="visitor-color-dot" style="background-color: ${user.color || '#ccc'};"></span>
      <span class="visitor-name">${user.name || '불멍객'}</span>
    `;
    visitorsList.appendChild(item);
  });

  countDisplay.innerText = count;
}

// 6. Emoji reactions burst
const reactionTriggers = document.querySelectorAll('.btn-reaction-trigger');
reactionTriggers.forEach((btn) => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.emoji;
    triggerLocalReaction(emoji);
    
    // Broadcast reaction stamp to awareness
    awareness.setLocalStateField('reaction', {
      emoji: emoji,
      timestamp: Date.now()
    });
  });
});

// Keyboard reactions shortcuts (1 to 6)
window.addEventListener('keydown', (e) => {
  const keyMap = { '1': '🔥', '2': '🪵', '3': '❤️', '4': '☕', '5': '✨', '6': '💤' };
  const emoji = keyMap[e.key];
  if (emoji) {
    // Check if focused on input fields
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    
    triggerLocalReaction(emoji);
    awareness.setLocalStateField('reaction', {
      emoji: emoji,
      timestamp: Date.now()
    });
  }
});

// Local animation trigger
function triggerLocalReaction(emoji) {
  // Find local mouse pos or default to center
  const states = awareness.getLocalState();
  const rawX = states ? (states.user.x / 100) * window.innerWidth : window.innerWidth / 2;
  const rawY = states ? (states.user.y / 100) * window.innerHeight : window.innerHeight / 2;
  
  spawnFloatingReaction(emoji, rawX, rawY);
}

function spawnFloatingReaction(emoji, x, y) {
  const container = document.body;
  const div = document.createElement('div');
  div.className = 'floating-reaction';
  div.innerText = emoji;
  div.style.left = `${x - 15}px`;
  div.style.top = `${y - 15}px`;
  
  container.appendChild(div);
  setTimeout(() => div.remove(), 1800);
}

// Observe remote client reactions via awareness updates
awareness.on('update', ({ added, updated, removed }) => {
  const states = awareness.getStates();
  
  // Check changed peers
  const peers = [...added, ...updated];
  peers.forEach((peerId) => {
    if (peerId === ydoc.clientID) return;
    
    const state = states.get(peerId);
    if (!state || !state.reaction) return;
    
    // Check if reaction is fresh (triggered in last 1.2s)
    const rx = state.reaction;
    const isFresh = (Date.now() - rx.timestamp) < 1200;
    
    // Check cache to avoid double triggers
    const cacheKey = `rx-peer-${peerId}`;
    const lastStamp = window[cacheKey] || 0;
    
    if (isFresh && rx.timestamp > lastStamp) {
      window[cacheKey] = rx.timestamp;
      
      const user = state.user;
      if (user && user.x !== undefined) {
        const absX = (user.x / 100) * window.innerWidth;
        const absY = (user.y / 100) * window.innerHeight;
        spawnFloatingReaction(rx.emoji, absX, absY);
      }
    }
  });
});

function spawnFloatingEmojiAtCursor(peerId, emoji) {
  const states = awareness.getStates();
  const state = states.get(peerId);
  if (state && state.user && state.user.x !== undefined) {
    const absX = (state.user.x / 100) * window.innerWidth;
    const absY = (state.user.y / 100) * window.innerHeight;
    spawnFloatingReaction(emoji, absX, absY);
  }
}

// ==========================================================================
// Ephemeral Cozy Chat Sidebar
// ==========================================================================

const toggleChatBtn = document.getElementById('toggle-chat-btn');
const chatSidebar = document.getElementById('chat-sidebar');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const chatBadge = document.getElementById('chat-badge');

let unreadCount = 0;

toggleChatBtn.addEventListener('click', () => {
  chatSidebar.classList.toggle('collapsed');
  
  if (!chatSidebar.classList.contains('collapsed')) {
    unreadCount = 0;
    chatBadge.classList.add('hidden');
    chatInput.focus();
  }
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const body = chatInput.value.trim();
  if (!body) return;

  const msg = {
    id: Math.random().toString(),
    author: nickname,
    authorColor: userColor,
    body: body,
    timestamp: Date.now()
  };

  ydoc.transact(() => {
    chatArray.push([msg]);
    
    // Ephemeral limitation: Keep chat records small (max 50) to prevent CRDT growth
    if (chatArray.length > 50) {
      chatArray.delete(0, chatArray.length - 50);
    }
  });

  chatInput.value = '';
});

// Send system messages
function sendSystemChatMessage(body) {
  const msg = {
    id: Math.random().toString(),
    author: 'SYSTEM',
    body: body,
    timestamp: Date.now()
  };
  ydoc.transact(() => {
    chatArray.push([msg]);
    if (chatArray.length > 50) {
      chatArray.delete(0, chatArray.length - 50);
    }
  });
}

// Render Chat log from CRDT changes
chatArray.observe((event) => {
  renderChatMessages();

  // Increment badge if chat is collapsed
  if (chatSidebar.classList.contains('collapsed')) {
    const addedCount = event.changes.added.size;
    if (addedCount > 0) {
      unreadCount += addedCount;
      chatBadge.innerText = unreadCount;
      chatBadge.classList.remove('hidden');
    }
  }
});

function renderChatMessages() {
  chatMessages.innerHTML = '';
  const list = chatArray.toArray();
  
  list.forEach((msg) => {
    const msgEl = document.createElement('div');
    
    if (msg.author === 'SYSTEM') {
      msgEl.className = 'chat-msg system';
      msgEl.innerHTML = `<div class="chat-msg-body">${msg.body}</div>`;
    } else {
      const isSelf = msg.author === nickname && msg.authorColor === userColor;
      msgEl.className = isSelf ? 'chat-msg self' : 'chat-msg';
      
      msgEl.innerHTML = `
        <span class="chat-msg-author" style="color: ${msg.authorColor};">${msg.author}</span>
        <div class="chat-msg-body">${escapeHTML(msg.body)}</div>
      `;
    }
    chatMessages.appendChild(msgEl);
  });
  
  // Auto scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
