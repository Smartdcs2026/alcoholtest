
/************************************************************
 * app.js
 * ระบบตรวจวัดปริมาณแอลกอฮอล์
 *
 * รองรับ:
 * - โหลดตัวเลือกจาก API
 * - รับภาพจาก camera.js
 * - เพิ่มและลบรอบตรวจ
 * - กดบันทึกได้โดยไม่ต้องกดเพิ่มรอบก่อน
 * - สร้างรอบตรวจอัตโนมัติเมื่อกดบันทึก
 * - ส่งข้อมูลผ่าน AlcoholAPI.saveRecord()
 * - ป้องกันการกดบันทึกซ้ำ
 ************************************************************/

(function (window, document) {
  'use strict';

  const CONFIG =
    window.APP_CONFIG || {};

  const API =
    window.AlcoholAPI;


  /************************************************************
   * State
   ************************************************************/

  const state = {
    initialized:
      false,

    loading:
      false,

    saving:
      false,

    online:
      navigator.onLine,

    selectedCapture:
      null,

    rounds:
      [],

    activeRequestId:
      '',

    options: {
      personTypes:
        [],

      inspectors:
        [],

      busLines:
        [],

      checkpoints: [
        'ป้อมหน้า',
        'ป้อมล่าง'
      ]
    },

    config: {
      alertThreshold:
        finiteNumber(
          CONFIG.ALERT_THRESHOLD,
          1
        ),

      gaugeMax:
        finiteNumber(
          CONFIG.GAUGE_MAX,
          50
        ),

      maxRounds:
        finiteNumber(
          CONFIG.MAX_ROUNDS,
          5
        )
    }
  };


  /************************************************************
   * Basic Helpers
   ************************************************************/

  function finiteNumber(
    value,
    fallback
  ) {
    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }


  function getElement(id) {
    return document.getElementById(
      id
    );
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
      typeof elementOrId ===
      'string'
        ? getElement(
          elementOrId
        )
        : elementOrId;

    if (!element) {
      return;
    }

    element.textContent =
      value === null ||
      value === undefined
        ? ''
        : String(value);
  }


  function setHidden(
    elementOrId,
    hidden
  ) {
    const element =
      typeof elementOrId ===
      'string'
        ? getElement(
          elementOrId
        )
        : elementOrId;

    if (element) {
      element.hidden =
        Boolean(hidden);
    }
  }


  /************************************************************
   * System Status
   ************************************************************/

  function setSystemStatus(
    message,
    type
  ) {
    const element =
      getElement(
        'systemStatus'
      );

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

    element.title =
      message || '';
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


  /************************************************************
   * Date / Time
   ************************************************************/

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
        date ||
        new Date()
      )
      .forEach(
        function (part) {
          parts[
            part.type
          ] =
            part.value;
        }
      );

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
        getElement(
          'appDateTime'
        );

      if (!timeElement) {
        return;
      }

      timeElement.textContent =
        formatBangkokDateTime(
          now
        );

      timeElement.dateTime =
        now.toISOString();
    }

    updateClock();

    window.setInterval(
      updateClock,
      1000
    );
  }


  /************************************************************
   * Options
   ************************************************************/

  function normalizeOptionValue(
    item
  ) {
    if (
      item === null ||
      item === undefined
    ) {
      return '';
    }

    if (
      typeof item ===
      'string' ||
      typeof item ===
      'number'
    ) {
      return cleanText(item);
    }

    if (
      typeof item ===
      'object'
    ) {
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
      cleanText(
        select.value
      );

    select.innerHTML =
      '';

    const placeholderOption =
      document.createElement(
        'option'
      );

    placeholderOption.value =
      '';

    placeholderOption.textContent =
      placeholder;

    select.appendChild(
      placeholderOption
    );

    const seen =
      Object.create(null);

    (
      Array.isArray(values)
        ? values
        : []
    ).forEach(
      function (item) {
        const value =
          normalizeOptionValue(
            item
          );

        if (!value) {
          return;
        }

        const key =
          value.toLowerCase();

        if (seen[key]) {
          return;
        }

        seen[key] =
          true;

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
      }
    );

    if (
      previousValue &&
      Array.from(
        select.options
      ).some(
        function (option) {
          return (
            option.value ===
            previousValue
          );
        }
      )
    ) {
      select.value =
        previousValue;
    }
  }


  function setSelectsLoading(
    loading
  ) {
    [
      'personTypeSelect',
      'inspectorSelect',
      'busLineSelect'
    ].forEach(
      function (id) {
        const select =
          getElement(id);

        if (select) {
          select.disabled =
            Boolean(
              loading
            );
        }
      }
    );
  }


  function fillOptions() {
    fillSelect(
      getElement(
        'personTypeSelect'
      ),
      state.options
        .personTypes,
      'เลือกประเภทบุคคล'
    );

    fillSelect(
      getElement(
        'inspectorSelect'
      ),
      state.options
        .inspectors,
      'เลือกผู้ตรวจวัด'
    );

    fillSelect(
      getElement(
        'busLineSelect'
      ),
      state.options
        .busLines,
      'เลือกสายรถ'
    );
  }



/************************************************************
 * Person Type
 ************************************************************/

function normalizePersonType(
  value
) {
  return cleanText(value)
    .toLowerCase()
    .replace(
      /\s+/g,
      ' '
    );
}


function isOtherOption(
  value
) {
  return [
    'อื่นๆ',
    'อื่น ๆ',
    'other'
  ].includes(
    normalizePersonType(value)
  );
}


/*
 * แสดงสายรถเฉพาะ
 * พขร.รถรับส่ง พนง เท่านั้น
 */
function isBusType(
  value
) {
  return (
    normalizePersonType(value) ===
    normalizePersonType(
      'พขร.รถรับส่ง พนง'
    )
  );
}


/*
 * ประเภทที่ต้องกรอกชื่อบริษัท
 */
function requiresCompany(
  value
) {
  const text =
    normalizePersonType(value);

  return (
    text === 'พนักงาน' ||
    text === 'พขร.' ||
    text === 'พขร' ||
    text.includes('เวนเดอร์') ||
    text.includes('vendor') ||
    text.includes('ช่าง') ||
    text.includes('contractor') ||
    isOtherOption(text)
  );
}


function updatePersonTypeFields() {
  const personTypeSelect =
    getElement(
      'personTypeSelect'
    );

  if (!personTypeSelect) {
    return;
  }

  const personType =
    cleanText(
      personTypeSelect.value
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

  const personNameInput =
    getElement(
      'personName'
    );

  const otherTypeInput =
    getElement(
      'personTypeOther'
    );

  const companyInput =
    getElement(
      'companyInput'
    );

  const busLineSelect =
    getElement(
      'busLineSelect'
    );

  const busLineOther =
    getElement(
      'busLineOther'
    );


  /*
   * แสดงหรือซ่อนช่อง
   */
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


  /*
   * ชื่อผู้ถูกตรวจต้องกรอกทุกประเภท
   * รวมถึงตัวเลือก อื่นๆ
   */

 
if (personNameInput) {
  personNameInput.required =
    true;

  personNameInput.setAttribute(
    'aria-required',
    'true'
  );
}



  /*
   * เมื่อเลือก อื่นๆ
   * ต้องระบุประเภทอื่น
   */
  if (otherTypeInput) {
    otherTypeInput.required =
      showOtherType;

    otherTypeInput.setAttribute(
      'aria-required',
      showOtherType
        ? 'true'
        : 'false'
    );

    if (!showOtherType) {
      otherTypeInput.value =
        '';
    }
  }


  /*
   * เมื่อประเภทนั้นต้องมีบริษัท
   * ให้บังคับกรอกชื่อบริษัท
   */
  if (companyInput) {
    companyInput.required =
      showCompany;

    companyInput.setAttribute(
      'aria-required',
      showCompany
        ? 'true'
        : 'false'
    );

    if (!showCompany) {
      companyInput.value =
        '';
    }
  }


  /*
   * แสดงและบังคับสายรถเฉพาะ
   * พขร.รถรับส่ง พนง
   */
  if (busLineSelect) {
    busLineSelect.required =
      showBusLine;

    busLineSelect.setAttribute(
      'aria-required',
      showBusLine
        ? 'true'
        : 'false'
    );
  }


  if (!showBusLine) {
    if (busLineSelect) {
      busLineSelect.value =
        '';
    }

    if (busLineOther) {
      busLineOther.value =
        '';

      busLineOther.required =
        false;

      busLineOther.setAttribute(
        'aria-required',
        'false'
      );
    }

    setHidden(
      'busLineOtherGroup',
      true
    );
  }

  /*
   * หากเป็นประเภทรถรับส่ง
   * ให้ตรวจสอบต่อว่าสายรถเลือก "อื่นๆ" หรือไม่
   */
  if (showBusLine) {
    updateBusLineOtherField();
  } else {
    updateActionButtons();
  }
}






function updateBusLineOtherField() {
  const select =
    getElement(
      'busLineSelect'
    );

  const input =
    getElement(
      'busLineOther'
    );

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

  if (input) {
    input.required =
      showOther;

    input.setAttribute(
      'aria-required',
      showOther
        ? 'true'
        : 'false'
    );

    if (!showOther) {
      input.value =
        '';
    }
  }

  updateActionButtons();
}


  /************************************************************
   * Measurement / Gauge
   ************************************************************/

  function normalizeMeasurementValue(
    value
  ) {
    const number =
      Number(value);

    if (
      !Number.isFinite(
        number
      ) ||
      number < 0
    ) {
      return 0;
    }

    return Math.min(
      number,
      999
    );
  }


  function readMeasurement() {
    const input =
      getElement(
        'measurementInput'
      );

    const rawValue =
      input
        ? cleanText(
          input.value
        )
        : '';

    if (rawValue === '') {
      return {
        valid:
          false,

        empty:
          true,

        value:
          0
      };
    }

    const value =
      Number(rawValue);

    return {
      valid:
        Number.isFinite(
          value
        ) &&
        value >= 0 &&
        value <= 999,

      empty:
        false,

      value:
        value
    };
  }


  const GAUGE_MIN_VISIBLE_PERCENT = 28;


  /*
   * นโยบายการแสดงผลแบบ Zero Alcohol
   * - 0 Mg%      = ผ่าน
   * - ตั้งแต่ 1  = ห้ามเข้าพื้นที่ / ห้ามปฏิบัติงาน
   */
  function getGaugeLevelClass(
    value,
    hasValue
  ) {
    if (!hasValue) {
      return 'level-empty';
    }

    return value >= 1
      ? 'level-critical'
      : 'level-safe';
  }


  /*
   * ค่า 1 Mg% ต้องมองเห็นได้ชัดบนแถบ
   * จึงกำหนดให้เริ่มแสดงอย่างน้อย 28% ของความสูงแถบ
   * แล้วจึงไล่ระดับไปถึง GAUGE_MAX
   */
  function calculateGaugePercentage(
    value,
    gaugeMaximum
  ) {
    const number =
      Number(value);

    if (
      !Number.isFinite(number) ||
      number < 1
    ) {
      return 0;
    }

    const maximum =
      Math.max(
        1,
        Number(gaugeMaximum) || 50
      );

    if (maximum <= 1) {
      return 100;
    }

    const ratio =
      Math.min(
        1,
        Math.max(
          0,
          (number - 1) /
          (maximum - 1)
        )
      );

    return (
      GAUGE_MIN_VISIBLE_PERCENT +
      ratio *
      (100 - GAUGE_MIN_VISIBLE_PERCENT)
    );
  }


  function updateGauge() {
    const input =
      getElement(
        'measurementInput'
      );

    if (!input) {
      return;
    }

    const rawValue =
      cleanText(
        input.value
      );

    const hasValue =
      rawValue !== '';

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
          state.config
            .gaugeMax
        ) ||
        50
      );

    const percentage =
      calculateGaugePercentage(
        value,
        gaugeMaximum
      );

    const gaugeMask =
      getElement(
        'gaugeMask'
      );

    const gaugeIndicator =
      getElement(
        'gaugeIndicator'
      );

    if (gaugeMask) {
      gaugeMask.style.width =
        (
          100 -
          percentage
        ) +
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

    const isDenied =
      hasValue &&
      value >= 1;

    const isSafeZero =
      hasValue &&
      value < 1;

    let gaugeText =
      'รอกรอกค่า';

    if (hasValue) {
      gaugeText =
        value.toFixed(2) +
        ' Mg%\n' +
        (
          isDenied
            ? 'ห้ามเข้าพื้นที่'
            : 'ผ่าน'
        );
    }

    setText(
      'gaugeValue',
      gaugeText
    );

    const gaugePanel =
      getElement(
        'gaugePanel'
      );

    if (gaugePanel) {
      gaugePanel
        .classList
        .remove(
          'level-empty',
          'level-safe',
          'level-warning',
          'level-orange',
          'level-danger',
          'level-critical'
        );

      gaugePanel
        .classList
        .add(
          getGaugeLevelClass(
            value,
            hasValue
          )
        );

      gaugePanel
        .classList
        .toggle(
          'has-measurement',
          hasValue
        );

      gaugePanel
        .classList
        .toggle(
          'is-safe-zero',
          isSafeZero
        );

      gaugePanel
        .classList
        .toggle(
          'is-denied',
          isDenied
        );

      gaugePanel.setAttribute(
        'aria-label',
        hasValue
          ? (
            'ปริมาณแอลกอฮอล์ ' +
            value.toFixed(2) +
            ' มิลลิกรัมเปอร์เซ็นต์ ' +
            (
              isDenied
                ? 'ห้ามเข้าพื้นที่และห้ามปฏิบัติงาน'
                : 'ผ่าน'
            )
          )
          : 'ยังไม่ได้กรอกปริมาณแอลกอฮอล์'
      );
    }

    const alertBanner =
      getElement(
        'alertBanner'
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

    updateActionButtons();
  }


  /************************************************************
   * Backend Configuration
   ************************************************************/

  function applyBackendConfig(
    config
  ) {
    if (
      !config ||
      typeof config !==
      'object'
    ) {
      return;
    }

    /*
     * ระบบนี้บังคับเกณฑ์ Zero Alcohol:
     * ตั้งแต่ 1 Mg% ขึ้นไปเป็น DENY เสมอ
     */
    state.config
      .alertThreshold =
      1;

    const gaugeMax =
      Number(
        config.gaugeMax
      );

    const maxRounds =
      Number(
        config.maxRounds
      );

    if (
      Number.isFinite(
        gaugeMax
      ) &&
      gaugeMax > 0
    ) {
      state.config
        .gaugeMax =
        gaugeMax;
    }

    if (
      Number.isFinite(
        maxRounds
      ) &&
      maxRounds > 0
    ) {
      state.config
        .maxRounds =
        Math.floor(
          maxRounds
        );
    }
  }


  /************************************************************
   * API Errors
   ************************************************************/

  function getErrorMessage(
    error,
    fallback
  ) {
    if (!error) {
      return (
        fallback ||
        'เกิดข้อผิดพลาด'
      );
    }

    let message =
      cleanText(
        error.message
      ) ||
      fallback ||
      'เกิดข้อผิดพลาด';

    const code =
      cleanText(
        error.code
      );

    const requestId =
      cleanText(
        error.requestId
      );

    if (code) {
      message +=
        ' [' +
        code +
        ']';
    }

    if (requestId) {
      message +=
        ' เลขคำขอ: ' +
        requestId;
    }

    return message;
  }


  /************************************************************
   * Load Options
   ************************************************************/

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

    state.loading =
      true;

    state.initialized =
      false;

    setSelectsLoading(
      true
    );

    updateActionButtons();

    setConnectionStatus(
      navigator.onLine,
      'กำลังตรวจสอบ'
    );

    setSystemStatus(
      'กำลังเชื่อมต่อและโหลดตัวเลือก...',
      'loading'
    );

    try {
      try {
        if (
          typeof API.health ===
          'function'
        ) {
          await API.health();
        }
      } catch (
        healthError
      ) {
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
            response.options
              .personTypes
          )
            ? response.options
              .personTypes
            : [],

        inspectors:
          Array.isArray(
            response.options
              .inspectors
          )
            ? response.options
              .inspectors
            : [],

        busLines:
          Array.isArray(
            response.options
              .busLines
          )
            ? response.options
              .busLines
            : [],

        checkpoints:
          Array.isArray(
            response.options
              .checkpoints
          )
            ? response.options
              .checkpoints
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

      const requiredMissing =
        [];

      const warnings =
        [];

      if (
        state.options
          .personTypes
          .length === 0
      ) {
        requiredMissing.push(
          'Person type'
        );
      }

      if (
        state.options
          .inspectors
          .length === 0
      ) {
        requiredMissing.push(
          'Name'
        );
      }

      if (
        state.options
          .busLines
          .length === 0
      ) {
        warnings.push(
          'bus line'
        );
      }

      if (
        requiredMissing
          .length > 0
      ) {
        setConnectionStatus(
          false,
          'ข้อมูลไม่ครบ'
        );

        setSystemStatus(
          'เชื่อมต่อสำเร็จ แต่ไม่พบข้อมูลในชีท: ' +
          requiredMissing.join(
            ', '
          ),
          'error'
        );

        return;
      }

      state.initialized =
        true;

      setConnectionStatus(
        true,
        'ระบบพร้อม'
      );

      setSystemStatus(
        warnings.length > 0
          ? (
            'ระบบพร้อมใช้งาน แต่ไม่พบข้อมูลในชีท: ' +
            warnings.join(', ')
          )
          : 'โหลดตัวเลือกสำเร็จ ระบบพร้อมใช้งาน',
        warnings.length > 0
          ? 'info'
          : 'success'
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
        getErrorMessage(
          error,
          'ไม่สามารถโหลดข้อมูลตัวเลือกได้'
        ),
        'error'
      );

    } finally {
      state.loading =
        false;

      setSelectsLoading(
        false
      );

      updateActionButtons();
    }
  }


  /************************************************************
   * Form Validation
   ************************************************************/

  function getSelectedCheckpoint() {
    const checked =
      document.querySelector(
        'input[name="checkpoint"]:checked'
      );

    return checked
      ? cleanText(
        checked.value
      )
      : '';
  }


  function validateCoreFields(
    showMessage
  ) {
    const personTypeElement =
      getElement(
        'personTypeSelect'
      );

    const personNameElement =
      getElement(
        'personName'
      );

    const inspectorElement =
      getElement(
        'inspectorSelect'
      );

    const personType =
      cleanText(
        personTypeElement &&
        personTypeElement.value
      );

    const personName =
      cleanText(
        personNameElement &&
        personNameElement.value
      );

    const inspector =
      cleanText(
        inspectorElement &&
        inspectorElement.value
      );

    const checkpoint =
      getSelectedCheckpoint();

    let message =
      '';

    let focusElement =
      null;

    if (!personType) {
      message =
        'กรุณาเลือกประเภทบุคคล';

      focusElement =
        personTypeElement;

    } else if (
      isOtherOption(
        personType
      ) &&
      !cleanText(
        getElement(
          'personTypeOther'
        ) &&
        getElement(
          'personTypeOther'
        ).value
      )
    ) {
      message =
        'กรุณาระบุประเภทบุคคลอื่น';

      focusElement =
        getElement(
          'personTypeOther'
        );

    } else if (!personName) {
      message =
        'กรุณากรอกชื่อผู้ถูกตรวจ';

      focusElement =
        personNameElement;

    } else if (
      isBusType(
        personType
      ) &&
      !cleanText(
        getElement(
          'busLineSelect'
        ) &&
        getElement(
          'busLineSelect'
        ).value
      )
    ) {
      message =
        'กรุณาเลือกสายรถ';

      focusElement =
        getElement(
          'busLineSelect'
        );

    } else if (
      isBusType(
        personType
      ) &&
      isOtherOption(
        getElement(
          'busLineSelect'
        ) &&
        getElement(
          'busLineSelect'
        ).value
      ) &&
      !cleanText(
        getElement(
          'busLineOther'
        ) &&
        getElement(
          'busLineOther'
        ).value
      )
    ) {
      message =
        'กรุณาระบุสายรถอื่น';

      focusElement =
        getElement(
          'busLineOther'
        );

    } else if (
      !isBusType(
        personType
      ) &&
      requiresCompany(
        personType
      ) &&
      !cleanText(
        getElement(
          'companyInput'
        ) &&
        getElement(
          'companyInput'
        ).value
      )
    ) {
      message =
        'กรุณากรอกชื่อบริษัท';

      focusElement =
        getElement(
          'companyInput'
        );

    } else if (!inspector) {
      message =
        'กรุณาเลือกผู้ตรวจวัด';

      focusElement =
        inspectorElement;

    } else if (!checkpoint) {
      message =
        'กรุณาเลือกจุดตรวจ';
    }

    if (
      message &&
      showMessage
    ) {
      setSystemStatus(
        message,
        'error'
      );

      window.alert(
        message
      );

      if (
        focusElement &&
        typeof focusElement
          .focus ===
        'function'
      ) {
        focusElement.focus();
      }
    }

    return {
      valid:
        !message,

      message:
        message
    };
  }


  function hasDraftActivity() {
    const measurement =
      getElement(
        'measurementInput'
      );

    return Boolean(
      state.selectedCapture ||
      cleanText(
        measurement &&
        measurement.value
      )
    );
  }


  function isDraftReady() {
    const measurement =
      readMeasurement();

    return Boolean(
      state.selectedCapture &&
      cleanText(
        state.selectedCapture
          .dataUrl
      ) &&
      measurement.valid
    );
  }


  function hasAnyFormData() {
    const form =
      getElement(
        'inspectionForm'
      );

    if (!form) {
      return (
        state.rounds.length > 0 ||
        Boolean(
          state.selectedCapture
        )
      );
    }

    const elements =
      form.querySelectorAll(
        'input[type="text"], input[type="number"], select'
      );

    const hasInput =
      Array.from(
        elements
      ).some(
        function (element) {
          return (
            cleanText(
              element.value
            ) !== ''
          );
        }
      );

    return (
      hasInput ||
      state.rounds.length > 0 ||
      Boolean(
        state.selectedCapture
      )
    );
  }


  /************************************************************
   * Button State
   ************************************************************/

function updateActionButtons() {
  const addRoundButton =
    getElement(
      'addRoundButton'
    );

  const saveButton =
    getElement(
      'saveButton'
    );

  const resetButton =
    getElement(
      'resetButton'
    );

  const coreReady =
    validateCoreFields(
      false
    ).valid;

  const draftReady =
    isDraftReady();

  const hasRoundToSave =
    state.rounds.length > 0 ||
    draftReady;

  const systemUnavailable =
    !state.initialized ||
    state.loading ||
    state.saving ||
    !state.online;

  if (addRoundButton) {
    addRoundButton.disabled =
      Boolean(
        systemUnavailable ||
        !draftReady ||
        state.rounds.length >=
        state.config.maxRounds
      );
  }

  if (saveButton) {
    saveButton.disabled =
      Boolean(
        systemUnavailable ||
        !coreReady ||
        !hasRoundToSave
      );

    saveButton.textContent =
      state.saving
        ? 'กำลังบันทึก...'
        : (
          !state.online
            ? 'อุปกรณ์ออฟไลน์'
            : 'บันทึกข้อมูล'
        );
  }

  if (resetButton) {
    resetButton.disabled =
      Boolean(
        state.saving ||
        !hasAnyFormData()
      );
  }
}




  /************************************************************
   * Round Creation
   ************************************************************/

  function createRoundFromDraft() {
    if (
      !state.selectedCapture ||
      !cleanText(
        state.selectedCapture
          .dataUrl
      )
    ) {
      throw new Error(
        'กรุณาถ่ายภาพและกด “ใช้ภาพนี้” ก่อน'
      );
    }

    const measurement =
      readMeasurement();

    if (!measurement.valid) {
      throw new Error(
        'กรุณากรอกค่าตรวจวัดระหว่าง 0 ถึง 999 Mg%'
      );
    }

    const originalImageData =
      cleanText(
        state.selectedCapture
          .dataUrl
      );

    /*
     * ใช้ภาพที่ผ่าน Blur Editor เมื่อมีข้อมูล
     * และใช้ภาพต้นฉบับเป็น fallback เมื่อผู้ใช้เลือกข้ามการเบลอ
     */
    const blurredImageData =
      cleanText(
        state.selectedCapture
          .blurredDataUrl ||
        state.selectedCapture
          .blurredImageData ||
        originalImageData
      );

    return {
      valueMg:
        Number(
          measurement.value
            .toFixed(2)
        ),

      measuredAt:
        cleanText(
          state.selectedCapture
            .capturedAt
        ) ||
        new Date()
          .toISOString(),

      originalImageData:
        originalImageData,

      blurredImageData:
        blurredImageData,

      blurAreas:
        Array.isArray(
          state.selectedCapture
            .blurAreas
        )
          ? state.selectedCapture
            .blurAreas
          : [],

      previewDataUrl:
        blurredImageData,

      width:
        Number(
          state.selectedCapture
            .width
        ) ||
        0,

      height:
        Number(
          state.selectedCapture
            .height
        ) ||
        0,

      bytes:
        Number(
          state.selectedCapture
            .bytes
        ) ||
        0
    };
  }


  function clearDraft() {
    state.selectedCapture =
      null;

    const measurement =
      getElement(
        'measurementInput'
      );

    if (measurement) {
      measurement.value =
        '';
    }

    if (
      window.AlcoholCamera &&
      typeof window
        .AlcoholCamera
        .clearPendingCapture ===
      'function'
    ) {
      window.AlcoholCamera
        .clearPendingCapture();
    }

    setHidden(
      'selectedCapturePanel',
      true
    );

    updateGauge();

    updateActionButtons();
  }


  function addCurrentRound(
    showMessage
  ) {
    if (
      state.rounds.length >=
      state.config.maxRounds
    ) {
      const message =
        'เพิ่มรอบตรวจได้ไม่เกิน ' +
        state.config.maxRounds +
        ' รอบ';

      if (showMessage) {
        window.alert(
          message
        );
      }

      throw new Error(
        message
      );
    }

    const round =
      createRoundFromDraft();

    state.rounds.push(
      round
    );

    renderRounds();

    clearDraft();

    if (showMessage) {
      setSystemStatus(
        'เพิ่มรอบตรวจที่ ' +
        state.rounds.length +
        ' แล้ว',
        'success'
      );
    }

    return round;
  }


  /************************************************************
   * Render Round List
   ************************************************************/

  function renderRounds() {
    const container =
      getElement(
        'roundsList'
      );

    if (!container) {
      return;
    }

    container.innerHTML =
      '';

    if (
      state.rounds.length ===
      0
    ) {
      const empty =
        document.createElement(
          'div'
        );

      empty.className =
        'empty-state';

      empty.textContent =
        'ยังไม่มีภาพและรอบตรวจที่บันทึก';

      container.appendChild(
        empty
      );

      updateActionButtons();

      return;
    }

    state.rounds.forEach(
      function (
        round,
        index
      ) {
        const item =
          document.createElement(
            'article'
          );

        item.className =
          'round-item';

        item.style.display =
          'grid';

        item.style
          .gridTemplateColumns =
          '72px minmax(0, 1fr) auto';

        item.style.gap =
          '10px';

        item.style.alignItems =
          'center';

        item.style.padding =
          '8px';

        item.style.marginBottom =
          '7px';

        item.style.border =
          '1px solid #d6e1e7';

        item.style.borderRadius =
          '10px';

        item.style.background =
          '#ffffff';

        const image =
          document.createElement(
            'img'
          );

        image.src =
          round.previewDataUrl ||
          round.originalImageData;

        image.alt =
          'ภาพรอบตรวจที่ ' +
          (
            index +
            1
          );

        image.style.width =
          '72px';

        image.style.height =
          '56px';

        image.style.objectFit =
          'cover';

        image.style.borderRadius =
          '8px';

        image.style.background =
          '#edf3f6';

        const content =
          document.createElement(
            'div'
          );

        content.style.minWidth =
          '0';

        const title =
          document.createElement(
            'strong'
          );

        title.textContent =
          'รอบที่ ' +
          (
            index +
            1
          ) +
          ' · ' +
          Number(
            round.valueMg
          ).toFixed(2) +
          ' Mg%';

        title.style.display =
          'block';

        title.style.fontSize =
          '12px';

        title.style.color =
          Number(
            round.valueMg
          ) >=
          state.config
            .alertThreshold
            ? '#c40000'
            : '#16844f';

        const meta =
          document.createElement(
            'small'
          );

        meta.textContent =
          formatBangkokDateTime(
            new Date(
              round.measuredAt
            )
          );

        meta.style.display =
          'block';

        meta.style.marginTop =
          '3px';

        meta.style.color =
          '#667985';

        meta.style.fontSize =
          '10px';

        content.appendChild(
          title
        );

        content.appendChild(
          meta
        );

        const removeButton =
          document.createElement(
            'button'
          );

        removeButton.type =
          'button';

        removeButton.textContent =
          'ลบ';

        removeButton.dataset
          .roundIndex =
          String(index);

        removeButton.style
          .minHeight =
          '32px';

        removeButton.style.padding =
          '5px 9px';

        removeButton.style.border =
          '1px solid #efb1b1';

        removeButton.style
          .borderRadius =
          '8px';

        removeButton.style.color =
          '#c40000';

        removeButton.style.background =
          '#fff7f7';

        removeButton.disabled =
          state.saving;

        removeButton
          .addEventListener(
            'click',
            function () {
              const roundIndex =
                Number(
                  removeButton
                    .dataset
                    .roundIndex
                );

              if (
                !Number.isInteger(
                  roundIndex
                )
              ) {
                return;
              }

              state.rounds.splice(
                roundIndex,
                1
              );

              state.activeRequestId =
                '';

              renderRounds();

              setSystemStatus(
                'ลบรอบตรวจแล้ว',
                'info'
              );
            }
          );

        item.appendChild(
          image
        );

        item.appendChild(
          content
        );

        item.appendChild(
          removeButton
        );

        container.appendChild(
          item
        );
      }
    );

    updateActionButtons();
  }


  /************************************************************
   * Device ID
   ************************************************************/

  function getDeviceId() {
    if (
      API &&
      typeof API
        .getOrCreateDeviceId ===
        'function'
    ) {
      return cleanText(
        API.getOrCreateDeviceId()
      ).slice(
        0,
        250
      );
    }

    /*
     * Fallback ใช้เฉพาะกรณี api.js โหลดไม่สำเร็จ
     */
    return (
      'DEVICE-' +
      Date.now()
        .toString(36)
        .toUpperCase()
    ).slice(
      0,
      250
    );
  }


  /************************************************************
   * Build Save Payload
   ************************************************************/

  function buildPayload() {
    const personTypeElement =
      getElement(
        'personTypeSelect'
      );

    const companyElement =
      getElement(
        'companyInput'
      );

    const busLineElement =
      getElement(
        'busLineSelect'
      );

    const personNameElement =
      getElement(
        'personName'
      );

    const inspectorElement =
      getElement(
        'inspectorSelect'
      );

    const personType =
      cleanText(
        personTypeElement &&
        personTypeElement.value
      );

    const busDriver =
      isBusType(
        personType
      );

    const companyOrBusLine =
      busDriver
        ? cleanText(
          busLineElement &&
          busLineElement.value
        )
        : cleanText(
          companyElement &&
          companyElement.value
        );

    return {
      requestId:
        state.activeRequestId,

      personType:
        personType,

      personTypeOther:
        cleanText(
          getElement(
            'personTypeOther'
          ) &&
          getElement(
            'personTypeOther'
          ).value
        ),

      personName:
        cleanText(
          personNameElement &&
          personNameElement.value
        ),

      companyOrBusLine:
        companyOrBusLine,

      company:
        busDriver
          ? ''
          : companyOrBusLine,

      busLine:
        busDriver
          ? companyOrBusLine
          : '',

      busLineOther:
        cleanText(
          getElement(
            'busLineOther'
          ) &&
          getElement(
            'busLineOther'
          ).value
        ),

      checkpoint:
        getSelectedCheckpoint(),

      inspector:
        cleanText(
          inspectorElement &&
          inspectorElement.value
        ),

      rounds:
        state.rounds.map(
          function (round) {
            return {
              valueMg:
                round.valueMg,

              measuredAt:
                round.measuredAt,

              originalImageData:
                round.originalImageData,

              blurredImageData:
                round.blurredImageData,

              blurAreas:
                round.blurAreas ||
                []
            };
          }
        ),

      deviceId:
        getDeviceId(),

      browser:
        navigator.userAgent ||
        ''
    };
  }


  /************************************************************
   * Reset Form
   ************************************************************/

  function resetForm(
    showStatus
  ) {
    const form =
      getElement(
        'inspectionForm'
      );

    if (form) {
      form.reset();
    }

    state.rounds =
      [];

    state.selectedCapture =
      null;

    state.activeRequestId =
      '';

    if (
      window.AlcoholCamera &&
      typeof window
        .AlcoholCamera
        .clearPendingCapture ===
      'function'
    ) {
      window.AlcoholCamera
        .clearPendingCapture();
    }

    setHidden(
      'selectedCapturePanel',
      true
    );

    setHidden(
      'personTypeOtherGroup',
      true
    );

    setHidden(
      'companyGroup',
      true
    );

    setHidden(
      'busLineGroup',
      true
    );

    setHidden(
      'busLineOtherGroup',
      true
    );

    renderRounds();

    updatePersonTypeFields();

    updateGauge();

    if (showStatus) {
      setSystemStatus(
        'เริ่มรายการใหม่แล้ว',
        'success'
      );
    }
  }


  /************************************************************
   * Submit / Save
   ************************************************************/

  async function submitForm(
    event
  ) {
    event.preventDefault();

    if (state.saving) {
      return;
    }

    if (
      !state.initialized
    ) {
      window.alert(
        'ระบบยังไม่พร้อม กรุณากด “โหลดใหม่”'
      );

      return;
    }

    if (
      !validateCoreFields(
        true
      ).valid
    ) {
      return;
    }

    /*
     * ผู้ใช้สามารถกดบันทึกได้ทันที
     * ระบบจะนำภาพและค่าปัจจุบันสร้างเป็นรอบตรวจให้อัตโนมัติ
     */
    if (
      hasDraftActivity()
    ) {
      if (
        !isDraftReady()
      ) {
        window.alert(
          state.selectedCapture
            ? 'กรุณากรอกค่าตรวจวัดให้ถูกต้องก่อนบันทึก'
            : 'กรุณาถ่ายภาพและกด “ใช้ภาพนี้” ก่อนบันทึก'
        );

        return;
      }

      try {
        addCurrentRound(
          false
        );

      } catch (error) {
        window.alert(
          error.message ||
          'ไม่สามารถเพิ่มรอบตรวจได้'
        );

        return;
      }
    }

    if (
      state.rounds.length ===
      0
    ) {
      window.alert(
        'กรุณาเพิ่มรอบตรวจอย่างน้อยหนึ่งรอบ'
      );

      return;
    }

    if (
      !API ||
      typeof API.saveRecord !==
      'function'
    ) {
      window.alert(
        'ไม่พบฟังก์ชันบันทึกข้อมูลใน api.js'
      );

      return;
    }

    if (
      !state.activeRequestId
    ) {
      state.activeRequestId =
        typeof API
          .createRequestId ===
        'function'
          ? API.createRequestId()
          : (
            'WEB-' +
            Date.now()
              .toString(36)
              .toUpperCase()
          );
    }

    const payload =
      buildPayload();

    state.saving =
      true;

    updateActionButtons();

    renderRounds();

    setSystemStatus(
      'กำลังเตรียมและส่งข้อมูล กรุณารอสักครู่...',
      'loading'
    );

    try {
      const response =
        await API.saveRecord(
          payload,
          {
            requestId:
              state.activeRequestId,

            onBeforeSend:
              function (info) {
                const megabytes =
                  Number(
                    info.payloadBytes ||
                    0
                  ) /
                  (
                    1024 *
                    1024
                  );

                setSystemStatus(
                  'กำลังบันทึกข้อมูลและภาพ ' +
                  megabytes.toFixed(2) +
                  ' MB กรุณารอ...',
                  'loading'
                );
              }
          }
        );

      const successMessage =
        (
          response &&
          response.message
            ? response.message
            : 'บันทึกข้อมูลสำเร็จ'
        ) +
        (
          response &&
          response.recordId
            ? (
              '\nเลขรายการ: ' +
              response.recordId
            )
            : ''
        );

      setSystemStatus(
        response &&
        response.status ===
        'DENY'
          ? 'บันทึกสำเร็จ: ห้ามเข้าพื้นที่ / ห้ามปฏิบัติงาน'
          : 'บันทึกข้อมูลสำเร็จ',
        'success'
      );

      window.alert(
        successMessage
      );

      resetForm(
        false
      );

    } catch (error) {
      console.error(
        'saveRecord error:',
        error
      );

      const message =
        getErrorMessage(
          error,
          'บันทึกข้อมูลไม่สำเร็จ'
        );

      setSystemStatus(
        message,
        'error'
      );

      window.alert(
        message
      );

    } finally {
      state.saving =
        false;

      updateActionButtons();

      renderRounds();
    }
  }


  /************************************************************
   * Events
   ************************************************************/

  function bindEvents() {
    const form =
      getElement(
        'inspectionForm'
      );

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

    const addRoundButton =
      getElement(
        'addRoundButton'
      );

    const resetButton =
      getElement(
        'resetButton'
      );

    if (form) {
      form.addEventListener(
        'submit',
        submitForm
      );

      form.addEventListener(
        'input',
        function () {
          state.activeRequestId =
            '';

          updateActionButtons();
        }
      );

      form.addEventListener(
        'change',
        function () {
          state.activeRequestId =
            '';

          updateActionButtons();
        }
      );
    }

    if (personType) {
      personType
        .addEventListener(
          'change',
          updatePersonTypeFields
        );
    }

    if (busLine) {
      busLine
        .addEventListener(
          'change',
          updateBusLineOtherField
        );
    }

    if (measurement) {
      measurement
        .addEventListener(
          'input',
          updateGauge
        );

      measurement
        .addEventListener(
          'blur',
          function () {
            const rawValue =
              cleanText(
                measurement.value
              );

            if (
              rawValue ===
              ''
            ) {
              updateGauge();

              return;
            }

            const value =
              Number(
                rawValue
              );

            if (
              !Number.isFinite(
                value
              ) ||
              value < 0 ||
              value > 999
            ) {
              setSystemStatus(
                'ค่าตรวจวัดต้องอยู่ระหว่าง 0 ถึง 999 Mg%',
                'error'
              );

              updateGauge();

              return;
            }

            measurement.value =
              value.toFixed(2);

            updateGauge();
          }
        );
    }

    if (retryButton) {
      retryButton
        .addEventListener(
          'click',
          loadSystemData
        );
    }

    if (addRoundButton) {
      addRoundButton
        .addEventListener(
          'click',
          function () {
            try {
              addCurrentRound(
                true
              );

            } catch (error) {
              window.alert(
                error.message ||
                'ไม่สามารถเพิ่มรอบตรวจได้'
              );
            }
          }
        );
    }

    if (resetButton) {
      resetButton
        .addEventListener(
          'click',
          function () {
            if (
              hasAnyFormData() &&
              !window.confirm(
                'ต้องการล้างข้อมูลและเริ่มรายการใหม่หรือไม่'
              )
            ) {
              return;
            }

            resetForm(
              true
            );
          }
        );
    }


    /*
     * รับภาพจาก camera.js
     */
    window.addEventListener(
      'alcohol:image-captured',
      function (event) {
        const image =
          event &&
          event.detail
            ? event.detail.image
            : null;

        if (
          !image ||
          !cleanText(
            image.dataUrl
          )
        ) {
          return;
        }

        state.selectedCapture =
          image;

        state.activeRequestId =
          '';

        setSystemStatus(
          'เลือกภาพแล้ว กรอกค่าตรวจวัดและกด “เพิ่มรอบตรวจ” หรือ “บันทึกข้อมูล”',
          'success'
        );

        updateActionButtons();
      }
    );


    window.addEventListener(
      'alcohol:image-cleared',
      function () {
        state.selectedCapture =
          null;

        state.activeRequestId =
          '';

        updateActionButtons();
      }
    );


    window.addEventListener(
      'online',
      function () {
        state.online =
          true;

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
        state.online =
          false;

        setConnectionStatus(
          false,
          'ออฟไลน์'
        );

        setSystemStatus(
          'อุปกรณ์ไม่ได้เชื่อมต่ออินเทอร์เน็ต',
          'error'
        );

        updateActionButtons();
      }
    );
  }


  /************************************************************
   * Initialize
   ************************************************************/

  async function initialize() {
    startClock();

    bindEvents();

    renderRounds();

    updateGauge();

    updateActionButtons();

    await loadSystemData();
  }


  document.addEventListener(
    'DOMContentLoaded',
    initialize
  );


  /************************************************************
   * Public API
   ************************************************************/

  window.AlcoholApp =
    Object.freeze({
      state:
        state,

      reloadOptions:
        loadSystemData,

      updateGauge:
        updateGauge,

      addRound:
        function () {
          return addCurrentRound(
            true
          );
        },

      reset:
        function () {
          resetForm(
            true
          );
        },

      formatDateTime:
        formatBangkokDateTime
    });

})(window, document);
