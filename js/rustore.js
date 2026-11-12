/* ============================================================
   RuStore: покупки через нативный RuStore Pay SDK и реклама Yandex Mobile Ads.
   Классический IIFE — файл работает и через file://, и в PWA.

   В Capacitor-сборке мост собирается поверх плагина RuStoreBridge
   (android/.../RuStoreBridgePlugin.java). В браузере и PWA плагина нет:
   все покупки возвращают false, products() — пустой массив, рекламы нет.
   Игра обязана работать без RuStore.

   Контракт моста (window.RuStoreBridge):
     showRewarded()       -> Promise<boolean>
     showInterstitial()   -> Promise<boolean>
     purchase(productId)  -> Promise<boolean>
     restore()            -> Promise<boolean>
     products()           -> Array<{ id, title, price, currency }>
     setAdsEnabled(on)    -> void (необязательно)
     adsEnabled()         -> boolean (необязательно)
     adsSupported()       -> boolean (необязательно)
   Мост может появиться позже: тогда нативная обёртка вызывает
   window.onRuStoreReady(bridge).
   ============================================================ */
(function (global) {
  'use strict';

  var BRIDGE_NAMES = ['RuStoreBridge', 'RuStorePay', 'RuStoreSDK'];
  var AD_WAIT_MS = 20000;
  var READY_WAIT_MS = 8000;

  var bridge = null;
  var readyDone = false;
  var readyResolve = null;
  var readyPromise = new Promise(function (resolve) { readyResolve = resolve; });
  var readyTimer = null;
  var nativeWait = null;
  var rewardedBusy = false;
  var adsOn = true;
  var adsSet = false;

  function safe(fn) {
    try { return fn(); } catch (e) { return null; }
  }

  function findBridge() {
    for (var i = 0; i < BRIDGE_NAMES.length; i++) {
      var candidate = global[BRIDGE_NAMES[i]];
      if (candidate && typeof candidate === 'object') return candidate;
    }
    return null;
  }

  function settle(sdk) {
    // Поздний мост не затираем: он всё ещё может пригодиться.
    if (sdk) {
      bridge = sdk;
      // Пока игру не просили выключить рекламу, доверяем состоянию моста.
      if (!adsSet && typeof bridge.adsEnabled === 'function') {
        var current = safe(function () { return bridge.adsEnabled(); });
        if (typeof current === 'boolean') adsOn = current;
      }
    }
    if (readyDone) return;
    readyDone = true;
    if (nativeWait) {
      clearTimeout(nativeWait);
      nativeWait = null;
    }
    if (readyTimer) {
      clearTimeout(readyTimer);
      readyTimer = null;
    }
    if (readyResolve) {
      var resolve = readyResolve;
      readyResolve = null;
      resolve(bridge);
    }
  }

  /* Нативная обёртка вызывает этот колбэк, когда мост готов. */
  global.onRuStoreReady = function (sdk) {
    settle(sdk || findBridge());
  };

  /* Capacitor-сборка: нативный плагин RuStoreBridge (см.
     android/app/src/main/java/dev/mensori/seabattle/RuStoreBridgePlugin.java).
     Плагин отвечает промисами, а контракт ждёт синхронные products() и
     adsEnabled(), поэтому кэшируем товары и собираем объект-мост сами. */
  function nativePlugin() {
    var cap = global.Capacitor;
    if (!cap || !cap.Plugins) return null;
    var plugin = cap.Plugins.RuStoreBridge;
    return plugin && typeof plugin.purchase === 'function' ? plugin : null;
  }

  function wrapNative(plugin) {
    var items = [];
    var adsAvailable = false;
    var adsAllowed = true;
    var hasRewarded = typeof plugin.showRewarded === 'function';
    var hasInterstitial = typeof plugin.showInterstitial === 'function';
    var shim = {
      products: function () { return items.slice(); },
      purchase: function (productId) {
        return plugin.purchase({ productId: productId }).then(function (res) {
          return !!(res && res.ok === true);
        }, function () { return false; });
      },
      restore: function () {
        return plugin.restore().then(function (res) {
          return !!(res && res.restored === true);
        }, function () { return false; });
      },
      /* Реклама: Yandex Mobile Ads внутри нативного плагина. */
      showRewarded: function () {
        if (!adsAvailable || !adsAllowed || !hasRewarded) return Promise.resolve(false);
        return plugin.showRewarded().then(function (res) {
          return !!(res && res.rewarded === true);
        }, function () { return false; });
      },
      showInterstitial: function () {
        if (!adsAvailable || !adsAllowed || !hasInterstitial) return Promise.resolve(false);
        return plugin.showInterstitial().then(function (res) {
          return !!(res && res.shown === true);
        }, function () { return false; });
      },
      setAdsEnabled: function (on) { adsAllowed = !!on; },
      adsEnabled: function () { return adsAllowed; },
      adsSupported: function () { return adsAvailable; }
    };
    plugin.products().then(function (res) {
      if (res && Array.isArray(res.items)) items = res.items.slice();
      adsAvailable = !!(res && res.ads === true) && hasRewarded && hasInterstitial;
      global.onRuStoreReady(shim);
    }, function () {
      global.onRuStoreReady(shim);
    });
    return shim;
  }

  // Без SDK не держим игру: через 8 секунд просто живём дальше.
  readyTimer = setTimeout(function () { settle(null); }, READY_WAIT_MS);

  // Мост мог быть внедрён до загрузки этого файла.
  var detected = findBridge();
  if (detected) settle(detected);

  /* capacitor.js приходит после наших скриптов: подхватываем плагин, как
     только он появится. Опрашиваем через setTimeout, а не setInterval:
     так мост не тянет таймер, если плагина нет вовсе. */
  function pollNative() {
    if (readyDone) return;
    var plugin = nativePlugin();
    if (plugin) {
      nativeWait = null;
      wrapNative(plugin);
      return;
    }
    nativeWait = setTimeout(pollNative, 150);
  }

  if (!detected) pollNative();

  /* SDK может не ответить (нет инвентаря, блокировщик, сбой).
     Не держим игрока с нажатой кнопкой дольше 20 секунд. */
  function withTimeout(run, fallback) {
    return new Promise(function (resolve) {
      var settled = false;
      var finish = function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      var timer = setTimeout(function () { finish(fallback); }, AD_WAIT_MS);
      var pending;
      try {
        pending = run();
      } catch (e) {
        finish(fallback);
        return;
      }
      Promise.resolve(pending).then(finish, function () { finish(fallback); });
    });
  }

  function productList() {
    if (!bridge) return [];
    var value = bridge.products;
    if (typeof value === 'function') {
      value = safe(function () { return value.call(bridge); });
    }
    if (!value || typeof value.then === 'function') return [];
    return Array.isArray(value) ? value.slice() : [];
  }

  global.RuStorePlatform = {
    available: function () { return !!bridge; },
    whenReady: function () { return readyPromise; },

    showRewarded: function () {
      if (rewardedBusy) return Promise.resolve(false);
      if (!bridge || typeof bridge.showRewarded !== 'function') return Promise.resolve(false);
      rewardedBusy = true;
      return withTimeout(function () {
        return bridge.showRewarded();
      }, false).then(function (ok) {
        rewardedBusy = false;
        return ok === true;
      }, function () {
        rewardedBusy = false;
        return false;
      });
    },

    showInterstitial: function () {
      if (!bridge || typeof bridge.showInterstitial !== 'function') {
        return Promise.resolve(false);
      }
      return withTimeout(function () {
        return bridge.showInterstitial();
      }, false).then(function (shown) {
        return shown !== false;
      });
    },

    purchase: function (productId) {
      if (!bridge || typeof bridge.purchase !== 'function') return Promise.resolve(false);
      if (typeof productId !== 'string' || !productId) return Promise.resolve(false);
      return withTimeout(function () {
        return bridge.purchase(productId);
      }, false).then(function (ok) {
        return ok === true;
      });
    },

    restore: function () {
      if (!bridge || typeof bridge.restore !== 'function') return Promise.resolve(false);
      return withTimeout(function () {
        return bridge.restore();
      }, false).then(function (ok) {
        return ok === true;
      });
    },

    /* Выключение рекламы: метод моста необязателен. Возвращаем true,
       только если мост реально принял команду. */
    setAdsEnabled: function (on) {
      adsOn = !!on;
      adsSet = true;
      if (!bridge || typeof bridge.setAdsEnabled !== 'function') return false;
      try {
        bridge.setAdsEnabled(!!on);
        return true;
      } catch (e) {
        return false;
      }
    },

    adsEnabled: function () {
      if (bridge && typeof bridge.adsEnabled === 'function') {
        var current = safe(function () { return bridge.adsEnabled(); });
        if (typeof current === 'boolean') return current;
      }
      return adsOn;
    },

    products: productList,

    /* Реклама есть только в нативной сборке с Yandex Mobile Ads: мост сам
       сообщает, заполнены ли рекламные места. В браузере — false. */
    adsSupported: function () {
      if (!bridge || typeof bridge.adsSupported !== 'function') return false;
      return safe(function () { return bridge.adsSupported(); }) === true;
    }
  };
})(window);
