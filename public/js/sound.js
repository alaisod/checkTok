/**
 * Sound & Haptic Feedback Module
 * Uses Web Audio API & Vibration API (Zero external audio files required)
 */
const SoundManager = (() => {
  let audioCtx = null;
  let isSoundEnabled = true;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq = 880, type = 'sine', duration = 0.08, gainVal = 0.15) {
    if (!isSoundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }

  return {
    playSuccess() {
      playTone(1050, 'sine', 0.07, 0.2); // Beep สั้นคมชัด
      if (navigator.vibrate) {
        try { navigator.vibrate(35); } catch (_) {}
      }
    },
    playEdit() {
      playTone(650, 'triangle', 0.09, 0.18);
    },
    playWarning() {
      playTone(280, 'sawtooth', 0.15, 0.2); // เสียงเตือน
      if (navigator.vibrate) {
        try { navigator.vibrate([60, 50, 60]); } catch (_) {}
      }
    },
    playBeepError() {
      // เสียง Beep Error โทนต่ำ 2 จังหวะ แจ้งเตือนสแกนผิดพลาดหรือไม่พบสินค้า
      playTone(220, 'sawtooth', 0.15, 0.25);
      setTimeout(() => {
        playTone(180, 'sawtooth', 0.2, 0.25);
      }, 120);
      if (navigator.vibrate) {
        try { navigator.vibrate([100, 60, 120]); } catch (_) {}
      }
    },
    playError() {
      this.playBeepError();
    },
    playbeepError() {
      this.playBeepError();
    },
    toggleSound(state) {
      isSoundEnabled = state !== undefined ? state : !isSoundEnabled;
      return isSoundEnabled;
    },
    isAudioEnabled() {
      return isSoundEnabled;
    },
    initAudio
  };
})();

// Auto-unlock Web Audio API on first touch/click (จำเป็นอย่างยิ่งสำหรับ iOS Safari)
(function unlockAudioForIOS() {
  const unlockEvents = ['touchstart', 'touchend', 'click'];
  function handleUnlock() {
    if (SoundManager && typeof SoundManager.initAudio === 'function') {
      SoundManager.initAudio();
    }
    unlockEvents.forEach((evt) => {
      window.removeEventListener(evt, handleUnlock, true);
    });
  }
  unlockEvents.forEach((evt) => {
    window.addEventListener(evt, handleUnlock, { passive: true, capture: true });
  });
})();
