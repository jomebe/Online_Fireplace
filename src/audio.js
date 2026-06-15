/* ==========================================================================
   Cozy Audio Engine (Procedural Synthesis & Streams)
   ========================================================================== */

class CozyAudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.masterGain = null;
    
    // Synth nodes
    this.fireNode = null;
    this.rainNode = null;
    this.windNode = null;
    
    // Music element
    this.musicAudio = null;
    this.musicSource = null;
    this.musicGain = null;

    // Local volume states (0 to 1)
    this.volumes = {
      fire: 0.5,
      rain: 0.2,
      wind: 0.1,
      music: 0.3
    };

    // Shared SFX triggers
    this.sfxHandlers = {
      guitar: () => this.playGuitarSFX(),
      chime: () => this.playChimeSFX(),
      owl: () => this.playOwlSFX(),
      'crackle-pop': () => this.playCracklePopSFX()
    };
  }

  // Initialize the audio context (must be called after user interaction)
  init() {
    if (this.ctx) return;
    
    // Create AudioContext
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Setup procedural generators
    this.setupFireSynth();
    this.setupRainSynth();
    this.setupWindSynth();

    // Setup background music stream
    this.setupMusicStream();
    
    // Resume context if suspended (browser security)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Set local mute state
  setMute(muteState) {
    this.isMuted = muteState;
    if (this.masterGain && this.ctx) {
      const targetGain = this.isMuted ? 0 : 1;
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
    }
  }

  // Update specific channel volume
  setVolume(channel, value) {
    this.volumes[channel] = value;
    if (!this.ctx) return;

    switch (channel) {
      case 'fire':
        if (this.fireNode) this.fireNode.gainNode.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
        break;
      case 'rain':
        if (this.rainNode) this.rainNode.gainNode.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
        break;
      case 'wind':
        if (this.windNode) this.windNode.gainNode.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
        break;
      case 'music':
        if (this.musicGain) this.musicGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
        break;
    }
  }

  /* ==========================================================================
     White & Pink Noise Generators
     ========================================================================== */
  createWhiteNoise() {
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;
    return whiteNoise;
  }

  createPinkNoise() {
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    let b0, b1, b2, b3, b4, b5, b6;
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
    
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      output[i] *= 0.11; // estimate
      b6 = white * 0.115926;
    }
    
    const pinkNoise = this.ctx.createBufferSource();
    pinkNoise.buffer = noiseBuffer;
    pinkNoise.loop = true;
    return pinkNoise;
  }

  /* ==========================================================================
     Procedural Audio Synthesizers
     ========================================================================== */

  // 1. FIRE CRACKLE SYNTH
  setupFireSynth() {
    // A. Constant rumble/roar of flames (Pink Noise + Lowpass + Modulator)
    const roarSource = this.createPinkNoise();
    const roarFilter = this.ctx.createBiquadFilter();
    roarFilter.type = 'lowpass';
    roarFilter.frequency.setValueAtTime(300, this.ctx.currentTime);

    // Roar LFO for breath effect
    const roarLFO = this.ctx.createOscillator();
    roarLFO.type = 'sine';
    roarLFO.frequency.setValueAtTime(0.3, this.ctx.currentTime); // 0.3 Hz
    const roarLFOGain = this.ctx.createGain();
    roarLFOGain.gain.setValueAtTime(80, this.ctx.currentTime); // modulate up to 80Hz
    
    roarLFO.connect(roarLFOGain);
    roarLFOGain.connect(roarFilter.frequency);
    roarLFO.start();

    const roarGain = this.ctx.createGain();
    roarGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    roarSource.connect(roarFilter);
    roarFilter.connect(roarGain);
    roarSource.start();

    // B. Crackle Pops (Spikes passing through Highpass Filter)
    const crackleBufferSize = this.ctx.sampleRate * 1.5;
    const crackleBuffer = this.ctx.createBuffer(1, crackleBufferSize, this.ctx.sampleRate);
    const crackleData = crackleBuffer.getChannelData(0);
    for (let i = 0; i < crackleBufferSize; i++) {
      if (Math.random() < 0.0006) {
        crackleData[i] = Math.random() * 2 - 1; // spike
      } else {
        crackleData[i] = 0;
      }
    }
    const crackleSource = this.ctx.createBufferSource();
    crackleSource.buffer = crackleBuffer;
    crackleSource.loop = true;

    const crackleFilter = this.ctx.createBiquadFilter();
    crackleFilter.type = 'bandpass';
    crackleFilter.frequency.setValueAtTime(2000, this.ctx.currentTime);
    crackleFilter.Q.setValueAtTime(3, this.ctx.currentTime);

    const crackleGain = this.ctx.createGain();
    crackleGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    crackleSource.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleSource.start();

    // C. Deep Thuds (Low-pass filtered spikes)
    const thudBufferSize = this.ctx.sampleRate * 2.0;
    const thudBuffer = this.ctx.createBuffer(1, thudBufferSize, this.ctx.sampleRate);
    const thudData = thudBuffer.getChannelData(0);
    for (let i = 0; i < thudBufferSize; i++) {
      if (Math.random() < 0.00015) {
        thudData[i] = Math.random() * 2 - 1;
      } else {
        thudData[i] = 0;
      }
    }
    const thudSource = this.ctx.createBufferSource();
    thudSource.buffer = thudBuffer;
    thudSource.loop = true;

    const thudFilter = this.ctx.createBiquadFilter();
    thudFilter.type = 'lowpass';
    thudFilter.frequency.setValueAtTime(120, this.ctx.currentTime);

    const thudGain = this.ctx.createGain();
    thudGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
    thudSource.connect(thudFilter);
    thudFilter.connect(thudGain);
    thudSource.start();

    // Combine into main fire node
    const fireMainGain = this.ctx.createGain();
    fireMainGain.gain.setValueAtTime(this.volumes.fire, this.ctx.currentTime);

    roarGain.connect(fireMainGain);
    crackleGain.connect(fireMainGain);
    thudGain.connect(fireMainGain);

    fireMainGain.connect(this.masterGain);

    this.fireNode = {
      gainNode: fireMainGain,
      roarFilter: roarFilter,
      crackleGain: crackleGain,
      sources: [roarSource, roarLFO, crackleSource, thudSource]
    };
  }

  // Adjust fire crackling parameters dynamically based on fireplace heat level (0 to 100)
  adjustFireIntensity(intensity) {
    if (!this.ctx || !this.fireNode) return;
    const normalized = Math.min(Math.max(intensity / 100, 0.1), 1.2);
    
    // Roar filter increases in frequency (flames get larger, roar gets brighter)
    this.fireNode.roarFilter.frequency.setTargetAtTime(250 + normalized * 150, this.ctx.currentTime, 0.5);
    
    // Crackle pops density (simulated via volume scaling of crackle nodes)
    this.fireNode.crackleGain.gain.setTargetAtTime(0.4 + normalized * 0.8, this.ctx.currentTime, 0.5);
  }

  // 2. RAIN SYNTH
  setupRainSynth() {
    const rainSource = this.createWhiteNoise();
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.setValueAtTime(1400, this.ctx.currentTime);
    rainFilter.Q.setValueAtTime(0.8, this.ctx.currentTime);

    const rainGain = this.ctx.createGain();
    rainGain.gain.setValueAtTime(this.volumes.rain, this.ctx.currentTime);

    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(this.masterGain);
    rainSource.start();

    this.rainNode = {
      gainNode: rainGain,
      sources: [rainSource]
    };
  }

  // 3. WIND SYNTH
  setupWindSynth() {
    const windSource = this.createPinkNoise();
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(350, this.ctx.currentTime);
    windFilter.Q.setValueAtTime(2.5, this.ctx.currentTime); // tight resonance makes it howl

    // Wind modulation LFO
    const windLFO = this.ctx.createOscillator();
    windLFO.type = 'sine';
    windLFO.frequency.setValueAtTime(0.04, this.ctx.currentTime); // extremely slow gust cycles (25s)
    
    const windLFOGain = this.ctx.createGain();
    windLFOGain.gain.setValueAtTime(180, this.ctx.currentTime); // howl sweep range

    windLFO.connect(windLFOGain);
    windLFOGain.connect(windFilter.frequency);
    windLFO.start();

    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(this.volumes.wind, this.ctx.currentTime);

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.masterGain);
    windSource.start();

    this.windNode = {
      gainNode: windGain,
      sources: [windSource, windLFO]
    };
  }

  /* ==========================================================================
     Cozy Music Stream
     ========================================================================== */
  setupMusicStream() {
    this.musicAudio = new Audio();
    // Stable copyright-free lofi jazz track from Chosic
    this.musicAudio.src = 'https://www.chosic.com/wp-content/uploads/2021/07/Rain-on-the-window-Lofi-Chill-Royalty-Free-Music.mp3';
    this.musicAudio.crossOrigin = 'anonymous';
    this.musicAudio.loop = true;

    this.musicSource = this.ctx.createMediaElementSource(this.musicAudio);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(this.volumes.music, this.ctx.currentTime);

    this.musicSource.connect(this.musicGain);
    this.musicGain.connect(this.masterGain);

    // Play lofi stream
    this.musicAudio.play().catch(err => {
      console.log("Auto-play blocked initially. Resuming on user input.", err);
    });
  }

  /* ==========================================================================
     Cozy SFX / Collaborative Soundboard Synthesizers
     ========================================================================== */

  // 1. Guitar Chord SFX (Cozy string pluck)
  playGuitarSFX() {
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    // Am9 Chord: A2, E3, C4, G4, B4
    const chord = [110, 164.81, 261.63, 392.00, 493.88];
    
    chord.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      
      // Pluck timbre: Triangle + Sine mix
      osc.type = index % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      
      // Delay pluck slightly for a nice arpeggio strum
      const pluckDelay = index * 0.06;
      const startTime = now + pluckDelay;
      
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.setValueAtTime(0.12, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.0);
      
      osc.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      osc.start(startTime);
      osc.stop(startTime + 2.1);
    });
  }

  // 2. Wind Chime SFX (Bell chimes)
  playChimeSFX() {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Chime notes: High pentatonic C6, D6, E6, G6, A6
    const notes = [1046.50, 1174.66, 1318.51, 1567.98, 1760.00];
    
    // Choose 3 random notes to strike
    for (let i = 0; i < 3; i++) {
      const freq = notes[Math.floor(Math.random() * notes.length)];
      const delay = Math.random() * 0.4;
      
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      
      const strikeTime = now + delay;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.setValueAtTime(0.08, strikeTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, strikeTime + 2.5); // long chime resonance
      
      // Small vibrato
      const vibrato = this.ctx.createOscillator();
      vibrato.frequency.setValueAtTime(6, strikeTime); // 6Hz
      const vibratoGain = this.ctx.createGain();
      vibratoGain.gain.setValueAtTime(4, strikeTime); // detune pitch slightly
      
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      
      osc.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      vibrato.start(strikeTime);
      osc.start(strikeTime);
      
      osc.stop(strikeTime + 2.6);
      vibrato.stop(strikeTime + 2.6);
    }
  }

  // 3. Owl Hoot SFX
  playOwlSFX() {
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    
    const hoot = (startTime, duration, pitchStart) => {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gainNode = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitchStart, startTime);
      
      // Hoot sweep: 330Hz down to 310Hz then slightly up
      osc.frequency.exponentialRampToValueAtTime(pitchStart - 30, startTime + duration * 0.3);
      osc.frequency.exponentialRampToValueAtTime(pitchStart - 10, startTime + duration);
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, startTime);
      
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.setValueAtTime(0.12, startTime);
      gainNode.gain.linearRampToValueAtTime(0.12, startTime + duration * 0.2);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      
      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.masterGain);
      
      osc.start(startTime);
      osc.stop(startTime + duration + 0.1);
    };

    // Owl hoot pattern: "Hoo... Hoo-hoo"
    hoot(now, 0.4, 340);
    hoot(now + 0.55, 0.35, 335);
    hoot(now + 0.95, 0.5, 320);
  }

  // 4. Crackle Pop SFX (Manual spark sound)
  playCracklePopSFX() {
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gainNode = this.ctx.createGain();
    
    // Sharp high pitch
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1500, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
    
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.setValueAtTime(5, now);
    
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.setValueAtTime(0.4, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);
    
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // Trigger soundboard SFX by name
  triggerSFX(name) {
    if (this.isMuted) return;
    const handler = this.sfxHandlers[name];
    if (handler) {
      // Lazy init context if we haven't already
      if (!this.ctx) this.init();
      handler();
    }
  }
}

export const audio = new CozyAudioEngine();
export default audio;
