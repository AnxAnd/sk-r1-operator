/**
 * sk-r1-operator: Audio Engine
 * Teenage Engineering x Casio SK-1 Architecture for Rabbit R1
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    
    // Nodes
    this.masterGain = null;
    this.limiter = null;
    this.analyser = null;
    this.synthFilter = null;
    
    // Synth Voice State
    this.currentOsc = null;
    this.fmModulator = null;
    this.fmGain = null;
    this.voiceGain = null;
    this.waveType = 'sawtooth'; // 'sawtooth', 'square', 'triangle', 'sine', 'fm'
    
    // Kinetic Filter Parameters (Tilt-controlled)
    this.targetCutoff = 1800;
    this.currentCutoff = 1800;
    this.targetQ = 3.5;
    this.currentQ = 3.5;
    
    // Sampler State
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.sampleBuffer = null;
    this.isRecording = false;
    this.sampleStartOffset = 0.0; // In seconds (scrubbed via wheel)
    this.sampleDuration = 0;
    
    // Tape Looper State
    this.bpm = 96;
    this.loopBeats = 8; // 2 bars in 4/4
    this.tapeBuffer = null; // Float32Array loop buffer
    this.tapeBufferLength = 0;
    this.tapePlayhead = 0; // Current sample index
    this.isTapePlaying = false;
    this.isTapeOverdubbing = false;
    this.tapeFeedback = 0.94; // Analog tape loop decay per cycle
    this.tapePlaybackRate = 1.0;
    this.tapeStopRamping = false;
    this.tapeScriptNode = null;

    // Master Export Recorder
    this.destNode = null;
    this.masterRecorder = null;
    this.sessionChunks = [];
    this.isSessionRecording = false;
  }

  async init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // 1. Analyser Node for 60fps Oscilloscope
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.75;

    // 2. Soft Limiter / Saturation Node (Analog warmth + clipping prevention)
    this.limiter = this.ctx.createWaveShaper();
    this.limiter.curve = this.createSoftClipCurve(400);
    this.limiter.oversample = '2x';

    // 3. Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);

    // 4. Kinetic Biquad Lowpass Filter (Modulated by R1 Accelerometer)
    this.synthFilter = this.ctx.createBiquadFilter();
    this.synthFilter.type = 'lowpass';
    this.synthFilter.frequency.setValueAtTime(this.currentCutoff, this.ctx.currentTime);
    this.synthFilter.Q.setValueAtTime(this.currentQ, this.ctx.currentTime);

    // 5. Shared Voice Bus (Routes Synth, Sampler, and Drums)
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.voiceBus.connect(this.synthFilter);

    // Routing Graph: voiceBus -> synthFilter -> limiter -> masterGain -> analyser -> destination
    this.synthFilter.connect(this.limiter);
    this.limiter.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // 6. Initialize Tape Looper Buffer & Processor
    this.initTapeBuffer();
    this.setupTapeProcessor();

    // Start filter smoothing loop
    this.startFilterSmoothing();

    // Load default fallback sample (classic Casio SK-1 style ping)
    this.generateFallbackSample();

    this.isInitialized = true;
    console.log('[AudioEngine] Initialized at sampleRate:', this.ctx.sampleRate);
  }

  // Soft clipping curve for vintage saturation
  createSoftClipCurve(n_samples = 400) {
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + 20) * x * 20 * deg) / (Math.PI + 20 * Math.abs(x));
    }
    return curve;
  }

  // Smooth filter parameter updates to avoid digital zipper noise
  startFilterSmoothing() {
    const lerp = (start, end, amt) => (1 - amt) * start + amt * end;
    const update = () => {
      if (this.synthFilter && this.ctx) {
        this.currentCutoff = lerp(this.currentCutoff, this.targetCutoff, 0.15);
        this.currentQ = lerp(this.currentQ, this.targetQ, 0.15);
        
        const now = this.ctx.currentTime;
        this.synthFilter.frequency.setTargetAtTime(this.currentCutoff, now, 0.02);
        this.synthFilter.Q.setTargetAtTime(this.currentQ, now, 0.02);
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  // Set filter from R1 Accelerometer Tilt
  // tiltX: -1.0 (full left) to +1.0 (full right)
  // tiltY: -1.0 (full forward) to +1.0 (full back)
  updateKineticFilter(tiltX, tiltY) {
    // Exponential mapping for cutoff frequency (100 Hz to 9000 Hz)
    // Normalized tiltX (-1 to +1) mapped to 0 to 1
    const normX = Math.max(0, Math.min(1, (tiltX + 1) / 2));
    this.targetCutoff = Math.round(100 * Math.pow(90, normX));

    // Resonance Q mapping (0.5 to 14.0)
    const normY = Math.max(0, Math.min(1, (tiltY + 1) / 2));
    this.targetQ = +(0.5 + normY * 13.5).toFixed(2);
  }

  // ----------------------------------------------------
  // SYNTHESIZER VOICE METHODS
  // ----------------------------------------------------

  setWaveType(type) {
    this.waveType = type;
  }

  triggerSynth(freq, isHold = false) {
    if (!this.ctx) return;
    this.stopSynth();

    const now = this.ctx.currentTime;

    // Voice Envelope
    this.voiceGain = this.ctx.createGain();
    this.voiceGain.gain.setValueAtTime(0.0001, now);
    
    // Attack
    this.voiceGain.gain.exponentialRampToValueAtTime(0.8, now + 0.015);
    
    if (!isHold) {
      // Decay & Release for standard tap
      this.voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    } else {
      // Sustain level for hold/PTT press
      this.voiceGain.gain.exponentialRampToValueAtTime(0.65, now + 0.06);
    }

    if (this.waveType === 'fm') {
      // 2-Operator FM Synthesizer: Modulator -> Carrier
      this.currentOsc = this.ctx.createOscillator();
      this.currentOsc.type = 'sine';
      this.currentOsc.frequency.setValueAtTime(freq, now);

      this.fmModulator = this.ctx.createOscillator();
      this.fmModulator.type = 'sine';
      // Harmonic ratio 2:1
      this.fmModulator.frequency.setValueAtTime(freq * 2, now);

      this.fmGain = this.ctx.createGain();
      // Modulation index dynamically influenced by resonance target
      this.fmGain.gain.setValueAtTime(freq * (this.currentQ * 0.4), now);

      this.fmModulator.connect(this.fmGain);
      this.fmGain.connect(this.currentOsc.frequency);

      this.currentOsc.connect(this.voiceGain);
      this.fmModulator.start(now);
      this.currentOsc.start(now);
    } else {
      // Subtractive Oscillator: Saw, Square, Triangle, Sine
      this.currentOsc = this.ctx.createOscillator();
      this.currentOsc.type = this.waveType;
      this.currentOsc.frequency.setValueAtTime(freq, now);

      this.currentOsc.connect(this.voiceGain);
      this.currentOsc.start(now);
    }

    this.voiceGain.connect(this.voiceBus);
  }

  releaseSynth() {
    if (this.voiceGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.voiceGain.gain.cancelScheduledValues(now);
      this.voiceGain.gain.setValueAtTime(Math.max(this.voiceGain.gain.value, 0.0001), now);
      this.voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      setTimeout(() => this.stopSynth(), 130);
    }
  }

  stopSynth() {
    if (this.currentOsc) {
      try { this.currentOsc.stop(); } catch (e) {}
      this.currentOsc.disconnect();
      this.currentOsc = null;
    }
    if (this.fmModulator) {
      try { this.fmModulator.stop(); } catch (e) {}
      this.fmModulator.disconnect();
      this.fmModulator = null;
    }
    if (this.voiceGain) {
      this.voiceGain.disconnect();
      this.voiceGain = null;
    }
  }

  // ----------------------------------------------------
  // FIELD SAMPLER METHODS (CASIO SK-1 / PO-33 VIBE)
  // ----------------------------------------------------

  async startMicSampling() {
    if (!this.ctx) await this.init();
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      console.log('[Sampler] Recording started from microphone...');
    } catch (err) {
      console.error('[Sampler] Microphone access error:', err);
      throw err;
    }
  }

  async stopMicSampling() {
    if (!this.mediaRecorder || !this.isRecording) return null;

    return new Promise((resolve) => {
      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm; codecs=opus' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        try {
          const decoded = await this.ctx.decodeAudioData(arrayBuffer);
          this.sampleBuffer = this.normalizeSample(decoded);
          this.sampleDuration = this.sampleBuffer.duration;
          this.sampleStartOffset = 0;
          console.log('[Sampler] Sample captured and normalized! Duration:', this.sampleDuration.toFixed(2), 's');
          resolve(this.sampleBuffer);
        } catch (e) {
          console.error('[Sampler] Decode error:', e);
          resolve(null);
        } finally {
          this.isRecording = false;
          // Stop media stream tracks
          if (this.mediaRecorder && this.mediaRecorder.stream) {
            this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
          }
        }
      };

      this.mediaRecorder.stop();
    });
  }

  // Auto-normalize peak audio amplitude to avoid quiet samples
  normalizeSample(buffer) {
    const numChannels = buffer.numberOfChannels;
    let maxPeak = 0;

    for (let c = 0; c < numChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > maxPeak) maxPeak = abs;
      }
    }

    if (maxPeak > 0 && maxPeak < 0.95) {
      const gainFactor = 0.95 / maxPeak;
      for (let c = 0; c < numChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          data[i] *= gainFactor;
        }
      }
    }
    return buffer;
  }

  // Play sample with chromatic pitch shift & scrub offset
  // semitoneOffset: -12 to +12
  playSample(semitoneOffset = 0, isLoop = false) {
    if (!this.ctx || !this.sampleBuffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.sampleBuffer;
    
    // Chromatic pitch shifting via playback rate
    // 2^(semitones / 12)
    const pitchRate = Math.pow(2, semitoneOffset / 12);
    source.playbackRate.setValueAtTime(pitchRate, this.ctx.currentTime);
    source.loop = isLoop;

    const env = this.ctx.createGain();
    const now = this.ctx.currentTime;
    env.gain.setValueAtTime(0.9, now);

    source.connect(env);
    env.connect(this.voiceBus); // Routes through shared voice bus!

    const safeOffset = Math.min(this.sampleStartOffset, this.sampleDuration * 0.9);
    source.start(now, safeOffset);
    return source;
  }

  // Generate classic 80s 8-bit synthetic bell tone as initial sample
  generateFallbackSample() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 1.2); // 1.2 seconds
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Casio metallic ping formula
      const envelope = Math.exp(-3.5 * t);
      const wave = Math.sin(2 * Math.PI * 440 * t) * 0.5 + 
                   Math.sin(2 * Math.PI * 880 * t) * 0.3 +
                   Math.sin(2 * Math.PI * 1760 * t) * 0.2;
      data[i] = wave * envelope;
    }
    this.sampleBuffer = buffer;
    this.sampleDuration = 1.2;
  }

  // ----------------------------------------------------
  // TAPE LOOPER & DRUM SYNTHESIZER (PHASE 2)
  // ----------------------------------------------------

  initTapeBuffer(bpm = this.bpm) {
    this.bpm = bpm;
    const sampleRate = this.ctx ? this.ctx.sampleRate : 44100;
    const seconds = (this.loopBeats * 60) / this.bpm;
    this.tapeBufferLength = Math.floor(sampleRate * seconds);
    this.tapeBuffer = new Float32Array(this.tapeBufferLength);
    this.tapePlayhead = 0;
    console.log('[Tape] Buffer initialized for', seconds.toFixed(2), 's at', this.bpm, 'BPM');
  }

  setupTapeProcessor() {
    if (!this.ctx) return;
    this.tapeScriptNode = this.ctx.createScriptProcessor(1024, 1, 1);
    this.tapeGain = this.ctx.createGain();
    this.tapeGain.gain.setValueAtTime(0.88, this.ctx.currentTime);

    this.tapeScriptNode.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);
      const len = this.tapeBufferLength;

      if (!this.isTapePlaying || len === 0 || !this.tapeBuffer) {
        for (let i = 0; i < output.length; i++) output[i] = 0;
        return;
      }

      for (let i = 0; i < output.length; i++) {
        const idx = Math.floor(this.tapePlayhead) % len;
        let tapeVal = this.tapeBuffer[idx];

        if (this.isTapeOverdubbing) {
          // Sound-on-sound magnetic tape overdub: decay previous sample, mix in new input
          tapeVal = (tapeVal * this.tapeFeedback) + (input[i] * 0.95);
          this.tapeBuffer[idx] = Math.max(-1, Math.min(1, tapeVal)); // Prevent overflow
        }

        output[i] = tapeVal;

        // Handle tape stop deceleration
        if (this.tapeStopRamping) {
          this.tapePlaybackRate = Math.max(0, this.tapePlaybackRate - 0.00035);
          if (this.tapePlaybackRate <= 0) {
            this.isTapePlaying = false;
            this.tapeStopRamping = false;
          }
        }

        this.tapePlayhead += this.tapePlaybackRate;
        if (this.tapePlayhead >= len) this.tapePlayhead -= len;
        if (this.tapePlayhead < 0) this.tapePlayhead += len;
      }
    };

    // Tape processor input listens to voiceBus, output goes into limiter -> master
    this.voiceBus.connect(this.tapeScriptNode);
    this.tapeScriptNode.connect(this.tapeGain);
    this.tapeGain.connect(this.limiter);
  }

  startTape() {
    this.tapePlaybackRate = 1.0;
    this.tapeStopRamping = false;
    this.isTapePlaying = true;
  }

  stopTape() {
    this.isTapePlaying = false;
    this.isTapeOverdubbing = false;
  }

  toggleOverdub() {
    if (!this.isTapePlaying) {
      this.startTape();
    }
    this.isTapeOverdubbing = !this.isTapeOverdubbing;
    return this.isTapeOverdubbing;
  }

  tapeStop() {
    if (!this.isTapePlaying) return;
    this.tapeStopRamping = true;
    this.isTapeOverdubbing = false;
  }

  tapeRestart() {
    this.tapePlaybackRate = 1.0;
    this.tapeStopRamping = false;
    this.isTapePlaying = true;
  }

  tapeScrub(deltaSeconds) {
    if (!this.ctx || this.tapeBufferLength === 0) return;
    const deltaSamples = deltaSeconds * this.ctx.sampleRate;
    this.tapePlayhead = (this.tapePlayhead + deltaSamples + this.tapeBufferLength) % this.tapeBufferLength;
  }

  clearTape() {
    if (this.tapeBuffer) {
      this.tapeBuffer.fill(0);
      this.tapePlayhead = 0;
      console.log('[Tape] Loop cleared.');
    }
  }

  getTapeProgress() {
    if (!this.tapeBufferLength) return 0;
    return this.tapePlayhead / this.tapeBufferLength;
  }

  // --- Casio SK / 808 Style Vintage Drum Synthesis ---

  playKick(vel = 1.0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.09);

    gain.gain.setValueAtTime(vel * 0.95, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    osc.connect(gain);
    gain.connect(this.voiceBus);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  playSnare(vel = 1.0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Snare tone body
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.07);
    oscGain.gain.setValueAtTime(vel * 0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.connect(oscGain);
    oscGain.connect(this.voiceBus);
    osc.start(now);
    osc.stop(now + 0.15);

    // Snare snap noise
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.2);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1250, now);
    filter.Q.setValueAtTime(1.8, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(vel * 0.75, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.voiceBus);

    whiteNoise.start(now);
    whiteNoise.stop(now + 0.21);
  }

  playHiHat(isOpen = false, vel = 1.0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = isOpen ? 0.26 : 0.055;

    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.voiceBus);

    whiteNoise.start(now);
    whiteNoise.stop(now + duration + 0.01);
  }

  playClap(vel = 1.0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [0, 0.014, 0.028].forEach((offset) => {
      const burstDur = 0.024;
      const bufSize = Math.floor(this.ctx.sampleRate * burstDur);
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const out = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) out[i] = Math.random() * 2 - 1;

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, now + offset);
      filter.Q.setValueAtTime(2.0, now + offset);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vel * 0.45, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + burstDur);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.voiceBus);

      src.start(now + offset);
      src.stop(now + offset + burstDur);
    });
  }

  // --- 16-Bit WAV Encoder & Cloud Export ---

  exportMasterWAV() {
    if (!this.tapeBuffer || this.tapeBufferLength === 0) return null;
    const sampleRate = this.ctx ? this.ctx.sampleRate : 44100;
    const numChannels = 1;
    const samples = this.tapeBuffer;
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  async uploadForQRExport(blob) {
    try {
      const formData = new FormData();
      formData.append('file', blob, 'sk-r1-tape.wav');

      const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error(`Upload returned status ${res.status}`);
      const json = await res.json();
      if (json.status === 'success' && json.data && json.data.url) {
        // Direct download URL on tmpfiles is /dl/
        return json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      }
    } catch (err) {
      console.warn('[Export] Upload service unreachable or offline:', err);
    }
    return null;
  }

  // ----------------------------------------------------
  // REALTIME OSCILLOSCOPE DATA
  // ----------------------------------------------------

  getScopeData(array) {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(array);
    }
  }
}

// Global engine instance
window.audioEngine = new AudioEngine();
