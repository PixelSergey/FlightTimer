(() => {
  'use strict';

  const STORAGE_KEY = 'jumpPilotLog.v1';
  const DEFAULT_SETTINGS = Object.freeze({
    trackingMode: 'times',
    utcOffset: 0,
    airfield: '',
    aircraftType: ''
  });

  const state = loadState();
  let selectedDate = todayKey();
  let selectedRegistration = normalizeRegistration(state.lastRegistration || '');
  let currentView = 'tracker';
  let toastTimer = null;

  const els = {
    previousDate: document.querySelector('#previousDate'),
    nextDate: document.querySelector('#nextDate'),
    dateButton: document.querySelector('#dateButton'),
    dateLabel: document.querySelector('#dateLabel'),
    registrationInput: document.querySelector('#registrationInput'),
    registrationControl: document.querySelector('#registrationControl'),
    aircraftDropdownButton: document.querySelector('#aircraftDropdownButton'),
    aircraftMenu: document.querySelector('#aircraftMenu'),
    settingsButton: document.querySelector('#settingsButton'),
    exportButton: document.querySelector('#exportButton'),
    emptyState: document.querySelector('#emptyState'),
    eventsList: document.querySelector('#eventsList'),
    eventActions: document.querySelector('#eventActions'),
    exportPanel: document.querySelector('#exportPanel'),
    statsCard: document.querySelector('#statsCard'),
    copyPilotLog: document.querySelector('#copyPilotLog'),
    copyStatus: document.querySelector('#copyStatus'),
    copyDayBackup: document.querySelector('#copyDayBackup'),
    downloadDayBackup: document.querySelector('#downloadDayBackup'),
    backupStatus: document.querySelector('#backupStatus'),
    datePicker: document.querySelector('#datePicker'),
    settingsDialog: document.querySelector('#settingsDialog'),
    settingsForm: document.querySelector('#settingsForm'),
    settingsTitle: document.querySelector('#settingsTitle'),
    utcOffsetInput: document.querySelector('#utcOffsetInput'),
    airfieldInput: document.querySelector('#airfieldInput'),
    aircraftTypeInput: document.querySelector('#aircraftTypeInput'),
    timeBoxTemplate: document.querySelector('#timeBoxTemplate')
  };

  init();

  function init() {
    ensureStateShape();
    bindGlobalEvents();
    renderAll();
    registerServiceWorker();
  }

  function ensureStateShape() {
    state.aircraftProfiles ||= {};
    state.days ||= {};
    state.lastRegistration ||= '';
    saveState();
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (error) {
      console.warn('Could not read saved data.', error);
    }
    return { version: 1, aircraftProfiles: {}, days: {}, lastRegistration: '' };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Could not save data.', error);
      showToast('Could not save locally');
    }
  }

  function bindGlobalEvents() {
    els.previousDate.addEventListener('click', () => changeDateBy(-1));
    els.nextDate.addEventListener('click', () => changeDateBy(1));

    els.registrationInput.addEventListener('input', () => {
      const clean = normalizeRegistration(els.registrationInput.value, false);
      if (clean !== els.registrationInput.value) els.registrationInput.value = clean;
      renderAircraftList(clean);
      if (Object.keys(state.aircraftProfiles).length) openAircraftMenu();
    });
    els.registrationInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const focusedOption = els.aircraftMenu.querySelector('.aircraft-option:focus');
        if (focusedOption) selectAircraftOption(focusedOption.dataset.registration);
        else commitRegistration();
        els.registrationInput.blur();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        renderAircraftList(els.registrationInput.value);
        openAircraftMenu();
        els.aircraftMenu.querySelector('.aircraft-option')?.focus();
      } else if (event.key === 'Escape') {
        closeAircraftMenu();
      }
    });
    els.registrationControl.addEventListener('focusout', () => {
      requestAnimationFrame(() => {
        if (!els.registrationControl.contains(document.activeElement)) {
          commitRegistration();
          closeAircraftMenu();
        }
      });
    });
    els.aircraftDropdownButton.addEventListener('click', () => {
      if (els.aircraftMenu.hidden) {
        renderAircraftList('');
        openAircraftMenu();
      } else {
        closeAircraftMenu();
      }
    });
    els.aircraftMenu.addEventListener('keydown', (event) => {
      const options = [...els.aircraftMenu.querySelectorAll('.aircraft-option')];
      const current = options.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        options[(current + 1 + options.length) % options.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        options[(current - 1 + options.length) % options.length]?.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeAircraftMenu();
        els.registrationInput.focus();
      }
    });
    document.addEventListener('pointerdown', (event) => {
      if (!els.registrationControl.contains(event.target)) closeAircraftMenu();
    });

    els.settingsButton.addEventListener('click', openSettingsDialog);
    els.exportButton.addEventListener('click', () => setView(currentView === 'tracker' ? 'export' : 'tracker'));
    els.copyPilotLog.addEventListener('click', copyPilotLog);
    els.copyDayBackup.addEventListener('click', copyDayBackup);
    els.downloadDayBackup.addEventListener('click', downloadDayBackup);

    els.datePicker.addEventListener('change', () => {
      if (!els.datePicker.value) return;
      selectedDate = els.datePicker.value;
      selectedRegistration = normalizeRegistration(state.lastRegistration || selectedRegistration || '');
      setView('tracker');
      renderAll();
    });

    els.settingsForm.addEventListener('submit', (event) => {
      const submitter = event.submitter;
      if (!submitter || submitter.value === 'cancel') return;
      event.preventDefault();
      saveSettingsFromModal();
    });

    els.airfieldInput.addEventListener('input', () => {
      els.airfieldInput.value = sanitizeCode(els.airfieldInput.value, 4);
    });
    els.aircraftTypeInput.addEventListener('input', () => {
      els.aircraftTypeInput.value = sanitizeCode(els.aircraftTypeInput.value, 4);
    });
  }

  function renderAll() {
    els.dateLabel.textContent = formatDateHeader(selectedDate);
    els.datePicker.value = selectedDate;
    els.registrationInput.value = selectedRegistration;
    renderAircraftList();
    renderTracker();
    renderStats();
  }

  function renderAircraftList(filter = '') {
    const query = normalizeRegistration(filter, false);
    const registrations = Object.keys(state.aircraftProfiles)
      .sort((a, b) => a.localeCompare(b))
      .filter((registration) => !query || registration.includes(query));

    if (!registrations.length) {
      const empty = document.createElement('div');
      empty.className = 'aircraft-empty';
      empty.textContent = Object.keys(state.aircraftProfiles).length ? 'No matching aircraft' : 'Saved aircraft will appear here';
      els.aircraftMenu.replaceChildren(empty);
      return;
    }

    els.aircraftMenu.replaceChildren(...registrations.map((registration) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'aircraft-option';
      option.role = 'option';
      option.dataset.registration = registration;
      option.setAttribute('aria-selected', String(registration === selectedRegistration));
      const label = document.createElement('span');
      label.textContent = registration;
      option.append(label);
      if (registration === selectedRegistration) option.append(iconElement('check', 'check'));
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => selectAircraftOption(registration));
      return option;
    }));
  }

  function openAircraftMenu() {
    els.aircraftMenu.hidden = false;
    els.registrationInput.setAttribute('aria-expanded', 'true');
    els.aircraftDropdownButton.setAttribute('aria-expanded', 'true');
  }

  function closeAircraftMenu() {
    els.aircraftMenu.hidden = true;
    els.registrationInput.setAttribute('aria-expanded', 'false');
    els.aircraftDropdownButton.setAttribute('aria-expanded', 'false');
  }

  function selectAircraftOption(registration) {
    els.registrationInput.value = registration;
    closeAircraftMenu();
    commitRegistration(registration);
    dismissKeyboard(els.registrationInput);
  }

  function commitRegistration(value = els.registrationInput.value) {
    const next = normalizeRegistration(value);
    els.registrationInput.value = next;
    closeAircraftMenu();
    if (next === selectedRegistration) return;

    selectedRegistration = next;
    if (next) {
      ensureAircraftProfile(next);
      state.lastRegistration = next;
      saveState();
    }
    setView('tracker');
    renderAll();
  }

  function ensureAircraftProfile(registration) {
    if (!registration) return null;
    if (!state.aircraftProfiles[registration]) {
      state.aircraftProfiles[registration] = {
        registration,
        settings: { ...DEFAULT_SETTINGS }
      };
    }
    return state.aircraftProfiles[registration];
  }

  function dayKey(date = selectedDate, registration = selectedRegistration) {
    return `${date}::${registration}`;
  }

  function getDay({ create = false } = {}) {
    if (!selectedRegistration) return null;
    const key = dayKey();
    let day = state.days[key];
    if (!day && create) {
      const profile = ensureAircraftProfile(selectedRegistration);
      day = state.days[key] = {
        date: selectedDate,
        registration: selectedRegistration,
        settings: { ...DEFAULT_SETTINGS, ...(profile?.settings || {}) },
        events: []
      };
      saveState();
    }
    return day || null;
  }

  function getDaySettings() {
    const day = getDay();
    if (day?.settings) return { ...DEFAULT_SETTINGS, ...day.settings };
    const profile = selectedRegistration ? ensureAircraftProfile(selectedRegistration) : null;
    return { ...DEFAULT_SETTINGS, ...(profile?.settings || {}) };
  }

  function renderTracker() {
    els.eventsList.replaceChildren();
    els.eventActions.replaceChildren();

    if (!selectedRegistration) {
      els.emptyState.hidden = false;
      return;
    }

    els.emptyState.hidden = true;
    const day = getDay();
    const events = day?.events || [];
    const settings = getDaySettings();

    for (const event of events) {
      let node;
      if (event.type === 'off') node = renderOffBlock(event);
      if (event.type === 'flight') node = renderFlight(event, settings);
      if (event.type === 'fuel') node = renderFuel(event);
      if (event.type === 'on') node = renderOnBlock(event);
      if (node) els.eventsList.append(node);
    }

    renderEventActions(events);
  }

  function renderOffBlock(event) {
    const card = makeEventCard();
    const main = card.querySelector('.event-main');
    const row = document.createElement('div');
    row.className = 'event-row';
    row.append(labelNode('OFF-BLOCK'));
    const timeBox = createTimeBox(event.time || '', 'Off-block time', (digits) => updateEvent(event.id, { time: digits }));
    timeBox.querySelector('[data-timebox]').classList.add('block-timebox');
    row.append(timeBox);
    main.append(row);

    const side = card.querySelector('.event-side');
    side.append(toggleControl('NO CYC', !!event.noCycle, (value) => updateEvent(event.id, { noCycle: value })));
    side.append(removeControl(event.id));
    return card;
  }

  function renderOnBlock(event) {
    const card = makeEventCard();
    const main = card.querySelector('.event-main');
    const row = document.createElement('div');
    row.className = 'event-row';
    row.append(labelNode('ON-BLOCK'));
    const timeBox = createTimeBox(event.time || '', 'On-block time', (digits) => updateEvent(event.id, { time: digits }));
    timeBox.querySelector('[data-timebox]').classList.add('block-timebox');
    row.append(timeBox);
    main.append(row);
    card.querySelector('.event-side').append(removeControl(event.id));
    return card;
  }

  function renderFlight(event, settings) {
    const card = makeEventCard();
    const main = card.querySelector('.event-main');

    if (settings.trackingMode === 'time-only') {
      const row = document.createElement('div');
      row.className = 'event-row';
      row.append(labelNode('TIME'));
      row.append(createIntegerBox(event.minutes ?? '', 'Flight time in minutes', (value) => updateEvent(event.id, { minutes: value }), { max: 999 }));
      row.append(suffixNode('MIN'));
      main.append(row);
    } else {
      card.classList.add('flight-event');
      const grid = document.createElement('div');
      grid.className = 'flight-layout';

      const to = document.createElement('div');
      to.className = 'flight-field';
      to.append(labelNode('T/O'));
      let durationBox;
      to.append(createTimeBox(event.takeoff || '', 'Takeoff time', (digits) => {
        const landing = event.landing || '';
        const minutes = digits.length === 4 && landing.length === 4 ? minuteDifference(digits, landing) : '';
        updateEvent(event.id, { takeoff: digits, minutes });
        if (durationBox) durationBox.querySelector('input').value = minutes === '' ? '' : String(minutes);
      }));

      const ldg = document.createElement('div');
      ldg.className = 'flight-field';
      ldg.append(labelNode('LDG'));
      ldg.append(createTimeBox(event.landing || '', 'Landing time', (digits) => {
        const takeoff = event.takeoff || '';
        const minutes = digits.length === 4 && takeoff.length === 4 ? minuteDifference(takeoff, digits) : '';
        updateEvent(event.id, { landing: digits, minutes });
        if (durationBox) durationBox.querySelector('input').value = minutes === '' ? '' : String(minutes);
      }));

      const duration = document.createElement('div');
      duration.className = 'flight-field';
      duration.append(labelNode('TIME'));
      const calculated = calculateFlightMinutes(event, 'times');
      durationBox = createIntegerBox(calculated ?? '', 'Calculated flight time in minutes', null, { readonly: true, max: 999 });
      durationBox.classList.add('flight-duration-box');
      duration.append(durationBox);

      grid.append(to, ldg, duration);
      main.append(grid);
    }

    const side = card.querySelector('.event-side');
    side.append(toggleControl('NO DROP', !!event.noDrop, (value) => updateEvent(event.id, { noDrop: value })));
    side.append(removeControl(event.id));
    return card;
  }

  function renderFuel(event) {
    const card = makeEventCard();
    const main = card.querySelector('.event-main');
    const row = document.createElement('div');
    row.className = 'event-row';
    row.append(labelNode('FUEL'));
    row.append(createIntegerBox(event.liters ?? '', 'Fuel in litres', (value) => updateEvent(event.id, { liters: value }), { max: 9999 }));
    row.append(suffixNode('L'));
    main.append(row);
    card.querySelector('.event-side').append(removeControl(event.id));
    return card;
  }

  function makeEventCard() {
    const card = document.createElement('article');
    card.className = 'event-card';
    const main = document.createElement('div');
    main.className = 'event-main';
    const side = document.createElement('div');
    side.className = 'event-side';
    card.append(main, side);
    return card;
  }

  function labelNode(text) {
    const span = document.createElement('span');
    span.className = 'event-label';
    span.textContent = text;
    return span;
  }

  function suffixNode(text) {
    const span = document.createElement('span');
    span.className = 'suffix';
    span.textContent = text;
    return span;
  }

  function toggleControl(label, pressed, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'toggle-control';

    const caption = document.createElement('span');
    caption.className = 'event-side-label';
    caption.textContent = label;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toggle-dot';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(pressed));
    button.addEventListener('click', () => {
      const next = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(next));
      onChange(next);
    });

    wrap.append(caption, button);
    return wrap;
  }

  function removeControl(eventId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'remove-button';
    button.append(iconElement('trash'));
    button.setAttribute('aria-label', 'Remove event');
    button.addEventListener('click', () => removeEvent(eventId));
    return button;
  }

  function renderEventActions(events) {
    const offBlocks = isCurrentlyOffBlocks(events);
    const actions = offBlocks
      ? [
          ['LIFT', 'flight', true],
          ['ON-BLOCK', 'on', false],
          ['FUEL', 'fuel', false]
        ]
      : [
          ['OFF-BLOCK', 'off', true],
          ['FUEL', 'fuel', false]
        ];

    if (actions.length === 2) els.eventActions.classList.add('two');
    else els.eventActions.classList.remove('two');

    for (const [label, type, primary] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `action-button${primary ? ' primary-ish' : ''}`;
      button.append(iconElement('plus'));
      const text = document.createElement('span');
      text.textContent = label;
      button.append(text);
      button.addEventListener('click', () => addEvent(type));
      els.eventActions.append(button);
    }
  }

  function iconElement(name, className = '') {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);

    const paths = {
      plus: ['M12 5v14', 'M5 12h14'],
      trash: ['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M10 11v6', 'M14 11v6'],
      check: ['m5 12 4 4L19 6']
    };
    for (const d of paths[name] || []) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }

  function isCurrentlyOffBlocks(events) {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i].type === 'off') return true;
      if (events[i].type === 'on') return false;
    }
    return false;
  }

  function addEvent(type) {
    if (!selectedRegistration) return;
    const day = getDay({ create: true });
    const event = { id: makeId(), type };
    if (type === 'off' || type === 'on') event.time = '';
    if (type === 'off') event.noCycle = false;
    if (type === 'flight') Object.assign(event, { takeoff: '', landing: '', minutes: '', noDrop: false });
    if (type === 'fuel') event.liters = '';
    day.events.push(event);
    saveState();
    renderTracker();
    renderStats();

    requestAnimationFrame(() => {
      const inputs = els.eventsList.querySelectorAll('.timebox-input, .integer-box input:not([readonly])');
      inputs[inputs.length - 1]?.focus();
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
  }

  function updateEvent(eventId, patch) {
    const day = getDay({ create: true });
    const event = day.events.find((item) => item.id === eventId);
    if (!event) return;
    Object.assign(event, patch);
    saveState();
    renderStats();
  }

  function removeEvent(eventId) {
    const day = getDay();
    if (!day) return;
    const index = day.events.findIndex((item) => item.id === eventId);
    if (index < 0) return;
    day.events.splice(index, 1);
    saveState();
    renderTracker();
    renderStats();
  }

  function createTimeBox(initialDigits, ariaLabel, onChange) {
    const fragment = els.timeBoxTemplate.content.cloneNode(true);
    const box = fragment.querySelector('[data-timebox]');
    const input = fragment.querySelector('.timebox-input');
    let digits = sanitizeTimeDigits(initialDigits || '');
    let lastTapAt = 0;

    input.setAttribute('aria-label', ariaLabel);
    input.value = digits;
    paint();

    // The real input is stretched over the entire custom time box. Let the
    // browser focus it natively from the tap instead of calling focus() from
    // touchstart. On iOS, focusing on touchstart happens before the visual
    // viewport shrinks for the keyboard, which can suppress WebKit's normal
    // scroll-to-focused-control behavior.
    input.addEventListener('focus', () => {
      if (!onChange || input.readOnly) return;

      // Keep manual entry appending at the end while preserving native focus.
      try {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      } catch (error) {
        // Selection placement is best-effort.
      }

      ensureFocusedTimeBoxVisible(input);
    });

    input.addEventListener('beforeinput', (event) => {
      if (!onChange) return;
      if (event.inputType !== 'insertText' || !/^\d$/.test(event.data || '')) return;
      if (input.value.length === 4 && input.selectionStart === input.selectionEnd) {
        event.preventDefault();
        digits = sanitizeTimeDigits(event.data);
        input.value = digits;
        paint();
        onChange(digits);
      }
    });

    input.addEventListener('input', () => {
      if (!onChange) return;
      const next = sanitizeTimeDigits(input.value);
      digits = next;
      input.value = next;
      paint();
      onChange(next);
    });

    box.addEventListener('pointerup', (event) => {
      if (!onChange) return;
      const now = performance.now();
      if (now - lastTapAt < 340) {
        event.preventDefault();
        const current = nowLocalTimeDigits();
        digits = current;
        input.value = current;
        paint();
        onChange(current);
        dismissKeyboard(input);
        showToast(`Time set to ${formatTimeDigits(current)}`);
        lastTapAt = 0;
      } else {
        lastTapAt = now;
        // Do not call focus() here. The pointer event originates on the native
        // input itself, so allowing its default action gives iOS WebKit the
        // same focus + keyboard + auto-scroll path as an ordinary text field.
      }
    });

    function paint() {
      const slots = [box.querySelector('[data-d0]'), box.querySelector('[data-d1]'), box.querySelector('[data-d2]'), box.querySelector('[data-d3]')];
      slots.forEach((slot, index) => { slot.textContent = digits[index] ?? '–'; });
    }

    return fragment;
  }

  function ensureFocusedTimeBoxVisible(input) {
    if (!input) return;

    const isTouchDevice = window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!isTouchDevice) return;

    const target = input.closest('[data-timebox]') || input;
    const viewport = window.visualViewport;
    let stopped = false;
    let rafId = 0;
    const timers = [];

    const nudgeIntoView = () => {
      if (stopped || document.activeElement !== input) return;

      const rect = target.getBoundingClientRect();
      const viewportTop = viewport ? viewport.offsetTop : 0;
      const viewportHeight = viewport ? viewport.height : window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight;
      const topMargin = 16;
      const bottomMargin = 20;

      let delta = 0;
      if (rect.bottom > viewportBottom - bottomMargin) {
        delta = rect.bottom - (viewportBottom - bottomMargin);
      } else if (rect.top < viewportTop + topMargin) {
        delta = rect.top - (viewportTop + topMargin);
      }

      if (Math.abs(delta) > 1) {
        // Scroll the document itself. scrollIntoView() can choose an
        // overflow-hidden ancestor on WebKit, so a root scroll is more
        // predictable for this layout.
        window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
      }
    };

    const scheduleNudge = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(nudgeIntoView);
    };

    // WebKit changes the visual viewport after focus when the keyboard opens.
    // Track that resize and also retry at a few short delays because Chrome on
    // iOS can report the final keyboard viewport over multiple frames.
    viewport?.addEventListener('resize', scheduleNudge);
    viewport?.addEventListener('scroll', scheduleNudge);
    [80, 180, 320, 520].forEach((delay) => timers.push(setTimeout(scheduleNudge, delay)));

    input.addEventListener('blur', () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      timers.forEach(clearTimeout);
      viewport?.removeEventListener('resize', scheduleNudge);
      viewport?.removeEventListener('scroll', scheduleNudge);
    }, { once: true });
  }

  function dismissKeyboard(input) {
    if (!input) return;
    const restoreEditable = !input.readOnly;

    // On iOS Safari a double tap can queue a click/focus after pointerup. Keep
    // the field temporarily read-only and blur more than once so that queued
    // focus events cannot reopen the software keyboard.
    if (restoreEditable) input.readOnly = true;

    const hide = () => {
      if (document.activeElement === input) input.blur();
      else input.blur();
      try {
        navigator.virtualKeyboard?.hide?.();
      } catch (error) {
        // The Virtual Keyboard API is optional; blur() remains the fallback.
      }
    };

    hide();
    requestAnimationFrame(hide);
    setTimeout(hide, 60);
    setTimeout(() => {
      hide();
      if (restoreEditable) input.readOnly = false;
    }, 220);
  }

  function createIntegerBox(initialValue, ariaLabel, onChange, { readonly = false, max = 9999 } = {}) {
    const wrap = document.createElement('label');
    wrap.className = 'integer-box';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', ariaLabel);
    input.value = initialValue === null || initialValue === undefined ? '' : String(initialValue);
    if (readonly) input.readOnly = true;
    if (readonly) wrap.classList.add('readonly');

    if (onChange) {
      input.addEventListener('input', () => {
        let clean = input.value.replace(/\D/g, '').slice(0, String(max).length);
        if (clean && Number(clean) > max) clean = String(max);
        input.value = clean;
        onChange(clean === '' ? '' : Number(clean));
      });
    }
    wrap.append(input);
    return wrap;
  }

  function sanitizeTimeDigits(raw) {
    const source = String(raw || '').replace(/\D/g, '').slice(0, 8);
    let out = '';
    for (const char of source) {
      const pos = out.length;
      if (pos >= 4) break;
      const digit = Number(char);
      const allowed =
        (pos === 0 && digit <= 2) ||
        (pos === 1 && (Number(out[0]) < 2 || digit <= 3)) ||
        (pos === 2 && digit <= 5) ||
        (pos === 3 && digit <= 9);
      if (allowed) out += char;
    }
    return out;
  }

  function renderStats() {
    const day = getDay();
    const events = day?.events || [];
    const stats = calculateStats(events, day?.settings || DEFAULT_SETTINGS);
    const rows = [
      ['Flight time', formatDuration(stats.flightMinutes)],
      ['Block time', formatDuration(stats.blockMinutes)],
      ['Engine starts', stats.engineStarts],
      ['Landings', stats.landings],
      ['Parachute drops', stats.drops],
      ['Fuel', `${stats.fuel} L`]
    ];

    els.statsCard.replaceChildren(...rows.map(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'stat-row';
      const l = document.createElement('span');
      l.className = 'stat-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'stat-value';
      v.textContent = String(value);
      row.append(l, v);
      return row;
    }));

    els.copyPilotLog.disabled = !day || buildBlockSegments(events).length === 0;
    const backupUnavailable = !day || events.length === 0;
    els.copyDayBackup.disabled = backupUnavailable;
    els.downloadDayBackup.disabled = backupUnavailable;
    els.copyStatus.textContent = '';
    els.backupStatus.textContent = '';
  }

  function calculateStats(events, settings = DEFAULT_SETTINGS) {
    const flightMinutes = events
      .filter((event) => event.type === 'flight')
      .reduce((sum, event) => sum + (Number(calculateFlightMinutes(event, settings.trackingMode)) || 0), 0);

    const blockMinutes = buildBlockSegments(events)
      .reduce((sum, segment) => sum + segment.blockMinutes, 0);

    const engineStarts = events.filter((event) => event.type === 'off' && !event.noCycle).length;
    const landings = events.filter((event) => event.type === 'flight').length;
    const drops = events.filter((event) => event.type === 'flight' && !event.noDrop).length;
    const fuel = events.filter((event) => event.type === 'fuel').reduce((sum, event) => sum + (Number(event.liters) || 0), 0);

    return { flightMinutes, blockMinutes, engineStarts, landings, drops, fuel };
  }

  function calculateFlightMinutes(event, trackingMode = 'times') {
    if (trackingMode === 'times' && event.takeoff?.length === 4 && event.landing?.length === 4) {
      return minuteDifference(event.takeoff, event.landing);
    }
    if (event.minutes === '' || event.minutes === null || event.minutes === undefined) return '';
    return Number(event.minutes) || 0;
  }

  function buildBlockSegments(events) {
    const segments = [];
    let current = null;

    events.forEach((event, index) => {
      if (event.type === 'off') {
        current = { off: event, startIndex: index, flights: [] };
        return;
      }
      if (event.type === 'flight' && current) {
        current.flights.push(event);
        return;
      }
      if (event.type === 'on' && current) {
        if (current.off.time?.length === 4 && event.time?.length === 4) {
          segments.push({
            ...current,
            on: event,
            endIndex: index,
            blockMinutes: minuteDifference(current.off.time, event.time)
          });
        }
        current = null;
      }
    });

    return segments;
  }

  function openSettingsDialog() {
    if (!selectedRegistration) {
      els.registrationInput.focus();
      showToast('Enter an aircraft registration first');
      return;
    }
    const settings = getDaySettings();
    els.settingsTitle.textContent = selectedRegistration;
    const radio = els.settingsForm.querySelector(`input[name="trackingMode"][value="${settings.trackingMode}"]`);
    if (radio) radio.checked = true;
    els.utcOffsetInput.value = String(settings.utcOffset ?? 0);
    els.airfieldInput.value = settings.airfield || '';
    els.aircraftTypeInput.value = settings.aircraftType || '';
    if (typeof els.settingsDialog.showModal === 'function') els.settingsDialog.showModal();
  }

  function saveSettingsFromModal() {
    const trackingMode = els.settingsForm.querySelector('input[name="trackingMode"]:checked')?.value || 'times';
    const utcOffsetRaw = Number(els.utcOffsetInput.value || 0);
    const utcOffset = Math.min(14, Math.max(-12, Number.isFinite(utcOffsetRaw) ? utcOffsetRaw : 0));
    const airfield = sanitizeCode(els.airfieldInput.value, 4);
    const aircraftType = sanitizeCode(els.aircraftTypeInput.value, 4);

    if (airfield && airfield.length !== 4) {
      els.airfieldInput.focus();
      showToast('Airfield must be four characters');
      return;
    }
    if (aircraftType && aircraftType.length < 3) {
      els.aircraftTypeInput.focus();
      showToast('Aircraft type must be 3–4 characters');
      return;
    }

    const settings = { trackingMode, utcOffset, airfield, aircraftType };
    const day = getDay({ create: true });
    day.settings = { ...settings };
    const profile = ensureAircraftProfile(selectedRegistration);
    profile.settings = { ...settings };
    saveState();
    els.settingsDialog.close();
    renderTracker();
    renderStats();
    showToast('Settings saved');
  }

  function setView(view) {
    currentView = view;
    document.body.classList.toggle('export-mode', view === 'export');
    els.exportPanel.setAttribute('aria-hidden', String(view !== 'export'));
    els.exportButton.setAttribute('aria-label', view === 'export' ? 'Back to flight tracker' : 'Open export page');
    if (view === 'export') renderStats();
  }

  async function copyPilotLog() {
    const day = getDay();
    if (!day) return;
    const segments = buildBlockSegments(day.events || []);
    if (!segments.length) {
      els.copyStatus.textContent = 'Complete an off-block / on-block pair first.';
      return;
    }

    const settings = { ...DEFAULT_SETTINGS, ...(day.settings || {}) };
    const lines = segments.map((segment) => {
      return [
        'PIC',
        formatExportDate(day.date),
        settings.airfield || '',
        localTimeToUtc(segment.off.time, settings.utcOffset),
        settings.airfield || '',
        localTimeToUtc(segment.on.time, settings.utcOffset),
        settings.aircraftType || '',
        day.registration,
      ].join('\t');
    });

    const payload = lines.join('\n');
    try {
      await copyText(payload);
      els.copyStatus.textContent = `${lines.length} block ${lines.length === 1 ? 'line' : 'lines'} copied.`;
      showToast('Pilot log copied');
    } catch (error) {
      console.warn('Clipboard write failed.', error);
      els.copyStatus.textContent = 'Clipboard unavailable in this browser.';
    }
  }

  function buildDayBackupText(day) {
    if (!day) return '';
    const settings = { ...DEFAULT_SETTINGS, ...(day.settings || {}) };
    const lines = [`${day.registration} ${formatExportDate(day.date)}`];

    for (const event of day.events || []) {
      if (event.type === 'off') {
        lines.push(`${formatBackupClockTime(event.time)}/${event.noCycle ? ' no cyc' : ''}`);
      } else if (event.type === 'flight') {
        if (settings.trackingMode === 'time-only') {
          const value = event.minutes === '' || event.minutes === null || event.minutes === undefined ? '' : String(event.minutes);
          lines.push(`${value}${event.noDrop ? ' no drop' : ''}`);
        } else {
          const flightMinutes = calculateFlightMinutes(event, 'times');
          const useFullTimes = Number.isFinite(Number(flightMinutes)) && Number(flightMinutes) > 60;
          const takeoff = useFullTimes ? formatBackupClockTime(event.takeoff) : formatBackupClockMinutes(event.takeoff);
          const landing = useFullTimes ? formatBackupClockTime(event.landing) : formatBackupClockMinutes(event.landing);
          lines.push(`${takeoff}/${landing}${event.noDrop ? ' no drop' : ''}`);
        }
      } else if (event.type === 'on') {
        lines.push(`/${formatBackupClockTime(event.time)}`);
      } else if (event.type === 'fuel') {
        const liters = event.liters === '' || event.liters === null || event.liters === undefined ? '' : String(event.liters);
        lines.push(`+${liters}L`);
      }
    }

    return lines.join('\n');
  }

  function formatBackupClockTime(digits) {
    return digits?.length === 4 ? digits : '';
  }

  function formatBackupClockMinutes(digits) {
    return digits?.length === 4 ? digits.slice(2) : '';
  }

  function formatExportDate(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return String(key || '');
    const [year, month, day] = key.split('-');
    return `${day}.${month}.${year}`;
  }

  async function copyDayBackup() {
    const day = getDay();
    if (!day || !(day.events || []).length) {
      els.backupStatus.textContent = 'Add at least one event first.';
      return;
    }

    const payload = buildDayBackupText(day);
    try {
      await copyText(payload);
      els.backupStatus.textContent = 'Day backup copied.';
      showToast('Backup copied');
    } catch (error) {
      console.warn('Backup clipboard write failed.', error);
      els.backupStatus.textContent = 'Clipboard unavailable in this browser.';
    }
  }

  function downloadDayBackup() {
    const day = getDay();
    if (!day || !(day.events || []).length) {
      els.backupStatus.textContent = 'Add at least one event first.';
      return;
    }

    const payload = buildDayBackupText(day);
    const blob = new Blob([payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeRegistration = (day.registration || 'aircraft').replace(/[^A-Z0-9-]/gi, '_');
    anchor.href = url;
    anchor.download = `${safeRegistration}_${formatExportDate(day.date)}_backup.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    els.backupStatus.textContent = 'Day backup downloaded.';
    showToast('Backup downloaded');
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    textarea.remove();
    if (!successful) throw new Error('Copy command failed');
  }

  function changeDateBy(deltaDays) {
    const date = dateFromKey(selectedDate);
    date.setDate(date.getDate() + deltaDays);
    selectedDate = dateKeyFromDate(date);
    selectedRegistration = normalizeRegistration(state.lastRegistration || selectedRegistration || '');
    setView('tracker');
    renderAll();
  }

  function localTimeToUtc(digits, offsetHours) {
    if (!digits || digits.length !== 4) return '';
    const localMinutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4));
    const offsetMinutes = Math.round((Number(offsetHours) || 0) * 60);
    const utcMinutes = mod(localMinutes - offsetMinutes, 1440);
    return `${pad2(Math.floor(utcMinutes / 60))}:${pad2(utcMinutes % 60)}`;
  }

  function minuteDifference(startDigits, endDigits) {
    if (startDigits?.length !== 4 || endDigits?.length !== 4) return 0;
    const start = Number(startDigits.slice(0, 2)) * 60 + Number(startDigits.slice(2, 4));
    let end = Number(endDigits.slice(0, 2)) * 60 + Number(endDigits.slice(2, 4));
    if (end < start) end += 1440;
    return end - start;
  }

  function formatDuration(minutes) {
    const total = Math.max(0, Number(minutes) || 0);
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return `${pad2(hours)}:${pad2(mins)}`;
  }

  function formatTimeDigits(digits) {
    return digits?.length === 4 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : '';
  }

  function normalizeRegistration(value, trimEdges = true) {
    let clean = String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
    clean = clean.replace(/-{2,}/g, '-');
    if (trimEdges) clean = clean.replace(/^-+|-+$/g, '');
    return clean.slice(0, 12);
  }

  function sanitizeCode(value, maxLength) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, maxLength);
  }

  function todayKey() {
    return dateKeyFromDate(new Date());
  }

  function dateKeyFromDate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function dateFromKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function formatDateHeader(key) {
    const date = dateFromKey(key);
    return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  function nowLocalTimeDigits() {
    const date = new Date();
    return `${pad2(date.getHours())}${pad2(date.getMinutes())}`;
  }

  function makeId() {
    return globalThis.crypto?.randomUUID?.() || `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function pad2(value) { return String(value).padStart(2, '0'); }
  function mod(value, divisor) { return ((value % divisor) + divisor) % divisor; }

  function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.info('Offline cache not available.', error);
      });
    });
  }
})();
