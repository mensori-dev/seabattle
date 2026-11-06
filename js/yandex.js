/* ============================================================
   Яндекс Игры: SDK, реклама и пауза.
   Файл есть только в сборке для Яндекс Игр (scripts/build-yandex.mjs),
   в обычной игре вместо него подключается js/online.js.
   app.js проверяет window.YandexGame и без него работает как раньше.
   ============================================================ */
(function () {
  'use strict';

  /* Игра переведена только на русский: другие языки показываем по-русски. */
  const LANGS = ['ru'];
  const DEFAULT_LANG = 'ru';

  let ysdk = null;
  let initPromise = null;
  let pendingReady = false;      // LoadingAPI.ready() просили до инициализации
  let gameplayActive = false;    // игрок сейчас в бою
  let paused = false;            // платформа просит паузу: реклама, чужая вкладка
  let rewardedBusy = false;
  let platformLang = '';         // environment.i18n.lang, как его отдал SDK
  const pauseHandlers = [];
  const resumeHandlers = [];

  function features() {
    return ysdk && ysdk.features ? ysdk.features : null;
  }

  /* Любой вызов SDK обёрнут: сбой платформы не должен ломать игру. */
  function callFeature(name, method) {
    const f = features();
    if (!f || !f[name] || typeof f[name][method] !== 'function') return;
    try {
      f[name][method]();
    } catch (e) {
      console.warn('[Яндекс Игры] ' + name + '.' + method + ':', e);
    }
  }

  function run(handler) {
    try {
      handler();
    } catch (e) {
      console.warn('[Яндекс Игры] обработчик паузы:', e);
    }
  }

  function handlePause() {
    if (paused) return;
    paused = true;
    if (gameplayActive) callFeature('GameplayAPI', 'stop');
    pauseHandlers.forEach(run);
  }

  function handleResume() {
    if (!paused) return;
    paused = false;
    if (gameplayActive) callFeature('GameplayAPI', 'start');
    resumeHandlers.forEach(run);
  }

  /* Автоопределение языка (требование 2.14): читаем environment.i18n.lang
     сразу при инициализации SDK, а не по ходу игры. Индикатор 文 в
     debug-панели становится зелёным именно после этого чтения. */
  function detectLanguage(sdk) {
    let lang = '';
    try {
      lang = sdk && sdk.environment && sdk.environment.i18n
        ? String(sdk.environment.i18n.lang || '')
        : '';
    } catch (e) {
      console.warn('[Яндекс Игры] язык платформы недоступен:', e);
    }
    platformLang = lang.toLowerCase();
    const supported = LANGS.indexOf(platformLang) >= 0;
    try {
      document.documentElement.lang = supported ? platformLang : DEFAULT_LANG;
      document.documentElement.setAttribute('data-lang', platformLang || DEFAULT_LANG);
      document.documentElement.setAttribute('data-lang-supported', supported ? '1' : '0');
    } catch (_e) { /* игнорируем: разметка не критична */ }
  }

  function bindEvents() {
    if (!ysdk || typeof ysdk.on !== 'function') return;
    try {
      ysdk.on('game_api_pause', handlePause);
      ysdk.on('game_api_resume', handleResume);
    } catch (e) {
      console.warn('[Яндекс Игры] события паузы недоступны:', e);
    }
    // Страховка для локального запуска и старых версий SDK.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) handlePause();
      else handleResume();
    });
  }

  function init() {
    if (initPromise) return initPromise;
    if (!window.YaGames || typeof window.YaGames.init !== 'function') {
      // SDK не подключён: локальный запуск или обычная сборка.
      initPromise = Promise.resolve(null);
      return initPromise;
    }
    initPromise = window.YaGames.init()
      .then(function (sdk) {
        ysdk = sdk;
        detectLanguage(sdk);
        bindEvents();
        if (pendingReady) {
          pendingReady = false;
          callFeature('LoadingAPI', 'ready');
        }
        return sdk;
      })
      .catch(function (err) {
        console.warn('[Яндекс Игры] SDK не инициализировался:', err);
        return null;
      });
    return initPromise;
  }

  function showInterstitial() {
    return init().then(function (sdk) {
      if (!sdk || !sdk.adv || typeof sdk.adv.showFullscreenAdv !== 'function') return false;
      return new Promise(function (resolve) {
        let done = false;
        function finish(shown) {
          if (done) return;
          done = true;
          resolve(!!shown);
        }
        try {
          sdk.adv.showFullscreenAdv({
            callbacks: {
              onClose: function (wasShown) { finish(wasShown); },
              onError: function () { finish(false); }
            }
          });
        } catch (e) {
          finish(false);
        }
      });
    });
  }

  function showRewarded() {
    return init().then(function (sdk) {
      if (!sdk || !sdk.adv || typeof sdk.adv.showRewardedVideo !== 'function') return false;
      if (rewardedBusy) return false;
      rewardedBusy = true;
      return new Promise(function (resolve) {
        let rewarded = false;
        let done = false;
        function finish() {
          if (done) return;
          done = true;
          rewardedBusy = false;
          resolve(rewarded);
        }
        try {
          sdk.adv.showRewardedVideo({
            callbacks: {
              onRewarded: function () { rewarded = true; },
              onClose: function () { finish(); },
              onError: function () { finish(); }
            }
          });
        } catch (e) {
          finish();
        }
      });
    });
  }

  window.YandexGame = {
    init: init,
    whenReady: init,
    available: function () { return !!ysdk; },
    isPaused: function () { return paused; },
    /* Язык, который отдала платформа ('' до инициализации SDK). */
    lang: function () { return platformLang; },
    languages: function () { return LANGS.slice(); },

    /* Игра загрузилась и готова к взаимодействию — обязательный вызов. */
    ready: function () {
      if (!ysdk) {
        pendingReady = true;
        init();
        return;
      }
      callFeature('LoadingAPI', 'ready');
    },

    /* Разметка геймплея: бой начался / закончился. */
    gameplayStart: function () {
      gameplayActive = true;
      if (!paused) callFeature('GameplayAPI', 'start');
    },
    gameplayStop: function () {
      gameplayActive = false;
      callFeature('GameplayAPI', 'stop');
    },

    onPause: function (fn) { if (typeof fn === 'function') pauseHandlers.push(fn); },
    onResume: function (fn) { if (typeof fn === 'function') resumeHandlers.push(fn); },

    showInterstitial: showInterstitial,
    showRewarded: showRewarded
  };

  /* Онлайн в этой сборке вырезан, но app.js на всякий случай обращается к Online.
     Заглушка отвечает «недоступно» и не даёт упасть инициализации. */
  window.Online = window.Online || {
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
    rematch: function () {},
    emoji: function () {},
    httpUrl: function (p) { return p; }
  };

  init();
})();
