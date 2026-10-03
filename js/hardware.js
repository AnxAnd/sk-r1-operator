/**
 * sk-r1-operator: Hardware Bindings
 * Native Rabbit R1 Creations SDK Bridges + Desktop Simulation
 */

class HardwareController {
  constructor() {
    this.isR1Hardware = false;
    this.tiltX = 0;
    this.tiltY = 0;
    this.tiltZ = 0;
    
    // Callbacks to be hooked by app.js
    this.onScrollUp = null;
    this.onScrollDown = null;
    this.onSideClick = null;
    this.onLongPressStart = null;
    this.onLongPressEnd = null;
    this.onTiltUpdate = null;
  }

  init() {
    this.detectEnvironment();
    this.bindR1Events();
    this.initSensors();
    this.bindBrowserFallbacks();
  }

  detectEnvironment() {
    // Check if running inside Rabbit R1 Creations WebView
    if (typeof PluginMessageHandler !== 'undefined' || 
        typeof window.creationSensors !== 'undefined' ||
        typeof window.creationStorage !== 'undefined') {
      this.isR1Hardware = true;
      console.log('[Hardware] Connected to Rabbit R1 Creations Bridge.');
    } else {
      this.isR1Hardware = false;
      console.log('[Hardware] Running in Web / Desktop Emulation Mode.');
    }
  }

  bindR1Events() {
    // 1. Scroll Wheel Events
    window.addEventListener('scrollUp', () => {
      console.log('[Hardware] scrollUp');
      if (this.onScrollUp) this.onScrollUp();
    });

    window.addEventListener('scrollDown', () => {
      console.log('[Hardware] scrollDown');
      if (this.onScrollDown) this.onScrollDown();
    });

    // 2. Side Button (PTT) Events
    window.addEventListener('sideClick', () => {
      console.log('[Hardware] sideClick');
      if (this.onSideClick) this.onSideClick();
    });

    window.addEventListener('longPressStart', () => {
      console.log('[Hardware] longPressStart');
      if (this.onLongPressStart) this.onLongPressStart();
    });

    window.addEventListener('longPressEnd', () => {
      console.log('[Hardware] longPressEnd');
      if (this.onLongPressEnd) this.onLongPressEnd();
    });
  }

  async initSensors() {
    if (typeof window.creationSensors !== 'undefined' && window.creationSensors.accelerometer) {
      try {
        const isAvailable = await window.creationSensors.accelerometer.isAvailable();
        if (isAvailable) {
          window.creationSensors.accelerometer.start((data) => {
            // Values are normalized -1 to +1
            // x: positive = tilt right, negative = tilt left
            // y: positive = tilt forward, negative = tilt back
            // z: positive = facing up, negative = facing down
            const x = data.tiltX !== undefined ? data.tiltX : (data.x || 0);
            const y = data.tiltY !== undefined ? data.tiltY : (data.y || 0);
            const z = data.tiltZ !== undefined ? data.tiltZ : (data.z || 0);
            
            this.handleTilt(x, y, z);
          }, { frequency: 60 });
          console.log('[Hardware] R1 Accelerometer activated at 60Hz.');
        }
      } catch (err) {
        console.warn('[Hardware] R1 Accelerometer init warning:', err);
      }
    }
  }

  handleTilt(x, y, z) {
    this.tiltX = x;
    this.tiltY = y;
    this.tiltZ = z;

    if (this.onTiltUpdate) {
      this.onTiltUpdate(this.tiltX, this.tiltY, this.tiltZ);
    }
  }

  bindBrowserFallbacks() {
    // Scroll wheel simulation via mouse wheel
    window.addEventListener('wheel', (e) => {
      if (e.deltaY < 0) {
        if (this.onScrollUp) this.onScrollUp();
      } else if (e.deltaY > 0) {
        if (this.onScrollDown) this.onScrollDown();
      }
    }, { passive: true });

    // Keyboard controls for desktop development
    let spacePressed = false;
    let spaceTimeout = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;

      if (e.key === 'ArrowUp') {
        if (this.onScrollUp) this.onScrollUp();
      } else if (e.key === 'ArrowDown') {
        if (this.onScrollDown) this.onScrollDown();
      } else if (e.code === 'Space') {
        e.preventDefault();
        spacePressed = true;
        // Start potential long press
        spaceTimeout = setTimeout(() => {
          if (spacePressed && this.onLongPressStart) {
            this.onLongPressStart();
          }
        }, 300);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (spaceTimeout) clearTimeout(spaceTimeout);
        
        if (spacePressed) {
          if (this.onLongPressEnd) {
            this.onLongPressEnd();
          }
          if (this.onSideClick) {
            this.onSideClick();
          }
        }
        spacePressed = false;
      }
    });

    // DeviceOrientation API fallback for mobile browser testing
    if (window.DeviceOrientationEvent && !this.isR1Hardware) {
      window.addEventListener('deviceorientation', (e) => {
        // gamma: left-to-right tilt in degrees [-90, 90]
        // beta: front-to-back tilt in degrees [-180, 180]
        if (e.gamma !== null && e.beta !== null) {
          const normX = Math.max(-1, Math.min(1, e.gamma / 45));
          const normY = Math.max(-1, Math.min(1, (e.beta - 45) / 45));
          this.handleTilt(normX, normY, 0);
        }
      });
    }

    // Mouse movement simulation over window for tilt testing on desktop
    if (!this.isR1Hardware) {
      window.addEventListener('mousemove', (e) => {
        // Normalize mouse pos across the 240x282 viewport
        const rect = document.getElementById('r1-container')?.getBoundingClientRect() || {
          left: 0, top: 0, width: 240, height: 282
        };
        const relX = (e.clientX - rect.left) / rect.width;
        const relY = (e.clientY - rect.top) / rect.height;

        const normX = Math.max(-1, Math.min(1, (relX - 0.5) * 2));
        const normY = Math.max(-1, Math.min(1, (relY - 0.5) * 2));
        this.handleTilt(normX, normY, 0);
      });
    }
  }

  // Storage wrapper using R1 CreationStorage
  async saveSetting(key, val) {
    const serialized = btoa(JSON.stringify(val));
    if (typeof window.creationStorage !== 'undefined' && window.creationStorage.plain) {
      await window.creationStorage.plain.setItem(key, serialized);
    } else {
      localStorage.setItem(`sk_r1_${key}`, serialized);
    }
  }

  async loadSetting(key) {
    try {
      let serialized = null;
      if (typeof window.creationStorage !== 'undefined' && window.creationStorage.plain) {
        serialized = await window.creationStorage.plain.getItem(key);
      } else {
        serialized = localStorage.getItem(`sk_r1_${key}`);
      }
      if (serialized) {
        return JSON.parse(atob(serialized));
      }
    } catch (e) {
      console.warn('[Hardware] Error loading setting:', key, e);
    }
    return null;
  }
}

window.hardwareController = new HardwareController();
