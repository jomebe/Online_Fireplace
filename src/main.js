import './style.css';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import { audio } from './audio.js';
import { FireplaceRenderer } from './fire.js';

// ==========================================================================
// Room selection / UI State variables
// ==========================================================================

let activeRoomId = 'global-lobby'; // Default room
let nickname = localStorage.getItem('cozy-nickname') || '따뜻한 불멍객';
let userColor = localStorage.getItem('cozy-color') || '#ff7e33';

// DOM elements
const welcomeModal = document.getElementById('welcome-modal');
const startAppBtn = document.getElementById('start-app-btn');
const welcomeNameInput = document.getElementById('welcome-name');
const lobbySelectBtn = document.getElementById('lobby-select-btn');
const customSelectBtn = document.getElementById('custom-select-btn');
const customRoomField = document.getElementById('custom-room-field');
const welcomeRoomInput = document.getElementById('welcome-room-id');

const nameInput = document.getElementById('nickname-input');
const colorPicker = document.getElementById('user-color-picker');
const roomDisplay = document.getElementById('room-name-display');
const copyRoomBtn = document.getElementById('copy-room-link');
const changeRoomBtn = document.getElementById('change-room-btn');

const actionHelperTooltip = document.getElementById('action-helper-tooltip');
const helperTooltipEmoji = document.getElementById('helper-tooltip-emoji');
const helperTooltipText = document.getElementById('helper-tooltip-text');

// Pre-fill profile details
welcomeNameInput.value = nickname;
nameInput.value = nickname;
colorPicker.value = userColor;

// Detect initial URL hash (if shared by a friend)
const initialHash = window.location.hash.slice(1);
if (initialHash) {
  activeRoomId = initialHash;
  welcomeRoomInput.value = initialHash;
  // Select Custom Room option by default since they came via a direct link
  lobbySelectBtn.classList.remove('active');
  lobbySelectBtn.style.background = 'rgba(255,255,255,0.05)';
  lobbySelectBtn.style.fontWeight = '500';
  lobbySelectBtn.style.border = '1px solid rgba(255,255,255,0.08)';

  customSelectBtn.classList.add('active');
  customSelectBtn.style.background = 'var(--color-accent)';
  customSelectBtn.style.fontWeight = '600';
  customRoomField.classList.remove('hidden');
}

// Room selection click events in welcome screen
lobbySelectBtn.addEventListener('click', () => {
  lobbySelectBtn.classList.add('active');
  lobbySelectBtn.style.background = 'var(--color-accent)';
  lobbySelectBtn.style.fontWeight = '600';
  
  customSelectBtn.classList.remove('active');
  customSelectBtn.style.background = 'rgba(255,255,255,0.05)';
  customSelectBtn.style.fontWeight = '500';
  customSelectBtn.style.border = '1px solid rgba(255,255,255,0.08)';
  
  customRoomField.classList.add('hidden');
});

customSelectBtn.addEventListener('click', () => {
  customSelectBtn.classList.add('active');
  customSelectBtn.style.background = 'var(--color-accent)';
  customSelectBtn.style.fontWeight = '600';
  
  lobbySelectBtn.classList.remove('active');
  lobbySelectBtn.style.background = 'rgba(255,255,255,0.05)';
  lobbySelectBtn.style.fontWeight = '500';
  lobbySelectBtn.style.border = '1px solid rgba(255,255,255,0.08)';
  
  customRoomField.classList.remove('hidden');
  welcomeRoomInput.focus();
});

// Setup Fireplace Canvas Renderer (runs locally immediately)
const fireCanvas = document.getElementById('fire-canvas');
const fireplace = new FireplaceRenderer(fireCanvas);
fireplace.start();

// Profile Variables (Local)
let currentTool = 'pointer'; // 'pointer', 'marshmallow'
let marshmallowRoastLevel = 0;
let marshmallowState = 'raw'; // 'raw', 'toasted', 'burnt', 'fire'
let isRoastingNearFire = false;

// ==========================================================================
// Yjs Init and Connection Bootstrapper
// ==========================================================================

let ydoc, webrtcProvider, websocketProvider, awareness;
let fireMap, logsArray, chatArray, sfxMap, worryMap;

function joinCozyRoom(roomId) {
  activeRoomId = roomId;
  window.location.hash = roomId;
  roomDisplay.textContent = roomId;

  // Initialize Yjs Document
  ydoc = new Y.Doc();

  // Connect WebRTC signaling (P2P)
  webrtcProvider = new WebrtcProvider('online-fireplace-' + roomId, ydoc, {
    signaling: [
      'wss://signaling.yjs.dev',
      'wss://y-webrtc-signaling-us.herokuapp.com',
      'wss://y-webrtc-signaling-de.herokuapp.com'
    ]
  });

  // Connect WebSocket Fallback, sharing the exact same awareness object
  websocketProvider = new WebsocketProvider('wss://demos.yjs.dev', 'online-fireplace-' + roomId, ydoc, {
    awareness: webrtcProvider.awareness
  });
  
  awareness = webrtcProvider.awareness;

  // Connection Indicator setup
  const statusIndicator = document.querySelector('.room-status-indicator');
  
  const updateStatus = () => {
    const isConnected = webrtcProvider.connected || websocketProvider.connected;
    statusIndicator.className = isConnected ? 'room-status-indicator' : 'room-status-indicator connecting';
  };
  
  webrtcProvider.on('status', updateStatus);
  websocketProvider.on('status', updateStatus);
  setInterval(updateStatus, 3000);

  // Initialize Shared Maps
  fireMap = ydoc.getMap('fire');
  logsArray = ydoc.getArray('logs');
  chatArray = ydoc.getArray('chat');
  sfxMap = ydoc.getMap('sfx');
  worryMap = ydoc.getMap('worry');

  // Lead-less setup of initial values
  if (!fireMap.has('intensity')) {
    fireMap.set('intensity', 50);
    fireMap.set('lastUpdate', Date.now());
  }

  // FORCE INITIAL SYNC IMMEDIATELY
  const initSync = () => {
    const intensity = fireMap.get('intensity') || 50;
    fireplace.syncState(logsArray.toArray(), intensity);
    audio.adjustFireIntensity(intensity);
    renderVisitorsList();
  };

  // Sync when doc is loaded and on provider synced signals
  setTimeout(initSync, 100);
  webrtcProvider.on('synced', initSync);
  websocketProvider.on('synced', initSync);

  // Setup Observers
  fireMap.observe(() => {
    const intensity = fireMap.get('intensity') || 50;
    fireplace.syncState(logsArray.toArray(), intensity);
    audio.adjustFireIntensity(intensity);
  });

  logsArray.observe(() => {
    const intensity = fireMap.get('intensity') || 50;
    fireplace.syncState(logsArray.toArray(), intensity);
  });

  chatArray.observe((event) => {
    renderChatMessages();
    // Chat badge notifications
    const chatSidebar = document.getElementById('chat-sidebar');
    if (chatSidebar.classList.contains('collapsed')) {
      const addedCount = event.changes.added.size;
      if (addedCount > 0) {
        const chatBadge = document.getElementById('chat-badge');
        let unread = parseInt(chatBadge.innerText || '0') + addedCount;
        chatBadge.innerText = unread;
        chatBadge.classList.remove('hidden');
      }
    }
  });

  sfxMap.observe(() => {
    const trigger = sfxMap.get('trigger');
    if (!trigger) return;
    audio.triggerSFX(trigger.name);
    
    // Draw sfx floating emoji
    if (trigger.sender !== ydoc.clientID) {
      const emojiMap = { guitar: '🎸', chime: '🔔', owl: '🦉', 'crackle-pop': '💥' };
      spawnFloatingEmojiAtCursor(trigger.sender, emojiMap[trigger.name] || '🎵');
    }
  });

  worryMap.observe(() => {
    const lastWorry = worryMap.get('lastWorry');
    if (!lastWorry || Date.now() - lastWorry.timestamp > 3000) return;
    triggerWorryAnimation(lastWorry.text, lastWorry.startX, lastWorry.startY);
  });

  // Setup Awareness listeners
  awareness.on('change', () => {
    // Clear and draw remote cursors
    const existing = document.querySelectorAll('.multi-cursor');
    existing.forEach(e => e.remove());

    const states = awareness.getStates();
    states.forEach((clientState, clientId) => {
      if (clientId === ydoc.clientID) return;
      const u = clientState.user;
      if (!u || u.x === undefined || u.x < 0) return;

      const cursorEl = document.createElement('div');
      cursorEl.className = 'multi-cursor';
      const absX = (u.x / 100) * window.innerWidth;
      const absY = (u.y / 100) * window.innerHeight;
      cursorEl.style.transform = `translate(${absX}px, ${absY}px)`;

      const pointer = document.createElement('div');
      pointer.className = 'cursor-pointer';
      pointer.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 4l5 16 3-6 6-3z" fill="${u.color}" stroke="#000" stroke-width="2"/></svg>`;
      cursorEl.appendChild(pointer);

      const label = document.createElement('div');
      label.className = 'cursor-label';
      label.style.backgroundColor = u.color;
      label.innerText = u.name;

      if (u.tool === 'marshmallow') {
        const badge = document.createElement('span');
        badge.className = 'cursor-badge';
        const labels = { raw: '🍡 굽는 중', toasted: '😋 노릇노릇', burnt: '💀 태움', fire: '🔥 불붙음!' };
        badge.innerText = labels[u.marshmallowState] || '🍡';
        label.appendChild(badge);

        const stick = document.createElement('div');
        stick.className = 'marshmallow-stick-held';
        const mHead = document.createElement('div');
        mHead.className = `marshmallow-head ${u.marshmallowState}`;
        stick.appendChild(mHead);
        cursorEl.appendChild(stick);
      }

      cursorEl.appendChild(label);
      document.getElementById('cursor-layer').appendChild(cursorEl);
    });

    renderVisitorsList();
  });

  // Awareness remote reaction streams
  awareness.on('update', ({ added, updated }) => {
    const states = awareness.getStates();
    const peers = [...added, ...updated];
    peers.forEach(peerId => {
      if (peerId === ydoc.clientID) return;
      const state = states.get(peerId);
      if (state && state.reaction) {
        const rx = state.reaction;
        const isFresh = (Date.now() - rx.timestamp) < 1200;
        const cacheKey = `rx-peer-${peerId}`;
        if (isFresh && rx.timestamp > (window[cacheKey] || 0)) {
          window[cacheKey] = rx.timestamp;
          if (state.user && state.user.x !== undefined) {
            const absX = (state.user.x / 100) * window.innerWidth;
            const absY = (state.user.y / 100) * window.innerHeight;
            spawnFloatingReaction(rx.emoji, absX, absY);
          }
        }
      }
    });
  });

  // Setup Decay Ticker (Leader-only)
  setupDecayTicker();

  // Announce Join
  updateLocalAwareness();
  sendSystemChatMessage(`${nickname}님이 아늑한 방에 입장했습니다.`);
}

// ==========================================================================
// Welcome App trigger
// ==========================================================================
startAppBtn.addEventListener('click', () => {
  nickname = welcomeNameInput.value.trim() || '따뜻한 불멍객';
  localStorage.setItem('cozy-nickname', nickname);
  nameInput.value = nickname;

  // Resolve selected room ID
  let targetRoom = 'global-lobby';
  if (customSelectBtn.classList.contains('active')) {
    const inputVal = welcomeRoomInput.value.trim().replace(/[^a-zA-Z0-9-_]/g, '');
    targetRoom = inputVal || 'cozy-lodge';
  }

  welcomeModal.classList.add('hidden');
  audio.init();

  // Boot up multiplayer sync
  joinCozyRoom(targetRoom);
});

// ==========================================================================
// Top Left HUD Actions (Copy / Change Room)
// ==========================================================================

copyRoomBtn.addEventListener('click', () => {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    const originalHTML = copyRoomBtn.innerHTML;
    copyRoomBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" style="fill: #22c55e;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
    setTimeout(() => copyRoomBtn.innerHTML = originalHTML, 1500);
  });
});

changeRoomBtn.addEventListener('click', () => {
  const input = prompt("이동하거나 새로 만들 방 이름을 입력하세요:\n(글로벌 로비로 가려면 비워두세요)", activeRoomId === 'global-lobby' ? '' : activeRoomId);
  if (input === null) return; // cancel
  
  const cleanRoom = input.trim().replace(/[^a-zA-Z0-9-_]/g, '');
  window.location.hash = cleanRoom || '';
  window.location.reload();
});

// Profile inputs binding
nameInput.addEventListener('input', (e) => {
  nickname = e.target.value.trim() || '불멍객';
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

function updateLocalAwareness() {
  if (!awareness) return;
  awareness.setLocalStateField('user', {
    name: nickname,
    color: userColor,
    tool: currentTool,
    marshmallowState: marshmallowState,
    marshmallowRoastLevel: marshmallowRoastLevel,
    x: awareness.getLocalState()?.user?.x || -100,
    y: awareness.getLocalState()?.user?.y || -100
  });
}

// ==========================================================================
// Action Listeners (Add Log, Roast, Worry, Soundboard)
// ==========================================================================

// Add Log
document.getElementById('add-log-btn').addEventListener('click', () => {
  audio.init();
  if (!ydoc) return;

  const currentLogs = logsArray.toArray();
  if (currentLogs.length >= 8) {
    alert("화로에 장작이 가득 찼습니다! 기존 장작이 탈 때까지 잠시 기다려 주세요.");
    return;
  }

  const intensity = fireMap.get('intensity') || 50;
  const newLog = {
    id: Math.random().toString(),
    addedBy: nickname,
    addedAt: Date.now(),
    burnProgress: 0
  };

  ydoc.transact(() => {
    logsArray.push([newLog]);
    // Boost fire intensity (20 points per log)
    fireMap.set('intensity', Math.min(100, intensity + 20));
    fireMap.set('lastUpdate', Date.now());
  });

  fireplace.burstSparks(15);
  audio.triggerSFX('crackle-pop');

  // Spawn visual floating "+1 장작" alert
  spawnFloatingText('🪵 장작 추가됨! (+20)', window.innerWidth / 2, window.innerHeight - 180);
});

function spawnFloatingText(text, x, y) {
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.innerText = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// Roast Marshmallow Toggle
const roastBtn = document.getElementById('roast-marshmallow-btn');
roastBtn.addEventListener('click', () => {
  audio.init();
  
  if (currentTool === 'marshmallow') {
    currentTool = 'pointer';
    roastBtn.classList.remove('active');
    actionHelperTooltip.classList.add('hidden');
  } else {
    currentTool = 'marshmallow';
    roastBtn.classList.add('active');
    actionHelperTooltip.classList.remove('hidden');
    updateTooltipContent();
  }
  updateLocalAwareness();
});

// Update dynamic marshmallow tooltip text
function updateTooltipContent() {
  let emoji = '🍡';
  let text = '불 근처로 마우스를 대면 마시멜로가 구워집니다!';

  if (marshmallowState === 'toasted') {
    emoji = '😋';
    text = '노릇노릇하게 구워졌습니다! 클릭하여 드세요!';
  } else if (marshmallowState === 'burnt') {
    emoji = '💀';
    text = '탄 마시멜로입니다! 클릭하여 새것으로 교체하세요.';
  } else if (marshmallowState === 'fire') {
    emoji = '🔥';
    text = '불이 붙었습니다! 얼른 클릭해서 끄세요!';
  } else if (isRoastingNearFire) {
    emoji = '🔥';
    text = `마시멜로 굽는 중... (${Math.round(marshmallowRoastLevel)}%)`;
  }

  helperTooltipEmoji.innerText = emoji;
  helperTooltipText.innerText = text;
}

// Track local player marshmallow roasting mechanics
setInterval(() => {
  if (currentTool !== 'marshmallow') return;

  if (isRoastingNearFire && marshmallowState !== 'eaten') {
    // Roasts 2.5 points per frame
    marshmallowRoastLevel += 2.5;

    if (marshmallowRoastLevel >= 130) {
      if (marshmallowState !== 'fire') {
        marshmallowState = 'fire';
        audio.triggerSFX('crackle-pop');
      }
    } else if (marshmallowRoastLevel >= 100) {
      marshmallowState = 'burnt';
    } else if (marshmallowRoastLevel >= 70) {
      marshmallowState = 'toasted';
    } else {
      marshmallowState = 'raw';
    }
    updateTooltipContent();
  }

  updateLocalAwareness();
}, 200);

// Eat / Extinguish marshmallow click
window.addEventListener('mousedown', (e) => {
  if (currentTool !== 'marshmallow') return;
  // Ignore clicks on HUD buttons
  if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return;

  if (marshmallowState === 'fire') {
    // Put out fire
    marshmallowState = 'burnt';
    marshmallowRoastLevel = 100;
    audio.triggerSFX('crackle-pop');
    spawnFloatingText('💨 후~ 불어서 끔!', e.clientX, e.clientY);
  } else if (marshmallowState === 'toasted' || marshmallowState === 'burnt') {
    // Eat it
    audio.triggerSFX('crackle-pop');
    spawnFloatingMunch(e.clientX, e.clientY, marshmallowState === 'toasted' ? '😋 냠냠 바삭!' : '💀 아우 탄맛..');
    
    marshmallowState = 'raw';
    marshmallowRoastLevel = 0;
  }
  updateTooltipContent();
  updateLocalAwareness();
});

function spawnFloatingMunch(x, y, text) {
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.innerText = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// Mouse positioning & dynamic helper tooltip follow
window.addEventListener('mousemove', (e) => {
  if (!awareness) return;

  const xPercent = (e.clientX / window.innerWidth) * 100;
  const yPercent = (e.clientY / window.innerHeight) * 100;

  if (currentTool === 'marshmallow') {
    const fRect = fireCanvas.getBoundingClientRect();
    isRoastingNearFire = (
      e.clientX >= fRect.left &&
      e.clientX <= fRect.right &&
      e.clientY >= fRect.top &&
      e.clientY <= fRect.bottom
    );
    
    // Position helper tooltip next to pointer
    actionHelperTooltip.style.left = `${e.clientX + 16}px`;
    actionHelperTooltip.style.top = `${e.clientY + 16}px`;
    updateTooltipContent();
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

// Worry Modal
const worryModal = document.getElementById('worry-modal');
const worryTextArea = document.getElementById('worry-text');

document.getElementById('burn-worry-btn').addEventListener('click', () => {
  audio.init();
  worryModal.classList.remove('hidden');
  worryTextArea.value = '';
  worryTextArea.focus();
});

document.getElementById('close-worry-modal').addEventListener('click', () => {
  worryModal.classList.add('hidden');
});

document.getElementById('submit-worry-btn').addEventListener('click', () => {
  const text = worryTextArea.value.trim();
  if (!text || !worryMap) return;

  const anim = {
    id: Math.random().toString(),
    text: text,
    startX: Math.random() < 0.5 ? -150 : window.innerWidth + 50,
    startY: window.innerHeight - 200 + Math.random() * 100,
    timestamp: Date.now()
  };

  worryMap.set('lastWorry', anim);
  worryModal.classList.add('hidden');
});

function triggerWorryAnimation(text, startX, startY) {
  const layer = document.getElementById('worry-animation-layer');
  const fRect = fireCanvas.getBoundingClientRect();
  const destX = fRect.left + fRect.width / 2 - 70;
  const destY = fRect.top + fRect.height / 2 + 30;

  const paper = document.createElement('div');
  paper.className = 'worry-paper';
  paper.innerText = text;

  const startRot = Math.floor(Math.random() * 60 - 30);
  const midRot = Math.floor(Math.random() * 180 - 90);
  const destRot = Math.floor(Math.random() * 360 - 180);

  paper.style.setProperty('--start-x', `${startX}px`);
  paper.style.setProperty('--start-y', `${startY}px`);
  paper.style.setProperty('--start-rot', `${startRot}deg`);

  const midX = (startX + destX) / 2;
  const midY = Math.min(startY, destY) - 150;
  paper.style.setProperty('--mid-x', `${midX}px`);
  paper.style.setProperty('--mid-y', `${midY}px`);
  paper.style.setProperty('--mid-rot', `${midRot}deg`);

  paper.style.setProperty('--dest-x', `${destX}px`);
  paper.style.setProperty('--dest-y', `${destY}px`);
  paper.style.setProperty('--dest-rot', `${destRot}deg`);

  layer.appendChild(paper);

  setTimeout(() => {
    fireplace.burstSparks(20);
    audio.triggerSFX('crackle-pop');
  }, 2800);

  setTimeout(() => paper.remove(), 4600);
}

// Soundboard instruments triggers
document.querySelectorAll('.btn-sfx').forEach(btn => {
  btn.addEventListener('click', () => {
    audio.init();
    if (!sfxMap) return;
    sfxMap.set('trigger', {
      name: btn.dataset.sfx,
      timestamp: Date.now(),
      sender: ydoc.clientID
    });
  });
});

// ==========================================================================
// Leader-elected Decay timer
// ==========================================================================
let decayInterval = null;

function setupDecayTicker() {
  if (decayInterval) clearInterval(decayInterval);

  decayInterval = setInterval(() => {
    // Only the leader client updates CRDT
    const clients = Array.from(awareness.getStates().keys()).sort();
    const isLeader = clients[0] === ydoc.clientID;
    if (!isLeader) return;

    const intensity = fireMap.get('intensity') || 50;
    const lastUpdate = fireMap.get('lastUpdate') || Date.now();
    const now = Date.now();
    const elapsed = (now - lastUpdate) / 1000;

    if (elapsed < 1.0) return;

    // Decay rate: 1.2 points/sec, or 2.5 points/sec if no logs
    let newIntensity = intensity - (elapsed * 1.2);
    const activeLogs = logsArray.toArray();
    if (activeLogs.length === 0) {
      newIntensity -= (elapsed * 2.5);
    }
    // Floor intensity cap at 30 to guarantee a cozy visual fireside glow
    newIntensity = Math.max(30, Math.round(newIntensity));

    // Age logs progress
    const updatedLogs = [];
    activeLogs.forEach(log => {
      const burnSpeed = 0.0067; // lasts 150 seconds
      const nextProgress = log.burnProgress + (elapsed * burnSpeed);
      if (nextProgress < 1.0) {
        updatedLogs.push({ ...log, burnProgress: nextProgress });
      }
    });

    ydoc.transact(() => {
      fireMap.set('intensity', newIntensity);
      fireMap.set('lastUpdate', now);
      logsArray.delete(0, logsArray.length);
      logsArray.insert(0, updatedLogs);
    });
  }, 1500);
}

// ==========================================================================
// Cursors & Chat List renderers
// ==========================================================================

function renderVisitorsList() {
  const visitorsList = document.getElementById('visitors-list');
  const countDisplay = document.getElementById('visitor-count');
  if (!visitorsList || !awareness) return;

  visitorsList.innerHTML = '';
  const states = awareness.getStates();

  const selfItem = document.createElement('div');
  selfItem.className = 'visitor-item';
  selfItem.innerHTML = `<span class="visitor-color-dot" style="background-color: ${userColor};"></span><span class="visitor-name is-me">${nickname}</span>`;
  visitorsList.appendChild(selfItem);

  let count = 1;
  states.forEach((clientState, clientId) => {
    if (clientId === ydoc.clientID) return;
    const u = clientState.user;
    if (!u) return;
    count++;

    const item = document.createElement('div');
    item.className = 'visitor-item';
    item.innerHTML = `<span class="visitor-color-dot" style="background-color: ${u.color || '#ccc'};"></span><span class="visitor-name">${u.name || '불멍객'}</span>`;
    visitorsList.appendChild(item);
  });

  countDisplay.innerText = count;
}

// Quick reaction triggers
document.querySelectorAll('.btn-reaction-trigger').forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.emoji;
    triggerLocalReaction(emoji);
    if (awareness) {
      awareness.setLocalStateField('reaction', { emoji, timestamp: Date.now() });
    }
  });
});

window.addEventListener('keydown', (e) => {
  const keys = { '1': '🔥', '2': '🪵', '3': '❤️', '4': '☕', '5': '✨', '6': '💤' };
  const emoji = keys[e.key];
  if (emoji) {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    triggerLocalReaction(emoji);
    if (awareness) {
      awareness.setLocalStateField('reaction', { emoji, timestamp: Date.now() });
    }
  }
});

function triggerLocalReaction(emoji) {
  const states = awareness?.getLocalState();
  const rawX = states?.user ? (states.user.x / 100) * window.innerWidth : window.innerWidth / 2;
  const rawY = states?.user ? (states.user.y / 100) * window.innerHeight : window.innerHeight / 2;
  spawnFloatingReaction(emoji, rawX, rawY);
}

function spawnFloatingReaction(emoji, x, y) {
  const div = document.createElement('div');
  div.className = 'floating-reaction';
  div.innerText = emoji;
  div.style.left = `${x - 15}px`;
  div.style.top = `${y - 15}px`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1800);
}

function spawnFloatingEmojiAtCursor(peerId, emoji) {
  const states = awareness?.getStates();
  const state = states?.get(peerId);
  if (state && state.user && state.user.x !== undefined) {
    const absX = (state.user.x / 100) * window.innerWidth;
    const absY = (state.user.y / 100) * window.innerHeight;
    spawnFloatingReaction(emoji, absX, absY);
  }
}

// Cozy Chat System
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const chatSidebar = document.getElementById('chat-sidebar');
const toggleChatBtn = document.getElementById('toggle-chat-btn');
const chatBadge = document.getElementById('chat-badge');

toggleChatBtn.addEventListener('click', () => {
  chatSidebar.classList.toggle('collapsed');
  if (!chatSidebar.classList.contains('collapsed')) {
    chatBadge.classList.add('hidden');
    chatBadge.innerText = '0';
    chatInput.focus();
  }
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = chatInput.value.trim();
  if (!val || !chatArray) return;

  const msg = {
    id: Math.random().toString(),
    author: nickname,
    authorColor: userColor,
    body: val,
    timestamp: Date.now()
  };

  ydoc.transact(() => {
    chatArray.push([msg]);
    if (chatArray.length > 50) {
      chatArray.delete(0, chatArray.length - 50);
    }
  });

  chatInput.value = '';
});

function sendSystemChatMessage(body) {
  if (!chatArray) return;
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

function renderChatMessages() {
  chatMessages.innerHTML = '';
  const list = chatArray.toArray();
  list.forEach(msg => {
    const el = document.createElement('div');
    if (msg.author === 'SYSTEM') {
      el.className = 'chat-msg system';
      el.innerHTML = `<div class="chat-msg-body">${msg.body}</div>`;
    } else {
      const isSelf = msg.author === nickname && msg.authorColor === userColor;
      el.className = isSelf ? 'chat-msg self' : 'chat-msg';
      el.innerHTML = `<span class="chat-msg-author" style="color: ${msg.authorColor};">${msg.author}</span><div class="chat-msg-body">${escapeHTML(msg.body)}</div>`;
    }
    chatMessages.appendChild(el);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// Sound mixer bindings
const volFire = document.getElementById('volume-fire');
const volRain = document.getElementById('volume-rain');
const volWind = document.getElementById('volume-wind');
const volMusic = document.getElementById('volume-music');
const muteBtn = document.getElementById('global-mute-btn');

let isMuted = false;
muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  audio.setMute(isMuted);
  muteBtn.style.borderColor = isMuted ? '#ef4444' : 'rgba(255, 255, 255, 0.08)';
  const icon = document.getElementById('mute-icon');
  icon.innerHTML = isMuted 
    ? `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`
    : `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
});

volFire.addEventListener('input', (e) => audio.setVolume('fire', e.target.value / 100));
volRain.addEventListener('input', (e) => audio.setVolume('rain', e.target.value / 100));
volWind.addEventListener('input', (e) => audio.setVolume('wind', e.target.value / 100));
volMusic.addEventListener('input', (e) => audio.setVolume('music', e.target.value / 100));
