/************************************************************
 * image-processor.js
 * ประมวลผลภาพจากกล้องและไฟล์ภาพ
 ************************************************************/

(function (window) {
  'use strict';

  const CONFIG =
    window.APP_CONFIG || {};

  const DEFAULT_MAX_WIDTH =
    Number(
      CONFIG.IMAGE_MAX_WIDTH || 1280
    );

  const DEFAULT_QUALITY =
    Number(
      CONFIG.JPEG_QUALITY || 0.80
    );

  const DEFAULT_MAX_BYTES =
    Number(
      CONFIG.MAX_IMAGE_BYTES ||
      (2 * 1024 * 1024)
    );


  function clamp(
    value,
    minimum,
    maximum
  ) {
    const number =
      Number(value);

    if (!Number.isFinite(number)) {
      return minimum;
    }

    return Math.min(
      maximum,
      Math.max(
        minimum,
        number
      )
    );
  }


  function createCanvas(
    width,
    height
  ) {
    const canvas =
      document.createElement(
        'canvas'
      );

    canvas.width =
      Math.max(
        1,
        Math.round(width)
      );

    canvas.height =
      Math.max(
        1,
        Math.round(height)
      );

    return canvas;
  }


  function canvasToBlob(
    canvas,
    mimeType,
    quality
  ) {
    return new Promise(
      function (resolve, reject) {
        if (
          !canvas ||
          typeof canvas.toBlob !==
          'function'
        ) {
          reject(
            new Error(
              'เบราว์เซอร์ไม่รองรับการแปลงภาพจาก Canvas'
            )
          );

          return;
        }

        canvas.toBlob(
          function (blob) {
            if (!blob) {
              reject(
                new Error(
                  'ไม่สามารถสร้างไฟล์ภาพได้'
                )
              );

              return;
            }

            resolve(blob);
          },

          mimeType || 'image/jpeg',

          quality
        );
      }
    );
  }


  function blobToDataUrl(blob) {
    return new Promise(
      function (resolve, reject) {
        const reader =
          new FileReader();

        reader.onload =
          function () {
            resolve(
              String(
                reader.result || ''
              )
            );
          };

        reader.onerror =
          function () {
            reject(
              new Error(
                'ไม่สามารถอ่านไฟล์ภาพได้'
              )
            );
          };

        reader.readAsDataURL(blob);
      }
    );
  }


  function calculateSize(
    width,
    height,
    maxWidth
  ) {
    const sourceWidth =
      Math.max(
        1,
        Number(width) || 1
      );

    const sourceHeight =
      Math.max(
        1,
        Number(height) || 1
      );

    const limit =
      Math.max(
        320,
        Number(maxWidth) ||
        DEFAULT_MAX_WIDTH
      );

    if (sourceWidth <= limit) {
      return {
        width:
          Math.round(sourceWidth),

        height:
          Math.round(sourceHeight)
      };
    }

    const ratio =
      limit / sourceWidth;

    return {
      width:
        Math.round(
          sourceWidth * ratio
        ),

      height:
        Math.round(
          sourceHeight * ratio
        )
    };
  }


  async function encodeWithinLimit(
    source,
    sourceWidth,
    sourceHeight,
    options
  ) {
    const settings =
      options || {};

    let maxWidth =
      Number(
        settings.maxWidth ||
        DEFAULT_MAX_WIDTH
      );

    let quality =
      clamp(
        settings.quality === undefined
          ? DEFAULT_QUALITY
          : settings.quality,
        0.45,
        0.95
      );

    const maxBytes =
      Math.max(
        150000,
        Number(
          settings.maxBytes ||
          DEFAULT_MAX_BYTES
        )
      );

    let lastResult = null;

    /*
     * ลดคุณภาพและขนาดภาพอัตโนมัติ
     * จนกว่าจะอยู่ภายในขนาดที่กำหนด
     */
    for (
      let attempt = 0;
      attempt < 8;
      attempt++
    ) {
      const size =
        calculateSize(
          sourceWidth,
          sourceHeight,
          maxWidth
        );

      const canvas =
        createCanvas(
          size.width,
          size.height
        );

      const context =
        canvas.getContext(
          '2d',
          {
            alpha: false
          }
        );

      if (!context) {
        throw new Error(
          'ไม่สามารถเปิดระบบประมวลผลภาพได้'
        );
      }

      context.imageSmoothingEnabled =
        true;

      context.imageSmoothingQuality =
        'high';

      context.fillStyle =
        '#000000';

      context.fillRect(
        0,
        0,
        size.width,
        size.height
      );

      context.drawImage(
        source,
        0,
        0,
        size.width,
        size.height
      );

      const blob =
        await canvasToBlob(
          canvas,
          'image/jpeg',
          quality
        );

      const dataUrl =
        await blobToDataUrl(blob);

      lastResult = {
        canvas:
          canvas,

        blob:
          blob,

        dataUrl:
          dataUrl,

        width:
          size.width,

        height:
          size.height,

        bytes:
          blob.size,

        mimeType:
          blob.type ||
          'image/jpeg',

        quality:
          quality
      };

      if (
        blob.size <=
        maxBytes
      ) {
        return lastResult;
      }

      if (quality > 0.58) {
        quality =
          Math.max(
            0.55,
            quality - 0.08
          );

      } else {
        maxWidth =
          Math.max(
            720,
            Math.floor(
              maxWidth * 0.84
            )
          );
      }
    }

    if (
      lastResult &&
      lastResult.bytes <=
      Math.ceil(
        maxBytes * 1.10
      )
    ) {
      return lastResult;
    }

    throw new Error(
      'ภาพยังมีขนาดใหญ่เกินกำหนด กรุณาถ่ายใหม่ในระยะที่เหมาะสม'
    );
  }


  function waitForVideoReady(
    video,
    timeoutMs
  ) {
    const timeout =
      Number(
        timeoutMs || 10000
      );

    return new Promise(
      function (resolve, reject) {
        if (
          video &&
          video.readyState >=
          HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          resolve();
          return;
        }

        let completed = false;
        let timerId = 0;

        function cleanup() {
          if (!video) {
            return;
          }

          video.removeEventListener(
            'loadedmetadata',
            handleReady
          );

          video.removeEventListener(
            'canplay',
            handleReady
          );

          window.clearTimeout(
            timerId
          );
        }

        function handleReady() {
          if (
            completed ||
            !video ||
            video.videoWidth < 1 ||
            video.videoHeight < 1
          ) {
            return;
          }

          completed = true;

          cleanup();

          resolve();
        }

        if (!video) {
          reject(
            new Error(
              'ไม่พบพื้นที่แสดงกล้อง'
            )
          );

          return;
        }

        video.addEventListener(
          'loadedmetadata',
          handleReady
        );

        video.addEventListener(
          'canplay',
          handleReady
        );

        timerId =
          window.setTimeout(
            function () {
              if (completed) {
                return;
              }

              completed = true;

              cleanup();

              reject(
                new Error(
                  'กล้องยังไม่พร้อมถ่ายภาพ'
                )
              );
            },
            timeout
          );
      }
    );
  }


  async function captureVideoFrame(
    video,
    options
  ) {
    await waitForVideoReady(
      video,
      10000
    );

    const frameCanvas =
      createCanvas(
        video.videoWidth,
        video.videoHeight
      );

    const frameContext =
      frameCanvas.getContext(
        '2d',
        {
          alpha: false
        }
      );

    if (!frameContext) {
      throw new Error(
        'ไม่สามารถจับภาพจากกล้องได้'
      );
    }

    frameContext.drawImage(
      video,
      0,
      0,
      frameCanvas.width,
      frameCanvas.height
    );

    const processed =
      await encodeWithinLimit(
        frameCanvas,
        frameCanvas.width,
        frameCanvas.height,
        options
      );

    return Object.assign(
      processed,
      {
        capturedAt:
          new Date().toISOString(),

        source:
          'camera'
      }
    );
  }


  function loadImageElement(file) {
    return new Promise(
      function (resolve, reject) {
        const image =
          new Image();

        const objectUrl =
          URL.createObjectURL(file);

        image.onload =
          function () {
            URL.revokeObjectURL(
              objectUrl
            );

            resolve(image);
          };

        image.onerror =
          function () {
            URL.revokeObjectURL(
              objectUrl
            );

            reject(
              new Error(
                'ไม่สามารถเปิดไฟล์ภาพที่เลือกได้'
              )
            );
          };

        image.src =
          objectUrl;
      }
    );
  }


  async function processImageFile(
    file,
    options
  ) {
    if (
      !file ||
      !String(
        file.type || ''
      ).startsWith('image/')
    ) {
      throw new Error(
        'กรุณาเลือกไฟล์ภาพเท่านั้น'
      );
    }

    let source = null;
    let sourceWidth = 0;
    let sourceHeight = 0;
    let shouldCloseBitmap = false;

    if (
      typeof createImageBitmap ===
      'function'
    ) {
      try {
        source =
          await createImageBitmap(
            file,
            {
              imageOrientation:
                'from-image'
            }
          );

        sourceWidth =
          source.width;

        sourceHeight =
          source.height;

        shouldCloseBitmap =
          typeof source.close ===
          'function';

      } catch (error) {
        source = null;
      }
    }

    if (!source) {
      source =
        await loadImageElement(
          file
        );

      sourceWidth =
        source.naturalWidth ||
        source.width;

      sourceHeight =
        source.naturalHeight ||
        source.height;
    }

    try {
      const processed =
        await encodeWithinLimit(
          source,
          sourceWidth,
          sourceHeight,
          options
        );

      return Object.assign(
        processed,
        {
          capturedAt:
            new Date().toISOString(),

          source:
            'file',

          originalFilename:
            String(
              file.name || ''
            )
        }
      );

    } finally {
      if (shouldCloseBitmap) {
        source.close();
      }
    }
  }


  function formatBytes(bytes) {
    const value =
      Number(bytes) || 0;

    if (value < 1024) {
      return (
        value +
        ' bytes'
      );
    }

    if (
      value <
      1024 * 1024
    ) {
      return (
        (
          value /
          1024
        ).toFixed(1) +
        ' KB'
      );
    }

    return (
      (
        value /
        (
          1024 *
          1024
        )
      ).toFixed(2) +
      ' MB'
    );
  }


  window.AlcoholImageProcessor =
    Object.freeze({
      captureVideoFrame:
        captureVideoFrame,

      processImageFile:
        processImageFile,

      blobToDataUrl:
        blobToDataUrl,

      canvasToBlob:
        canvasToBlob,

      waitForVideoReady:
        waitForVideoReady,

      formatBytes:
        formatBytes
    });

})(window);
