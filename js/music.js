/* ============================================================
   «Морской бой»: процедурная музыка на WebAudio.
   Три темы: пиратская, тихий эмбиент и таверна.
   Без внешних файлов, мелодии оригинальные.
   ============================================================ */
(function (global) {
  'use strict';

  const LOOKAHEAD = 2;                  // секунды, которые планируем вперёд
  const BASE_GAIN = 0.17;
  const DUCK_GAIN = 0.035;

  /* ---------------- Пиратская тема ---------------- */
  const PIRATE_STEP = (60 / 100) / 2;   // восьмая в размере 6/8
  const PIRATE_BARS = 8;
  const PIRATE_STEPS = 6 * PIRATE_BARS;

  // Dm — Bb — F — C — Dm — Bb — C — Dm: морской минор с подъёмом.
  const CHORDS = [
    [62, 65, 69],
    [58, 62, 65],
    [57, 60, 65],
    [60, 64, 67],
    [62, 65, 69],
    [58, 62, 65],
    [60, 64, 67],
    [62, 65, 69]
  ];
  const BASS = [50, 46, 41, 48, 50, 46, 48, 50];

  // Оригинальная мелодия: D5 F5 A5 | F5 E5 D5 и т. д. null — пауза.
  const MELODY = [
    [74, 77, 81, 77, 76, 74],
    [70, 74, 77, 74, 72, 70],
    [69, 72, 77, 76, 74, 72],
    [72, 76, 79, 76, 74, 72],
    [74, 77, 81, 81, 79, 77],
    [82, 81, 79, 77, 76, 74],
    [76, 79, 84, 82, 81, 79],
    [81, 79, 77, 76, 74, null]
  ];

  /* ---------------- Тихий эмбиент ---------------- */
  const AMBIENT_STEP = 0.5;
  const AMBIENT_STEPS = 64;
  const AMBIENT_CHORDS = [
    [57, 60, 64],   // Am
    [53, 57, 60],   // F
    [60, 64, 67],   // C
    [55, 59, 62]    // G
  ];
  const AMBIENT_PENTA = [72, 74, 76, 79, 81];

  /* ---------------- Таверна: весёлый вальс ---------------- */
  const TAVERN_STEP = (60 / 132) / 2;
  const TAVERN_STEPS = 6 * 8;
  const TAVERN_CHORDS = [
    [60, 64, 67],   // C
    [59, 62, 67],   // G
    [57, 60, 64],   // Am
    [57, 60, 65],   // F
    [60, 64, 67],
    [59, 62, 67],
    [57, 60, 65],
    [60, 64, 67]
  ];
  const TAVERN_BASS = [48, 43, 45, 41, 48, 43, 41, 48];
  const TAVERN_MELODY = [
    [72, 76, 79, 76, 72, 76],
    [71, 74, 79, 74, 71, 74],
    [69, 72, 76, 72, 69, 72],
    [69, 72, 77, 72, 69, 72],
    [72, 76, 79, 84, 79, 76],
    [74, 71, 74, 79, 74, 71],
    [72, 69, 72, 77, 72, 69],
    [72, 76, 79, 76, 72, null]
  ];

  const TRACKS = {
    pirate: { step: PIRATE_STEP, steps: PIRATE_STEPS, wave: 0.014 },
    ambient: { step: AMBIENT_STEP, steps: AMBIENT_STEPS, wave: 0.03 },
    tavern: { step: TAVERN_STEP, steps: TAVERN_STEPS, wave: 0.009 }
  };

  let ctx = null;
  let master = null;
  let sceneBus = null;
  let compressor = null;
  let padBus = null;
  let waveBus = null;
  let waveSrc = null;
  let waveLfo = null;
  let noiseBuffer = null;
  let timer = null;
  let fadeBuses = [];
  let enabled = true;
  let volume = 0.5;
  let playing = false;
  let ducked = false;
  let track = 'pirate';
  let nextStepAt = 0;
  let stepIndex = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function now() { return ctx ? ctx.currentTime : 0; }
  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function targetGain() {
    return ducked ? DUCK_GAIN : BASE_GAIN * clamp(volume, 0, 1);
  }

  function applyGain(immediate) {
    if (!master) return;
    const g = master.gain;
    const t = now();
    const value = playing ? targetGain() : 0;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value || 0, t);
    } catch (e) { /* ignore */ }
    try {
      if (immediate) g.setValueAtTime(value, t);
      else g.linearRampToValueAtTime(value, t + 0.6);
    } catch (e) { /* ignore */ }
  }

  function later(fn, ms) {
    const st = global.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null);
    if (!st) { fn(); return null; }
    return st(fn, ms);
  }

  function ensurePadBus() {
    if (!ctx || !sceneBus || padBus) return;
    padBus = ctx.createGain();
    padBus.gain.value = 0.9;
    padBus.connect(sceneBus);
  }

  function fadeWaves() {
    if (!waveBus) return;
    const target = TRACKS[track].wave;
    const t = now();
    try {
      waveBus.gain.cancelScheduledValues(t);
      waveBus.gain.setValueAtTime(waveBus.gain.value || target, t);
      waveBus.gain.linearRampToValueAtTime(target, t + 0.7);
    } catch (e) { /* ignore */ }
  }

  /* Кроссфейд между темами: у новой темы всегда свежая шина, поэтому её
     поднимаем с нуля. Старая шина гаснет и через секунду отключается —
     её хвосты не оживают при следующем переключении. */
  function transitionToTrack() {
    if (!ctx || !sceneBus) return;
    const FADE = 1.1;
    const t = now();
    const oldBus = padBus;
    const nextBus = ctx.createGain();
    nextBus.gain.value = 0.0001;
    nextBus.connect(sceneBus);
    padBus = nextBus;

    try {
      nextBus.gain.cancelScheduledValues(t);
      nextBus.gain.setValueAtTime(0.0001, t);
      nextBus.gain.linearRampToValueAtTime(0.9, t + FADE);
    } catch (e) { /* ignore */ }

    if (oldBus) {
      try {
        if (oldBus.gain.cancelAndHoldAtTime) oldBus.gain.cancelAndHoldAtTime(t);
        else {
          oldBus.gain.cancelScheduledValues(t);
          oldBus.gain.setValueAtTime(oldBus.gain.value || 0.9, t);
        }
        oldBus.gain.linearRampToValueAtTime(0.0001, t + FADE);
      } catch (e) { /* ignore */ }
      fadeBuses.push(oldBus);
      later(function () {
        const i = fadeBuses.indexOf(oldBus);
        if (i >= 0) fadeBuses.splice(i, 1);
        try { oldBus.disconnect(); } catch (e) { /* ignore */ }
      }, FADE * 1000 + 150);
    }

    stepIndex = 0;
    nextStepAt = t + 0.05;
    fadeWaves();
    schedule();
  }

  function createNoise() {
    if (!ctx || noiseBuffer) return;
    // 8 секунд шума с плавными краями: на стыке петли уровень near-zero,
    // поэтому прибой не щёлкает каждый круг.
    const len = Math.max(1, Math.floor(ctx.sampleRate * 8));
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
    const fade = Math.min(Math.floor(ctx.sampleRate * 1.5), Math.floor(len / 3));
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[i] *= k;
      data[len - 1 - i] *= k;
    }
  }

  /* Тихий шум прибоя: низкий фильтр и медленное «дыхание» — фон, не дрон. */
  function startWaves() {
    if (!ctx || waveSrc) return;
    createNoise();
    if (!noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    src.connect(filter);
    filter.connect(waveBus);
    try { src.start(); lfo.start(); } catch (e) { /* ignore */ }
    waveSrc = src;
    waveLfo = lfo;
  }

  function stopWaves() {
    if (waveSrc) {
      try { waveSrc.stop(); } catch (e) { /* ignore */ }
      try { waveSrc.disconnect(); } catch (e) { /* ignore */ }
      waveSrc = null;
    }
    if (waveLfo) {
      try { waveLfo.stop(); } catch (e) { /* ignore */ }
      try { waveLfo.disconnect(); } catch (e) { /* ignore */ }
      waveLfo = null;
    }
  }

  /* Скрипка: две расстроенные пилы, мягкий фильтр и короткая атака. */
  function playFiddle(freq, at, dur, level) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, at);
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.04);
    gain.gain.linearRampToValueAtTime(level * 0.55, at + Math.max(0.08, dur * 0.6));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, at);
      osc.detune.setValueAtTime(detune, at);
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    }
    filter.connect(gain);
    gain.connect(padBus);
  }

  /* Струнный аккорд: короткий удар на сильную долю. */
  function playChord(freqs, at, dur) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, at);
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.024, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    freqs.forEach(function (freq) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, at);
      osc.detune.setValueAtTime((Math.random() * 10) - 5, at);
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    });
    filter.connect(gain);
    gain.connect(padBus);
  }

  function playBass(freq, at, dur) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, at);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.045, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain);
    gain.connect(padBus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  function playKick(at) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.07, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
    osc.connect(gain);
    gain.connect(padBus);
    osc.start(at);
    osc.stop(at + 0.28);
  }

  function playNoiseHit(at, dur, level, cutoff) {
    createNoise();
    if (!noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = cutoff > 3000 ? 'highpass' : 'bandpass';
    filter.frequency.setValueAtTime(cutoff, at);
    filter.Q.value = 1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(padBus);
    try { src.start(at, 2 + Math.random() * 2); src.stop(at + dur + 0.05); } catch (e) { /* ignore */ }
  }

  function playPirateStep(index, at) {
    const bar = Math.floor(index / 6) % PIRATE_BARS;
    const beat = index % 6;
    const chord = CHORDS[bar];
    const melody = MELODY[bar][beat];

    if (beat === 0 || beat === 3) {
      playChord(chord.map(midi), at, beat === 0 ? 0.34 : 0.22);
      playBass(midi(BASS[bar]), at, beat === 0 ? 0.36 : 0.24);
    } else if (beat === 5) {
      playBass(midi(BASS[bar]) * 1.5, at, 0.16);
    }

    if (melody !== null) playFiddle(midi(melody), at, beat === 5 ? 0.4 : 0.3, 0.032);

    if (beat === 0 || beat === 3) playKick(at);
    if (beat === 3) playNoiseHit(at, 0.18, 0.022, 1500);
    if (beat === 2 || beat === 5) playNoiseHit(at, 0.06, 0.008, 4800);
  }

  function playAmbientPad(freqs, at, dur) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, at);
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.05, at + 1.4);
    gain.gain.linearRampToValueAtTime(0.0001, at + dur);
    freqs.forEach(function (freq) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, at);
      osc.detune.setValueAtTime((Math.random() * 8) - 4, at);
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + dur + 0.2);
    });
    filter.connect(gain);
    gain.connect(padBus);
  }

  function playAmbientNote(at) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(midi(AMBIENT_PENTA[Math.floor(Math.random() * AMBIENT_PENTA.length)]), at);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.04, at + 0.08);
    gain.gain.linearRampToValueAtTime(0.0001, at + 2.2);
    osc.connect(gain);
    gain.connect(padBus);
    osc.start(at);
    osc.stop(at + 2.4);
  }

  function playAmbientStep(index, at) {
    if (index % 16 === 0) {
      const chord = AMBIENT_CHORDS[(index / 16) % AMBIENT_CHORDS.length];
      playAmbientPad(chord.map(midi), at, 8);
    } else if (index % 16 === 8 && Math.random() < 0.7) {
      playAmbientNote(at);
    }
  }

  function playTavernStep(index, at) {
    const bar = Math.floor(index / 6) % 8;
    const beat = index % 6;
    const chord = TAVERN_CHORDS[bar];
    const melody = TAVERN_MELODY[bar][beat];

    if (beat === 0) {
      playBass(midi(TAVERN_BASS[bar]), at, 0.26);
      playKick(at);
    } else if (beat === 2 || beat === 4) {
      playChord(chord.map(midi), at, 0.16);
      playNoiseHit(at, 0.05, 0.008, 4600);
    }

    if (melody !== null) playFiddle(midi(melody), at, 0.22, 0.026);
  }

  function playStep(index, at) {
    if (track === 'ambient') playAmbientStep(index, at);
    else if (track === 'tavern') playTavernStep(index, at);
    else playPirateStep(index, at);
  }

  function schedule() {
    if (!ctx || !playing) return;
    const t = now();
    // После фонового таба или подвисания не выплёвываем пачку пропущенных
    // шагов разом — это звучит как треск. Просто догоняем текущий момент.
    if (nextStepAt < t - 0.25) nextStepAt = t + 0.05;
    const cfg = TRACKS[track] || TRACKS.pirate;
    const horizon = t + LOOKAHEAD;
    while (nextStepAt < horizon) {
      const at = Math.max(nextStepAt, t + 0.05);
      playStep(stepIndex, at);
      stepIndex = (stepIndex + 1) % cfg.steps;
      nextStepAt += cfg.step;
    }
  }

  function init() {
    if (ctx) return true;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      sceneBus = ctx.createGain();
      master = ctx.createGain();
      waveBus = ctx.createGain();
      sceneBus.gain.value = 1;
      master.gain.value = 0;
      waveBus.gain.value = TRACKS[track].wave;
      sceneBus.connect(master);
      if (ctx.createDynamicsCompressor) {
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 24;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.25;
        master.connect(compressor);
        compressor.connect(ctx.destination);
      } else {
        master.connect(ctx.destination);
      }
      ensurePadBus();
      waveBus.connect(sceneBus);
      createNoise();
      return true;
    } catch (e) {
      ctx = null;
      master = null;
      sceneBus = null;
      compressor = null;
      padBus = null;
      return false;
    }
  }

  function start() {
    if (!enabled || !ctx) return false;
    if (playing) return true;
    playing = true;
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
    ensurePadBus();
    if (padBus) {
      try { padBus.gain.setValueAtTime(0.9, now()); } catch (e) { /* ignore */ }
    }
    if (sceneBus) {
      try { sceneBus.gain.setValueAtTime(1, now()); } catch (e) { /* ignore */ }
    }
    applyGain(true);
    startWaves();
    stepIndex = 0;
    nextStepAt = now() + 0.05;
    schedule();
    timer = setInterval(schedule, 2000);
    return true;
  }

  function stop() {
    playing = false;
    if (timer !== null) {
      try { clearInterval(timer); } catch (e) { /* ignore */ }
      timer = null;
    }
    stopWaves();
    applyGain(false);
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) stop();
  }

  function setVolume(v) {
    volume = clamp(typeof v === 'number' ? v : 0.5, 0, 1);
    if (playing) applyGain(false);
  }

  function setTrack(name) {
    if (!TRACKS[name]) return false;
    if (name === track) return true;
    track = name;
    if (playing) {
      transitionToTrack();
    } else if (waveBus) {
      waveBus.gain.value = TRACKS[track].wave;
    }
    return true;
  }

  function getTrack() { return track; }

  function duck(on) {
    ducked = !!on;
    if (playing) applyGain(false);
  }

  function pause() {
    if (ctx && ctx.state === 'running') {
      try { ctx.suspend(); } catch (e) { /* ignore */ }
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended' && playing) {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
  }

  global.Music = {
    init: init,
    setEnabled: setEnabled,
    setVolume: setVolume,
    setTrack: setTrack,
    getTrack: getTrack,
    start: start,
    stop: stop,
    duck: duck,
    pause: pause,
    resume: resume,
    isEnabled: function () { return enabled; },
    isPlaying: function () { return playing; }
  };
})(window);
