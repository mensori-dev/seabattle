/* ============================================================
   «Морской бой»: процедурная пиратская тема на WebAudio.
   Без внешних файлов: скрипки, барабаны, бас и шум волн.
   Мелодия оригинальная — не цитата из фильма.
   ============================================================ */
(function (global) {
  'use strict';

  const BPM = 100;
  const STEP = (60 / BPM) / 2;          // одна восьмая в размере 6/8
  const BAR = 6;                        // шесть восьмых в такте
  const BARS = 8;
  const TOTAL_STEPS = BAR * BARS;
  const LOOKAHEAD = 2;                  // секунды, которые планируем вперёд
  const BASE_GAIN = 0.17;
  const DUCK_GAIN = 0.035;

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

  let ctx = null;
  let master = null;
  let padBus = null;
  let waveBus = null;
  let waveSrc = null;
  let waveLfo = null;
  let noiseBuffer = null;
  let timer = null;
  let enabled = true;
  let volume = 0.5;
  let playing = false;
  let ducked = false;
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
    try { g.cancelScheduledValues(t); } catch (e) { /* ignore */ }
    if (immediate) g.setValueAtTime(value, t);
    else g.linearRampToValueAtTime(value, t + 0.6);
  }

  function createNoise() {
    if (!ctx || noiseBuffer) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * 4));
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
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
    const gain = ctx.createGain();
    gain.gain.value = 0.014;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(waveBus);
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
    gain.gain.linearRampToValueAtTime(0.028, at + 0.03);
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
    gain.gain.linearRampToValueAtTime(0.05, at + 0.03);
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
    gain.gain.linearRampToValueAtTime(0.085, at + 0.015);
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
    try { src.start(at); src.stop(at + dur + 0.05); } catch (e) { /* ignore */ }
  }

  function playStep(index, at) {
    const bar = Math.floor(index / BAR) % BARS;
    const beat = index % BAR;
    const chord = CHORDS[bar];
    const melody = MELODY[bar][beat];

    if (beat === 0 || beat === 3) {
      playChord(chord.map(midi), at, beat === 0 ? 0.34 : 0.22);
      playBass(midi(BASS[bar]), at, beat === 0 ? 0.36 : 0.24);
    } else if (beat === 5) {
      playBass(midi(BASS[bar]) * 1.5, at, 0.16);
    }

    if (melody !== null) playFiddle(midi(melody), at, beat === 5 ? 0.4 : 0.3, 0.038);

    if (beat === 0 || beat === 3) playKick(at);
    if (beat === 3) playNoiseHit(at, 0.16, 0.035, 1800);
    if (beat === 2 || beat === 5) playNoiseHit(at, 0.06, 0.016, 6500);
  }

  function schedule() {
    if (!ctx || !playing) return;
    const horizon = now() + LOOKAHEAD;
    while (nextStepAt < horizon) {
      const at = Math.max(nextStepAt, now() + 0.05);
      playStep(stepIndex, at);
      stepIndex = (stepIndex + 1) % TOTAL_STEPS;
      nextStepAt += STEP;
    }
  }

  function init() {
    if (ctx) return true;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain();
      padBus = ctx.createGain();
      waveBus = ctx.createGain();
      padBus.gain.value = 0.9;
      waveBus.gain.value = 0.9;
      master.gain.value = 0;
      padBus.connect(master);
      waveBus.connect(master);
      master.connect(ctx.destination);
      createNoise();
      return true;
    } catch (e) {
      ctx = null;
      master = null;
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
    start: start,
    stop: stop,
    duck: duck,
    pause: pause,
    resume: resume,
    isEnabled: function () { return enabled; },
    isPlaying: function () { return playing; }
  };
})(window);
