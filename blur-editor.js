
/************************************************************
 * blur-editor.js
 * ตัวแก้ไขพื้นที่เบลอภาพสำหรับมือถือและคอมพิวเตอร์
 ************************************************************/
(function (window, document) {
  'use strict';

  const CONFIG =
    window.APP_CONFIG || {};

  const Processor =
    window.AlcoholImageProcessor || {};

  const MAX_AREAS = 20;
  const MIN_BOX_CSS = 24;
  const HANDLE_CSS = 18;

  const state = {
    open: false,
    busy: false,

    imageObject: null,
    image: null,
    blurCanvas: null,

    areas: [],
    selected: -1,

    pointerId: null,
    mode: '',
    startPoint: null,
    startBox: null,

    history: [],
    renderPending: false
  };


  /************************************************************
   * Helpers
   ************************************************************/

  const $ =
    function (id) {
      return document.getElementById(
        id
      );
    };


  function clamp(
    value,
    minimum,
    maximum
  ) {
    const number =
      Number(value);

    return Math.min(
      maximum,
      Math.max(
        minimum,
        Number.isFinite(number)
          ? number
          : 0
      )
    );
  }


  function cloneAreas() {
    return state.areas.map(
      function (area) {
        return {
          ...area
        };
      }
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


  function formatBytes(bytes) {
    if (
      typeof Processor
        .formatBytes ===
      'function'
    ) {
      return Processor
        .formatBytes(bytes);
    }

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
        1024 /
        1024
      ).toFixed(2) +
      ' MB'
    );
  }


  /************************************************************
   * สร้าง UI อัตโนมัติ
   ************************************************************/

  function injectUi() {
    if (
      !$(
        'alcoholBlurEditorStyles'
      )
    ) {
      const style =
        document.createElement(
          'style'
        );

      style.id =
        'alcoholBlurEditorStyles';

      style.textContent = `
        .abe-modal {
          position: fixed;
          inset: 0;
          z-index: 10000;

          display: grid;
          place-items: center;

          padding: 8px;

          background:
            rgba(2, 10, 15, 0.90);

          overscroll-behavior:
            contain;
        }

        .abe-modal[hidden] {
          display: none !important;
        }

        .abe-card {
          display: grid;

          grid-template-rows:
            auto
            minmax(0, 1fr)
            auto
            auto;

          width:
            min(100%, 980px);

          height:
            min(96dvh, 900px);

          overflow: hidden;

          border:
            1px solid
            rgba(255, 255, 255, 0.18);

          border-radius: 16px;

          background: #0a1720;

          box-shadow:
            0 24px 80px
            rgba(0, 0, 0, 0.50);
        }

        .abe-head {
          display: flex;

          justify-content:
            space-between;

          gap: 10px;

          padding: 11px 12px;

          color: #ffffff;

          background:
            linear-gradient(
              135deg,
              #103d58,
              #092b40
            );
        }

        .abe-head h2 {
          margin: 0;

          font-size: 15px;
        }

        .abe-head p {
          margin: 3px 0 0;

          color:
            rgba(
              255,
              255,
              255,
              0.72
            );

          font-size: 10px;
          line-height: 1.35;
        }

        .abe-count {
          align-self: flex-start;

          min-width: 60px;

          padding: 5px 8px;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              0.20
            );

          border-radius: 999px;

          background:
            rgba(
              255,
              255,
              255,
              0.10
            );

          font-size: 10px;
          font-weight: 800;

          text-align: center;
        }

        .abe-work {
          position: relative;

          display: grid;
          place-items: center;

          min-height: 0;

          overflow: auto;

          padding: 8px;

          background: #081117;
        }

        .abe-wrap {
          display: inline-flex;

          max-width: 100%;
          max-height: 100%;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              0.20
            );

          border-radius: 10px;

          background: #000000;

          box-shadow:
            0 10px 30px
            rgba(0, 0, 0, 0.40);
        }

        #abeCanvas {
          display: block;

          width: auto;
          height: auto;

          max-width: 100%;

          max-height:
            calc(
              96dvh -
              205px
            );

          border-radius: 9px;

          touch-action: none;

          user-select: none;
          -webkit-user-select: none;
        }

        .abe-help {
          position: absolute;

          top: 14px;
          left: 50%;

          z-index: 2;

          max-width:
            calc(
              100% -
              28px
            );

          padding: 6px 10px;

          border-radius: 999px;

          color: #ffffff;

          background:
            rgba(
              0,
              0,
              0,
              0.65
            );

          font-size: 10px;
          font-weight: 700;

          text-align: center;

          transform:
            translateX(-50%);

          pointer-events: none;
        }

        .abe-status {
          position: absolute;

          right: 14px;
          bottom: 14px;

          z-index: 2;

          max-width:
            calc(
              100% -
              28px
            );

          padding: 6px 9px;

          border-radius: 8px;

          color: #ffffff;

          background:
            rgba(
              0,
              0,
              0,
              0.72
            );

          font-size: 9px;
          font-weight: 700;

          pointer-events: none;
        }

        .abe-tools {
          display: grid;

          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );

          gap: 6px;

          padding: 8px;

          border-top:
            1px solid
            rgba(
              255,
              255,
              255,
              0.10
            );

          background: #0e202b;
        }

        .abe-btn {
          min-height: 38px;

          padding: 7px;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              0.18
            );

          border-radius: 9px;

          color: #ffffff;

          background:
            rgba(
              255,
              255,
              255,
              0.08
            );

          font-size: 10px;
          font-weight: 800;

          touch-action:
            manipulation;
        }

        .abe-btn.danger {
          color: #ffd0d0;

          border-color:
            rgba(
              255,
              80,
              80,
              0.34
            );

          background:
            rgba(
              190,
              20,
              20,
              0.18
            );
        }

        .abe-actions {
          display: grid;

          grid-template-columns:
            0.85fr
            1.15fr;

          gap: 7px;

          padding: 8px;

          border-top:
            1px solid
            rgba(
              255,
              255,
              255,
              0.10
            );

          background: #071219;
        }

        .abe-action {
          min-height: 44px;

          padding: 8px;

          border: 0;
          border-radius: 10px;

          font-size: 11px;
          font-weight: 850;

          touch-action:
            manipulation;
        }

        .abe-action.secondary {
          color: #dcebf2;
          background: #263943;
        }

        .abe-action.primary {
          color: #ffffff;

          background:
            linear-gradient(
              135deg,
              #08784c,
              #10a869
            );
        }

        .abe-btn:disabled,
        .abe-action:disabled {
          opacity: 0.40;

          cursor:
            not-allowed;
        }

        .abe-edit-button {
          align-self:
            flex-start;

          min-height: 32px;

          margin-top: 3px;
          padding: 5px 8px;

          border:
            1px solid
            #78ccec;

          border-radius: 8px;

          color: #0c4b68;
          background: #e8f8ff;

          font-size: 9px;
          font-weight: 800;

          touch-action:
            manipulation;
        }

        body.abe-open {
          overflow:
            hidden !important;

          overscroll-behavior:
            none;
        }

        @media (
          max-width: 560px
        ) {
          .abe-modal {
            padding: 0;
          }

          .abe-card {
            width: 100%;
            height: 100dvh;

            border: 0;
            border-radius: 0;
          }

          #abeCanvas {
            max-height:
              calc(
                100dvh -
                206px
              );
          }

          .abe-tools {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }
        }
      `;

      document.head
        .appendChild(style);
    }


    if (
      !$(
        'alcoholBlurEditorModal'
      )
    ) {
      const modal =
        document.createElement(
          'div'
        );

      modal.id =
        'alcoholBlurEditorModal';

      modal.className =
        'abe-modal';

      modal.hidden =
        true;

      modal.setAttribute(
        'role',
        'dialog'
      );

      modal.setAttribute(
        'aria-modal',
        'true'
      );

      modal.innerHTML = `
        <section class="abe-card">

          <header class="abe-head">

            <div>
              <h2>
                กำหนดพื้นที่เบลอ (PDPA)
              </h2>

              <p>
                ลากบนภาพเพื่อเพิ่มกรอบ
                แล้วลากกรอบหรือจุดมุม
                เพื่อปรับตำแหน่ง
              </p>
            </div>

            <div
              id="abeCount"
              class="abe-count"
            >
              0 จุด
            </div>

          </header>


          <div class="abe-work">

            <div class="abe-help">
              ลากครอบใบหน้า ป้ายชื่อ
              หรือข้อมูลที่ต้องการปกปิด
            </div>

            <div class="abe-wrap">

              <canvas
                id="abeCanvas"
                aria-label="พื้นที่กำหนดจุดเบลอ"
              ></canvas>

            </div>

            <div
              id="abeStatus"
              class="abe-status"
            >
              ลากบนภาพเพื่อเพิ่มพื้นที่
            </div>

          </div>


          <div class="abe-tools">

            <button
              id="abeUndo"
              class="abe-btn"
              type="button"
            >
              ย้อนกลับ
            </button>

            <button
              id="abeDelete"
              class="abe-btn danger"
              type="button"
            >
              ลบกรอบที่เลือก
            </button>

            <button
              id="abeClear"
              class="abe-btn danger"
              type="button"
            >
              ล้างทั้งหมด
            </button>

            <button
              id="abeReset"
              class="abe-btn"
              type="button"
            >
              คืนค่าเดิม
            </button>

          </div>


          <footer class="abe-actions">

            <button
              id="abeSkip"
              class="abe-action secondary"
              type="button"
            >
              ใช้ภาพโดยไม่เบลอ
            </button>

            <button
              id="abeApply"
              class="abe-action primary"
              type="button"
            >
              ใช้ภาพที่เบลอแล้ว
            </button>

          </footer>

        </section>
      `;

      document.body
        .appendChild(modal);
    }


    const content =
      document.querySelector(
        '#selectedCapturePanel ' +
        '.selected-capture-content'
      );

    if (
      content &&
      !$('editBlurButton')
    ) {
      const button =
        document.createElement(
          'button'
        );

      button.id =
        'editBlurButton';

      button.className =
        'abe-edit-button';

      button.type =
        'button';

      button.textContent =
        'แก้ไขจุดเบลอ';

      content.appendChild(
        button
      );
    }
  }


  /************************************************************
   * Status
   ************************************************************/

  function setStatus(message) {
    const target =
      $('abeStatus');

    if (target) {
      target.textContent =
        message || '';
    }
  }


  /************************************************************
   * Area Helpers
   ************************************************************/

  function normalizeArea(area) {
    const x =
      clamp(
        area.x,
        0,
        1
      );

    const y =
      clamp(
        area.y,
        0,
        1
      );

    const width =
      clamp(
        area.width,
        0,
        1 - x
      );

    const height =
      clamp(
        area.height,
        0,
        1 - y
      );

    return {
      x:
        Number(
          x.toFixed(6)
        ),

      y:
        Number(
          y.toFixed(6)
        ),

      width:
        Number(
          width.toFixed(6)
        ),

      height:
        Number(
          height.toFixed(6)
        )
    };
  }


  function normalizeAreas(areas) {
    return (
      Array.isArray(areas)
        ? areas
        : []
    )
      .slice(
        0,
        MAX_AREAS
      )
      .map(
        normalizeArea
      )
      .filter(
        function (area) {
          return (
            area.width > 0 &&
            area.height > 0
          );
        }
      );
  }


  function toPixels(
    area,
    width,
    height
  ) {
    return {
      x:
        area.x *
        width,

      y:
        area.y *
        height,

      width:
        area.width *
        width,

      height:
        area.height *
        height
    };
  }


  function toArea(
    box,
    width,
    height
  ) {
    return normalizeArea({
      x:
        box.x /
        width,

      y:
        box.y /
        height,

      width:
        box.width /
        width,

      height:
        box.height /
        height
    });
  }


  /************************************************************
   * Image / Canvas
   ************************************************************/

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


  function loadImage(dataUrl) {
    return new Promise(
      function (resolve, reject) {
        const image =
          new Image();

        image.onload =
          function () {
            resolve(image);
          };

        image.onerror =
          function () {
            reject(
              new Error(
                'ไม่สามารถเปิดภาพสำหรับกำหนดจุดเบลอได้'
              )
            );
          };

        image.src =
          dataUrl;
      }
    );
  }


  function createFullBlurCanvas(
    image,
    width,
    height
  ) {
    const canvas =
      createCanvas(
        width,
        height
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

    /*
     * ใช้ Gaussian Blur
     * หาก Browser รองรับ
     */
    if (
      'filter' in
      context
    ) {
      const radius =
        Math.max(
          16,
          Math.round(
            width *
            0.014
          )
        );

      context.filter =
        'blur(' +
        radius +
        'px)';

      context.drawImage(
        image,
        0,
        0,
        width,
        height
      );

      context.filter =
        'none';

    } else {
      /*
       * Browser รุ่นเก่า:
       * ใช้ Pixelation แทน
       */
      const pixelSize =
        Math.max(
          10,
          Math.round(
            Math.min(
              width,
              height
            ) /
            55
          )
        );

      const small =
        createCanvas(
          Math.ceil(
            width /
            pixelSize
          ),
          Math.ceil(
            height /
            pixelSize
          )
        );

      const smallContext =
        small.getContext(
          '2d',
          {
            alpha: false
          }
        );

      if (!smallContext) {
        throw new Error(
          'ไม่สามารถสร้างภาพปกปิดข้อมูลได้'
        );
      }

      smallContext.drawImage(
        image,
        0,
        0,
        small.width,
        small.height
      );

      context.imageSmoothingEnabled =
        false;

      context.drawImage(
        small,
        0,
        0,
        small.width,
        small.height,
        0,
        0,
        width,
        height
      );

      context.imageSmoothingEnabled =
        true;
    }

    return canvas;
  }


  function drawBlurredImage(
    canvas,
    image,
    areas,
    preparedBlur
  ) {
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

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    context.imageSmoothingEnabled =
      true;

    context.imageSmoothingQuality =
      'high';

    /*
     * วาดภาพต้นฉบับ
     */
    context.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );


    if (
      areas.length > 0
    ) {
      const blurred =
        (
          preparedBlur &&
          preparedBlur.width ===
            canvas.width &&
          preparedBlur.height ===
            canvas.height
        )
          ? preparedBlur
          : createFullBlurCanvas(
            image,
            canvas.width,
            canvas.height
          );


      areas.forEach(
        function (area) {
          const box =
            toPixels(
              area,
              canvas.width,
              canvas.height
            );

          const x =
            Math.max(
              0,
              Math.floor(
                box.x
              )
            );

          const y =
            Math.max(
              0,
              Math.floor(
                box.y
              )
            );

          const width =
            Math.max(
              1,
              Math.min(
                canvas.width -
                x,

                Math.ceil(
                  box.width
                )
              )
            );

          const height =
            Math.max(
              1,
              Math.min(
                canvas.height -
                y,

                Math.ceil(
                  box.height
                )
              )
            );

          /*
           * นำเฉพาะตำแหน่งที่เลือก
           * จากภาพเบลอมาแปะบนภาพจริง
           */
          context.drawImage(
            blurred,

            x,
            y,
            width,
            height,

            x,
            y,
            width,
            height
          );
        }
      );
    }

    return context;
  }


  /************************************************************
   * Selection Handles
   ************************************************************/

  function handleSize() {
    const canvas =
      $('abeCanvas');

    const rect =
      canvas
        .getBoundingClientRect();

    if (!rect.width) {
      return HANDLE_CSS;
    }

    return (
      HANDLE_CSS *
      canvas.width /
      rect.width
    );
  }


  function handles(box) {
    return [
      {
        name: 'nw',
        x: box.x,
        y: box.y
      },

      {
        name: 'ne',
        x:
          box.x +
          box.width,

        y:
          box.y
      },

      {
        name: 'sw',
        x:
          box.x,

        y:
          box.y +
          box.height
      },

      {
        name: 'se',
        x:
          box.x +
          box.width,

        y:
          box.y +
          box.height
      }
    ];
  }


  function drawOverlay(context) {
    const canvas =
      $('abeCanvas');

    const pointSize =
      handleSize();


    state.areas.forEach(
      function (area, index) {
        const box =
          toPixels(
            area,
            canvas.width,
            canvas.height
          );

        const selected =
          index ===
          state.selected;

        context.save();

        context.lineWidth =
          Math.max(
            selected
              ? 3
              : 2,

            canvas.width *
            0.002
          );

        context.strokeStyle =
          selected
            ? '#00e5ff'
            : '#ff3344';

        context.fillStyle =
          selected
            ? 'rgba(0,229,255,0.10)'
            : 'rgba(255,30,50,0.08)';

        context.fillRect(
          box.x,
          box.y,
          box.width,
          box.height
        );

        context.strokeRect(
          box.x,
          box.y,
          box.width,
          box.height
        );


        const fontSize =
          Math.max(
            16,
            Math.round(
              canvas.width *
              0.018
            )
          );

        context.font =
          '800 ' +
          fontSize +
          'px system-ui';

        context.textBaseline =
          'top';

        context.fillStyle =
          selected
            ? '#00a9c7'
            : '#d7132c';

        context.fillRect(
          box.x,
          box.y,

          context
            .measureText(
              String(
                index + 1
              )
            )
            .width +
          14,

          fontSize +
          8
        );

        context.fillStyle =
          '#ffffff';

        context.fillText(
          String(
            index + 1
          ),

          box.x + 7,
          box.y + 4
        );


        if (selected) {
          handles(box)
            .forEach(
              function (point) {
                context.beginPath();

                context.arc(
                  point.x,
                  point.y,

                  pointSize /
                  2,

                  0,
                  Math.PI * 2
                );

                context.fillStyle =
                  '#ffffff';

                context.strokeStyle =
                  '#00a9c7';

                context.fill();
                context.stroke();
              }
            );
        }

        context.restore();
      }
    );
  }


  /************************************************************
   * Render
   ************************************************************/

  function render() {
    state.renderPending =
      false;

    if (
      !state.image ||
      !$('abeCanvas')
    ) {
      return;
    }

    const context =
      drawBlurredImage(
        $('abeCanvas'),
        state.image,
        state.areas,
        state.blurCanvas
      );

    drawOverlay(context);

    updateButtons();
  }


  function queueRender() {
    if (
      state.renderPending
    ) {
      return;
    }

    state.renderPending =
      true;

    window.requestAnimationFrame(
      render
    );
  }


  /************************************************************
   * Pointer Interaction
   ************************************************************/

  function pointFromEvent(event) {
    const canvas =
      $('abeCanvas');

    const rect =
      canvas
        .getBoundingClientRect();

    return {
      x:
        clamp(
          (
            event.clientX -
            rect.left
          ) *
          canvas.width /
          rect.width,

          0,
          canvas.width
        ),

      y:
        clamp(
          (
            event.clientY -
            rect.top
          ) *
          canvas.height /
          rect.height,

          0,
          canvas.height
        )
    };
  }


  function inside(
    point,
    box
  ) {
    return (
      point.x >= box.x &&
      point.x <=
        box.x +
        box.width &&

      point.y >= box.y &&
      point.y <=
        box.y +
        box.height
    );
  }


  function hitHandle(
    point,
    box
  ) {
    const radius =
      handleSize() *
      0.85;

    const found =
      handles(box)
        .find(
          function (handle) {
            return (
              Math.hypot(
                point.x -
                handle.x,

                point.y -
                handle.y
              ) <=
              radius
            );
          }
        );

    return found
      ? found.name
      : '';
  }


  function findHit(point) {
    const canvas =
      $('abeCanvas');


    if (
      state.selected >= 0 &&
      state.areas[
        state.selected
      ]
    ) {
      const box =
        toPixels(
          state.areas[
            state.selected
          ],

          canvas.width,
          canvas.height
        );

      const handle =
        hitHandle(
          point,
          box
        );

      if (handle) {
        return {
          index:
            state.selected,

          mode:
            'resize-' +
            handle
        };
      }
    }


    for (
      let index =
        state.areas.length - 1;

      index >= 0;

      index -= 1
    ) {
      const box =
        toPixels(
          state.areas[index],
          canvas.width,
          canvas.height
        );

      if (
        inside(
          point,
          box
        )
      ) {
        return {
          index:
            index,

          mode:
            'move'
        };
      }
    }

    return null;
  }


  function pushHistory() {
    state.history.push(
      cloneAreas()
    );

    if (
      state.history.length >
      40
    ) {
      state.history.shift();
    }
  }


  function pointerDown(event) {
    if (
      !state.open ||
      state.busy ||
      event.button > 0
    ) {
      return;
    }

    const canvas =
      $('abeCanvas');

    const point =
      pointFromEvent(event);

    const hit =
      findHit(point);

    event.preventDefault();

    pushHistory();


    if (hit) {
      state.selected =
        hit.index;

      state.mode =
        hit.mode;

      state.startBox =
        toPixels(
          state.areas[
            hit.index
          ],

          canvas.width,
          canvas.height
        );

    } else {
      if (
        state.areas.length >=
        MAX_AREAS
      ) {
        state.history.pop();

        setStatus(
          'เพิ่มพื้นที่ได้ไม่เกิน ' +
          MAX_AREAS +
          ' จุด'
        );

        return;
      }

      state.areas.push(
        toArea(
          {
            x:
              point.x,

            y:
              point.y,

            width:
              1,

            height:
              1
          },

          canvas.width,
          canvas.height
        )
      );

      state.selected =
        state.areas.length -
        1;

      state.mode =
        'create';

      state.startBox = {
        x:
          point.x,

        y:
          point.y,

        width:
          1,

        height:
          1
      };
    }


    state.pointerId =
      event.pointerId;

    state.startPoint =
      point;


    try {
      canvas.setPointerCapture(
        event.pointerId
      );
    } catch (error) {
      // Browser บางรุ่นไม่รองรับ
    }

    queueRender();
  }


  function resizedBox(
    start,
    point,
    mode,
    canvasWidth,
    canvasHeight
  ) {
    let left =
      start.x;

    let top =
      start.y;

    let right =
      start.x +
      start.width;

    let bottom =
      start.y +
      start.height;


    if (
      mode.includes('w')
    ) {
      left =
        point.x;
    }

    if (
      mode.includes('e')
    ) {
      right =
        point.x;
    }

    if (
      mode.includes('n')
    ) {
      top =
        point.y;
    }

    if (
      mode.includes('s')
    ) {
      bottom =
        point.y;
    }


    return {
      x:
        clamp(
          Math.min(
            left,
            right
          ),

          0,
          canvasWidth
        ),

      y:
        clamp(
          Math.min(
            top,
            bottom
          ),

          0,
          canvasHeight
        ),

      width:
        clamp(
          Math.abs(
            right -
            left
          ),

          1,
          canvasWidth
        ),

      height:
        clamp(
          Math.abs(
            bottom -
            top
          ),

          1,
          canvasHeight
        )
    };
  }


  function pointerMove(event) {
    if (
      state.pointerId ===
        null ||

      event.pointerId !==
        state.pointerId ||

      state.selected < 0
    ) {
      return;
    }

    event.preventDefault();

    const canvas =
      $('abeCanvas');

    const point =
      pointFromEvent(event);

    const deltaX =
      point.x -
      state.startPoint.x;

    const deltaY =
      point.y -
      state.startPoint.y;

    let box;


    if (
      state.mode ===
      'create'
    ) {
      box = {
        x:
          Math.min(
            state.startPoint.x,
            point.x
          ),

        y:
          Math.min(
            state.startPoint.y,
            point.y
          ),

        width:
          Math.abs(
            point.x -
            state.startPoint.x
          ),

        height:
          Math.abs(
            point.y -
            state.startPoint.y
          )
      };

    } else if (
      state.mode ===
      'move'
    ) {
      box = {
        x:
          clamp(
            state.startBox.x +
            deltaX,

            0,

            canvas.width -
            state.startBox.width
          ),

        y:
          clamp(
            state.startBox.y +
            deltaY,

            0,

            canvas.height -
            state.startBox.height
          ),

        width:
          state.startBox.width,

        height:
          state.startBox.height
      };

    } else {
      box =
        resizedBox(
          state.startBox,
          point,

          state.mode.replace(
            'resize-',
            ''
          ),

          canvas.width,
          canvas.height
        );
    }


    state.areas[
      state.selected
    ] =
      toArea(
        box,
        canvas.width,
        canvas.height
      );

    queueRender();
  }


  function pointerEnd(event) {
    if (
      state.pointerId ===
        null ||

      event.pointerId !==
        state.pointerId
    ) {
      return;
    }

    const canvas =
      $('abeCanvas');

    const rect =
      canvas
        .getBoundingClientRect();

    const box =
      (
        state.selected >= 0 &&
        state.areas[
          state.selected
        ]
      )
        ? toPixels(
          state.areas[
            state.selected
          ],

          canvas.width,
          canvas.height
        )
        : null;


    if (box) {
      const minimumWidth =
        MIN_BOX_CSS *
        canvas.width /
        Math.max(
          1,
          rect.width
        );

      const minimumHeight =
        MIN_BOX_CSS *
        canvas.height /
        Math.max(
          1,
          rect.height
        );


      if (
        box.width <
          minimumWidth ||

        box.height <
          minimumHeight
      ) {
        state.areas.splice(
          state.selected,
          1
        );

        state.selected =
          state.areas.length -
          1;

        setStatus(
          'กรอบเล็กเกินไป จึงไม่นำมาใช้'
        );
      }
    }


    try {
      canvas.releasePointerCapture(
        event.pointerId
      );
    } catch (error) {
      // ไม่กระทบการทำงาน
    }


    state.pointerId =
      null;

    state.mode =
      '';

    state.startPoint =
      null;

    state.startBox =
      null;

    queueRender();
  }


  /************************************************************
   * Toolbar Actions
   ************************************************************/

  function undo() {
    if (
      !state.history.length ||
      state.busy
    ) {
      return;
    }

    state.areas =
      state.history.pop();

    state.selected =
      state.areas.length -
      1;

    setStatus(
      'ย้อนกลับแล้ว'
    );

    queueRender();
  }


  function deleteSelected() {
    if (
      state.selected < 0 ||
      !state.areas[
        state.selected
      ] ||
      state.busy
    ) {
      return;
    }

    pushHistory();

    state.areas.splice(
      state.selected,
      1
    );

    state.selected =
      Math.min(
        state.selected,
        state.areas.length -
        1
      );

    setStatus(
      'ลบกรอบที่เลือกแล้ว'
    );

    queueRender();
  }


  function clearAll() {
    if (
      !state.areas.length ||
      state.busy
    ) {
      return;
    }

    pushHistory();

    state.areas = [];
    state.selected = -1;

    setStatus(
      'ล้างพื้นที่เบลอทั้งหมดแล้ว'
    );

    queueRender();
  }


  function resetAreas() {
    if (
      !state.imageObject ||
      state.busy
    ) {
      return;
    }

    pushHistory();

    state.areas =
      normalizeAreas(
        state.imageObject
          .blurAreas
      );

    state.selected =
      state.areas.length -
      1;

    setStatus(
      'คืนค่าพื้นที่เดิมแล้ว'
    );

    queueRender();
  }


  /************************************************************
   * Encode Image
   ************************************************************/

  function canvasToBlob(
    canvas,
    quality
  ) {
    if (
      typeof Processor
        .canvasToBlob ===
      'function'
    ) {
      return Processor
        .canvasToBlob(
          canvas,
          'image/jpeg',
          quality
        );
    }

    return new Promise(
      function (resolve, reject) {
        canvas.toBlob(
          function (blob) {
            if (!blob) {
              reject(
                new Error(
                  'ไม่สามารถสร้างไฟล์ภาพเบลอได้'
                )
              );

              return;
            }

            resolve(blob);
          },

          'image/jpeg',
          quality
        );
      }
    );
  }


  function blobToDataUrl(blob) {
    if (
      typeof Processor
        .blobToDataUrl ===
      'function'
    ) {
      return Processor
        .blobToDataUrl(blob);
    }

    return new Promise(
      function (resolve, reject) {
        const reader =
          new FileReader();

        reader.onload =
          function () {
            resolve(
              String(
                reader.result ||
                ''
              )
            );
          };

        reader.onerror =
          function () {
            reject(
              new Error(
                'ไม่สามารถอ่านไฟล์ภาพเบลอได้'
              )
            );
          };

        reader.readAsDataURL(
          blob
        );
      }
    );
  }


  async function encodeBlurredImage() {
    const maxBytes =
      Math.max(
        200000,

        Number(
          CONFIG
            .MAX_IMAGE_BYTES
        ) ||
        (
          2 *
          1024 *
          1024
        )
      );

    let width =
      state.image
        .naturalWidth ||
      state.image.width;

    let height =
      state.image
        .naturalHeight ||
      state.image.height;

    let quality =
      clamp(
        CONFIG
          .JPEG_QUALITY ===
          undefined
          ? 0.80
          : CONFIG
            .JPEG_QUALITY,

        0.52,
        0.92
      );

    let lastResult =
      null;


    for (
      let attempt = 0;

      attempt < 8;

      attempt += 1
    ) {
      const canvas =
        createCanvas(
          width,
          height
        );

      drawBlurredImage(
        canvas,
        state.image,
        state.areas,
        null
      );

      const blob =
        await canvasToBlob(
          canvas,
          quality
        );

      lastResult = {
        dataUrl:
          await blobToDataUrl(
            blob
          ),

        bytes:
          blob.size,

        width:
          canvas.width,

        height:
          canvas.height
      };


      if (
        blob.size <=
        maxBytes
      ) {
        return lastResult;
      }


      if (
        quality > 0.60
      ) {
        quality =
          Math.max(
            0.56,
            quality - 0.08
          );

      } else {
        const nextWidth =
          Math.floor(
            width *
            0.86
          );

        const nextHeight =
          Math.floor(
            height *
            0.86
          );


        if (
          Math.max(
            nextWidth,
            nextHeight
          ) < 720
        ) {
          break;
        }

        width =
          nextWidth;

        height =
          nextHeight;
      }
    }


    if (
      lastResult &&
      lastResult.bytes <=
        maxBytes *
        1.10
    ) {
      return lastResult;
    }

    throw new Error(
      'ภาพเบลอมีขนาดใหญ่เกินกำหนด กรุณาถ่ายภาพใหม่'
    );
  }


  /************************************************************
   * Update Preview
   ************************************************************/

  function updatePreview(
    dataUrl,
    text
  ) {
    const image =
      $(
        'selectedCaptureImage'
      );

    const meta =
      $(
        'selectedCaptureMeta'
      );

    if (image) {
      image.src =
        dataUrl;
    }

    if (meta) {
      meta.textContent =
        text;
    }

    dispatch(
      'alcohol:image-blurred',
      {
        image:
          state.imageObject
      }
    );
  }


  /************************************************************
   * Button State
   ************************************************************/

  function setBusy(busy) {
    state.busy =
      Boolean(busy);

    updateButtons();
  }


  function updateButtons() {
    if ($('abeCount')) {
      $('abeCount')
        .textContent =
        state.areas.length +
        ' จุด';
    }

    if ($('abeUndo')) {
      $('abeUndo')
        .disabled =
        state.busy ||
        !state.history.length;
    }

    if ($('abeDelete')) {
      $('abeDelete')
        .disabled =
        state.busy ||
        state.selected < 0 ||
        !state.areas[
          state.selected
        ];
    }

    if ($('abeClear')) {
      $('abeClear')
        .disabled =
        state.busy ||
        !state.areas.length;
    }

    if ($('abeReset')) {
      $('abeReset')
        .disabled =
        state.busy;
    }

    if ($('abeSkip')) {
      $('abeSkip')
        .disabled =
        state.busy;
    }

    if ($('abeApply')) {
      $('abeApply')
        .disabled =
        state.busy ||
        !state.areas.length;

      $('abeApply')
        .textContent =
        state.busy
          ? 'กำลังสร้างภาพ...'
          : 'ใช้ภาพที่เบลอแล้ว';
    }
  }


  /************************************************************
   * Apply Blur
   ************************************************************/

  async function applyBlur() {
    if (
      state.busy ||
      !state.imageObject ||
      !state.image
    ) {
      return;
    }

    if (
      !state.areas.length
    ) {
      setStatus(
        'ยังไม่มีพื้นที่เบลอ กรุณาลากบนภาพหรือกด “ใช้ภาพโดยไม่เบลอ”'
      );

      return;
    }

    setBusy(true);

    setStatus(
      'กำลังสร้างภาพเบลอ กรุณารอสักครู่...'
    );


    try {
      const result =
        await encodeBlurredImage();

      const areas =
        normalizeAreas(
          state.areas
        );


      Object.assign(
        state.imageObject,
        {
          blurredDataUrl:
            result.dataUrl,

          blurredImageData:
            result.dataUrl,

          blurAreas:
            areas,

          blurredBytes:
            result.bytes,

          blurredWidth:
            result.width,

          blurredHeight:
            result.height,

          blurApplied:
            true
        }
      );


      updatePreview(
        result.dataUrl,

        result.width +
        ' × ' +
        result.height +
        ' px · เบลอ ' +
        areas.length +
        ' จุด · ' +
        formatBytes(
          result.bytes
        )
      );

      closeEditor();

    } catch (error) {
      setStatus(
        error.message ||
        'ไม่สามารถสร้างภาพเบลอได้'
      );

    } finally {
      setBusy(false);
    }
  }


  /************************************************************
   * ไม่เบลอ
   ************************************************************/

  function skipBlur() {
    if (
      state.busy ||
      !state.imageObject
    ) {
      return;
    }

    const original =
      String(
        state.imageObject
          .dataUrl ||
        ''
      );


    Object.assign(
      state.imageObject,
      {
        blurredDataUrl:
          original,

        blurredImageData:
          original,

        blurAreas:
          [],

        blurredBytes:
          Number(
            state.imageObject
              .bytes
          ) || 0,

        blurredWidth:
          Number(
            state.imageObject
              .width
          ) || 0,

        blurredHeight:
          Number(
            state.imageObject
              .height
          ) || 0,

        blurApplied:
          false
      }
    );


    updatePreview(
      original,

      (
        Number(
          state.imageObject
            .width
        ) || 0
      ) +
      ' × ' +
      (
        Number(
          state.imageObject
            .height
        ) || 0
      ) +
      ' px · ไม่ได้กำหนดพื้นที่เบลอ · ' +
      formatBytes(
        state.imageObject
          .bytes
      )
    );

    closeEditor();
  }


  /************************************************************
   * Open / Close
   ************************************************************/

  async function openEditor(
    imageObject
  ) {
    if (
      state.busy ||
      !imageObject ||
      !imageObject.dataUrl
    ) {
      return;
    }

    state.imageObject =
      imageObject;

    state.areas =
      normalizeAreas(
        imageObject.blurAreas
      );

    state.selected =
      state.areas.length -
      1;

    state.history =
      [];

    state.pointerId =
      null;

    state.mode =
      '';


    $('alcoholBlurEditorModal')
      .hidden =
      false;

    document.body
      .classList
      .add(
        'abe-open',
        'modal-open'
      );

    state.open =
      true;

    setStatus(
      'กำลังเปิดภาพ...'
    );


    try {
      state.image =
        await loadImage(
          imageObject.dataUrl
        );

      const canvas =
        $('abeCanvas');

      canvas.width =
        state.image
          .naturalWidth ||
        state.image.width;

      canvas.height =
        state.image
          .naturalHeight ||
        state.image.height;


      /*
       * สร้างภาพเบลอเต็มภาพไว้ครั้งเดียว
       * เพื่อให้ลากกรอบได้ลื่นขึ้น
       */
      state.blurCanvas =
        createFullBlurCanvas(
          state.image,
          canvas.width,
          canvas.height
        );


      setStatus(
        state.areas.length
          ? 'เลือกกรอบเดิมเพื่อย้ายหรือปรับขนาดได้'
          : 'แตะและลากบนภาพเพื่อเพิ่มพื้นที่เบลอ'
      );

      queueRender();

    } catch (error) {
      setStatus(
        error.message ||
        'ไม่สามารถเปิดภาพได้'
      );
    }
  }


  function closeEditor() {
    const modal =
      $(
        'alcoholBlurEditorModal'
      );

    if (modal) {
      modal.hidden =
        true;
    }

    state.open =
      false;

    state.pointerId =
      null;

    state.mode =
      '';

    document.body
      .classList
      .remove(
        'abe-open'
      );


    const previewModal =
      $(
        'capturePreviewModal'
      );

    if (
      !previewModal ||
      previewModal.hidden
    ) {
      document.body
        .classList
        .remove(
          'modal-open'
        );
    }
  }


  function currentImage() {
    if (
      window.AlcoholApp &&
      window.AlcoholApp.state
    ) {
      return window
        .AlcoholApp
        .state
        .selectedCapture;
    }

    return state.imageObject;
  }


  /************************************************************
   * Events
   ************************************************************/

  function bindEvents() {
    const canvas =
      $('abeCanvas');

    canvas.addEventListener(
      'pointerdown',
      pointerDown
    );

    canvas.addEventListener(
      'pointermove',
      pointerMove
    );

    canvas.addEventListener(
      'pointerup',
      pointerEnd
    );

    canvas.addEventListener(
      'pointercancel',
      pointerEnd
    );

    canvas.addEventListener(
      'contextmenu',
      function (event) {
        event.preventDefault();
      }
    );


    $('abeUndo')
      .addEventListener(
        'click',
        undo
      );

    $('abeDelete')
      .addEventListener(
        'click',
        deleteSelected
      );

    $('abeClear')
      .addEventListener(
        'click',
        clearAll
      );

    $('abeReset')
      .addEventListener(
        'click',
        resetAreas
      );

    $('abeSkip')
      .addEventListener(
        'click',
        skipBlur
      );

    $('abeApply')
      .addEventListener(
        'click',
        applyBlur
      );

    $('editBlurButton')
      .addEventListener(
        'click',
        function () {
          openEditor(
            currentImage()
          );
        }
      );


    /*
     * รับภาพจาก camera.js
     * แล้วเปิด Blur Editor อัตโนมัติ
     */
    window.addEventListener(
      'alcohol:image-captured',
      function (event) {
        const imageObject =
          event.detail &&
          event.detail.image;

        if (
          !imageObject ||
          !imageObject.dataUrl
        ) {
          return;
        }

        state.imageObject =
          imageObject;

        window.setTimeout(
          function () {
            openEditor(
              imageObject
            );
          },
          0
        );
      }
    );


    window.addEventListener(
      'alcohol:image-cleared',
      function () {
        state.imageObject =
          null;

        state.image =
          null;

        state.blurCanvas =
          null;

        state.areas =
          [];

        state.selected =
          -1;

        state.history =
          [];

        if (state.open) {
          closeEditor();
        }
      }
    );


    window.addEventListener(
      'resize',
      queueRender,
      {
        passive: true
      }
    );
  }


  /************************************************************
   * Initialize
   ************************************************************/

  function initialize() {
    injectUi();

    bindEvents();

    updateButtons();
  }


  document.addEventListener(
    'DOMContentLoaded',
    initialize
  );


  /************************************************************
   * Public API
   ************************************************************/

  window.AlcoholBlurEditor =
    Object.freeze({
      open:
        function (imageObject) {
          return openEditor(
            imageObject ||
            currentImage()
          );
        },

      close:
        closeEditor,

      apply:
        applyBlur,

      skip:
        skipBlur,

      clear:
        clearAll,

      getAreas:
        function () {
          return normalizeAreas(
            state.areas
          );
        },

      isOpen:
        function () {
          return state.open;
        }
    });

})(window, document);

