(function () {
  'use strict';

  var service = document.getElementById('brief-service');
  var budget = document.getElementById('brief-budget');
  var deadline = document.getElementById('brief-deadline');
  var about = document.getElementById('brief-about');
  var contact = document.getElementById('brief-contact');
  var out = document.getElementById('brief-out');
  var copy = document.getElementById('brief-copy');
  var mail = document.getElementById('brief-mail');
  var status = document.getElementById('brief-status');
  if (!service || !out || !copy || !mail) return;

  function message() {
    var lines = [
      'Здравствуйте! Хочу обсудить проект.',
      '',
      'Что нужно: ' + service.value,
      'Бюджет: ' + budget.value,
      'Срок: ' + deadline.value
    ];
    var text = (about.value || '').trim();
    if (text) lines.push('О проекте: ' + text);
    var who = (contact.value || '').trim();
    if (who) lines.push('Связаться: ' + who);
    lines.push('', 'Отправлено с сайта Mensori Dev.');
    return lines.join('\n');
  }

  function refresh() {
    out.textContent = message();
    out.classList.add('is-on');
    mail.href = 'mailto:mensoridev@gmail.com?subject=' + encodeURIComponent('Проект: ' + service.value) +
      '&body=' + encodeURIComponent(message());
  }

  function say(text) {
    if (status) status.textContent = text;
  }

  [service, budget, deadline, about, contact].forEach(function (el) {
    if (el) el.addEventListener('input', refresh);
    if (el) el.addEventListener('change', refresh);
  });

  copy.addEventListener('click', function () {
    refresh();
    var text = message();
    var done = function (ok) {
      say(ok ? 'Скопировано — можно вставлять в Telegram' : 'Не удалось скопировать, выдели текст ниже');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      return;
    }
    var area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;top:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    area.remove();
    done(ok);
  });

  mail.addEventListener('click', function () {
    refresh();
    say('Открываю почту…');
  });

  refresh();
})();
