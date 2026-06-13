/************************************************************
 * camera.js
 * ระบบกล้องหลัก
 ************************************************************/

(function (window, document) {
  'use strict';

  const CONFIG =
    window.APP_CONFIG || {};

  const ImageProcessor =
    window.AlcoholImageProcessor;

  const state = {
    stream:
      null,

    track:
      null,

    devices:
      [],

    deviceIndex:
      -1,

    facingMode:
      String(
        (
          CONFIG.CAMERA &&
          CONFIG.CAMERA
            .DEFAULT_FACING_MODE
        ) ||
        'environment'
      ),

    opening:
      false,

    ready:
      false,

    torchSupported:
      false,

    torchOn:
      false,

    pendingCapture:
      null,

    lastError:
      null,

    autoRestartTimer:
      0
  };


  function element(id) {
    return document.getElementById(
      id
    );
  }


  function setText(
    id,
    value
  ) {
    const target =
      element(id);

    if (target) {
      target.textContent =
        String(value || '');
    }
  }


  function setHidden(
    id,
    hidden
  ) {
    const target =
      element(id);

    if (target) {
      target.hidden =
        Boolean(hidden);
    }
  }


  function setCameraStatus(
    message,
    type
  ) {
    const target =
      element('cameraStatus');

    if (!target) {
      return;
    }

    target.textContent =
      message || '';

    target.className =
      'camera-status ' +
      (
        type ||
        'info'
      );
  }


  function dispatch(
    name,
    detail
  ) {
    window.dispatchEvent(
      new CustomEvent(
        name,
        {
          detail:
            detail || {}
        }
      )
    );
  }


  function supportsLiveCamera() {
    return Boolean(
      window.isSecureContext &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices
        .getUserMedia ===
        'function'
    );
  }


  function setButtonState() {
    const openButton =
      element(
        'openCameraButton'
      );

    const captureButton =
      element(
        'captureButton'
      );

    const switchButton =
      element(
        'switchCameraButton'
      );

    const torchButton =
      element(
        'torchButton'
      );

    const fallbackButton =
      element(
        'fallbackCameraButton'
      );

    if (openButton) {
      openButton.disabled =
        state.opening;

      openButton.textContent =
        state.ready
          ? 'เริ่มใหม่'
          : (
            state.opening
              ? 'กำลังเปิด...'
              : 'เปิดกล้อง'
          );
    }

    if (captureButton) {
      captureButton.disabled =
        !state.ready ||
        state.opening;
    }

    if (switchButton) {
      switchButton.disabled =
        state.opening ||
        state.devices.length < 2;
    }

    if (torchButton) {
      torchButton.disabled =
        !state.ready ||
        !state.torchSupported ||
        state.opening;

      torchButton.textContent =
        state.torchOn
          ? 'ปิดไฟ'
          : 'เปิดไฟ';

      torchButton.hidden =
        !state.torchSupported;
    }

    if (fallbackButton) {
      fallbackButton.disabled =
        state.opening;
    }
  }


  function stopStream() {
    window.clearTimeout(
      state.autoRestartTimer
    );

    state.autoRestartTimer = 0;

    if (state.stream) {
      state.stream
        .getTracks()
        .forEach(
          function (track) {
            try {
              track.stop();
            } catch (error) {
              console.warn(error);
            }
          }
        );
    }

    const video =
      element('cameraVideo');

    if (video) {
      video.pause();
      video.srcObject = null;
    }

    state.stream = null;
    state.track = null;
    state.ready = false;
    state.torchSupported = false;
    state.torchOn = false;

    setButtonState();
  }


  function createPreferredConstraints(
    options
  ) {
    const settings =
      options || {};

    const cameraConfig =
      CONFIG.CAMERA || {};

    const video = {
      width: {
        ideal:
          Number(
            cameraConfig
              .IDEAL_WIDTH ||
            1920
          )
      },

      height: {
        ideal:
          Number(
            cameraConfig
              .IDEAL_HEIGHT ||
            1080
          )
      },

      frameRate: {
        ideal: 30,
        max: 30
      }
    };

    if (settings.deviceId) {
      video.deviceId = {
        exact:
          settings.deviceId
      };

    } else {
      video.facingMode = {
        ideal:
          settings.facingMode ||
          state.facingMode ||
          'environment'
      };
    }

    return {
      audio:
        false,

      video:
        video
    };
  }


  function createFallbackConstraints(
    options
  ) {
    const settings =
      options || {};

    const video = {};

    if (settings.deviceId) {
      video.deviceId = {
        exact:
          settings.deviceId
      };

    } else {
      video.facingMode =
        settings.facingMode ||
        state.facingMode ||
        'environment';
    }

    return {
      audio:
        false,

      video:
        video
    };
  }


  async function requestStream(
    options
  ) {
    try {
      return await navigator
        .mediaDevices
        .getUserMedia(
          createPreferredConstraints(
            options
          )
        );

    } catch (error) {
      if (
        error &&
        (
          error.name ===
          'OverconstrainedError' ||
          error.name ===
          'ConstraintNotSatisfiedError'
        )
      ) {
        return navigator
          .mediaDevices
          .getUserMedia(
            createFallbackConstraints(
              options
            )
          );
      }

      throw error;
    }
  }


  async function refreshVideoDevices() {
    if (
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices
        .enumerateDevices !==
        'function'
    ) {
      state.devices = [];
      state.deviceIndex = -1;

      return [];
    }

    const devices =
      await navigator
        .mediaDevices
        .enumerateDevices();

    state.devices =
      devices.filter(
        function (device) {
          return (
            device.kind ===
            'videoinput'
          );
        }
      );

    const settings =
      state.track &&
      typeof state.track
        .getSettings ===
      'function'
        ? state.track.getSettings()
        : {};

    state.deviceIndex =
      state.devices.findIndex(
        function (device) {
          return (
            device.deviceId &&
            device.deviceId ===
            settings.deviceId
          );
        }
      );

    return state.devices;
  }


  function inspectTrackCapabilities() {
    state.torchSupported = false;
    state.torchOn = false;

    if (
      !state.track ||
      typeof state.track
        .getCapabilities !==
        'function'
    ) {
      return;
    }

    try {
      const capabilities =
        state.track
          .getCapabilities();

      state.torchSupported =
        Boolean(
          capabilities &&
          capabilities.torch
        );

    } catch (error) {
      state.torchSupported = false;
    }
  }


  function attachTrackLifecycle(
    track
  ) {
    if (!track) {
      return;
    }

    track.addEventListener(
      'ended',
      function () {
        state.ready = false;
        state.track = null;
        state.stream = null;

        setButtonState();

        setCameraStatus(
          'กล้องหยุดทำงาน แตะ “เปิดกล้อง” เพื่อเริ่มใหม่',
          'error'
        );

        dispatch(
          'alcohol:camera-ended'
        );
      }
    );
  }


  async function openCamera(
    options
  ) {
    if (state.opening) {
      return;
    }

    if (!supportsLiveCamera()) {
      const message =
        !window.isSecureContext
          ? 'ต้องเปิดเว็บไซต์ผ่าน HTTPS จึงจะใช้กล้องสดได้'
          : 'เบราว์เซอร์นี้ไม่รองรับกล้องสด กรุณาใช้ปุ่ม “ถ่ายแบบสำรอง”';

      state.lastError =
        new Error(message);

      setCameraStatus(
        message,
        'error'
      );

      setHidden(
        'cameraPlaceholder',
        false
      );

      setButtonState();

      dispatch(
        'alcohol:camera-error',
        {
          error:
            state.lastError
        }
      );

      return;
    }

    state.opening = true;
    state.lastError = null;

    setButtonState();

    setCameraStatus(
      'กำลังขอสิทธิ์และเปิดกล้อง...',
      'loading'
    );

    try {
      stopStream();

      state.opening = true;

      setButtonState();

      const settings =
        options || {};

      if (settings.facingMode) {
        state.facingMode =
          settings.facingMode;
      }

      const stream =
        await requestStream(
          settings
        );

      const video =
        element(
          'cameraVideo'
        );

      if (!video) {
        stream
          .getTracks()
          .forEach(
            function (track) {
              track.stop();
            }
          );

        throw new Error(
          'ไม่พบพื้นที่แสดงกล้อง'
        );
      }

      state.stream =
        stream;

      state.track =
        stream
          .getVideoTracks()[0] ||
        null;

      attachTrackLifecycle(
        state.track
      );

      video.srcObject =
        stream;

      video.muted =
        true;

      video.setAttribute(
        'playsinline',
        ''
      );

      await video.play();

      await ImageProcessor
        .waitForVideoReady(
          video,
          12000
        );

      const trackSettings =
        state.track &&
        typeof state.track
          .getSettings ===
        'function'
          ? state.track.getSettings()
          : {};

      if (
        trackSettings.facingMode
      ) {
        state.facingMode =
          trackSettings.facingMode;
      }

      state.ready =
        true;

      inspectTrackCapabilities();

      try {
        await refreshVideoDevices();

      } catch (error) {
        state.devices = [];
      }

      setHidden(
        'cameraPlaceholder',
        true
      );

      setCameraStatus(
        'กล้องพร้อมถ่ายภาพ',
        'success'
      );

      dispatch(
        'alcohol:camera-ready',
        {
          facingMode:
            state.facingMode,

          deviceCount:
            state.devices.length,

          width:
            video.videoWidth,

          height:
            video.videoHeight,

          torchSupported:
            state.torchSupported
        }
      );

    } catch (error) {
      stopStream();

      state.lastError =
        error;

      const message =
        translateCameraError(
          error
        );

      setHidden(
        'cameraPlaceholder',
        false
      );

      setCameraStatus(
        message,
        'error'
      );

      dispatch(
        'alcohol:camera-error',
        {
          error:
            error,

          message:
            message
        }
      );

    } finally {
      state.opening = false;

      setButtonState();
    }
  }


  async function switchCamera() {
    if (state.opening) {
      return;
    }

    try {
      /*
       * กรณี enumerateDevices ไม่คืนรายการครบ
       * ให้สลับจาก environment เป็น user แทน
       */
      if (
        state.devices.length < 2
      ) {
        state.facingMode =
          state.facingMode ===
          'environment'
            ? 'user'
            : 'environment';

        await openCamera({
          facingMode:
            state.facingMode
        });

        return;
      }

      const nextIndex =
        state.deviceIndex >= 0
          ? (
            state.deviceIndex + 1
          ) %
          state.devices.length
          : 0;

      const nextDevice =
        state.devices[nextIndex];

      await openCamera({
        deviceId:
          nextDevice.deviceId
      });

    } catch (error) {
      setCameraStatus(
        translateCameraError(
          error
        ),
        'error'
      );
    }
  }


  async function toggleTorch() {
    if (
      !state.track ||
      !state.torchSupported ||
      typeof state.track
        .applyConstraints !==
        'function'
    ) {
      return;
    }

    try {
      const nextValue =
        !state.torchOn;

      await state.track
        .applyConstraints({
          advanced: [
            {
              torch:
                nextValue
            }
          ]
        });

      state.torchOn =
        nextValue;

      setButtonState();

    } catch (error) {
      state.torchOn = false;

      setButtonState();

      setCameraStatus(
        'อุปกรณ์นี้ไม่สามารถควบคุมไฟฉายผ่านเว็บได้',
        'error'
      );
    }
  }


  async function captureFromCamera() {
    if (
      !state.ready ||
      state.opening
    ) {
      setCameraStatus(
        'กล้องยังไม่พร้อมถ่ายภาพ',
        'error'
      );

      return;
    }

    const captureButton =
      element(
        'captureButton'
      );

    if (captureButton) {
      captureButton.disabled =
        true;
    }

    setCameraStatus(
      'กำลังประมวลผลภาพ...',
      'loading'
    );

    try {
      const result =
        await ImageProcessor
          .captureVideoFrame(
            element(
              'cameraVideo'
            ),
            {
              maxWidth:
                CONFIG
                  .IMAGE_MAX_WIDTH,

              quality:
                CONFIG
                  .JPEG_QUALITY,

              maxBytes:
                CONFIG
                  .MAX_IMAGE_BYTES
            }
          );

      showCapturePreview(
        result
      );

      setCameraStatus(
        'ถ่ายภาพแล้ว กรุณาตรวจสอบภาพ',
        'success'
      );

    } catch (error) {
      setCameraStatus(
        error.message ||
        'ถ่ายภาพไม่สำเร็จ',
        'error'
      );

    } finally {
      setButtonState();
    }
  }


  async function captureFromFile(
    file
  ) {
    if (!file) {
      return;
    }

    setCameraStatus(
      'กำลังประมวลผลภาพสำรอง...',
      'loading'
    );

    try {
      const result =
        await ImageProcessor
          .processImageFile(
            file,
            {
              maxWidth:
                CONFIG
                  .IMAGE_MAX_WIDTH,

              quality:
                CONFIG
                  .JPEG_QUALITY,

              maxBytes:
                CONFIG
                  .MAX_IMAGE_BYTES
            }
          );

      showCapturePreview(
        result
      );

      setCameraStatus(
        'รับภาพแล้ว กรุณาตรวจสอบภาพ',
        'success'
      );

    } catch (error) {
      setCameraStatus(
        error.message ||
        'ไม่สามารถใช้ภาพที่เลือกได้',
        'error'
      );
    }
  }


  function showCapturePreview(
    result
  ) {
    state.pendingCapture =
      result;

    const image =
      element(
        'capturePreviewImage'
      );

    if (image) {
      image.src =
        result.dataUrl;
    }

    setText(
      'capturePreviewMeta',

      result.width +
      ' × ' +
      result.height +
      ' px · ' +
      ImageProcessor.formatBytes(
        result.bytes
      )
    );

    setHidden(
      'capturePreviewModal',
      false
    );

    document.body
      .classList
      .add(
        'modal-open'
      );
  }


  function closeCapturePreview(
    clearCapture
  ) {
    setHidden(
      'capturePreviewModal',
      true
    );

    document.body
      .classList
      .remove(
        'modal-open'
      );

    if (clearCapture) {
      state.pendingCapture =
        null;

      const image =
        element(
          'capturePreviewImage'
        );

      if (image) {
        image.removeAttribute(
          'src'
        );
      }
    }
  }


  function acceptCapture() {
    if (!state.pendingCapture) {
      return;
    }

    const accepted =
      state.pendingCapture;

    closeCapturePreview(false);

    const selectedImage =
      element(
        'selectedCaptureImage'
      );

    if (selectedImage) {
      selectedImage.src =
        accepted.dataUrl;
    }

    setText(
      'selectedCaptureMeta',

      accepted.width +
      ' × ' +
      accepted.height +
      ' px · ' +
      ImageProcessor.formatBytes(
        accepted.bytes
      )
    );

    setHidden(
      'selectedCapturePanel',
      false
    );

    dispatch(
      'alcohol:image-captured',
      {
        image:
          accepted
      }
    );

    setCameraStatus(
      'เลือกภาพแล้ว พร้อมกำหนดพื้นที่เบลอ',
      'success'
    );
  }


  function removeSelectedCapture() {
    state.pendingCapture =
      null;

    const selectedImage =
      element(
        'selectedCaptureImage'
      );

    if (selectedImage) {
      selectedImage.removeAttribute(
        'src'
      );
    }

    setHidden(
      'selectedCapturePanel',
      true
    );

    dispatch(
      'alcohol:image-cleared'
    );

    setCameraStatus(
      'ลบภาพที่เลือกแล้ว กรุณาถ่ายภาพใหม่',
      'info'
    );
  }


  function openFallbackPicker() {
    const input =
      element(
        'fallbackCameraInput'
      );

    if (input) {
      input.click();
    }
  }


  function translateCameraError(
    error
  ) {
    const name =
      String(
        (
          error &&
          error.name
        ) ||
        ''
      );

    if (
      name ===
      'NotAllowedError' ||
      name ===
      'PermissionDeniedError'
    ) {
      return 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาเปิดสิทธิ์กล้องในการตั้งค่าเบราว์เซอร์';
    }

    if (
      name ===
      'NotFoundError' ||
      name ===
      'DevicesNotFoundError'
    ) {
      return 'ไม่พบกล้องในอุปกรณ์นี้';
    }

    if (
      name ===
      'NotReadableError' ||
      name ===
      'TrackStartError'
    ) {
      return 'กล้องอาจถูกใช้งานโดยแอปอื่น กรุณาปิดแอปกล้องแล้วลองใหม่';
    }

    if (
      name ===
      'OverconstrainedError' ||
      name ===
      'ConstraintNotSatisfiedError'
    ) {
      return 'กล้องไม่รองรับค่าที่ร้องขอ กรุณาลองเปิดกล้องใหม่';
    }

    if (
      name ===
      'SecurityError'
    ) {
      return 'เบราว์เซอร์บล็อกการใช้กล้อง กรุณาเปิดเว็บไซต์ผ่าน HTTPS';
    }

    if (
      name ===
      'AbortError'
    ) {
      return 'การเปิดกล้องถูกยกเลิก กรุณาลองใหม่';
    }

    return String(
      (
        error &&
        error.message
      ) ||
      'ไม่สามารถเปิดกล้องได้'
    );
  }


  function bindEvents() {
    const openButton =
      element(
        'openCameraButton'
      );

    const captureButton =
      element(
        'captureButton'
      );

    const switchButton =
      element(
        'switchCameraButton'
      );

    const torchButton =
      element(
        'torchButton'
      );

    const fallbackButton =
      element(
        'fallbackCameraButton'
      );

    const fallbackInput =
      element(
        'fallbackCameraInput'
      );

    const retakeButton =
      element(
        'retakeCaptureButton'
      );

    const acceptButton =
      element(
        'acceptCaptureButton'
      );

    const removeSelectedButton =
      element(
        'removeSelectedCaptureButton'
      );

    if (openButton) {
      openButton.addEventListener(
        'click',
        function () {
          openCamera();
        }
      );
    }

    if (captureButton) {
      captureButton.addEventListener(
        'click',
        captureFromCamera
      );
    }

    if (switchButton) {
      switchButton.addEventListener(
        'click',
        switchCamera
      );
    }

    if (torchButton) {
      torchButton.addEventListener(
        'click',
        toggleTorch
      );
    }

    if (fallbackButton) {
      fallbackButton.addEventListener(
        'click',
        openFallbackPicker
      );
    }

    if (retakeButton) {
      retakeButton.addEventListener(
        'click',
        function () {
          closeCapturePreview(
            true
          );
        }
      );
    }

    if (acceptButton) {
      acceptButton.addEventListener(
        'click',
        acceptCapture
      );
    }

    if (removeSelectedButton) {
      removeSelectedButton
        .addEventListener(
          'click',
          removeSelectedCapture
        );
    }

    if (fallbackInput) {
      fallbackInput.addEventListener(
        'change',
        function () {
          const file =
            fallbackInput.files &&
            fallbackInput.files[0];

          captureFromFile(file);

          fallbackInput.value =
            '';
        }
      );
    }

    /*
     * กลับเข้าหน้าเว็บแล้วกล้องหยุด
     * ให้พยายามเปิดใหม่
     */
    document.addEventListener(
      'visibilitychange',
      function () {
        if (
          document.visibilityState !==
          'visible'
        ) {
          return;
        }

        if (
          state.stream &&
          state.track &&
          state.track.readyState ===
          'live'
        ) {
          return;
        }

        if (state.opening) {
          return;
        }

        window.clearTimeout(
          state.autoRestartTimer
        );

        state.autoRestartTimer =
          window.setTimeout(
            function () {
              openCamera();
            },
            500
          );
      }
    );

    window.addEventListener(
      'pagehide',
      stopStream
    );

    window.addEventListener(
      'pageshow',
      function () {
        if (
          !state.ready &&
          !state.opening
        ) {
          openCamera();
        }
      }
    );

    if (
      navigator.mediaDevices &&
      typeof navigator.mediaDevices
        .addEventListener ===
        'function'
    ) {
      navigator.mediaDevices
        .addEventListener(
          'devicechange',
          function () {
            refreshVideoDevices()
              .then(
                setButtonState
              )
              .catch(
                function () {}
              );
          }
        );
    }
  }


  function initialize() {
    if (!ImageProcessor) {
      setCameraStatus(
        'ไม่พบไฟล์ image-processor.js',
        'error'
      );

      return;
    }

    bindEvents();

    setButtonState();

    if (!supportsLiveCamera()) {
      setCameraStatus(
        window.isSecureContext
          ? 'เบราว์เซอร์นี้ไม่รองรับกล้องสด ใช้ปุ่ม “ถ่ายแบบสำรอง”'
          : 'ต้องเปิดผ่าน HTTPS หรือใช้ปุ่ม “ถ่ายแบบสำรอง”',
        'error'
      );

      return;
    }

    /*
     * เปิดกล้องอัตโนมัติ
     */
    openCamera();
  }


  document.addEventListener(
    'DOMContentLoaded',
    initialize
  );


  window.AlcoholCamera =
    Object.freeze({
      open:
        openCamera,

      close:
        stopStream,

      switchCamera:
        switchCamera,

      toggleTorch:
        toggleTorch,

      capture:
        captureFromCamera,

      getPendingCapture:
        function () {
          return state.pendingCapture;
        },

      clearPendingCapture:
        function () {
          state.pendingCapture =
            null;

          const previewImage =
            element(
              'capturePreviewImage'
            );

          const selectedImage =
            element(
              'selectedCaptureImage'
            );

          if (previewImage) {
            previewImage
              .removeAttribute(
                'src'
              );
          }

          if (selectedImage) {
            selectedImage
              .removeAttribute(
                'src'
              );
          }

          setHidden(
            'selectedCapturePanel',
            true
          );
        },

      getState:
        function () {
          return {
            ready:
              state.ready,

            opening:
              state.opening,

            facingMode:
              state.facingMode,

            deviceCount:
              state.devices.length,

            torchSupported:
              state.torchSupported,

            torchOn:
              state.torchOn
          };
        }
    });

})(window, document);
