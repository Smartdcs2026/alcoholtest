
/************************************************************
 * app.js
 * โหลดตัวเลือก ควบคุมแบบฟอร์ม และ Gauge
 ************************************************************/

(function (window, document) {
  'use strict';

  const CONFIG =
    window.APP_CONFIG || {};

  const API =
    window.AlcoholAPI;

  const state = {
    initialized: false,
    loading: false,
    online: navigator.onLine,

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
        Number.isFinite(
          Number(CONFIG.ALERT_THRESHOLD)
        )
          ? Number(CONFIG.ALERT_THRESHOLD)
          : 1,

      gaugeMax:
        Number.isFinite(
          Number(CONFIG.GAUGE_MAX)
        )
          ? Number(CONFIG.GAUGE_MAX)
          : 50,

      maxRounds:
        Number.isFinite(
          Number(CONFIG.MAX_ROUNDS)
        )
          ? Number(CONFIG.MAX_ROUNDS)
          : 5
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
        value === null ||
        value === undefined
          ? ''
          : String(value);
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

    if (element) {
      element.hidden =
        Boolean(hidden);
    }
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
      (type || 'info');

    element.title =
      message || '';
  }


  function setConnectionStatus(
    online,
    text
  ) {
    const badge =
      getElement('connectionBadge');

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


  function formatBangkokDateTime(date) {
    const formatter =
      new Intl.DateTimeFormat(
        'en-GB',
        {
          timeZone:
            CONFIG.TIMEZONE ||
            'Asia/Bangkok',

          day: '2-digit',
          month: '2-digit',
          year: 'numeric',

          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',

          hourCycle: 'h23'
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
    function updateClock() {
      const now =
        new Date();

      const timeElement =
        getElement('appDateTime');

      if (!timeElement) {
        return;
      }

      timeElement.textContent =
        formatBangkokDateTime(now);

      timeElement.dateTime =
        now.toISOString();
    }

    updateClock();

    window.setInterval(
      updateClock,
      1000
    );
  }


  function normalizeOptionValue(item) {
    if (
      item === null ||
      item === undefined
    ) {
      return '';
    }

    if (
      typeof item === 'string' ||
      typeof item === 'number'
    ) {
      return cleanText(item);
    }

    if (typeof item === 'object') {
      return cleanText(
        item.value ||
        item.name ||
        item.label ||
        item.text
      );
    }

    return '';
  }


  function fillSelect(
    select,
    values,
    placeholder
  ) {
    if (!select) {
      return;
    }

    const previousValue =
      cleanText(select.value);

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

    const seen = {};

    (Array.isArray(values)
      ? values
      : []
    ).forEach(function (item) {
      const value =
        normalizeOptionValue(item);

      if (!value) {
        return;
      }

      const key =
        value.toLowerCase();

      if (seen[key]) {
        return;
      }

      seen[key] = true;

      const option =
        document.createElement(
          'option'
        );

      option.value =
        value;

      option.textContent =
        value;

      select.appendChild(
        option
      );
    });

    if (
      previousValue &&
      Array.from(select.options)
        .some(function (option) {
          return (
            option.value ===
            previousValue
          );
        })
    ) {
      select.value =
        previousValue;
    }
  }


  function setSelectsLoading(loading) {
    [
      'personTypeSelect',
      'inspectorSelect',
      'busLineSelect'
    ].forEach(function (id) {
      const select =
        getElement(id);

      if (select) {
        select.disabled =
          Boolean(loading);
      }
    });
  }


  function fillOptions() {
    fillSelect(
      getElement('personTypeSelect'),
      state.options.personTypes,
      'เลือกประเภทบุคคล'
    );

    fillSelect(
      getElement('inspectorSelect'),
      state.options.inspectors,
      'เลือกผู้ตรวจวัด'
    );

    fillSelect(
      getElement('busLineSelect'),
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
    const personTypeSelect =
      getElement('personTypeSelect');

    if (!personTypeSelect) {
      return;
    }

    const personType =
      cleanText(
        personTypeSelect.value
      );

    const showOtherType =
      isOtherOption(personType);

    const showBusLine =
      isBusType(personType);

    const showCompany =
      !showBusLine &&
      requiresCompany(personType);

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

    const otherTypeInput =
      getElement('personTypeOther');

    const companyInput =
      getElement('companyInput');

    const busLineSelect =
      getElement('busLineSelect');

    const busLineOther =
      getElement('busLineOther');

    if (
      !showOtherType &&
      otherTypeInput
    ) {
      otherTypeInput.value = '';
    }

    if (
      !showCompany &&
      companyInput
    ) {
      companyInput.value = '';
    }

    if (!showBusLine) {
      if (busLineSelect) {
        busLineSelect.value = '';
      }

      if (busLineOther) {
        busLineOther.value = '';
      }

      setHidden(
        'busLineOtherGroup',
        true
      );
    }
  }


  function updateBusLineOtherField() {
    const select =
      getElement('busLineSelect');

    if (!select) {
      return;
    }

    const showOther =
      isOtherOption(
        select.value
      );

    setHidden(
      'busLineOtherGroup',
      !showOther
    );

    if (!showOther) {
      const input =
        getElement('busLineOther');

      if (input) {
        input.value = '';
      }
    }
  }


  function normalizeMeasurementValue(value) {
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


  function getGaugeLevelClass(value) {
    /*
     * ต่ำกว่า 1.00 เท่านั้นที่อยู่ในระดับผ่าน
     */
    if (value < 1) {
      return 'level-safe';
    }

    if (value < 10) {
      return 'level-warning';
    }

    if (value < 25) {
      return 'level-orange';
    }

    if (value < 50) {
      return 'level-danger';
    }

    return 'level-critical';
  }


  function updateGauge() {
    const input =
      getElement('measurementInput');

    if (!input) {
      return;
    }

    const rawValue =
      cleanText(input.value);

    const hasValue =
      rawValue !== '';

    /*
     * ใช้ 0 สำหรับคำนวณตำแหน่ง Gauge เท่านั้น
     * ไม่กรอก 0 ให้ผู้ใช้อัตโนมัติ
     */
    const value =
      hasValue
        ? normalizeMeasurementValue(
          rawValue
        )
        : 0;

    const gaugeMaximum =
      Math.max(
        1,
        Number(
          state.config.gaugeMax
        ) || 50
      );

    const percentage =
      Math.min(
        100,
        Math.max(
          0,
          (
            value /
            gaugeMaximum
          ) * 100
        )
      );

    const gaugeMask =
      getElement('gaugeMask');

    const gaugeIndicator =
      getElement('gaugeIndicator');

    /*
     * Gauge แนวนอน
     */
    if (gaugeMask) {
      gaugeMask.style.width =
        (100 - percentage) +
        '%';

      gaugeMask.style.height =
        '100%';
    }

    if (gaugeIndicator) {
      gaugeIndicator.style.left =
        percentage +
        '%';

      gaugeIndicator.style.bottom =
        'auto';
    }

    setText(
      'gaugeValue',
      hasValue
        ? (
          value >= gaugeMaximum
            ? gaugeMaximum + '+ Mg%'
            : value.toFixed(2) + ' Mg%'
        )
        : 'ยังไม่กรอก'
    );

    const threshold =
      Number(
        state.config.alertThreshold
      );

    const finalThreshold =
      Number.isFinite(threshold)
        ? threshold
        : 1;

    /*
     * ตั้งแต่ 1.00 Mg% ขึ้นไป = DENY
     */
    const isDenied =
      hasValue &&
      value >= finalThreshold;

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

      gaugePanel.classList.toggle(
        'is-denied',
        isDenied
      );
    }

    const alertBanner =
      getElement('alertBanner');

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


  function applyBackendConfig(config) {
    if (
      !config ||
      typeof config !== 'object'
    ) {
      return;
    }

    const threshold =
      Number(
        config.alertThreshold
      );

    const gaugeMax =
      Number(
        config.gaugeMax
      );

    const maxRounds =
      Number(
        config.maxRounds
      );

    if (
      Number.isFinite(threshold) &&
      threshold >= 0
    ) {
      state.config.alertThreshold =
        threshold;
    }

    if (
      Number.isFinite(gaugeMax) &&
      gaugeMax > 0
    ) {
      state.config.gaugeMax =
        gaugeMax;
    }

    if (
      Number.isFinite(maxRounds) &&
      maxRounds > 0
    ) {
      state.config.maxRounds =
        maxRounds;
    }
  }


  function getErrorMessage(error) {
    if (!error) {
      return 'ไม่สามารถโหลดข้อมูลตัวเลือกได้';
    }

    let message =
      cleanText(error.message) ||
      'ไม่สามารถโหลดข้อมูลตัวเลือกได้';

    const code =
      cleanText(error.code);

    const requestId =
      cleanText(error.requestId);

    if (code) {
      message +=
        ' [' + code + ']';
    }

    if (requestId) {
      message +=
        ' เลขคำขอ: ' +
        requestId;
    }

    return message;
  }


  async function loadSystemData() {
    if (
      !API ||
      typeof API.getOptions !==
      'function'
    ) {
      setConnectionStatus(
        false,
        'API ไม่พร้อม'
      );

      setSystemStatus(
        'ไม่พบ AlcoholAPI กรุณาตรวจสอบ config.js และ api.js',
        'error'
      );

      return;
    }

    if (state.loading) {
      return;
    }

    state.loading = true;
    state.initialized = false;

    setSelectsLoading(true);

    setConnectionStatus(
      navigator.onLine,
      'กำลังตรวจสอบ'
    );

    setSystemStatus(
      'กำลังเชื่อมต่อและโหลดตัวเลือกจาก Google Sheets...',
      'loading'
    );

    try {
      /*
       * Health ใช้ตรวจสอบประกอบเท่านั้น
       * หาก Health มีปัญหายังพยายามโหลด Options ต่อ
       */
      try {
        if (
          typeof API.health ===
          'function'
        ) {
          await API.health();
        }
      } catch (healthError) {
        console.warn(
          'Health check failed:',
          healthError
        );
      }

      const response =
        await API.getOptions();

      if (
        !response ||
        response.ok !== true
      ) {
        throw new Error(
          response &&
          response.message
            ? response.message
            : 'API ส่งผลลัพธ์ไม่สำเร็จ'
        );
      }

      if (
        !response.options ||
        typeof response.options !==
        'object'
      ) {
        throw new Error(
          'API ไม่ได้ส่ง options กลับมา'
        );
      }

      state.options = {
        personTypes:
          Array.isArray(
            response.options.personTypes
          )
            ? response.options.personTypes
            : [],

        inspectors:
          Array.isArray(
            response.options.inspectors
          )
            ? response.options.inspectors
            : [],

        busLines:
          Array.isArray(
            response.options.busLines
          )
            ? response.options.busLines
            : [],

        checkpoints:
          Array.isArray(
            response.options.checkpoints
          )
            ? response.options.checkpoints
            : [
              'ป้อมหน้า',
              'ป้อมล่าง'
            ]
      };

      applyBackendConfig(
        response.config
      );

      fillOptions();
      updatePersonTypeFields();
      updateGauge();

      const missingOptions = [];

      if (
        state.options
          .personTypes.length === 0
      ) {
        missingOptions.push(
          'Person type'
        );
      }

      if (
        state.options
          .inspectors.length === 0
      ) {
        missingOptions.push(
          'Name'
        );
      }

      if (
        state.options
          .busLines.length === 0
      ) {
        missingOptions.push(
          'bus line'
        );
      }

      setConnectionStatus(
        true,
        'API พร้อม'
      );

      if (
        missingOptions.length > 0
      ) {
        setSystemStatus(
          'เชื่อมต่อสำเร็จ แต่ไม่พบข้อมูลในชีท: ' +
          missingOptions.join(', '),
          'error'
        );

        return;
      }

      state.initialized = true;

      setConnectionStatus(
        true,
        'ระบบพร้อม'
      );

      setSystemStatus(
        'โหลดตัวเลือกสำเร็จ ระบบพร้อมใช้งาน',
        'success'
      );

    } catch (error) {
      console.error(
        'loadSystemData error:',
        error
      );

      setConnectionStatus(
        false,
        'เชื่อมต่อไม่สำเร็จ'
      );

      setSystemStatus(
        getErrorMessage(error),
        'error'
      );

    } finally {
      state.loading = false;

      setSelectsLoading(false);
    }
  }


  function bindEvents() {
    const personType =
      getElement('personTypeSelect');

    const busLine =
      getElement('busLineSelect');

    const measurement =
      getElement('measurementInput');

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
          const rawValue =
            cleanText(
              measurement.value
            );

          /*
           * ไม่เติม 0.00 ให้อัตโนมัติ
           */
          if (rawValue === '') {
            updateGauge();
            return;
          }

          const value =
            normalizeMeasurementValue(
              rawValue
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
        function () {
          loadSystemData();
        }
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
      state: state,

      reloadOptions:
        loadSystemData,

      updateGauge:
        updateGauge,

      formatDateTime:
        formatBangkokDateTime
    });

})(window, document);

