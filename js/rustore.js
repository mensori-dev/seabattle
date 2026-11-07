/* ============================================================
   RuStore: фундамент монетизации без нативного SDK.
   Классический IIFE — файл работает и через file://, и в PWA.

   Пока нативный мост не подключён, все действия возвращают false,
   а products() — пустой массив. Игра обязана работать без RuStore.

   Контракт моста (window.RuStoreBridge):
     showRewarded()       -> Promise<boolean>
     showInterstitial()   -> Promise<boolean>
     purchase(productId)  -> Promise<boolean>
     restore()            -> Promise<boolean>
     products()           -> Array<{ id, title, price, currency }>
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
  var rewardedBusy = false;

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
    if (sdk) bridge = sdk;
    if (readyDone) return;
    readyDone = true;
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

  // Без SDK не держим игру: через 8 секунд просто живём дальше.
  readyTimer = setTimeout(function () { settle(null); }, READY_WAIT_MS);

  // Мост мог быть внедрён до загрузки этого файла.
  var detected = findBridge();
  if (detected) settle(detected);

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

    products: productList
  };
})(window);
