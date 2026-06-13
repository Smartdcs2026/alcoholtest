/************************************************************
 * app.js
 * ระบบเริ่มต้นหน้าเว็บและโหลดข้อมูลตัวเลือก
 *
 * รอบนี้ยังไม่รวมการเปิดกล้องและบันทึกภาพ
 ************************************************************/

(function (window, document) {
  'use strict';

  const CONFIG =
    window.APP_CONFIG || {};

  const API =
    window.AlcoholAPI;

  const state = {
    initialized:
      false,

    loading:
      false,

    online:
      navigator.onLine,

    options: {
      personTypes: [],
      inspectors: [],
      busLines: [],
      checkpoints: [
        'ป้อมหน้า',
        'ป้อมล่าง'
      ]
    },

    config: {
      alertThreshold:
        Number(
          CONFIG.ALERT_THRESHOLD || 1
        ),

      gaugeMax:
        Number(
          CONFIG.GAUGE_MAX || 50
        ),

      maxRounds:
        Number(
          CONFIG.MAX_ROUNDS || 5
        )
    }
  };


  function getElement(id) {
    return document.getElementById(id);
  }


  function cleanText(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return '';
    }

    return String(value).trim();
  }


  function setText(
    elementOrId,
    value
  ) {
    const element =
      typeof elementOrId === 'string'
        ? getElement(elementOrId)
        : elementOrId;

    if (element) {
      element.textContent =
        value || '';
    }
  }


  function setHidden(
    elementOrId,
    hidden
  ) {
    const element =
      typeof elementOrId === 'string'
        ? getElement(elementOrId)
        : elementOrId;

    if (!element) {
      return;
    }

    element.hidden =
      Boolean(hidden);
  }


  function setSystemStatus(
    message,
    type
  ) {
    const element =
      getElement('systemStatus');

    if (!element) {
      return;
    }

    element.textContent =
      message || '';

    element.className =
      'system-status ' +
      (
        type ||
        'info'
      );
  }


  function setConnectionStatus(
    online,
    text
  ) {
    const badge =
      getElement(
        'connectionBadge'
      );

    if (!badge) {
      return;
    }

    badge.classList.toggle(
      'is-online',
      Boolean(online)
    );

    badge.classList.toggle(
      'is-offline',
      !online
    );

    setText(
      badge,
      text ||
      (
        online
          ? 'ออนไลน์'
          : 'ออฟไลน์'
      )
    );
  }


  function formatBangkokDateTime(
    date
  ) {
    const formatter =
      new Intl.DateTimeFormat(
        'en-GB',
        {
          timeZone:
            CONFIG.TIMEZONE ||
            'Asia/Bangkok',

          day:
            '2-digit',

          month:
            '2-digit',

          year:
            'numeric',

          hour:
            '2-digit',

          minute:
            '2-digit',

          second:
            '2-digit',

          hourCycle:
            'h23'
        }
      );

    const parts = {};

    formatter
      .formatToParts(
        date || new Date()
      )
      .forEach(function (part) {
        parts[part.type] =
          part.value;
      });

    return (
      parts.day +
      '/' +
      parts.month +
      '/' +
      parts.year +
      ' ' +
      parts.hour +
      ':' +
      parts.minute +
      ':' +
      parts.second
    );
  }


  function startClock() {
    const updateClock =
      function () {
        setText(
          'appDateTime',
          formatBangkokDateTime(
            new Date()
          )
        );
      };

    updateClock();

    window.setInterval(
      updateClock,
      1000
    );
  }


  function fillSelect(
    select,
    values,
    placeholder
  ) {
    if (!select) {
      return;
    }

    select.innerHTML = '';

    const placeholderOption =
      document.createElement(
        'option'
      );

    placeholderOption.value = '';
    placeholderOption.textContent =
      placeholder;

    select.appendChild(
      placeholderOption
    );

    (values || []).forEach(
      function (value) {
        const option =
          document.createElement(
            'option'
          );

        option.value =
          cleanText(value);

        option.textContent =
          cleanText(value);

        select.appendChild(
          option
        );
      }
    );
  }


  function fillOptions() {
    fillSelect(
      getElement(
        'personTypeSelect'
      ),
      state.options.personTypes,
      'เลือกประเภท'
    );

    fillSelect(
      getElement(
        'inspectorSelect'
      ),
      state.options.inspectors,
      'เลือกผู้ตรวจวัด'
    );

    fillSelect(
      getElement(
        'busLineSelect'
      ),
      state.options.busLines,
      'เลือกสายรถ'
    );
  }


  function isOtherOption(value) {
    const text =
      cleanText(value)
        .toLowerCase();

    return (
      text === 'อื่นๆ' ||
      text === 'อื่น ๆ' ||
      text === 'other'
    );
  }


  function isBusType(value) {
    const text =
      cleanText(value)
        .toLowerCase();

    return (
      text.includes('พขร') ||
      text.includes('รถรับส่ง') ||
      text.includes('bus')
    );
  }


  function requiresCompany(value) {
    const text =
      cleanText(value)
        .toLowerCase();

    return (
      text.includes('เวนเดอร์') ||
      text.includes('vendor') ||
      text.includes('ช่าง') ||
      text.includes('contractor') ||
      isOtherOption(text)
    );
  }


  function updatePersonTypeFields() {
    const personType =
      cleanText(
        getElement(
          'personTypeSelect'
        ).value
      );

    const showOtherType =
      isOtherOption(
        personType
      );

    const showBusLine =
      isBusType(
        personType
      );

    const showCompany =
      !showBusLine &&
      requiresCompany(
        personType
      );

    setHidden(
      'personTypeOtherGroup',
      !showOtherType
    );

    setHidden(
      'companyGroup',
      !showCompany
    );

    setHidden(
      'busLineGroup',
      !showBusLine
    );

    if (!showOtherType) {
      getElement(
        'personTypeOther'
      ).value = '';
    }

    if (!showCompany) {
      getElement(
        'companyInput'
      ).value = '';
    }

    if (!showBusLine) {
      getElement(
        'busLineSelect'
      ).value = '';

      getElement(
        'busLineOther'
      ).value = '';

      setHidden(
        'busLineOtherGroup',
        true
      );
    }
  }


  function updateBusLineOtherField() {
    const value =
      getElement(
        'busLineSelect'
      ).value;

    const showOther =
      isOtherOption(value);

    setHidden(
      'busLineOtherGroup',
      !showOther
    );

    if (!showOther) {
      getElement(
        'busLineOther'
      ).value = '';
    }
  }


  function normalizeMeasurementValue(
    value
  ) {
    const number =
      Number(value);

    if (
      !Number.isFinite(number) ||
      number < 0
    ) {
      return 0;
    }

    return Math.min(
      number,
      999
    );
  }


  function getGaugeLevelClass(
    value
  ) {
    if (value <= 1) {
      return 'level-safe';
    }

    if (value <= 10) {
      return 'level-warning';
    }

    if (value <= 25) {
      return 'level-orange';
    }

    if (value < 50) {
      return 'level-danger';
    }

    return 'level-critical';
  }


  function updateGauge() {
    const input =
      getElement(
        'measurementInput'
      );

    const value =
      normalizeMeasurementValue(
        input.value
      );

    const gaugeMaximum =
      Math.max(
        1,
        Number(
          state.config.gaugeMax
        )
      );

    const percentage =
      Math.min(
        100,
        Math.max(
          0,
          (
            value /
            gaugeMaximum
          ) *
          100
        )
      );

    const gaugeMask =
      getElement('gaugeMask');

    const gaugeIndicator =
      getElement(
        'gaugeIndicator'
      );

    if (gaugeMask) {
      gaugeMask.style.height =
        (
          100 -
          percentage
        ) +
        '%';
    }

    if (gaugeIndicator) {
      gaugeIndicator.style.bottom =
        percentage +
        '%';
    }

    setText(
      'gaugeValue',
      (
        value >= gaugeMaximum
          ? gaugeMaximum + '+'
          : value.toFixed(2)
      ) +
      ' Mg%'
    );

    const gaugePanel =
      getElement('gaugePanel');

    if (gaugePanel) {
      gaugePanel.classList.remove(
        'level-safe',
        'level-warning',
        'level-orange',
        'level-danger',
        'level-critical'
      );

      gaugePanel.classList.add(
        getGaugeLevelClass(value)
      );
    }

    const alertBanner =
      getElement('alertBanner');

    const isDenied =
      value >
      Number(
        state.config.alertThreshold
      );

    if (alertBanner) {
      alertBanner.hidden =
        !isDenied;
    }

    if (isDenied) {
      setText(
        'alertMeasurementValue',
        value.toFixed(2) +
        ' Mg%'
      );
    }
  }


  async function loadSystemData() {
    if (
      !API ||
      typeof API.getOptions !==
      'function'
    ) {
      setSystemStatus(
        'ไม่พบไฟล์ api.js',
        'error'
      );

      return;
    }

    if (state.loading) {
      return;
    }

    state.loading = true;

    setSystemStatus(
      'กำลังเชื่อมต่อระบบและโหลดข้อมูล...',
      'loading'
    );

    setConnectionStatus(
      navigator.onLine,
      'กำลังตรวจสอบ'
    );

    const results =
      await Promise.allSettled([
        API.health(),
        API.getOptions()
      ]);

    const healthResult =
      results[0];

    const optionsResult =
      results[1];

    if (
      healthResult.status ===
      'fulfilled'
    ) {
      setConnectionStatus(
        true,
        'ระบบพร้อม'
      );

    } else {
      console.warn(
        'Health check failed:',
        healthResult.reason
      );
    }

    if (
      optionsResult.status ===
      'rejected'
    ) {
      state.loading = false;

      setConnectionStatus(
        false,
        'เชื่อมต่อไม่สำเร็จ'
      );

      setSystemStatus(
        optionsResult.reason &&
        optionsResult.reason.message
          ? optionsResult.reason.message
          : 'ไม่สามารถโหลดข้อมูลตัวเลือกได้',
        'error'
      );

      return;
    }

    const response =
      optionsResult.value;

    state.options = {
      personTypes:
        Array.isArray(
          response.options &&
          response.options.personTypes
        )
          ? response.options.personTypes
          : [],

      inspectors:
        Array.isArray(
          response.options &&
          response.options.inspectors
        )
          ? response.options.inspectors
          : [],

      busLines:
        Array.isArray(
          response.options &&
          response.options.busLines
        )
          ? response.options.busLines
          : [],

      checkpoints:
        Array.isArray(
          response.options &&
          response.options.checkpoints
        )
          ? response.options.checkpoints
          : [
            'ป้อมหน้า',
            'ป้อมล่าง'
          ]
    };

    if (response.config) {
      state.config.alertThreshold =
        Number(
          response.config
            .alertThreshold
        ) || 1;

      state.config.gaugeMax =
        Number(
          response.config.gaugeMax
        ) || 50;

      state.config.maxRounds =
        Number(
          response.config.maxRounds
        ) || 5;
    }

    fillOptions();
    updatePersonTypeFields();
    updateGauge();

    setSystemStatus(
      'โหลดข้อมูลสำเร็จ ระบบพร้อมเตรียมเปิดกล้อง',
      'success'
    );

    setConnectionStatus(
      true,
      'ระบบพร้อม'
    );

    state.loading = false;
    state.initialized = true;
  }


  function bindEvents() {
    const personType =
      getElement(
        'personTypeSelect'
      );

    const busLine =
      getElement(
        'busLineSelect'
      );

    const measurement =
      getElement(
        'measurementInput'
      );

    const retryButton =
      getElement(
        'retryConnectionButton'
      );

    if (personType) {
      personType.addEventListener(
        'change',
        updatePersonTypeFields
      );
    }

    if (busLine) {
      busLine.addEventListener(
        'change',
        updateBusLineOtherField
      );
    }

    if (measurement) {
      measurement.addEventListener(
        'input',
        updateGauge
      );

      measurement.addEventListener(
        'blur',
        function () {
          if (!measurement.value) {
            measurement.value =
              '0.00';
          }

          const value =
            normalizeMeasurementValue(
              measurement.value
            );

          measurement.value =
            value.toFixed(2);

          updateGauge();
        }
      );
    }

    if (retryButton) {
      retryButton.addEventListener(
        'click',
        loadSystemData
      );
    }

    window.addEventListener(
      'online',
      function () {
        state.online = true;

        setConnectionStatus(
          true,
          'ออนไลน์'
        );

        loadSystemData();
      }
    );

    window.addEventListener(
      'offline',
      function () {
        state.online = false;

        setConnectionStatus(
          false,
          'ออฟไลน์'
        );

        setSystemStatus(
          'อุปกรณ์ไม่ได้เชื่อมต่ออินเทอร์เน็ต',
          'error'
        );
      }
    );
  }


  async function initialize() {
    startClock();
    bindEvents();
    updateGauge();

    await loadSystemData();
  }


  document.addEventListener(
    'DOMContentLoaded',
    initialize
  );


  window.AlcoholApp =
    Object.freeze({
      state:
        state,

      reloadOptions:
        loadSystemData,

      formatDateTime:
        formatBangkokDateTime
    });

})(window, document);
