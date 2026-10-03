/**
 * sk-r1-operator: UI & Visualizer
 * High-performance 60fps Vector Oscilloscope & 240x282 HUD
 */

class UIController {
  constructor() {
    this.canvas = null;
    this.canvasCtx = null;
    this.scopeBuffer = new Uint8Array(512);
    this.isRunning = false;
    
    // DOM Elements
    this.elModeBadge = null;
    this.elActiveNote = null;
    this.elNoteFreq = null;
    this.elParamLabel = null;
    this.elParamValue = null;
    this.elTilt = null;
    this.elRecIndicator = null;
    this.elRecText = null;
    this.elScopeOverlay = null;
    this.elPads = [];
    
    this.paramTabs = {
      pitch: null,
      tone: null,
      delay: null
    };
  }

  init() {
    this.canvas = document.getElementById('oscilloscope');
    this.canvasCtx = this.canvas.getContext('2d', { alpha: false });
    
    this.elModeBadge = document.getElementById('modeBadge');
    this.elActiveNote = document.getElementById('activeNote');
    this.elNoteFreq = document.getElementById('noteFreq');
    this.elParamLabel = document.getElementById('paramLabel');
    this.elParamValue = document.getElementById('paramValue');
    this.elTilt = document.getElementById('valTilt');
    this.elRecIndicator = document.getElementById('recIndicator');
    this.elRecText = document.getElementById('recText');
    this.elScopeOverlay = document.getElementById('scopeOverlay');
    this.elParamTabsContainer = document.getElementById('paramTabs');
    
    this.paramTabs.bpm = document.getElementById('tabBpm');
    this.paramTabs.pitch = document.getElementById('tabPitch');
    this.paramTabs.tone = document.getElementById('tabTone');
    this.paramTabs.delay = document.getElementById('tabDelay');

    this.elPads = [
      document.getElementById('pad0'),
      document.getElementById('pad1'),
      document.getElementById('pad2'),
      document.getElementById('pad3')
    ];

    this.startOscilloscope();
  }

  startOscilloscope() {
    this.isRunning = true;
    const draw = () => {
      if (!this.isRunning) return;
      this.renderScope();
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  renderScope() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.canvasCtx;

    // Deep analog CRT background
    ctx.fillStyle = '#070809';
    ctx.fillRect(0, 0, width, height);

    // Subtle technical grid lines
    ctx.strokeStyle = '#121418';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.moveTo(width * 0.25, 0); ctx.lineTo(width * 0.25, height);
    ctx.moveTo(width * 0.5, 0); ctx.lineTo(width * 0.5, height);
    ctx.moveTo(width * 0.75, 0); ctx.lineTo(width * 0.75, height);
    ctx.stroke();

    const isRec = window.audioEngine && window.audioEngine.isRecording;

    // Pull real-time time-domain audio data
    if (window.audioEngine) {
      window.audioEngine.getScopeData(this.scopeBuffer);
    }

    // Glowing vector beam (Red during Recording, Cyan during Playback)
    ctx.lineWidth = isRec ? 2.0 : 1.5;
    ctx.strokeStyle = isRec ? '#ff3344' : '#00e5ff';
    ctx.shadowBlur = isRec ? 8 : 4;
    ctx.shadowColor = isRec ? '#ff3344' : '#00e5ff';

    ctx.beginPath();
    const sliceWidth = width / this.scopeBuffer.length;
    let x = 0;

    for (let i = 0; i < this.scopeBuffer.length; i++) {
      const v = this.scopeBuffer[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    // If recording: draw live mic level pulse indicator
    if (isRec && window.audioEngine) {
      const level = window.audioEngine.getMicLevel();
      ctx.fillStyle = 'rgba(255, 51, 68, 0.2)';
      ctx.fillRect(0, height - 4, width * Math.min(1.0, level * 2.5), 4);
    }

    // If tape is playing, draw glowing orange tape playhead line
    if (window.audioEngine && (window.audioEngine.isTapePlaying || window.app?.mode === 'tape')) {
      const progress = window.audioEngine.getTapeProgress();
      const headX = progress * width;
      
      ctx.fillStyle = window.audioEngine.isTapeOverdubbing ? '#ff3344' : '#fe5000';
      ctx.fillRect(headX, 0, 2, height);
      
      ctx.fillStyle = '#8b909a';
      ctx.font = '8px monospace';
      ctx.fillText(`TAPE ${Math.floor(progress * 100)}%`, 6, height - 6);
    }
  }

  updateNoteDisplay(noteName, freqText) {
    if (this.elActiveNote) this.elActiveNote.textContent = noteName;
    if (this.elNoteFreq) this.elNoteFreq.textContent = freqText;
  }

  setActiveParamTab(activeKey) {
    Object.keys(this.paramTabs).forEach(key => {
      const tab = this.paramTabs[key];
      if (tab) {
        if (key === activeKey) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      }
    });
  }

  updateParamDisplay(label, value) {
    if (this.elParamLabel) this.elParamLabel.textContent = label;
    if (this.elParamValue) this.elParamValue.textContent = value;
  }

  updateTiltDisplay(tiltXDeg) {
    if (this.elTilt) {
      this.elTilt.textContent = `${tiltXDeg > 0 ? '+' : ''}${Math.round(tiltXDeg)}°`;
    }
  }

  updateMode(modeName) {
    if (this.elModeBadge) {
      this.elModeBadge.textContent = modeName.toUpperCase();
      this.elModeBadge.className = 'mode-badge';
      if (modeName === 'sampler') {
        this.elModeBadge.classList.add('sampler');
      } else if (modeName === 'tape') {
        this.elModeBadge.classList.add('tape');
      }
    }

    // Toggle 4-tabs vs 3-tabs layout for TAPE mode (showing BPM tab)
    if (this.elParamTabsContainer && this.paramTabs.bpm) {
      if (modeName === 'tape') {
        this.elParamTabsContainer.classList.add('four-tabs');
        this.paramTabs.bpm.classList.remove('hidden');
      } else {
        this.elParamTabsContainer.classList.remove('four-tabs');
        this.paramTabs.bpm.classList.add('hidden');
      }
    }

    if (this.elScopeOverlay) {
      this.elScopeOverlay.textContent = modeName === 'sampler' ? 'MIC OSC' : (modeName === 'tape' ? 'TAPE REEL' : 'LIVE OSC');
    }
  }

  setRecordingState(isRec, text = "REC MIC") {
    if (this.elRecIndicator) {
      if (isRec) {
        this.elRecIndicator.classList.add('active');
        if (this.elRecText) this.elRecText.textContent = text;
      } else {
        this.elRecIndicator.classList.remove('active');
      }
    }
    const recBtn = document.getElementById('btnRec');
    if (recBtn) {
      if (isRec) {
        recBtn.classList.add('recording');
      } else {
        recBtn.classList.remove('recording');
      }
    }
  }

  updatePadLabels(labels) {
    labels.forEach((lbl, idx) => {
      if (this.elPads[idx]) {
        const noteEl = this.elPads[idx].querySelector('.pad-note');
        if (noteEl) noteEl.textContent = lbl;
      }
    });
  }

  flashPad(index) {
    const pad = this.elPads[index];
    if (pad) {
      pad.classList.add('triggered');
      setTimeout(() => pad.classList.remove('triggered'), 110);
    }
  }

  // --- QR Code Export Modal Management ---

  showExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) modal.classList.remove('hidden');
  }

  hideExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) modal.classList.add('hidden');
  }

  setExportStatus(text) {
    const statusEl = document.getElementById('exportStatus');
    if (statusEl) statusEl.textContent = text;
  }

  renderQRCode(url) {
    const container = document.getElementById('qrTarget');
    if (!container) return;
    container.innerHTML = '';

    if (window.QRCode) {
      new window.QRCode(container, {
        text: url,
        width: 140,
        height: 140,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
    }

    const link = document.getElementById('directDownloadLink');
    if (link) {
      link.href = url;
      link.style.display = 'inline-block';
    }
  }
}

window.uiController = new UIController();
