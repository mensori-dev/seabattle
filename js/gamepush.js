/* ============================================================
   GamePush: один SDK для VK Games, OK Games и других площадок.
   Классический IIFE — файл подключается только в сборке GamePush.
   Наружу отдаём window.GamePlatform с тем же API, что у YandexGame,
   чтобы js/app.js не знал, какая площадка под ним.
   ============================================================ */
(function (global) {
  'use strict';

  var gp = null;
  var readyDone = false;
  var readyResolve = null;
  var readyPromise = new Promise(function (resolve) { readyResolve = resolve; });
  var readyTimer = null;
  var startRequested = false;
  var paused = false;
  var gameplayActive = false;
  var rewardedBusy = false;
  var gameStarted = false;
  var pauseHandlers = [];
  var resumeHandlers = [];

  function safe(fn) {
    try { return fn(); } catch (e) { return null; }
  }

  function callEach(list) {
    for (var i = 0; i < list.length; i++) {
      safe(list[i]);
    }
  }

  function sendGameStart() {
    if (gameStarted || !startRequested || !gp || !gp.gameStart) return;
    gameStarted = true;
    safe(function () { gp.gameStart(); });
  }

  function settle(sdk) {
    // Поздний SDK не должен затирать уже полученный объект.
    if (sdk) gp = sdk;
    if (readyDone) {
      // Таймаут уже сработал, но площадка всё-таки ответила: досылаем
      // gameStart, иначе VK/OK так и не узнают, что игра загрузилась.
      sendGameStart();
      return;
    }
    readyDone = true;
    if (readyTimer) {
      clearTimeout(readyTimer);
      readyTimer = null;
    }
    if (readyResolve) {
      var resolve = readyResolve;
      readyResolve = null;
      resolve(gp);
    }
    sendGameStart();
  }

  function startGame() {
    startRequested = true;
    sendGameStart();
  }

  function handlePause() {
    if (paused) return;
    paused = true;
    if (gameplayActive && gp && gp.gameplayStop) safe(function () { gp.gameplayStop(); });
    callEach(pauseHandlers);
  }

  function handleResume() {
    if (!paused) return;
    paused = false;
    if (gameplayActive && gp && gp.gameplayStart) safe(function () { gp.gameplayStart(); });
    callEach(resumeHandlers);
  }

  /* SDK вызывает этот колбэк сам после загрузки game-score.js. */
  global.onGPInit = function (sdk) {
    gp = sdk || null;
    if (gp) {
      if (gp.on) {
        safe(function () { gp.on('pause', handlePause); });
        safe(function () { gp.on('resume', handleResume); });
      }
      // Ждём синхронизацию игрока, но не держим игру вечно:
      // если площадка не ответила, через 8 секунд работаем без неё.
      var playerReady = gp.player && gp.player.ready;
      if (playerReady && typeof playerReady.then === 'function') {
        playerReady.then(function () { settle(gp); }, function () { settle(gp); });
      } else {
        settle(gp);
      }
    } else {
      settle(null);
    }
  };

  // Если SDK не загрузился (локальная сборка, блокировщик, сбой площадки),
  // не заставляем игру ждать: возвращаем null и живём как обычная сборка.
  readyTimer = setTimeout(function () { settle(null); }, 8000);

  global.GamePlatform = {
    available: function () { return !!gp; },
    whenReady: function () { return readyPromise; },
    isPaused: function () {
      if (paused) return true;
      if (!gp) return false;
      return typeof gp.isPaused === 'function' ? !!gp.isPaused() : !!gp.isPaused;
    },
    lang: function () { return (gp && gp.language) || 'ru'; },
    languages: function () { return ['ru', 'en']; },
    ready: startGame,
    gameplayStart: function () {
      gameplayActive = true;
      if (gp && !paused && gp.gameplayStart) safe(function () { gp.gameplayStart(); });
    },
    gameplayStop: function () {
      gameplayActive = false;
      if (gp && gp.gameplayStop) safe(function () { gp.gameplayStop(); });
    },
    onPause: function (fn) { if (typeof fn === 'function') pauseHandlers.push(fn); },
    onResume: function (fn) { if (typeof fn === 'function') resumeHandlers.push(fn); },
    showInterstitial: function () {
      if (!gp || !gp.ads || !gp.ads.showFullscreen) return Promise.resolve(false);
      if (gp.ads.isFullscreenAvailable === false) return Promise.resolve(false);
      return Promise.resolve(gp.ads.showFullscreen()).then(function (shown) {
        return shown !== false;
      }, function () { return false; });
    },
    showRewarded: function () {
      if (rewardedBusy) return Promise.resolve(false);
      if (!gp || !gp.ads || !gp.ads.showRewardedVideo) return Promise.resolve(false);
      if (gp.ads.isRewardedAvailable === false) return Promise.resolve(false);
      rewardedBusy = true;
      var done = function () { rewardedBusy = false; };
      return Promise.resolve(gp.ads.showRewardedVideo()).then(function (ok) {
        done();
        return ok === true;
      }, function () {
        done();
        return false;
      });
    }
  };

  /* В одиночной GamePush-сборке онлайн вырезан, но app.js всё равно
     обращается к Online. Заглушка отвечает «недоступно». */
  global.Online = global.Online || {
    available: function () { return false; },
    isOpen: function () { return false; },
    on: function () {},
    connect: function () { return Promise.resolve(); },
    create: function () {},
    join: function () {},
    leave: function () {},
    fleet: function () {},
    loadout: function () {},
    ability: function () {},
    shot: function () {},
    surrender: function () {},
    httpUrl: function (p) { return p; }
  };
})(window);
