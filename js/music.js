/* ============================================================
   «Морской бой»: процедурная фоновая музыка на WebAudio.
   Без внешних файлов: пэд, шум волн и редкие высокие ноты.
   ============================================================ */
(function (global) {
  'use strict';

  // Am — F — C — G в низком регистре: спокойный морской фон.
  const PROGRESSION = [
    [110.00, 130.81, 164.81],
    [87.31, 130.81, 174.61],
    [130.81, 164.81, 196.00],
    [98.00, 123.47, 146.83]
  ];
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880.00];
  const BASE_GAIN = 0.18;
  const DUCK_GAIN = 0.04;
  const CHORD_SECONDS = 8;
  const LOOKAHEAD = 2;

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
  let nextChordAt = 0;
  let chordIndex = 0;
  let nextNoteAt = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function now() { return ctx ? ctx.currentTime : 0; }

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

  function startWaves() {
    if (!ctx || waveSrc) return;
    createNoise();
    if (!noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = ctx.createGain();
    gain.gain.value = 0.03;
    // медленная LFO «дышит» фильтром — волны накатывают и отступают
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
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

  function playPad(freqs, at, dur) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, at);
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.06, at + 1.4);
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

  function playNote(at) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(PENTA[Math.floor(Math.random() * PENTA.length)], at);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.045, at + 0.08);
    gain.gain.linearRampToValueAtTime(0.0001, at + 2.2);
    osc.connect(gain);
    gain.connect(padBus);
    osc.start(at);
    osc.stop(at + 2.4);
  }

  function schedule() {
    if (!ctx || !playing) return;
    const horizon = now() + LOOKAHEAD;
    if (nextChordAt < horizon) {
      const at = Math.max(nextChordAt, now() + 0.05);
      playPad(PROGRESSION[chordIndex % PROGRESSION.length], at, CHORD_SECONDS);
      chordIndex += 1;
      nextChordAt += CHORD_SECONDS;
      if (nextChordAt < now()) nextChordAt = now() + CHORD_SECONDS;
    }
    if (nextNoteAt < now()) nextNoteAt = now() + 12 + Math.random() * 8;
    if (nextNoteAt < horizon) {
      playNote(nextNoteAt);
      nextNoteAt += 12 + Math.random() * 8;
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
    nextChordAt = now() + 0.05;
    chordIndex = 0;
    nextNoteAt = now() + 12 + Math.random() * 8;
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
