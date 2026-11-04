import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'js', 'music.js'), 'utf8');

function load(extra) {
  const window = {};
  if (extra && extra.AudioContext) window.AudioContext = extra.AudioContext;
  const sandbox = Object.assign({ window, console }, extra || {});
  vm.runInNewContext(source, sandbox, { filename: 'js/music.js' });
  return window.Music;
}

test('API музыки на месте и не падает без AudioContext', () => {
  const Music = load();
  for (const fn of ['init', 'setEnabled', 'setVolume', 'start', 'stop', 'duck', 'pause', 'resume', 'isEnabled', 'isPlaying']) {
    assert.equal(typeof Music[fn], 'function', fn);
  }
  assert.equal(Music.start(), false);
  Music.setEnabled(true);
  Music.setVolume(0.4);
  Music.stop();
});

test('трек можно переключить и он запоминается', () => {
  const Music = load();
  assert.equal(typeof Music.setTrack, 'function');
  assert.equal(Music.getTrack(), 'pirate');
  assert.equal(Music.setTrack('ambient'), true);
  assert.equal(Music.getTrack(), 'ambient');
  assert.equal(Music.setTrack('unknown'), false);
  assert.equal(Music.getTrack(), 'ambient');
});

test('start создаёт планировщик только после init', () => {
  const timers = [];
  class Param {
    setValueAtTime() {}
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
    cancelScheduledValues() {}
  }
  class Node {
    connect() { return this; }
    disconnect() {}
    start() {}
    stop() {}
  }
  class Gain extends Node { constructor() { super(); this.gain = new Param(); } }
  class Osc extends Node {
    constructor() { super(); this.frequency = new Param(); this.detune = new Param(); this.type = 'sine'; }
  }
  class Filter extends Node {
    constructor() { super(); this.frequency = new Param(); this.Q = new Param(); this.type = 'lowpass'; }
  }
  class BufferSource extends Node { constructor() { super(); this.buffer = null; this.loop = false; } }
  class FakeCtx {
    constructor() {
      this.currentTime = 0; this.sampleRate = 48000; this.state = 'running';
      this.destination = {};
    }
    createGain() { return new Gain(); }
    createOscillator() { return new Osc(); }
    createBiquadFilter() { return new Filter(); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { return new BufferSource(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }

  const Music = load({
    AudioContext: FakeCtx,
    setInterval: (fn, ms) => { timers.push(ms); return timers.length; },
    clearInterval: () => {}
  });
  assert.equal(Music.start(), false);
  assert.equal(Music.init(), true);
  assert.equal(Music.start(), true);
  assert.equal(Music.isPlaying(), true);
  assert.equal(timers[0], 2000);
  // Смена темы — кроссфейд на второй шине, без перезапуска планировщика.
  assert.equal(Music.setTrack('ambient'), true);
  assert.equal(Music.isPlaying(), true);
  assert.equal(timers.length, 1);
  Music.stop();
  assert.equal(Music.isPlaying(), false);
});
