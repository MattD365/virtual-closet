import { useEffect, useRef, useState } from 'react';
import { ClosetScene } from './three/ClosetScene.js';
import { db } from './lib/db.js';
import CropModal from './components/CropModal.jsx';

const TYPES = [
  { key: 'top', label: 'Tops' },
  { key: 'bottom', label: 'Bottoms' },
  { key: 'shoes', label: 'Shoes' },
];

export default function App() {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const sceneRef = useRef(null);

  const [profile, setProfile] = useState({ heightCm: 175, weightKg: 75 });
  const [face, setFace] = useState(null);
  const [items, setItems] = useState([]);
  const [outfit, setOutfit] = useState({ top: null, bottom: null, shoes: null });
  const [pendingCrop, setPendingCrop] = useState(null); // {file, type}
  const [loaded, setLoaded] = useState(false);

  // boot: scene + stored state
  useEffect(() => {
    const scene = new ClosetScene(canvasRef.current);
    sceneRef.current = scene;
    const ro = new ResizeObserver(([e]) => {
      scene.resize(e.contentRect.width, e.contentRect.height);
    });
    ro.observe(stageRef.current);

    (async () => {
      const [savedProfile, savedOutfit, savedItems, savedFace] = await Promise.all([
        db.getKV('profile'), db.getKV('outfit'), db.listItems(), db.getKV('face'),
      ]);
      if (savedProfile) setProfile(savedProfile);
      if (savedOutfit) setOutfit(savedOutfit);
      if (savedFace) setFace(savedFace);
      setItems(savedItems ?? []);
      setLoaded(true);
    })();

    return () => { ro.disconnect(); scene.dispose(); };
  }, []);

  // body follows measurements
  useEffect(() => {
    if (!loaded) return;
    sceneRef.current.setBody(profile);
    db.setKV('profile', profile);
    // re-apply the outfit onto the rebuilt body
    for (const t of TYPES) {
      const item = items.find((i) => i.id === outfit[t.key]);
      sceneRef.current.wear(t.key, item?.image ?? null);
    }
  }, [loaded, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // garments follow the outfit
  useEffect(() => {
    if (!loaded) return;
    for (const t of TYPES) {
      const item = items.find((i) => i.id === outfit[t.key]);
      sceneRef.current.wear(t.key, item?.image ?? null);
    }
    db.setKV('outfit', outfit);
  }, [loaded, outfit, items]); // eslint-disable-line react-hooks/exhaustive-deps

  // face photo follows its own state
  useEffect(() => {
    if (!loaded) return;
    sceneRef.current.setFace(face);
    db.setKV('face', face);
  }, [loaded, face]);

  async function addItem(type, image) {
    const item = { id: crypto.randomUUID(), type, image, added: Date.now() };
    await db.putItem(item);
    setItems((prev) => [...prev, item]);
    setOutfit((prev) => ({ ...prev, [type]: item.id }));
    setPendingCrop(null);
  }

  async function removeItem(item) {
    await db.deleteItem(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setOutfit((prev) => (prev[item.type] === item.id ? { ...prev, [item.type]: null } : prev));
  }

  // sliders work in whole inches / pounds; the scene and storage stay metric
  const heightIn = Math.round(profile.heightCm / 2.54);
  const weightLb = Math.round(profile.weightKg * 2.20462);

  function cycle(type, dir) {
    const options = [null, ...items.filter((i) => i.type === type).map((i) => i.id)];
    if (options.length === 1) return;
    const at = Math.max(0, options.indexOf(outfit[type]));
    const next = options[(at + dir + options.length) % options.length];
    setOutfit((prev) => ({ ...prev, [type]: next }));
  }

  return (
    <div className="app">
      <aside className="panel">
        <h1>Virtual Closet</h1>
        <p className="tagline">
          Your clothes on a mannequin your size. Everything stays in this browser —
          nothing is uploaded, anywhere.
        </p>

        <section>
          <h2>Measurements</h2>
          <label>
            Height: <strong>{Math.floor(heightIn / 12)}′{heightIn % 12}″</strong>
            <span className="alt">({Math.round(profile.heightCm)} cm)</span>
            <input type="range" min="51" max="83" value={heightIn}
                   onChange={(e) => setProfile((p) => ({ ...p, heightCm: Number(e.target.value) * 2.54 }))} />
          </label>
          <label>
            Weight: <strong>{weightLb} lb</strong>
            <span className="alt">({Math.round(profile.weightKg)} kg)</span>
            <input type="range" min="90" max="350" value={weightLb}
                   onChange={(e) => setProfile((p) => ({ ...p, weightKg: Number(e.target.value) / 2.20462 }))} />
          </label>
        </section>

        <section>
          <div className="rack-head">
            <h2>Face</h2>
            <div className="rack-controls">
              {face && (
                <button type="button" aria-label="Remove face photo"
                        onClick={() => setFace(null)}>×</button>
              )}
              <label className="add">
                {face ? 'Change' : '+ Add photo'}
                <input type="file" accept="image/*" hidden
                       onChange={(e) => {
                         if (e.target.files?.[0]) setPendingCrop({ file: e.target.files[0], type: 'face' });
                         e.target.value = '';
                       }} />
              </label>
            </div>
          </div>
        </section>

        {TYPES.map(({ key, label }) => {
          const rack = items.filter((i) => i.type === key);
          return (
            <section key={key}>
              <div className="rack-head">
                <h2>{label} <span className="alt">({rack.length})</span></h2>
                <div className="rack-controls">
                  <button type="button" onClick={() => cycle(key, -1)} aria-label={`Previous ${label}`}>‹</button>
                  <button type="button" onClick={() => cycle(key, 1)} aria-label={`Next ${label}`}>›</button>
                  <label className="add">
                    + Add
                    <input type="file" accept="image/*" hidden
                           onChange={(e) => {
                             if (e.target.files?.[0]) setPendingCrop({ file: e.target.files[0], type: key });
                             e.target.value = '';
                           }} />
                  </label>
                </div>
              </div>
              <div className="rack">
                <button type="button"
                        className={`swatch none ${outfit[key] === null ? 'worn' : ''}`}
                        onClick={() => setOutfit((prev) => ({ ...prev, [key]: null }))}>
                  none
                </button>
                {rack.map((item) => (
                  <div key={item.id} className={`swatch ${outfit[key] === item.id ? 'worn' : ''}`}>
                    <button type="button" className="wear"
                            onClick={() => setOutfit((prev) => ({ ...prev, [key]: item.id }))}>
                      <img src={item.image} alt={`${label} option`} />
                    </button>
                    <button type="button" className="del" aria-label="Delete item"
                            onClick={() => removeItem(item)}>×</button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <footer>
          Drag to rotate · scroll to zoom ·
          <a href="https://github.com/MattD365/virtual-closet"> source</a>
        </footer>
      </aside>

      <main className="stage" ref={stageRef}>
        <canvas ref={canvasRef} aria-label="3D mannequin preview" />
      </main>

      {pendingCrop && (
        <CropModal
          file={pendingCrop.file}
          type={pendingCrop.type}
          onDone={(image) => {
            if (pendingCrop.type === 'face') { setFace(image); setPendingCrop(null); }
            else addItem(pendingCrop.type, image);
          }}
          onCancel={() => setPendingCrop(null)}
        />
      )}
    </div>
  );
}
