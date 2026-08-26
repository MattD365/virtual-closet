import { useEffect, useRef, useState } from 'react';

// Fixed crop frame per garment type; the photo moves and zooms underneath it,
// the way avatar croppers work. Output is a 512px-wide texture.
const FRAMES = {
  top: { w: 300, h: 340 },
  bottom: { w: 260, h: 360 },
  shoes: { w: 340, h: 220 },
  face: { w: 260, h: 320 },
};

export default function CropModal({ file, type, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const view = useRef({ x: 0, y: 0, zoom: 1, min: 1 });
  const frame = FRAMES[type];

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const v = view.current;
      v.min = v.zoom = Math.max(frame.w / image.width, frame.h / image.height);
      v.x = (frame.w - image.width * v.zoom) / 2;
      v.y = (frame.h - image.height * v.zoom) / 2;
      setImg(image);
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, frame.w, frame.h]);

  useEffect(() => {
    if (!img) return;
    draw();
  });

  function clampPan() {
    const v = view.current;
    v.x = Math.min(0, Math.max(v.x, frame.w - img.width * v.zoom));
    v.y = Math.min(0, Math.max(v.y, frame.h - img.height * v.zoom));
  }

  function draw() {
    const ctx = canvasRef.current.getContext('2d');
    const v = view.current;
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, frame.w, frame.h);
    ctx.drawImage(img, v.x, v.y, img.width * v.zoom, img.height * v.zoom);
  }

  function onPointerDown(e) {
    const v = view.current;
    const start = { px: e.clientX, py: e.clientY, x: v.x, y: v.y };
    const move = (ev) => {
      v.x = start.x + (ev.clientX - start.px);
      v.y = start.y + (ev.clientY - start.py);
      clampPan();
      draw();
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  function setZoom(z) {
    const v = view.current;
    const cx = frame.w / 2, cy = frame.h / 2;
    const k = z / v.zoom;
    v.x = cx - (cx - v.x) * k;
    v.y = cy - (cy - v.y) * k;
    v.zoom = z;
    clampPan();
    draw();
  }

  function save() {
    const v = view.current;
    const out = document.createElement('canvas');
    const scale = 512 / frame.w;
    out.width = 512;
    out.height = Math.round(frame.h * scale);
    const ctx = out.getContext('2d');
    ctx.drawImage(img, v.x * scale, v.y * scale, img.width * v.zoom * scale, img.height * v.zoom * scale);
    onDone(out.toDataURL('image/jpeg', 0.85));
  }

  if (!img) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-label="Crop photo">
      <div className="modal">
        <h3>{type === 'face' ? 'Frame your face' : 'Frame the garment'}</h3>
        <p className="hint">
          Drag to position, zoom until {type === 'face' ? 'your face fills' : `the ${type} fills`} the frame.
        </p>
        <canvas
          ref={canvasRef}
          width={frame.w}
          height={frame.h}
          onPointerDown={onPointerDown}
          onWheel={(e) => {
            e.preventDefault();
            setZoom(Math.min(Math.max(view.current.zoom * (e.deltaY < 0 ? 1.08 : 0.93), view.current.min), view.current.min * 6));
          }}
        />
        <input
          type="range"
          min={view.current.min}
          max={view.current.min * 6}
          step="0.01"
          defaultValue={view.current.zoom}
          onInput={(e) => setZoom(Number(e.target.value))}
          aria-label="Zoom"
        />
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={save}>
            {type === 'face' ? 'Use photo' : 'Add to closet'}
          </button>
        </div>
      </div>
    </div>
  );
}
