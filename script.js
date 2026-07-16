(function () {
  "use strict";

  /**
   * Initializes all interactive components.
   */
  function initializeApp() {
    initScrollReveal();
    initStatsCounter();
    initSongRows();
    initMusicLab();
    initGalleryMatrix();
    initStageShowBuilder();
  }

  /* ================================
     SCROLL REVEAL
     ================================ */

  /**
   * Reveals elements when they enter the viewport.
   */
  function initScrollReveal() {
    const elements = document.querySelectorAll(
      ".intro__container, .albums__header, .albums__grid, .lab__header, .lab__board, .songs__header, .songs__rows, .gallery__header, .gallery__grid, .stage-show__header, .stage-show__panel, .outro__content"
    );

    if (elements.length === 0) {
      return;
    }

    elements.forEach((el) => {
      el.classList.add("reveal");
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    elements.forEach((el) => {
      observer.observe(el);
    });
  }

  /* ================================
     STATS COUNTER
     ================================ */

  /**
   * Animates stat numbers from 0 to their target value.
   */
  function initStatsCounter() {
    const counters = document.querySelectorAll("[data-count]");
    if (counters.length === 0) {
      return;
    }

    let hasAnimated = false;
    const introSection = document.querySelector(".intro");
    if (!introSection) {
      return;
    }

    /**
     * Animates a single counter element.
     * @param {HTMLElement} counter The counter element.
     */
    function animateCounter(counter) {
      const target = parseInt(counter.getAttribute("data-count"), 10);
      const duration = 1500;
      const startTime = performance.now();

      /**
       * Updates counter on each frame.
       * @param {number} currentTime Current timestamp.
       */
      function updateCount(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(eased * target);
        counter.textContent = current.toLocaleString();

        if (progress < 1) {
          requestAnimationFrame(updateCount);
        } else {
          counter.textContent = target.toLocaleString();
        }
      }

      requestAnimationFrame(updateCount);
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !hasAnimated) {
          hasAnimated = true;
          counters.forEach(animateCounter);
          observer.disconnect();
        }
      });
    }, { threshold: 0.3 });

    observer.observe(introSection);
  }

  /* ================================
     SONG ROWS - THEME MANAGER
     ================================ */

  const SONG_THEMES = {
    "rap-god": { primary: "#00FFFF", glow: "#00FFFF" },
    "lose-yourself": { primary: "#FF8C00", glow: "#FF8C00" },
    "godzilla": { primary: "#cc0001", glow: "#32CD32" },
    "without-me": { primary: "#FFD700", glow: "#FF00FF" },
    "houdini": { primary: "#4B0082", glow: "#FFD700" }
  };

  let currentSongSoundPreset = "classic";
  const songSoundPresetListeners = new Set();
  let songDeckController = null;

  /**
   * Applies a named sound preset to a song filter chain.
   * @param {object} chain Filter nodes for one song.
   * @param {string} preset Preset name.
   */
  function applySongSoundPreset(chain, preset) {
    const now = chain.ctx.currentTime;

    if (preset === "neon") {
      chain.low.gain.setValueAtTime(-2.5, now);
      chain.mid.gain.setValueAtTime(2.8, now);
      chain.high.gain.setValueAtTime(6.5, now);
      chain.compressor.threshold.setValueAtTime(-20, now);
      chain.compressor.ratio.setValueAtTime(3.2, now);
      return;
    }

    if (preset === "high-contrast") {
      chain.low.gain.setValueAtTime(5.5, now);
      chain.mid.gain.setValueAtTime(3.2, now);
      chain.high.gain.setValueAtTime(7.2, now);
      chain.compressor.threshold.setValueAtTime(-24, now);
      chain.compressor.ratio.setValueAtTime(4.6, now);
      return;
    }

    chain.low.gain.setValueAtTime(2.8, now);
    chain.mid.gain.setValueAtTime(-0.8, now);
    chain.high.gain.setValueAtTime(-1.5, now);
    chain.compressor.threshold.setValueAtTime(-18, now);
    chain.compressor.ratio.setValueAtTime(2.4, now);
  }

  /**
   * Subscribes a listener to song sound preset changes.
   * @param {Function} listener Listener callback.
   */
  function registerSongSoundPresetListener(listener) {
    songSoundPresetListeners.add(listener);
    listener(currentSongSoundPreset);
  }

  /**
   * Sets the global song sound preset.
   * @param {string} preset Preset name.
   */
  function setSongSoundPreset(preset) {
    currentSongSoundPreset = preset;
    songSoundPresetListeners.forEach((listener) => {
      listener(preset);
    });
  }

  /**
   * Applies theme colors to a song row.
   * @param {HTMLElement} row The song row element.
   */
  function applyTheme(row) {
    const songId = row.getAttribute("data-song");
    const theme = SONG_THEMES[songId];
    if (theme) {
      row.style.setProperty("--song-primary", theme.primary);
      row.style.setProperty("--song-glow", theme.glow);
    }
  }

  /* ================================
     SONG ROWS - VISUALIZER
     ================================ */

  /**
   * Creates a vertical bar EQ visualizer driven by Web Audio API.
   * @param {HTMLVideoElement} video The video element to analyze.
   * @param {HTMLCanvasElement} canvas The canvas to draw on.
   * @param {HTMLElement} row The parent row for theme colors.
   * @return {{start: Function, stop: Function}} Control handles.
   */
  function createVisualizer(video, canvas, row) {
    const ctx = canvas.getContext("2d");
    let audioCtx = null;
    let analyser = null;
    let source = null;
    let presetRegistered = false;
    let animId = null;
    let isConnected = false;

    /**
     * Connects Web Audio API to the video element.
     */
    function connect() {
      if (isConnected) {
        return;
      }
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;

      const low = audioCtx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 170;

      const mid = audioCtx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1400;
      mid.Q.value = 0.9;

      const high = audioCtx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 3600;

      const compressor = audioCtx.createDynamicsCompressor();
      compressor.attack.value = 0.01;
      compressor.release.value = 0.2;

      source = audioCtx.createMediaElementSource(video);
      source.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(compressor);
      compressor.connect(analyser);
      compressor.connect(audioCtx.destination);

      if (!presetRegistered) {
        registerSongSoundPresetListener((preset) => {
          applySongSoundPreset({ ctx: audioCtx, low, mid, high, compressor }, preset);
        });
        presetRegistered = true;
      }

      isConnected = true;
    }

    /**
     * Draws vertical equalizer bars each frame.
     */
    function draw() {
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const width = canvas.width;
      const height = canvas.height;
      const glowColor = getComputedStyle(row).getPropertyValue("--song-glow").trim();
      const primaryColor = getComputedStyle(row).getPropertyValue("--song-primary").trim();

      ctx.clearRect(0, 0, width, height);

      const barCount = bufferLength;
      const gap = 3;
      const barWidth = (width - gap * (barCount - 1)) / barCount;

      for (let i = 0; i < barCount; i++) {
        const barHeight = (dataArray[i] / 255) * height;
        const x = i * (barWidth + gap);
        const y = height - barHeight;

        const gradient = ctx.createLinearGradient(x, height, x, y);
        gradient.addColorStop(0, primaryColor);
        gradient.addColorStop(1, glowColor);

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 6;
        ctx.shadowColor = glowColor;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      ctx.shadowBlur = 0;
      animId = requestAnimationFrame(draw);
    }

    return {
      start() {
        connect();
        if (audioCtx.state === "suspended") {
          audioCtx.resume();
        }
        canvas.width = canvas.offsetWidth * 2;
        canvas.height = canvas.offsetHeight * 2;
        draw();
      },
      stop() {
        if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }

  /* ================================
     SONG ROWS - INIT
     ================================ */

  /**
   * Initializes all song row interactions.
   */
  function initSongRows() {
    const rows = document.querySelectorAll(".song-row");
    if (rows.length === 0) {
      return;
    }

    const rowStates = [];

    rows.forEach((row) => {
      applyTheme(row);

      const videoWrap = row.querySelector(".song-row__video");
      const video = row.querySelector(".song-row__player");
      const btn = row.querySelector(".song-row__play-btn");
      const info = row.querySelector(".song-row__info");
      const canvas = row.querySelector(".song-row__visualizer");

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "song-row__toggle-btn";
      toggleBtn.type = "button";
      toggleBtn.textContent = "Full Width";
      toggleBtn.setAttribute("aria-label", "Expand video to full width");
      videoWrap.appendChild(toggleBtn);

      let visualizer = null;

      const state = { row, video, btn, info, videoWrap, visualizer };
      rowStates.push(state);

      // Play/pause
      btn.addEventListener("click", () => {
        if (video.paused) {
          // Pause all other videos
          rowStates.forEach((other) => {
            if (other.video !== video && !other.video.paused) {
              pauseRow(other);
            }
          });
          // Initialize visualizer on first play
          if (!visualizer && canvas) {
            visualizer = createVisualizer(video, canvas, row);
            state.visualizer = visualizer;
          }
          video.play();
          btn.hidden = true;
          row.classList.add("is-active");
          if (visualizer) {
            visualizer.start();
          }
        } else {
          pauseRow(state);
        }
      });

      // Click video to pause
      video.addEventListener("click", () => {
        if (!video.paused) {
          pauseRow(state);
        }
      });

      // Ended
      video.addEventListener("ended", () => {
        btn.hidden = false;
        btn.querySelector(".material-symbols-outlined").textContent = "replay";
        row.classList.remove("is-active");
        if (visualizer) {
          visualizer.stop();
        }
      });

      /**
       * Toggles expanded video mode and updates button copy.
       */
      function toggleExpandedMode() {
        const isExpanded = videoWrap.classList.toggle("is-expanded");
        if (isExpanded) {
          info.classList.add("is-hidden");
          toggleBtn.textContent = "Back to Visualizer";
          toggleBtn.setAttribute("aria-label", "Return to visualizer view");
        } else {
          info.classList.remove("is-hidden");
          toggleBtn.textContent = "Full Width";
          toggleBtn.setAttribute("aria-label", "Expand video to full width");
        }
      }

      // Expand toggle on video container double-click
      videoWrap.addEventListener("dblclick", toggleExpandedMode);

      // Expand toggle with explicit button for easier discovery
      toggleBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleExpandedMode();
      });
    });

    /**
     * Pauses a song row and resets its state.
     * @param {object} state The row state object.
     */
    function pauseRow(state) {
      state.video.pause();
      state.btn.hidden = false;
      state.btn.querySelector(".material-symbols-outlined").textContent = "play_arrow";
      state.row.classList.remove("is-active");
      if (state.visualizer) {
        state.visualizer.stop();
      }
    }

    songDeckController = {
      playSongById(songId) {
        const target = rowStates.find((state) => state.row.getAttribute("data-song") === songId);
        if (!target) {
          return false;
        }

        rowStates.forEach((other) => {
          if (other.video !== target.video && !other.video.paused) {
            pauseRow(other);
          }
        });

        if (!target.visualizer) {
          const canvas = target.row.querySelector(".song-row__visualizer");
          if (canvas) {
            target.visualizer = createVisualizer(target.video, canvas, target.row);
          }
        }

        target.video.play();
        target.btn.hidden = true;
        target.row.classList.add("is-active");
        if (target.visualizer) {
          target.visualizer.start();
        }
        return true;
      },
      pauseAll() {
        rowStates.forEach((state) => {
          if (!state.video.paused) {
            pauseRow(state);
          }
        });
      },
      getSongIds() {
        return rowStates.map((state) => state.row.getAttribute("data-song"));
      }
    };
  }

  /* ================================
     MUSIC LAB
     ================================ */

  /**
   * Synthesizes a kick drum hit using Web Audio API.
   * @param {AudioContext} ctx The shared audio context.
   * @param {AudioNode} dest The destination node (e.g. analyser).
   * @param {number} pitchMod Pitch multiplier from the synth slider (0-1).
   * @param {string} variant 'kick1' or 'kick2' for different characters.
   */
  function synthKick(ctx, dest, pitchMod, variant) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startFreq = variant === "kick1" ? 160 + pitchMod * 120 : 100 + pitchMod * 80;
    // slider left = tight punch (0.35s), slider right = boomy sustain (1.2s)
    const decay = 0.35 + pitchMod * 0.85;
    const now = ctx.currentTime;

    osc.connect(gain);
    gain.connect(dest);

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + decay);

    gain.gain.setValueAtTime(1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

    osc.start(now);
    osc.stop(now + decay + 0.05);
  }

  /**
   * Synthesizes a snare drum hit using Web Audio API.
   * @param {AudioContext} ctx The shared audio context.
   * @param {AudioNode} dest The destination node.
   * @param {number} pitchMod Pitch multiplier from the synth slider (0-1).
   * @param {string} variant 'snare1' or 'snare2' for different tones.
   */
  function synthSnare(ctx, dest, pitchMod, variant) {
    // slider left = snappy (0.18s), slider right = fat rimshot (0.55s)
    const decay = 0.18 + pitchMod * 0.37;
    const bufferSize = ctx.sampleRate * (decay + 0.05);
    const buffer = ctx.createBuffer(1, Math.ceil(bufferSize), ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = variant === "snare1"
      ? 900 + pitchMod * 1200
      : 1800 + pitchMod * 1000;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    const now = ctx.currentTime;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

    noise.start(now);
    noise.stop(now + decay + 0.05);
  }

  /**
   * Synthesizes a plucked guitar string using Karplus-Strong-inspired approach.
   * @param {AudioContext} ctx The shared audio context.
   * @param {AudioNode} dest The destination node.
   * @param {number} pitchMod Pitch multiplier from the synth slider (0-1).
   * @param {string} variant 'guitar1' = power chord, 'guitar2' = riff hit.
   */
  /**
   * Synthesizes a hi-hat cymbal hit.
   * @param {AudioContext} ctx The shared audio context.
   * @param {AudioNode} dest The destination node.
   * @param {number} pitchMod Pitch modifier 0-1.
   * @param {string} variant 'hihat1' = closed, 'hihat2' = open.
   */
  function synthDrum(ctx, dest, pitchMod, variant) {
    const now = ctx.currentTime;

    if (variant === "hihat1" || variant === "hihat2") {
      // slider left = tight (0.05s closed / 0.2s open), right = splashy (0.15s / 0.7s)
      const decay = variant === "hihat1"
        ? 0.05 + pitchMod * 0.1
        : 0.2 + pitchMod * 0.5;
      const bufSize = Math.ceil(ctx.sampleRate * (decay + 0.05));
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 6000 + pitchMod * 4000;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

      src.connect(hp);
      hp.connect(gain);
      gain.connect(dest);
      src.start(now);
      src.stop(now + decay + 0.05);

    } else {
      const freq = variant === "tom1"
        ? 160 + pitchMod * 120
        : 70 + pitchMod * 60;
      // slider left = short hit (0.25s / 0.4s), right = big resonant boom (0.8s / 1.4s)
      const decay = variant === "tom1"
        ? 0.25 + pitchMod * 0.55
        : 0.4 + pitchMod * 1.0;

      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + decay);

      const noise = ctx.createBufferSource();
      const nBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.03), ctx.sampleRate);
      const nData = nBuf.getChannelData(0);
      for (let i = 0; i < nData.length; i++) {
        nData[i] = Math.random() * 2 - 1;
      }
      noise.buffer = nBuf;

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.2, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      const ampEnv = ctx.createGain();
      ampEnv.gain.setValueAtTime(0.75, now);
      ampEnv.gain.exponentialRampToValueAtTime(0.001, now + decay);

      osc.connect(ampEnv);
      noise.connect(noiseGain);
      noiseGain.connect(ampEnv);
      ampEnv.connect(dest);

      osc.start(now);
      osc.stop(now + decay + 0.05);
      noise.start(now);
      noise.stop(now + 0.05);
    }
  }

  /**
   * Synthesizes a real vinyl DJ scratch using filtered noise with a
   * bandpass sweep that mimics the "wah" of a record being pushed and pulled.
   * @param {AudioContext} ctx The shared audio context.
   * @param {AudioNode} dest The destination node.
   * @param {number} pitchMod Pitch modifier 0-1 (shifts sweep range).
   * @param {string} variant 'scratch1' = forward-back scratch, 'scratch2' = baby scratch.
   */
  function synthScratch(ctx, dest, pitchMod, variant) {
    const baseShift = pitchMod * 1200;
    const now = ctx.currentTime;

    /**
     * Plays one scratch stroke (forward = freq sweeps up, back = sweeps down).
     * @param {number} startTime AudioContext time to begin.
     * @param {number} duration Stroke length in seconds.
     * @param {boolean} forward True sweeps frequency up, false sweeps down.
     * @param {number} amplitude Gain peak 0-1.
     */
    function stroke(startTime, duration, forward, amplitude) {
      const bufSize = Math.ceil(ctx.sampleRate * duration * 1.2);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.Q.value = 4.5;

      const startFreq = forward ? 300 + baseShift * 0.3 : 2200 + baseShift;
      const endFreq   = forward ? 2200 + baseShift      : 300 + baseShift * 0.3;
      bandpass.frequency.setValueAtTime(startFreq, startTime);
      bandpass.frequency.exponentialRampToValueAtTime(
        Math.max(endFreq, 20),
        startTime + duration
      );

      const lowcut = ctx.createBiquadFilter();
      lowcut.type = "highpass";
      lowcut.frequency.value = 180;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(amplitude, startTime + 0.01);
      gain.gain.setValueAtTime(amplitude, startTime + duration - 0.02);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);

      src.connect(bandpass);
      bandpass.connect(lowcut);
      lowcut.connect(gain);
      gain.connect(dest);

      src.start(startTime);
      src.stop(startTime + duration + 0.05);
    }

    if (variant === "scratch1") {
      stroke(now,        0.18, true,  0.9);
      stroke(now + 0.2,  0.14, false, 0.75);
    } else {
      stroke(now,        0.1,  true,  0.9);
      stroke(now + 0.12, 0.07, false, 0.8);
      stroke(now + 0.21, 0.1,  true,  0.85);
      stroke(now + 0.33, 0.06, false, 0.7);
    }
  }

  /**
   * Initializes the Music Lab beat pad section with record/playback.
   */
  function initMusicLab() {
    const canvas = document.getElementById("lab-canvas");
    const slider = document.getElementById("lab-synth");
    const pads = document.querySelectorAll(".lab__pad");
    const recordBtn = document.getElementById("lab-record");
    const playBtn = document.getElementById("lab-play");
    const clearBtn = document.getElementById("lab-clear");

    if (!canvas || !slider || pads.length === 0) {
      return;
    }

    const ctx2d = canvas.getContext("2d");
    let audioCtx = null;
    let analyser = null;
    let animId = null;

    /** @type {Array<{sound: string, pitchMod: number, time: number}>} */
    let recording = [];
    let isRecording = false;
    let recordStartTime = 0;
    let playbackTimeouts = [];

    /** Lazily creates AudioContext on first user gesture. */
    function getAudioCtx() {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.75;
        analyser.connect(audioCtx.destination);
        startViz();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      return audioCtx;
    }

    /**
     * Fires the correct synth function for a given sound ID.
     * @param {AudioContext} ac The active audio context.
     * @param {string} sound The sound identifier string.
     * @param {number} pitchMod Pitch modifier value 0-1.
     */
    function triggerSound(ac, sound, pitchMod) {
      switch (sound) {
        case "kick1":
        case "kick2":
          synthKick(ac, analyser, pitchMod, sound);
          break;
        case "snare1":
        case "snare2":
          synthSnare(ac, analyser, pitchMod, sound);
          break;
        case "hihat1":
        case "hihat2":
        case "tom1":
        case "tom2":
          synthDrum(ac, analyser, pitchMod, sound);
          break;
        case "scratch1":
        case "scratch2":
          synthScratch(ac, analyser, pitchMod, sound);
          break;
        default:
          break;
      }
    }

    /** Draws the frequency bar visualizer each animation frame. */
    function drawViz() {
      animId = requestAnimationFrame(drawViz);

      const w = canvas.width;
      const h = canvas.height;
      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      analyser.getByteFrequencyData(data);

      ctx2d.clearRect(0, 0, w, h);
      ctx2d.fillStyle = "#040a0e";
      ctx2d.fillRect(0, 0, w, h);

      const gap = 3;
      const barW = (w - gap * (bufLen - 1)) / bufLen;

      for (let i = 0; i < bufLen; i++) {
        const barH = (data[i] / 255) * h;
        const x = i * (barW + gap);
        const y = h - barH;
        const progress = i / bufLen;
        const r = Math.round(0 + progress * 255);
        const g = Math.round(229 - progress * 120);
        const b = Math.round(255 - progress * 255);
        ctx2d.fillStyle = `rgb(${r},${g},${b})`;
        ctx2d.fillRect(x, y, barW, barH);
      }
    }

    /** Starts the visualizer animation loop and sizes the canvas. */
    function startViz() {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx2d.scale(window.devicePixelRatio, window.devicePixelRatio);
      if (animId) {
        cancelAnimationFrame(animId);
      }
      drawViz();
    }

    /**
     * Flashes the hit class on a pad then removes it.
     * @param {HTMLButtonElement} pad The pad button element.
     */
    function flashPad(pad) {
      pad.classList.add("is-hit");
      setTimeout(() => pad.classList.remove("is-hit"), 120);
    }

    /**
     * Finds and flashes the pad matching a given sound.
     * @param {string} sound The sound identifier.
     */
    function flashPadBySound(sound) {
      const match = document.querySelector(`.lab__pad[data-sound="${sound}"]`);
      if (match) {
        flashPad(match);
      }
    }

    /** Starts recording mode. */
    function startRecording() {
      const ac = getAudioCtx();
      recording = [];
      isRecording = true;
      recordStartTime = ac.currentTime;
      recordBtn.classList.add("is-recording");
      recordBtn.setAttribute("aria-pressed", "true");
      recordBtn.innerHTML = '<span class="lab__transport-icon" aria-hidden="true">&#9679;</span> Stop';
      playBtn.disabled = true;
      clearBtn.disabled = true;
    }

    /** Stops recording mode and enables playback. */
    function stopRecording() {
      isRecording = false;
      recordBtn.classList.remove("is-recording");
      recordBtn.setAttribute("aria-pressed", "false");
      recordBtn.innerHTML = '<span class="lab__transport-icon" aria-hidden="true">&#9679;</span> Record';
      playBtn.disabled = recording.length === 0;
      clearBtn.disabled = recording.length === 0;
    }

    /** Plays back the recorded sequence of beats. */
    function playRecording() {
      if (recording.length === 0) {
        return;
      }
      const ac = getAudioCtx();

      playBtn.classList.add("is-playing");
      playBtn.disabled = true;
      recordBtn.disabled = true;
      clearBtn.disabled = true;

      const totalDuration = recording[recording.length - 1].time;

      recording.forEach(({ sound, pitchMod, time }) => {
        const id = setTimeout(() => {
          triggerSound(ac, sound, pitchMod);
          flashPadBySound(sound);
        }, time * 1000);
        playbackTimeouts.push(id);
      });

      const endId = setTimeout(() => {
        playBtn.classList.remove("is-playing");
        playBtn.disabled = false;
        recordBtn.disabled = false;
        clearBtn.disabled = false;
        playbackTimeouts = [];
      }, (totalDuration + 0.5) * 1000);

      playbackTimeouts.push(endId);
    }

    /** Clears recording and resets transport. */
    function clearRecording() {
      playbackTimeouts.forEach(clearTimeout);
      playbackTimeouts = [];
      recording = [];
      playBtn.disabled = true;
      clearBtn.disabled = true;
      playBtn.classList.remove("is-playing");
      recordBtn.disabled = false;
    }

    // Transport button events
    recordBtn.addEventListener("click", () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    playBtn.addEventListener("click", playRecording);
    clearBtn.addEventListener("click", clearRecording);

    // Pad events
    pads.forEach((pad) => {
      pad.addEventListener("click", () => {
        const sound = pad.getAttribute("data-sound");
        const ac = getAudioCtx();
        const pitchMod = parseInt(slider.value, 10) / 100;

        triggerSound(ac, sound, pitchMod);
        flashPad(pad);

        if (isRecording) {
          recording.push({
            sound,
            pitchMod,
            time: ac.currentTime - recordStartTime
          });
        }
      });

      pad.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          pad.click();
        }
      });
    });
  }

  /* ================================
     GALLERY - LYRIC MATRIX
     ================================ */

  /**
   * Initializes tile interactions for the Lyric Matrix section.
   */
  function initGalleryMatrix() {
    const kicker = document.getElementById("gallery-clue-kicker");
    const title = document.getElementById("gallery-clue-title");
    const line = document.getElementById("gallery-clue-line");
    const optionButtons = Array.from(document.querySelectorAll(".gallery__option-btn"));
    const nextBtn = document.getElementById("gallery-next");
    const roundText = document.getElementById("gallery-round");
    const scoreText = document.getElementById("gallery-score");
    const streakText = document.getElementById("gallery-streak");
    const noteText = document.getElementById("gallery-score-note");

    if (!kicker || !title || !line || optionButtons.length !== 4 || !nextBtn || !roundText || !scoreText || !streakText || !noteText) {
      return;
    }

    let audioCtx = null;
    const clues = [
      {
        kicker: "Lose Yourself",
        title: "Finish The Line",
        line: "You only get one _____, do not miss your chance to blow.",
        options: ["shot", "verse", "beat", "turn"],
        correct: 0
      },
      {
        kicker: "The Real Slim Shady",
        title: "Finish The Line",
        line: "Will the real Slim Shady please _____ up?",
        options: ["wake", "stand", "line", "show"],
        correct: 1
      },
      {
        kicker: "Rap God",
        title: "Finish The Line",
        line: "I'm beginning to feel like a _____ God.",
        options: ["rhythm", "mic", "rap", "beat"],
        correct: 2
      },
      {
        kicker: "Without Me",
        title: "Finish The Line",
        line: "Guess who's back, _____ again.",
        options: ["here", "back", "slim", "guess"],
        correct: 1
      },
      {
        kicker: "Houdini",
        title: "Finish The Line",
        line: "Abra-abra-_____, I’m about to reach in my bag, bruh.",
        options: ["dancer", "crown", "camera", "cadabra"],
        correct: 3
      }
    ];

    let score = 0;
    let streak = 0;
    let round = 0;
    let activeClue = null;
    let hasStarted = false;
    let answered = false;

    /**
     * Lazily creates an AudioContext from user interaction.
     * @return {AudioContext} The active audio context.
     */
    function getAudioContext() {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      return audioCtx;
    }

    /**
     * Plays a short synth blip for matrix interactions.
     * @param {number} frequency Frequency in Hz.
     * @param {number} duration Duration in seconds.
     */
    function playMatrixTone(frequency, duration, type = "triangle", volume = 0.08) {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.92, now + duration);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    /**
     * Plays a short punchy kick.
     */
    function playKick() {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = "sine";
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.2);

      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    }

    /**
     * Plays a quick snare-like noise burst.
     */
    function playSnare() {
      const ctx = getAudioContext();
      const length = Math.ceil(ctx.sampleRate * 0.15);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1800;

      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      src.connect(band);
      band.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.16);
    }

    /**
     * Plays a crowd cheer burst for correct answers.
     */
    function playCrowd() {
      const ctx = getAudioContext();
      const length = Math.ceil(ctx.sampleRate * 0.4);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.6;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 900;
      band.Q.value = 0.4;

      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      src.connect(band);
      band.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.41);
    }

    /**
     * Plays a vinyl-stop scratch for wrong answers.
     */
    function playScratchStop() {
      const ctx = getAudioContext();
      const length = Math.ceil(ctx.sampleRate * 0.22);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const now = ctx.currentTime;
      src.playbackRate.setValueAtTime(1.8, now);
      src.playbackRate.exponentialRampToValueAtTime(0.35, now + 0.2);

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1400;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.22);
    }

    /**
     * Renders current score and streak values.
     */
    function renderStats() {
      roundText.textContent = String(round);
      scoreText.textContent = String(score);
      streakText.textContent = String(streak);
    }

    /**
     * Enables or disables all option buttons.
     * @param {boolean} isEnabled True enables options.
     */
    function setOptionsEnabled(isEnabled) {
      optionButtons.forEach((button) => {
        button.disabled = !isEnabled;
      });
    }

    /**
     * Loads a clue into the UI.
     * @param {object} clue The clue object.
     */
    function loadClue(clue) {
      activeClue = clue;
      answered = false;
      kicker.textContent = clue.kicker;
      title.textContent = clue.title;
      line.textContent = clue.line;
      optionButtons.forEach((button, index) => {
        button.textContent = clue.options[index];
        button.classList.remove("is-correct", "is-wrong");
      });
      setOptionsEnabled(true);
    }

    /**
     * Moves to the next clue or ends the challenge.
     */
    function nextRound() {
      if (round >= clues.length) {
        hasStarted = false;
        setOptionsEnabled(false);
        nextBtn.textContent = "Play Again";
        kicker.textContent = "Challenge Complete";
        title.textContent = score >= 4 ? "You Went Full Rap God" : "Good Run";
        line.textContent = "You finished the Eminem lyric challenge. Hit Play Again to run it back.";
        noteText.textContent = score >= 4
          ? "Crowd is loud. That was legendary."
          : "Solid run. Run it back and chase a perfect score.";
        playCrowd();
        return;
      }

      const clue = clues[round];
      round += 1;
      renderStats();
      loadClue(clue);
      noteText.textContent = "Pick the missing word from the lyric.";
      nextBtn.textContent = round === clues.length ? "Finish Challenge" : "Next Lyric";
    }

    optionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (!activeClue || answered || !hasStarted) {
          return;
        }

        answered = true;
        setOptionsEnabled(false);

        const pickedIndex = parseInt(button.dataset.optionIndex, 10);
        const correctIndex = activeClue.correct;

        if (pickedIndex === correctIndex) {
          score += 1;
          streak += 1;
          button.classList.add("is-correct");
          playKick();
          setTimeout(playSnare, 80);
          setTimeout(playCrowd, 140);
          playMatrixTone(440 + streak * 10, 0.14, "sawtooth", 0.06);
          noteText.textContent = "Fire. Eminem would approve that bar.";
        } else {
          streak = 0;
          button.classList.add("is-wrong");
          optionButtons[correctIndex].classList.add("is-correct");
          playScratchStop();
          noteText.textContent = "Not quite. Stay calm and drop the next line.";
        }

        renderStats();
      });
    });

    nextBtn.addEventListener("click", () => {
      if (!hasStarted) {
        hasStarted = true;
        round = 0;
        score = 0;
        streak = 0;
        renderStats();
        nextBtn.textContent = "Next Lyric";
      }

      if (answered || round === 0) {
        nextRound();
      }
    });

    setOptionsEnabled(false);
  }

    /* ================================
      STAGE SHOW BUILDER
      ================================ */

  /**
   * Initializes the Stage Show Builder section.
   */
  function initStageShowBuilder() {
    const section = document.getElementById("stage-show");
    if (!section) {
      return;
    }

    const dropZone = document.getElementById("stage-drop-zone");
    const stageVideo = document.getElementById("stage-main-video");
    const stageOpenVideo = document.getElementById("stage-open-video");
    const lightVideo = document.getElementById("stage-light-video");
    const smokeVideo = document.getElementById("stage-smoke-video");
    const note = document.getElementById("stage-show-note");
    const startBtn = document.getElementById("stage-show-start");
    const clearBtn = document.getElementById("stage-show-clear");
    const stopBtn = document.getElementById("stage-show-stop");
    const stageButtons = Array.from(section.querySelectorAll("[data-stage-video-src]"));
    const lightButtons = Array.from(section.querySelectorAll("[data-light-video-src]"));
    const smokeButtons = Array.from(section.querySelectorAll("[data-smoke-video-src]"));

    if (!dropZone || !stageVideo || !stageOpenVideo || !lightVideo || !smokeVideo || !note || !startBtn || !clearBtn || !stopBtn || stageButtons.length === 0 || lightButtons.length === 0 || smokeButtons.length === 0) {
      return;
    }

    let selectedVideo = "";
    let selectedLight = "";
    let selectedSmoke = "";
    let revealTimer = null;
    let showReady = false;

    /**
     * Marks one button in a group as selected.
     * @param {HTMLButtonElement[]} buttons Group button list.
     * @param {HTMLButtonElement} active Active button.
     */
    function setActiveButton(buttons, active) {
      buttons.forEach((btn) => {
        btn.classList.toggle("is-selected", btn === active);
      });
    }

    /**
     * Starts a muted preview play for a video element.
     * @param {HTMLVideoElement} video Video element to preview.
     */
    function playMutedPreview(video) {
      video.muted = true;
      video.play().catch(() => {
        // Ignore autoplay rejections; explicit Start still works.
      });
    }

    /**
     * Syncs pre-start backdrop state.
     * Shows black stage once a song, lights, or smoke is selected until Start.
     */
    function syncPrestartBackdrop() {
      if (dropZone.classList.contains("is-performing")) {
        dropZone.classList.remove("is-setup-dark");
        return;
      }

      if (selectedVideo || selectedLight || selectedSmoke) {
        dropZone.classList.add("is-setup-dark");
      } else {
        dropZone.classList.remove("is-setup-dark");
      }
    }

    /**
     * Stops all stage videos and effects.
     */
    function stopPerformance() {
      if (revealTimer) {
        clearTimeout(revealTimer);
        revealTimer = null;
      }

      stageVideo.pause();
      stageOpenVideo.pause();
      lightVideo.pause();
      smokeVideo.pause();
      stageVideo.currentTime = 0;
      stageOpenVideo.currentTime = 0;
      lightVideo.currentTime = 0;
      smokeVideo.currentTime = 0;
      dropZone.classList.remove("is-performing", "is-opening", "is-revealed");
    }

    stageButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const src = button.dataset.stageVideoSrc;
        if (!src) {
          return;
        }

        selectedVideo = src;
        stageVideo.src = src;
        stageVideo.pause();
        stageVideo.currentTime = 0;
        dropZone.classList.add("is-ready");
        setActiveButton(stageButtons, button);
        syncPrestartBackdrop();
        note.textContent = `Video selected: ${button.textContent}. Now pick lights and smoke.`;
      });
    });

    lightButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const src = button.dataset.lightVideoSrc;
        if (!src) {
          return;
        }

        selectedLight = src;
        lightVideo.src = src;
        lightVideo.classList.add("is-active");
        setActiveButton(lightButtons, button);
        playMutedPreview(lightVideo);
        syncPrestartBackdrop();
      });
    });

    smokeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const src = button.dataset.smokeVideoSrc;
        if (!src) {
          return;
        }

        selectedSmoke = src;
        smokeVideo.src = src;
        smokeVideo.classList.add("is-active");
        setActiveButton(smokeButtons, button);
        playMutedPreview(smokeVideo);
        syncPrestartBackdrop();
      });
    });

    startBtn.addEventListener("click", () => {
      if (!selectedVideo) {
        note.textContent = "Pick a performance video first.";
        return;
      }

      if (!selectedLight || !selectedSmoke) {
        note.textContent = "Pick one light style and one smoke style first.";
        return;
      }

      showReady = true;
      dropZone.classList.remove("is-setup-dark");
      dropZone.classList.remove("is-revealed");
      dropZone.classList.add("is-performing", "is-opening");

      if (revealTimer) {
        clearTimeout(revealTimer);
      }

      stageVideo.currentTime = 0;
      stageOpenVideo.currentTime = 0;
      lightVideo.currentTime = 0;
      smokeVideo.currentTime = 0;
      stageVideo.muted = false;
      stageOpenVideo.muted = true;
      stageVideo.play();
      stageOpenVideo.play();
      lightVideo.muted = true;
      smokeVideo.muted = true;
      lightVideo.play();
      smokeVideo.play();
      revealTimer = window.setTimeout(() => {
        dropZone.classList.remove("is-opening");
        dropZone.classList.add("is-revealed");
      }, 8000);
      note.textContent = "Show is live with your stage, lights, and smoke videos.";
    });

    clearBtn.addEventListener("click", () => {
      selectedVideo = "";
      selectedLight = "";
      selectedSmoke = "";
      showReady = false;
      stopPerformance();
      dropZone.classList.remove("is-ready");
      dropZone.classList.remove("is-setup-dark");
      stageButtons.forEach((button) => button.classList.remove("is-selected"));
      lightButtons.forEach((button) => button.classList.remove("is-selected"));
      smokeButtons.forEach((button) => button.classList.remove("is-selected"));
      lightVideo.classList.remove("is-active");
      smokeVideo.classList.remove("is-active");
      stageVideo.removeAttribute("src");
      lightVideo.removeAttribute("src");
      smokeVideo.removeAttribute("src");
      stageVideo.load();
      lightVideo.load();
      smokeVideo.load();
      note.textContent = "Choose stage, lights, and smoke videos, then press Start Show.";
    });

    stopBtn.addEventListener("click", () => {
      if (!showReady) {
        note.textContent = "Pick your setup and press Start Show first.";
        return;
      }

      stopPerformance();
      syncPrestartBackdrop();
      note.textContent = "Performance stopped. Press Start Show to play again.";
    });

    stageVideo.addEventListener("ended", () => {
      if (revealTimer) {
        clearTimeout(revealTimer);
        revealTimer = null;
      }

      stageOpenVideo.pause();
      lightVideo.pause();
      smokeVideo.pause();
      dropZone.classList.remove("is-performing", "is-opening", "is-revealed");
      syncPrestartBackdrop();
      note.textContent = "Video ended. Pick another video or press Start Show again.";
    });
  }

  // Initialize on load
  if (document.readyState === "complete") {
    initializeApp();
  } else {
    window.addEventListener("load", initializeApp, { once: true });
  }
})();