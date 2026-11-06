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
    // iPadOS 13+ представляется как Macintosh, но с сенсорным экраном
    if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'is-ios';
    return '';
  }

  function parseDate(value) {
    var parts = String(value).split('-');
    if (parts.length !== 3) return null;
    var year = Number(parts[0]);
    var month = Number(parts[1]) - 1;
    var day = Number(parts[2]);
    var date = new Date(year, month, day);
    if (isNaN(date.getTime())) return null;
    // отсекаем 2026-13-40, которые Date молча переносит на другой день
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return date;
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
      var parsed = parseDate(data.date);
      if (parsed) {
        date.textContent = parsed.toLocaleDateString('ru-RU', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
      }
    }

    var list = document.querySelector('[data-notes]');
    if (list && Array.isArray(data.notes) && data.notes.length) {
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

  function initDemo() {
    var board = document.getElementById('demo-board');
    var status = document.getElementById('demo-status');
    var score = document.getElementById('demo-score');
    var reset = document.getElementById('demo-reset');
    if (!board || !status || !score) return;

    var ships = [
      [[0, 0], [1, 0], [2, 0]],
      [[5, 0], [6, 0]],
      [[0, 2], [1, 2]],
      [[4, 2]],
      [[7, 2]]
    ];
    var map = {};
    var hit = {};
    var cells = [];
    var shots = 0;
    var hits = 0;
    var total = 0;
    var over = false;

    function paintCell(x, y) {
      var key = x + ':' + y;
      var cell = map[key];
      if (!cell) return;
      cell.className = 'demo-cell';
      cell.disabled = over || !!cell.dataset.done;
      if (!cell.dataset.done) return;
      cell.classList.add(cell.dataset.done);
      if (cell.dataset.sunk === '1') cell.classList.add('sunk');
      var text = 'Клетка ' + (x + 1) + ', ' + (y + 1);
      if (cell.dataset.sunk === '1') text += ': корабль потоплен';
      else if (cell.dataset.done === 'hit') text += ': попадание';
      else text += ': мимо';
      cell.setAttribute('aria-label', text);
    }

    function statusText() {
      if (over) {
        status.textContent = 'Победа! Весь флот на дне';
        status.classList.add('is-win');
      } else if (shots === 0) {
        status.textContent = 'Твой ход';
        status.classList.remove('is-win');
      } else {
        status.textContent = 'Выстрелов: ' + shots + ' · попаданий: ' + hits;
        status.classList.remove('is-win');
      }
      score.textContent = hits + ' из ' + total;
    }

    function build() {
      board.innerHTML = '';
      map = {};
      hit = {};
      cells = [];
      shots = 0;
      hits = 0;
      over = false;
      total = 0;
      status.classList.remove('is-win');

      var owner = {};
      ships.forEach(function (ship, index) {
        total += ship.length;
        ship.forEach(function (point) {
          owner[point[0] + ':' + point[1]] = index;
        });
      });

      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          var cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'demo-cell';
          cell.dataset.x = x;
          cell.dataset.y = y;
          cell.dataset.ship = owner[x + ':' + y] === undefined ? '' : String(owner[x + ':' + y]);
          cell.setAttribute('aria-label', 'Клетка ' + (x + 1) + ', ' + (y + 1));
          cell.addEventListener('click', fire);
          board.appendChild(cell);
          map[x + ':' + y] = cell;
          cells.push(cell);
        }
      }
      statusText();
    }

    function fire(event) {
      var cell = event.currentTarget;
      if (over || cell.dataset.done) return;
      var x = Number(cell.dataset.x);
      var y = Number(cell.dataset.y);
      var key = x + ':' + y;
      var shipIndex = cell.dataset.ship;
      cell.dataset.done = shipIndex === '' ? 'miss' : 'hit';
      shots++;
      if (shipIndex === '') {
        paintCell(x, y);
        statusText();
        return;
      }

      hits++;
      hit[shipIndex] = hit[shipIndex] || {};
      hit[shipIndex][key] = true;
      if (Object.keys(hit[shipIndex]).length === ships[Number(shipIndex)].length) {
        ships[Number(shipIndex)].forEach(function (point) {
          var sunkCell = map[point[0] + ':' + point[1]];
          sunkCell.dataset.sunk = '1';
        });
      }
      for (var i = 0; i < cells.length; i++) paintCell(Number(cells[i].dataset.x), Number(cells[i].dataset.y));
      over = hits === total;
      if (over) {
        for (var j = 0; j < cells.length; j++) cells[j].disabled = true;
      }
      statusText();
    }

    if (reset) reset.addEventListener('click', build);
    build();
  }

  var visitor = platform();
  if (visitor) document.documentElement.classList.add(visitor);
  setHrefs(null);
  initTabs();
  initDemo();
  if (visitor === 'is-ios') {
    var iosTab = document.getElementById('tab-ios');
    if (iosTab) iosTab.click();
  }

  fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) { applyVersion(data); })
    .catch(function () { /* остаёмся на странице релизов */ });
})();
