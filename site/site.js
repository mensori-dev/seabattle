(function () {
  'use strict';

  var REPO = 'https://github.com/mensori-dev/seabattle';
  var RELEASES = REPO + '/releases/latest';
  var links = {
    apk: document.querySelector('[data-download="apk"]'),
    ipa: document.querySelector('[data-download="ipa"]')
  };

  function setHrefs(version) {
    var apk = version
      ? REPO + '/releases/download/v' + version + '/seabattle-' + version + '-release.apk'
      : RELEASES;
    var ipa = version
      ? REPO + '/releases/download/v' + version + '/seabattle-' + version + '-unsigned.ipa'
      : RELEASES;
    if (links.apk) links.apk.href = apk;
    if (links.ipa) links.ipa.href = ipa;
  }

  function platform() {
    var ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'is-android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'is-ios';
    return '';
  }

  function applyVersion(data) {
    if (!data || !data.version) return;
    setHrefs(data.version);

    var versionNodes = document.querySelectorAll('[data-version]');
    for (var i = 0; i < versionNodes.length; i++) versionNodes[i].textContent = data.version;

    var file = document.querySelector('[data-filename]');
    if (file) file.textContent = 'seabattle-' + data.version + '-release.apk';

    var date = document.querySelector('[data-date]');
    if (date && data.date) {
      var parsed = new Date(data.date);
      if (!isNaN(parsed.getTime())) {
        date.textContent = parsed.toLocaleDateString('ru-RU', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
      }
    }

    var list = document.querySelector('[data-notes]');
    if (list && data.notes && data.notes.length) {
      list.innerHTML = '';
      for (var n = 0; n < data.notes.length; n++) {
        var li = document.createElement('li');
        li.textContent = data.notes[n];
        list.appendChild(li);
      }
    }
  }

  function initTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;

    function select(tab) {
      tabs.forEach(function (item) {
        var selected = item === tab;
        item.setAttribute('aria-selected', selected ? 'true' : 'false');
        item.tabIndex = selected ? 0 : -1;
        var panel = document.getElementById(item.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs[tabs.length - 1];
        if (!next) return;
        event.preventDefault();
        select(next);
        next.focus();
      });
    });
  }

  document.documentElement.className += ' ' + platform();
  setHrefs(null);
  initTabs();

  fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) { applyVersion(data); })
    .catch(function () { /* остаёмся на странице релизов */ });
})();
