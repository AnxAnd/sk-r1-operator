/**
 * sk-r1-operator: Master App Controller (Phase 2)
 * Orchestrates Audio, Hardware, UI, Tape Looper, and QR Export
 */

class App {
  constructor() {
    this.mode = 'synth'; // 'synth' | 'sampler' | 'tape'
    
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
      this.bindExportControls();
      this.updateDisplayState();
      
      startModal.classList.add('hidden');
      this.isAudioUnlocked = true;
      console.log('[App] Audio, Sensors, & Looper Unlocked.');
    };

    startBtn.addEventListener('click', unlockAudio);
    startModal.addEventListener('touchstart', unlockAudio, { passive: true });

    // R1 device touch trigger fallback
    document.addEventListener('touchstart', () => {
      if (!this.isAudioUnlocked) unlockAudio();
    }, { once: true, passive: true });
  }

  bindHardwareEvents() {
    const hw = window.hardwareController;
    const audio = window.audioEngine;

    // Scroll Wheel Up
    hw.onScrollUp = () => {
      if (this.mode === 'synth') {
        this.stepNote(1);
      } else if (this.mode === 'sampler') {
        // Scrub sample start offset (+50ms)
        audio.sampleStartOffset = Math.min(
          audio.sampleDuration * 0.8,
          audio.sampleStartOffset + 0.05
        );
        this.updateDisplayState();
      } else if (this.mode === 'tape') {
        // Increase BPM (+2)
        const newBpm = Math.min(180, audio.bpm + 2);
        audio.initTapeBuffer(newBpm);
        this.updateDisplayState();
      }
    };

    // Scroll Wheel Down
    hw.onScrollDown = () => {
      if (this.mode === 'synth') {
        this.stepNote(-1);
      } else if (this.mode === 'sampler') {
        // Scrub sample start offset (-50ms)
        audio.sampleStartOffset = Math.max(0, audio.sampleStartOffset - 0.05);
        this.updateDisplayState();
      } else if (this.mode === 'tape') {
        // Decrease BPM (-2)
        const newBpm = Math.max(50, audio.bpm - 2);
        audio.initTapeBuffer(newBpm);
        this.updateDisplayState();
      }
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
        try {
          await audio.startMicSampling();
          window.uiController.setRecordingState(true);
        } catch (e) {
          console.error('[App] Mic start failed:', e);
        }
      } else if (this.mode === 'synth') {
        // Sustain Synth Drone
        this.isHoldingSustain = true;
        const freq = this.getCurrentFrequency();
        audio.triggerSynth(freq, true);
        window.uiController.flashPad(0);
      } else if (this.mode === 'tape') {
        // Authentic Analog Tape Stop deceleration
        audio.tapeStop();
        this.updateDisplayState();
      }
    };

    // Side Button Long Press End (PTT Release)
    hw.onLongPressEnd = async () => {
      if (this.mode === 'sampler') {
        // Stop Mic Sampling & Normalize
        const buffer = await audio.stopMicSampling();
        window.uiController.setRecordingState(false);
        if (buffer) {
          audio.playSample(0); // Audition sample
        }
      } else if (this.mode === 'synth') {
        // Release Synth Drone
        this.isHoldingSustain = false;
        audio.releaseSynth();
      } else if (this.mode === 'tape') {
        // Restart tape motor
        audio.tapeRestart();
        this.updateDisplayState();
      }
    };

    // Accelerometer Tilt
    hw.onTiltUpdate = (x, y, z) => {
      // Feed to Audio Kinetic Filter
      audio.updateKineticFilter(x, y);
      
      // Update UI Telemetry
      const tiltXDeg = x * 45; // Approx angle
      window.uiController.updateTelemetry(audio.targetCutoff, audio.targetQ, tiltXDeg);
    };
  }

  bindTouchControls() {
    const audio = window.audioEngine;

    // 4 Performance Pads
    const padIntervals = [0, 3, 7, 12]; // Root, Minor 3rd, 5th, Octave
    padIntervals.forEach((interval, idx) => {
      const padEl = document.getElementById(`pad${idx}`);
      if (!padEl) return;

      const triggerPad = (isHold = false) => {
        if (!this.isAudioUnlocked) return;
        window.uiController.flashPad(idx);

        if (this.mode === 'synth') {
          const baseFreq = this.getCurrentFrequency();
          const padFreq = baseFreq * Math.pow(2, interval / 12);
          audio.triggerSynth(padFreq, isHold);
        } else if (this.mode === 'sampler') {
          audio.playSample(interval);
        } else if (this.mode === 'tape') {
          // Trigger Casio Vintage Drums (Kick, Snare, HiHat, Clap)
          if (idx === 0) audio.playKick();
          else if (idx === 1) audio.playSnare();
          else if (idx === 2) audio.playHiHat(false);
          else if (idx === 3) audio.playClap();
        }
      };

      padEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        triggerPad(true);
      });

      padEl.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (this.mode === 'synth') {
          audio.releaseSynth();
        }
      });

      padEl.addEventListener('mousedown', () => triggerPad(false));
      padEl.addEventListener('mouseup', () => {
        if (this.mode === 'synth') {
          audio.releaseSynth();
        }
      });
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
        btnWave.querySelector('b').textContent = wave.toUpperCase();
      } else if (this.mode === 'sampler') {
        // Reset offset
        audio.sampleStartOffset = 0;
        this.updateDisplayState();
      } else if (this.mode === 'tape') {
        // Tape Stop effect trigger
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
          try {
            await audio.startMicSampling();
            window.uiController.setRecordingState(true);
          } catch (e) {
            console.error('[App] Rec failed:', e);
          }
        } else {
          await audio.stopMicSampling();
          window.uiController.setRecordingState(false);
          audio.playSample(0);
        }
      } else if (this.mode === 'synth') {
        // Toggle Drone Hold
        this.isHoldingSustain = !this.isHoldingSustain;
        if (this.isHoldingSustain) {
          const freq = this.getCurrentFrequency();
          audio.triggerSynth(freq, true);
          btnRec.classList.add('active-state');
        } else {
          audio.releaseSynth();
          btnRec.classList.remove('active-state');
        }
      } else if (this.mode === 'tape') {
        // Toggle Loop Overdub
        const isDub = audio.toggleOverdub();
        if (isDub) {
          btnRec.classList.add('recording');
        } else {
          btnRec.classList.remove('recording');
        }
        this.updateDisplayState();
      }
    });
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

    // Small delay to allow UI render
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
      // Local blob URL fallback
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
    
    // Quick preview click of note
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
    const btnWave = document.getElementById('btnWave');
    const btnRec = document.getElementById('btnRec');

    if (this.mode === 'synth') {
      const midi = this.getCurrentMidi();
      const noteName = this.midiToNoteName(midi);
      const freq = this.getCurrentFrequency();
      window.uiController.updateNoteDisplay(noteName, freq);
      
      const padLabels = ['ROOT', '+3RD', '+5TH', '+OCT'];
      window.uiController.updatePadLabels(padLabels);

      btnWave.querySelector('span').textContent = 'TIMBRE';
      btnWave.querySelector('b').textContent = this.waveforms[this.waveformIndex].toUpperCase();

      btnRec.querySelector('span').textContent = 'DRONE';
      btnRec.querySelector('b').textContent = this.isHoldingSustain ? 'HOLD ON' : 'HOLD OFF';
    } else if (this.mode === 'sampler') {
      const offsetMs = Math.round(audio.sampleStartOffset * 1000);
      const dur = audio.sampleDuration.toFixed(2);
      window.uiController.updateNoteDisplay('SMPL', parseFloat(dur));
      document.getElementById('noteFreq').textContent = `OFFS:${offsetMs}ms`;
      
      const padLabels = ['ROOT', '+3ST', '+7ST', '+12ST'];
      window.uiController.updatePadLabels(padLabels);

      btnWave.querySelector('span').textContent = 'SCRUB';
      btnWave.querySelector('b').textContent = 'RESET';

      btnRec.querySelector('span').textContent = 'MIC';
      btnRec.querySelector('b').textContent = 'RECORD';
    } else if (this.mode === 'tape') {
      // Tape Looper Mode
      const status = audio.isTapeOverdubbing ? 'OVERDUB' : (audio.isTapePlaying ? 'PLAYING' : 'STOPPED');
      window.uiController.updateNoteDisplay('TAPE', audio.bpm);
      document.getElementById('noteFreq').textContent = `${audio.bpm} BPM`;

      const padLabels = ['KICK', 'SNARE', 'HIHAT', 'CLAP'];
      window.uiController.updatePadLabels(padLabels);

      btnWave.querySelector('span').textContent = 'MOTOR';
      btnWave.querySelector('b').textContent = audio.tapeStopRamping ? 'STOPPING' : 'TAPE STOP';

      btnRec.querySelector('span').textContent = 'LOOP';
      btnRec.querySelector('b').textContent = audio.isTapeOverdubbing ? 'DUB ON' : 'OVERDUB';
    }
  }
}

// Instantiate and start app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
