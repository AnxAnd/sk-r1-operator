/**
 * sk-r1-operator: Audio Engine
 * Teenage Engineering x Casio SK-1 Architecture for Rabbit R1
 * Zero-Click Micro-Envelopes, Tape Echo FX, Universal Pitch/Tone
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    
    // Master Nodes
    this.masterGain = null;
    this.limiter = null;
    this.analyser = null;
    this.synthFilter = null;
    this.voiceBus = null;
    
    // Tape Delay / Echo FX Bus
    this.delayNode = null;
    this.delayFeedbackNode = null;
    this.delayFilterNode = null;
    this.delayWetGain = null;
    this.delayTime = 0.28; // 280ms
    this.delayFeedback = 0.42; // 42% feedback
    this.delayWet = 0.30; // 30% wet mix
    
    // Synth Voice State
    this.currentOsc = null;
    this.fmModulator = null;
    this.fmGain = null;
    this.voiceGain = null;
    this.waveType = 'sawtooth'; // 'sawtooth', 'square', 'triangle', 'sine', 'fm'
    
    // Active Engine Mode & Per-Mode Sound Profiles
    this.activeMode = 'synth';
    this.modeProfiles = {
      synth: {
        pitch: 0,        // -24 to +24 semitones
        tone: 3200,      // 100 to 9500 Hz
        delay: 25,       // 0% to 100%
        waveType: 'sawtooth'
      },
      sampler: {
        pitch: 0,        // -24 to +24 semitones
        tone: 5800,      // Brighter default for mic capture
        delay: 15,       // 0% to 100%
        startOffset: 0.0
      },
      tape: {
        bpm: 96,         // 50 to 180 BPM
        pitch: 0,        // Varispeed -12 to +12 semitones
        tone: 4200,      // Master tape filter
        delay: 35        // Master tape echo
      }
    };

    // Sound Shaping Parameters (Active profile values)
    this.pitchShift = 0;
    this.manualTone = 3200;
    this.delayAmount = 25;
    
    // Kinetic Filter Parameters (Tilt-controlled)
    this.targetCutoff = 3200;
    this.currentCutoff = 3200;
    this.targetQ = 3.0;
    this.currentQ = 3.0;
    this.tiltX = 0;
    this.tiltY = 0;
    
    // Sampler State
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.sampleBuffer = null;
    this.isRecording = false;
    this.sampleStartOffset = 0.0; // In seconds
    this.sampleDuration = 0;
    this.micStream = null;
    this.micAnalyser = null;
    this.micDataArray = new Uint8Array(128);
    this.recordingTimer = null;
    
    // Tape Looper State
    this.bpm = 96;
    this.loopBeats = 8; // 2 bars in 4/4
    this.tapeBuffer = null;
    this.tapeBufferLength = 0;
    this.tapePlayhead = 0;
    this.isTapePlaying = false;
    this.isTapeOverdubbing = false;
    this.tapeFeedback = 0.94;
    this.tapePlaybackRate = 1.0;
    this.tapeStopRamping = false;
    this.tapeScriptNode = null;
    this.tapeGain = null;

    // Master Export Recorder
    this.destNode = null;
    this.masterRecorder = null;
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
    this.masterGain.gain.setValueAtTime(0.72, this.ctx.currentTime);

    // 4. Kinetic Biquad Lowpass Filter
    this.synthFilter = this.ctx.createBiquadFilter();
    this.synthFilter.type = 'lowpass';
    this.synthFilter.frequency.setValueAtTime(this.currentCutoff, this.ctx.currentTime);
    this.synthFilter.Q.setValueAtTime(this.currentQ, this.ctx.currentTime);

    // 5. Shared Voice Bus (Routes Synth, Sampler, and Drums)
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.voiceBus.connect(this.synthFilter);

    // 6. Dedicated Tape Echo / Delay FX Bus
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.setValueAtTime(this.delayTime, this.ctx.currentTime);

    this.delayFeedbackNode = this.ctx.createGain();
    this.delayFeedbackNode.gain.setValueAtTime(this.delayFeedback, this.ctx.currentTime);

    // Analog tape damping filter on echoes
    this.delayFilterNode = this.ctx.createBiquadFilter();
    this.delayFilterNode.type = 'lowpass';
    this.delayFilterNode.frequency.setValueAtTime(2400, this.ctx.currentTime);

    this.delayWetGain = this.ctx.createGain();
    this.delayWetGain.gain.setValueAtTime(this.delayWet, this.ctx.currentTime);

    // Delay Feedback Loop:
    // synthFilter -> delayNode -> delayFilterNode -> delayFeedbackNode -> delayNode
    // delayFilterNode -> delayWetGain -> limiter
    this.synthFilter.connect(this.delayNode);
    this.delayNode.connect(this.delayFilterNode);
    this.delayFilterNode.connect(this.delayFeedbackNode);
    this.delayFeedbackNode.connect(this.delayNode);
    this.delayFilterNode.connect(this.delayWetGain);
    this.delayWetGain.connect(this.limiter);

    // Main Dry Path: synthFilter -> limiter -> masterGain -> analyser -> destination
    this.synthFilter.connect(this.limiter);
    this.limiter.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // 7. Initialize Tape Looper Buffer & Processor
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

  // ----------------------------------------------------
  // INDEPENDENT PER-MODE SOUND PROFILES & PARAMETERS
  // ----------------------------------------------------

  setMode(mode) {
    if (!this.modeProfiles[mode]) return;
    this.activeMode = mode;
    this.applyModeProfile(mode);
  }

  applyModeProfile(mode) {
    const profile = this.modeProfiles[mode];
    if (!profile) return;

    this.pitchShift = profile.pitch;
    this.manualTone = profile.tone;
    this.delayAmount = profile.delay;

    if (mode === 'synth' && profile.waveType) {
      this.waveType = profile.waveType;
    }
    if (mode === 'tape') {
      this.bpm = profile.bpm;
      if (this.isTapePlaying) {
        this.tapePlaybackRate = Math.pow(2, this.pitchShift / 12);
      }
    }

    // Push new mode parameters to audio DSP immediately
    this.setTone(this.manualTone);
    this.setDelayAmount(this.delayAmount);
  }

  setPitchShift(semitones) {
    const clamped = Math.max(-24, Math.min(24, Math.round(semitones)));
    this.pitchShift = clamped;
    if (this.modeProfiles[this.activeMode]) {
      this.modeProfiles[this.activeMode].pitch = clamped;
    }
    if (this.activeMode === 'tape' && this.isTapePlaying) {
      this.tapePlaybackRate = Math.pow(2, this.pitchShift / 12);
    }
  }

  setTone(cutoffHz) {
    const clamped = Math.max(120, Math.min(9500, Math.round(cutoffHz)));
    this.manualTone = clamped;
    if (this.modeProfiles[this.activeMode]) {
      this.modeProfiles[this.activeMode].tone = clamped;
    }
    this.updateCutoffTarget();
  }

  setDelayAmount(percent) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    this.delayAmount = clamped;
    if (this.modeProfiles[this.activeMode]) {
      this.modeProfiles[this.activeMode].delay = clamped;
    }
    const norm = this.delayAmount / 100;
    this.delayWet = norm * 0.65;
    this.delayFeedback = norm * 0.76;
    if (this.ctx && this.delayWetGain && this.delayFeedbackNode) {
      const now = this.ctx.currentTime;
      this.delayWetGain.gain.setTargetAtTime(this.delayWet, now, 0.02);
      this.delayFeedbackNode.gain.setTargetAtTime(this.delayFeedback, now, 0.02);
    }
  }

  setBpm(newBpm) {
    const clamped = Math.max(50, Math.min(180, Math.round(newBpm)));
    this.bpm = clamped;
    if (this.modeProfiles.tape) {
      this.modeProfiles.tape.bpm = clamped;
    }
    this.initTapeBuffer(clamped);
  }

  updateKineticFilter(tiltX, tiltY) {
    this.tiltX = tiltX;
    this.tiltY = tiltY;
    this.updateCutoffTarget();
  }

  updateCutoffTarget() {
    // Smooth modulation around manualTone setting
    const tiltMultiplier = Math.pow(2.2, this.tiltX || 0);
    this.targetCutoff = Math.max(80, Math.min(10500, this.manualTone * tiltMultiplier));

    const normY = Math.max(0, Math.min(1, ((this.tiltY || 0) + 1) / 2));
    this.targetQ = +(0.5 + normY * 13.5).toFixed(2);
  }

  // ----------------------------------------------------
  // SYNTHESIZER VOICE (ZERO-CLICK MICRO-ENVELOPE)
  // ----------------------------------------------------

  setWaveType(type) {
    this.waveType = type;
    if (this.modeProfiles && this.modeProfiles.synth) {
      this.modeProfiles.synth.waveType = type;
    }
  }

  triggerSynth(freq, isHold = false) {
    if (!this.ctx) return;

    // Apply Universal Pitch Shift
    const pitchMultiplier = Math.pow(2, this.pitchShift / 12);
    const tunedFreq = freq * pitchMultiplier;

    const now = this.ctx.currentTime;

    // Smoothly fade out previous voice over 4ms to ELIMINATE CLICKS
    if (this.voiceGain) {
      const oldGain = this.voiceGain;
      const oldOsc = this.currentOsc;
      const oldFm = this.fmModulator;
      oldGain.gain.cancelScheduledValues(now);
      oldGain.gain.setValueAtTime(Math.max(oldGain.gain.value, 0.0001), now);
      oldGain.gain.linearRampToValueAtTime(0.0001, now + 0.004);
      setTimeout(() => {
        try {
          oldOsc?.stop(); oldFm?.stop();
          oldOsc?.disconnect(); oldFm?.disconnect();
          oldGain?.disconnect();
        } catch (e) {}
      }, 15);
    }

    // New Voice Envelope with 3ms anti-click micro-attack
    this.voiceGain = this.ctx.createGain();
    this.voiceGain.gain.setValueAtTime(0.0001, now);
    this.voiceGain.gain.linearRampToValueAtTime(0.78, now + 0.003);
    
    if (!isHold) {
      this.voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    } else {
      this.voiceGain.gain.setValueAtTime(0.65, now + 0.05);
    }

    if (this.waveType === 'fm') {
      this.currentOsc = this.ctx.createOscillator();
      this.currentOsc.type = 'sine';
      this.currentOsc.frequency.setValueAtTime(tunedFreq, now);

      this.fmModulator = this.ctx.createOscillator();
      this.fmModulator.type = 'sine';
      this.fmModulator.frequency.setValueAtTime(tunedFreq * 2, now);

      this.fmGain = this.ctx.createGain();
      this.fmGain.gain.setValueAtTime(tunedFreq * (this.currentQ * 0.4), now);

      this.fmModulator.connect(this.fmGain);
      this.fmGain.connect(this.currentOsc.frequency);

      this.currentOsc.connect(this.voiceGain);
      this.fmModulator.start(now);
      this.currentOsc.start(now);
    } else {
      this.currentOsc = this.ctx.createOscillator();
      this.currentOsc.type = this.waveType;
      this.currentOsc.frequency.setValueAtTime(tunedFreq, now);

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
  // FIELD SAMPLER (ZERO-CLICK SAMPLES & SMART RECORDING)
  // ----------------------------------------------------

  async startMicSampling(onAutoStop = null) {
    if (!this.ctx) await this.init();
    
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.micStream);
      
      // Setup live mic analyser for visual VU meter
      const source = this.ctx.createMediaStreamSource(this.micStream);
      this.micAnalyser = this.ctx.createAnalyser();
      this.micAnalyser.fftSize = 128;
      source.connect(this.micAnalyser);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(50);
      this.isRecording = true;
      console.log('[Sampler] Recording started from microphone...');

      // Smart Auto-Stop after 3.2 seconds max to keep buffer clean
      if (this.recordingTimer) clearTimeout(this.recordingTimer);
      this.recordingTimer = setTimeout(async () => {
        if (this.isRecording) {
          console.log('[Sampler] Max duration reached, auto-stopping...');
          await this.stopMicSampling();
          if (onAutoStop) onAutoStop();
        }
      }, 3200);

    } catch (err) {
      console.error('[Sampler] Microphone access error:', err);
      throw err;
    }
  }

  getMicLevel() {
    if (!this.isRecording || !this.micAnalyser) return 0;
    this.micAnalyser.getByteFrequencyData(this.micDataArray);
    let sum = 0;
    for (let i = 0; i < this.micDataArray.length; i++) {
      sum += this.micDataArray[i];
    }
    return sum / (this.micDataArray.length * 255); // 0.0 to 1.0
  }

  async stopMicSampling() {
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }
    if (!this.mediaRecorder || !this.isRecording) return null;

    return new Promise((resolve) => {
      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm; codecs=opus' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        try {
          const decoded = await this.ctx.decodeAudioData(arrayBuffer);
          this.sampleBuffer = this.normalizeAndTrimSample(decoded);
          this.sampleDuration = this.sampleBuffer.duration;
          this.sampleStartOffset = 0;
          console.log('[Sampler] Sample normalized & trimmed! Duration:', this.sampleDuration.toFixed(2), 's');
          resolve(this.sampleBuffer);
        } catch (e) {
          console.error('[Sampler] Decode error:', e);
          resolve(null);
        } finally {
          this.isRecording = false;
          if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
            this.micStream = null;
          }
          this.micAnalyser = null;
        }
      };

      this.mediaRecorder.stop();
    });
  }

  // Trim leading/trailing noise floor and normalize peak gain
  normalizeAndTrimSample(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const data = buffer.getChannelData(0);
    
    // 1. Find start above threshold (-38dB approx 0.012)
    let startIdx = 0;
    while (startIdx < data.length && Math.abs(data[startIdx]) < 0.012) {
      startIdx++;
    }
    startIdx = Math.max(0, startIdx - Math.floor(sampleRate * 0.005)); // 5ms pre-roll

    // 2. Find end
    let endIdx = data.length - 1;
    while (endIdx > startIdx && Math.abs(data[endIdx]) < 0.008) {
      endIdx--;
    }
    endIdx = Math.min(data.length, endIdx + Math.floor(sampleRate * 0.02)); // 20ms post-roll

    const trimmedLength = Math.max(1024, endIdx - startIdx);
    const trimmedBuffer = this.ctx.createBuffer(numChannels, trimmedLength, sampleRate);

    for (let c = 0; c < numChannels; c++) {
      const src = buffer.getChannelData(c);
      const dest = trimmedBuffer.getChannelData(c);
      let maxPeak = 0;

      for (let i = 0; i < trimmedLength; i++) {
        const val = src[startIdx + i] || 0;
        dest[i] = val;
        const abs = Math.abs(val);
        if (abs > maxPeak) maxPeak = abs;
      }

      // Peak normalize to 0.92
      if (maxPeak > 0) {
        const gain = 0.92 / maxPeak;
        for (let i = 0; i < trimmedLength; i++) {
          dest[i] *= gain;
        }
      }
    }

    return trimmedBuffer;
  }

  // Play sample with zero-click micro-fade and universal pitch
  playSample(semitoneOffset = 0, isLoop = false) {
    if (!this.ctx || !this.sampleBuffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.sampleBuffer;
    
    // Pitch shift (Interval + Universal Pitch)
    const totalSemitones = semitoneOffset + this.pitchShift;
    const pitchRate = Math.pow(2, totalSemitones / 12);
    source.playbackRate.setValueAtTime(pitchRate, this.ctx.currentTime);
    source.loop = isLoop;

    // Zero-Click Envelope with 3ms micro-attack & end fade
    const env = this.ctx.createGain();
    const now = this.ctx.currentTime;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.92, now + 0.003); // 3ms smooth attack (NO CLICKS)

    source.connect(env);
    env.connect(this.voiceBus);

    const safeOffset = Math.min(this.sampleStartOffset, this.sampleDuration * 0.9);
    source.start(now, safeOffset);
    return source;
  }

  generateFallbackSample() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 1.2);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
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
  // TAPE LOOPER & DRUMS (ZERO-CLICK DRUM VOICES)
  // ----------------------------------------------------

  initTapeBuffer(bpm = this.bpm) {
    const oldBuffer = this.tapeBuffer;
    const oldLen = this.tapeBufferLength;
    this.bpm = bpm;
    const sampleRate = this.ctx ? this.ctx.sampleRate : 44100;
    const seconds = (this.loopBeats * 60) / this.bpm;
    this.tapeBufferLength = Math.floor(sampleRate * seconds);
    const newBuffer = new Float32Array(this.tapeBufferLength);

    if (oldBuffer && oldLen > 0) {
      // Resample existing audio to fit new loop length without clicks or wiping
      const ratio = oldLen / this.tapeBufferLength;
      for (let i = 0; i < this.tapeBufferLength; i++) {
        const srcIdx = i * ratio;
        const base = Math.floor(srcIdx);
        const frac = srcIdx - base;
        const s1 = oldBuffer[base % oldLen] || 0;
        const s2 = oldBuffer[(base + 1) % oldLen] || 0;
        newBuffer[i] = s1 + frac * (s2 - s1);
      }
      this.tapePlayhead = (this.tapePlayhead / oldLen) * this.tapeBufferLength;
    }

    this.tapeBuffer = newBuffer;
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
          tapeVal = (tapeVal * this.tapeFeedback) + (input[i] * 0.95);
          this.tapeBuffer[idx] = Math.max(-1, Math.min(1, tapeVal));
        }

        output[i] = tapeVal;

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

    this.voiceBus.connect(this.tapeScriptNode);
    this.tapeScriptNode.connect(this.tapeGain);
    this.tapeGain.connect(this.limiter);
  }

  startTape() {
    this.tapePlaybackRate = Math.pow(2, this.pitchShift / 12);
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
    this.tapePlaybackRate = Math.pow(2, this.pitchShift / 12);
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

  // --- Smooth Zero-Click Drum Voices ---

  playKick(vel = 1.0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.09);

    // 2ms micro-attack curve to kill click
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vel * 0.95, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    osc.connect(gain);
    gain.connect(this.voiceBus);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  playSnare(vel = 1.0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.07);
    
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.linearRampToValueAtTime(vel * 0.5, now + 0.002);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.connect(oscGain);
    oscGain.connect(this.voiceBus);
    osc.start(now);
    osc.stop(now + 0.15);

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
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(vel * 0.75, now + 0.002);
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
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vel * 0.55, now + 0.002);
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
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.linearRampToValueAtTime(vel * 0.45, now + offset + 0.002);
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
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
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
    if (this.isRecording && this.micAnalyser) {
      this.micAnalyser.getByteTimeDomainData(array);
    } else if (this.analyser) {
      this.analyser.getByteTimeDomainData(array);
    }
  }
}

// Global engine instance
window.audioEngine = new AudioEngine();
