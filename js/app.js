/**
 * sk-r1-operator: Master App Controller
 * Orchestrates Audio, Hardware, UI, Parameters (Pitch, Tone, Delay), and Tape Looper
 */

class App {
  constructor() {
    this.mode = 'synth'; // 'synth' | 'sampler' | 'tape'
    this.activeParam = 'pitch'; // 'pitch' | 'tone' | 'delay'
    
    // Musical Scale System
    this.rootNoteMidi = 48; // C3
    this.octave = 3;
    this.currentScaleIndex = 0;
    this.scales = [
      { name: 'MIN PENT', intervals: [0, 3, 5, 7, 10] },
      { name: 'MAJ PENT', intervals: [0, 2, 4, 7, 9] },
      { name: 'BLUES',    intervals: [0, 3, 5, 6, 7, 10] },
      { name: 'INSEN',    intervals: [0, 1, 5, 7, 10] },
      { name: 'DORIAN',   intervals: [0, 2, 3, 5, 7, 9, 10] }
    ];
    this.scaleNoteIndex = 0;
    
    this.waveforms = ['sawtooth', 'square', 'triangle', 'sine', 'fm'];
    this.waveformIndex = 0;
    
    this.isAudioUnlocked = false;
    this.isHoldingSustain = false;
    this.lastPadTriggerTime = 0;
  }

  async init() {
    // 1. Initialize UI
    window.uiController.init();

    // 2. Setup Audio Unlock Modal
    const startModal = document.getElementById('startModal');
    const startBtn = document.getElementById('startBtn');
    
    const unlockAudio = async () => {
      if (this.isAudioUnlocked) return;
      await window.audioEngine.init();
      window.hardwareController.init();
      this.bindHardwareEvents();
      this.bindTouchControls();
      this.bindParameterTabs();
      this.bindExportControls();
      this.updateDisplayState();
      
      startModal.classList.add('hidden');
      this.isAudioUnlocked = true;
      console.log('[App] Audio Engine, FX, & Sensors Unlocked.');
    };

    startBtn.addEventListener('click', unlockAudio);
    startModal.addEventListener('touchstart', unlockAudio, { passive: true });

    document.addEventListener('touchstart', () => {
      if (!this.isAudioUnlocked) unlockAudio();
    }, { once: true, passive: true });
  }

  bindParameterTabs() {
    const tabs = ['pitch', 'tone', 'delay'];
    tabs.forEach(tabKey => {
      const el = document.getElementById(`tab${tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}`);
      if (el) {
        el.addEventListener('click', () => {
          this.activeParam = tabKey;
          window.uiController.setActiveParamTab(tabKey);
          this.updateDisplayState();
        });
      }
    });
  }

  bindHardwareEvents() {
    const hw = window.hardwareController;
    const audio = window.audioEngine;

    // Scroll Wheel Up
    hw.onScrollUp = () => {
      this.handleWheelInput(1);
    };

    // Scroll Wheel Down
    hw.onScrollDown = () => {
      this.handleWheelInput(-1);
    };

    // Side Click (PTT Tap)
    hw.onSideClick = () => {
      if (this.mode === 'synth') {
        const freq = this.getCurrentFrequency();
        audio.triggerSynth(freq, false);
        window.uiController.flashPad(0);
      } else if (this.mode === 'sampler') {
        audio.playSample(0);
        window.uiController.flashPad(0);
      } else if (this.mode === 'tape') {
        // Toggle Tape Play / Pause
        if (audio.isTapePlaying) {
          audio.stopTape();
        } else {
          audio.startTape();
        }
        this.updateDisplayState();
      }
    };

    // Side Button Long Press Start (PTT Hold)
    hw.onLongPressStart = async () => {
      if (this.mode === 'sampler') {
        // Start Mic Field Sampling
        this.startSmartRecording();
      } else if (this.mode === 'synth') {
        // Sustain Synth Drone
        this.isHoldingSustain = true;
        const freq = this.getCurrentFrequency();
        audio.triggerSynth(freq, true);
        window.uiController.flashPad(0);
      } else if (this.mode === 'tape') {
        // Analog Tape Stop
        audio.tapeStop();
        this.updateDisplayState();
      }
    };

    // Side Button Long Press End (PTT Release)
    hw.onLongPressEnd = async () => {
      if (this.mode === 'sampler') {
        this.stopSmartRecording();
      } else if (this.mode === 'synth') {
        this.isHoldingSustain = false;
        audio.releaseSynth();
      } else if (this.mode === 'tape') {
        audio.tapeRestart();
        this.updateDisplayState();
      }
    };

    // Accelerometer Tilt
    hw.onTiltUpdate = (x, y, z) => {
      audio.updateKineticFilter(x, y);
      const tiltXDeg = x * 45;
      window.uiController.updateTiltDisplay(tiltXDeg);
      if (this.activeParam === 'tone') {
        this.updateDisplayState();
      }
    };
  }

  handleWheelInput(dir) {
    const audio = window.audioEngine;

    if (this.activeParam === 'pitch') {
      if (this.mode === 'synth') {
        // Step semitones or notes in scale
        this.stepNote(dir);
      } else if (this.mode === 'sampler') {
        // Shift sample pitch in semitones (-24 to +24)
        audio.setPitchShift(audio.pitchShift + dir);
        this.updateDisplayState();
      } else if (this.mode === 'tape') {
        // Shift tape varispeed pitch
        audio.setPitchShift(audio.pitchShift + dir);
        this.updateDisplayState();
      }
    } else if (this.activeParam === 'tone') {
      // Step Lowpass Cutoff frequency by 250Hz
      const step = dir * 250;
      audio.setTone(audio.manualTone + step);
      this.updateDisplayState();
    } else if (this.activeParam === 'delay') {
      // Step Delay Echo amount by 5%
      audio.setDelayAmount(audio.delayAmount + dir * 5);
      this.updateDisplayState();
    }
  }

  bindTouchControls() {
    const audio = window.audioEngine;

    // 4 Performance Pads with strict debounce against double-trigger clicks
    const padIntervals = [0, 3, 7, 12];
    padIntervals.forEach((interval, idx) => {
      const padEl = document.getElementById(`pad${idx}`);
      if (!padEl) return;

      const triggerPad = (isHold = false) => {
        if (!this.isAudioUnlocked) return;
        const now = performance.now();
        if (now - this.lastPadTriggerTime < 45) return; // Prevent double trigger pop
        this.lastPadTriggerTime = now;

        window.uiController.flashPad(idx);

        if (this.mode === 'synth') {
          const baseFreq = this.getCurrentFrequency();
          const padFreq = baseFreq * Math.pow(2, interval / 12);
          audio.triggerSynth(padFreq, isHold);
        } else if (this.mode === 'sampler') {
          audio.playSample(interval);
        } else if (this.mode === 'tape') {
          if (idx === 0) audio.playKick();
          else if (idx === 1) audio.playSnare();
          else if (idx === 2) audio.playHiHat(false);
          else if (idx === 3) audio.playClap();
        }
      };

      // Pointer events for modern unified touch + mouse support
      if (window.PointerEvent) {
        padEl.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          triggerPad(true);
        });
        padEl.addEventListener('pointerup', (e) => {
          e.preventDefault();
          if (this.mode === 'synth') audio.releaseSynth();
        });
      } else {
        padEl.addEventListener('touchstart', (e) => {
          e.preventDefault();
          triggerPad(true);
        });
        padEl.addEventListener('touchend', (e) => {
          e.preventDefault();
          if (this.mode === 'synth') audio.releaseSynth();
        });
        padEl.addEventListener('mousedown', (e) => {
          e.preventDefault();
          triggerPad(false);
        });
        padEl.addEventListener('mouseup', (e) => {
          e.preventDefault();
          if (this.mode === 'synth') audio.releaseSynth();
        });
      }
    });

    // Action Buttons
    const btnMode = document.getElementById('btnMode');
    btnMode.addEventListener('click', () => {
      if (this.mode === 'synth') this.mode = 'sampler';
      else if (this.mode === 'sampler') this.mode = 'tape';
      else this.mode = 'synth';

      window.uiController.updateMode(this.mode);
      this.updateDisplayState();
    });

    const btnWave = document.getElementById('btnWave');
    btnWave.addEventListener('click', () => {
      if (this.mode === 'synth') {
        this.waveformIndex = (this.waveformIndex + 1) % this.waveforms.length;
        const wave = this.waveforms[this.waveformIndex];
        audio.setWaveType(wave);
        this.updateDisplayState();
      } else if (this.mode === 'sampler') {
        // Reset pitch & scrub offset
        audio.setPitchShift(0);
        audio.sampleStartOffset = 0;
        this.updateDisplayState();
      } else if (this.mode === 'tape') {
        if (audio.isTapePlaying) {
          audio.tapeStop();
        } else {
          audio.tapeRestart();
        }
        this.updateDisplayState();
      }
    });

    const btnRec = document.getElementById('btnRec');
    btnRec.addEventListener('click', async () => {
      if (this.mode === 'sampler') {
        if (!audio.isRecording) {
          this.startSmartRecording();
        } else {
          this.stopSmartRecording();
        }
      } else if (this.mode === 'synth') {
        this.isHoldingSustain = !this.isHoldingSustain;
        if (this.isHoldingSustain) {
          const freq = this.getCurrentFrequency();
          audio.triggerSynth(freq, true);
        } else {
          audio.releaseSynth();
        }
        this.updateDisplayState();
      } else if (this.mode === 'tape') {
        audio.toggleOverdub();
        this.updateDisplayState();
      }
    });
  }

  // --- Smart One-Tap Recording Workflow ---

  async startSmartRecording() {
    const audio = window.audioEngine;
    try {
      window.uiController.setRecordingState(true, 'REC MIC...');
      document.getElementById('btnRecVal').textContent = 'STOP REC';
      await audio.startMicSampling(() => {
        // Auto-stop callback
        this.stopSmartRecording();
      });
    } catch (e) {
      console.error('[App] Mic start failed:', e);
      window.uiController.setRecordingState(false);
      this.updateDisplayState();
    }
  }

  async stopSmartRecording() {
    const audio = window.audioEngine;
    window.uiController.setRecordingState(false);
    const buffer = await audio.stopMicSampling();
    if (buffer) {
      audio.playSample(0); // Audition with zero-click envelope
    }
    this.updateDisplayState();
  }

  bindExportControls() {
    const btnExport = document.getElementById('btnExport');
    const closeExport = document.getElementById('closeExport');

    if (btnExport) {
      btnExport.addEventListener('click', () => this.handleExport());
    }
    if (closeExport) {
      closeExport.addEventListener('click', () => window.uiController.hideExportModal());
    }
  }

  async handleExport() {
    window.uiController.showExportModal();
    window.uiController.setExportStatus('ENCODING 16-BIT WAV...');

    await new Promise((r) => setTimeout(r, 100));

    const wavBlob = window.audioEngine.exportMasterWAV();
    if (!wavBlob) {
      window.uiController.setExportStatus('NO TAPE AUDIO TO EXPORT');
      return;
    }

    window.uiController.setExportStatus('GENERATING CLOUD LINK...');
    const downloadUrl = await window.audioEngine.uploadForQRExport(wavBlob);

    if (downloadUrl) {
      window.uiController.setExportStatus('SCAN WITH PHONE CAMERA');
      window.uiController.renderQRCode(downloadUrl);
    } else {
      const localUrl = URL.createObjectURL(wavBlob);
      window.uiController.setExportStatus('OFFLINE: TAP TO DOWNLOAD');
      window.uiController.renderQRCode(localUrl);
    }
  }

  stepNote(dir) {
    const scale = this.scales[this.currentScaleIndex];
    this.scaleNoteIndex += dir;
    
    if (this.scaleNoteIndex >= scale.intervals.length) {
      this.scaleNoteIndex = 0;
      this.octave = Math.min(6, this.octave + 1);
    } else if (this.scaleNoteIndex < 0) {
      this.scaleNoteIndex = scale.intervals.length - 1;
      this.octave = Math.max(1, this.octave - 1);
    }

    this.updateDisplayState();
    
    const freq = this.getCurrentFrequency();
    window.audioEngine.triggerSynth(freq, false);
    window.uiController.flashPad(0);
  }

  getCurrentMidi() {
    const scale = this.scales[this.currentScaleIndex];
    const interval = scale.intervals[this.scaleNoteIndex];
    return (this.octave + 1) * 12 + interval;
  }

  getCurrentFrequency() {
    const midi = this.getCurrentMidi();
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  midiToNoteName(midi) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const note = noteNames[midi % 12];
    const oct = Math.floor(midi / 12) - 1;
    return `${note}${oct}`;
  }

  updateDisplayState() {
    const audio = window.audioEngine;
    const btnWaveLabel = document.getElementById('btnWaveLabel');
    const btnWaveVal = document.getElementById('btnWaveVal');
    const btnRecLabel = document.getElementById('btnRecLabel');
    const btnRecVal = document.getElementById('btnRecVal');
    const btnRec = document.getElementById('btnRec');

    // 1. Parameter Readout based on Active Parameter Tab
    if (this.activeParam === 'pitch') {
      const sign = audio.pitchShift >= 0 ? '+' : '';
      if (this.mode === 'synth') {
        const midi = this.getCurrentMidi();
        window.uiController.updateParamDisplay('PITCH:', `${sign}${audio.pitchShift} ST (${this.midiToNoteName(midi)})`);
      } else {
        window.uiController.updateParamDisplay('PITCH:', `${sign}${audio.pitchShift} SEMITONES`);
      }
    } else if (this.activeParam === 'tone') {
      window.uiController.updateParamDisplay('TONE LPF:', `${Math.round(audio.targetCutoff)} Hz`);
    } else if (this.activeParam === 'delay') {
      window.uiController.updateParamDisplay('ECHO MIX:', `${audio.delayAmount}% (${Math.round(audio.delayTime * 1000)}ms)`);
    }

    // 2. Mode-Specific Display Updates
    if (this.mode === 'synth') {
      const midi = this.getCurrentMidi();
      const noteName = this.midiToNoteName(midi);
      const freq = this.getCurrentFrequency();
      window.uiController.updateNoteDisplay(noteName, `${freq.toFixed(1)}Hz`);
      
      const padLabels = ['ROOT', '+3RD', '+5TH', '+OCT'];
      window.uiController.updatePadLabels(padLabels);

      btnWaveLabel.textContent = 'TIMBRE';
      btnWaveVal.textContent = this.waveforms[this.waveformIndex].toUpperCase();

      btnRecLabel.textContent = 'DRONE';
      btnRecVal.textContent = this.isHoldingSustain ? 'HOLD ON' : 'HOLD OFF';
      btnRec.classList.toggle('active-state', this.isHoldingSustain);
      btnRec.classList.remove('recording');

    } else if (this.mode === 'sampler') {
      const dur = audio.sampleDuration.toFixed(2);
      window.uiController.updateNoteDisplay('SMPL', `${dur}s`);
      
      const padLabels = ['ROOT', '+3ST', '+7ST', '+12ST'];
      window.uiController.updatePadLabels(padLabels);

      btnWaveLabel.textContent = 'PITCH';
      btnWaveVal.textContent = 'RESET';

      btnRecLabel.textContent = 'MIC';
      btnRecVal.textContent = audio.isRecording ? 'STOP REC' : 'TAP REC';
      btnRec.classList.toggle('recording', audio.isRecording);
      btnRec.classList.remove('active-state');

    } else if (this.mode === 'tape') {
      window.uiController.updateNoteDisplay('TAPE', `${audio.bpm} BPM`);

      const padLabels = ['KICK', 'SNARE', 'HIHAT', 'CLAP'];
      window.uiController.updatePadLabels(padLabels);

      btnWaveLabel.textContent = 'MOTOR';
      btnWaveVal.textContent = audio.tapeStopRamping ? 'STOPPING' : (audio.isTapePlaying ? 'TAPE STOP' : 'TAPE START');

      btnRecLabel.textContent = 'LOOP';
      btnRecVal.textContent = audio.isTapeOverdubbing ? 'DUB ON' : 'OVERDUB';
      btnRec.classList.toggle('recording', audio.isTapeOverdubbing);
      btnRec.classList.remove('active-state');
    }
  }
}

// Instantiate and start app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
