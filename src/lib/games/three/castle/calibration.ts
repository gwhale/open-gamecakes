// Dev-only LIVE calibration overlay for Castle Crumble. Gated behind
// `?calibrate=1` (see engine.ts). Builds a floating HTML panel of sliders bound
// straight to the running scene:
//   • object TRANSFORMS — position / rotation / scale of the ship, water and
//     cannon parts. Three.js Object3D transforms are already live (matrixAuto
//     Update), so assigning `obj.position.y = v` shows up next frame.
//   • gameplay SCALARS — gravity, blast, aim, power, camera. Each scalar's
//     set() applies to the live physics/render state immediately.
// A "Copy code" button emits a paste-ready summary of everything the user
// changed from the source defaults, so a good tuning session becomes a diff.
//
// No dependency, no three/cannon import — the panel only touches the plain
// number props of the objects/handles the engine hands it.

interface Vec3Like { x: number; y: number; z: number; }
interface Transformable { position: Vec3Like; rotation: Vec3Like; scale: Vec3Like; }

/** A single tunable number wired to live game state. */
export interface CalibScalar {
  label: string;
  /** How it appears in the exported summary, e.g. `AZIM_MAX` or
   *  `WEAPONS.cannonball.blastStrength`. */
  code: string;
  min: number;
  max: number;
  step: number;
  get(): number;
  /** MUST apply the value to the live scene. */
  set(v: number): void;
}

/** A scene object whose transform can be nudged live. `label` doubles as the
 *  source variable name used in the exported code (e.g. `pool`, `hull`). */
export interface CalibTransform {
  label: string;
  target: Transformable;
  pos?: boolean;
  rot?: boolean;
  scale?: boolean;
}

export interface CalibSection {
  title: string;
  scalars?: CalibScalar[];
  transforms?: CalibTransform[];
}

export interface CalibSpec {
  sections: CalibSection[];
  /** Extra action buttons, label → handler (e.g. "Reset camera"). */
  actions?: Array<{ label: string; run: () => void }>;
}

export interface CalibHandle {
  dispose(): void;
}

const AXES = ['x', 'y', 'z'] as const;
type Axis = (typeof AXES)[number];

/** Trim a number to at most 3 decimals, dropping trailing zeros. */
function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return parseFloat(v.toFixed(3)).toString();
}

export function mountCalibrationPanel(spec: CalibSpec): CalibHandle {
  // ---- Snapshot defaults (for "changed?" export + Reset all) ----
  const scalarDefaults = new Map<CalibScalar, number>();
  for (const s of spec.sections) for (const sc of s.scalars ?? []) scalarDefaults.set(sc, sc.get());
  const transformDefaults = new Map<CalibTransform, Record<Axis, number>[]>();
  for (const s of spec.sections) {
    for (const t of s.transforms ?? []) {
      transformDefaults.set(t, [
        { x: t.target.position.x, y: t.target.position.y, z: t.target.position.z },
        { x: t.target.rotation.x, y: t.target.rotation.y, z: t.target.rotation.z },
        { x: t.target.scale.x, y: t.target.scale.y, z: t.target.scale.z },
      ]);
    }
  }

  // ---- Root panel ----
  const root = document.createElement('div');
  root.setAttribute('data-castle-calibration', '');
  Object.assign(root.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    width: '312px',
    maxHeight: '94vh',
    overflowY: 'auto',
    zIndex: '2147483000',
    background: 'rgba(24,20,32,0.92)',
    color: '#f4f1f7',
    font: '12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
    borderRadius: '12px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(6px)',
    padding: '10px',
    touchAction: 'pan-y',
    userSelect: 'none',
  } as CSSStyleDeclaration);

  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } as CSSStyleDeclaration);
  const title = document.createElement('div');
  title.textContent = '🎛️ Castle Calibration';
  Object.assign(title.style, { fontWeight: '700', fontSize: '13px', flex: '1' } as CSSStyleDeclaration);
  const collapseBtn = mkButton('▁ hide', () => {
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    collapseBtn.textContent = hidden ? '▁ hide' : '▸ show';
  });
  header.append(title, collapseBtn);
  root.append(header);

  const body = document.createElement('div');
  root.append(body);

  // ---- Live "changed from default" export ----
  const exportBox = document.createElement('textarea');
  exportBox.readOnly = true;
  exportBox.spellcheck = false;
  Object.assign(exportBox.style, {
    width: '100%',
    height: '150px',
    marginTop: '8px',
    boxSizing: 'border-box',
    background: 'rgba(0,0,0,0.35)',
    color: '#c8f7d0',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    font: '11px/1.3 ui-monospace, monospace',
    padding: '6px',
    resize: 'vertical',
  } as CSSStyleDeclaration);

  const rebuildExport = (): void => {
    const lines: string[] = ['// Castle Crumble — calibration (changed from defaults)'];
    let anyChange = false;
    for (const s of spec.sections) {
      const sectionLines: string[] = [];
      for (const sc of s.scalars ?? []) {
        const def = scalarDefaults.get(sc)!;
        const cur = sc.get();
        if (cur !== def) sectionLines.push(`${sc.code} = ${fmt(cur)};  // was ${fmt(def)}`);
      }
      for (const t of s.transforms ?? []) {
        const defs = transformDefaults.get(t)!;
        const cur = [t.target.position, t.target.rotation, t.target.scale];
        const kinds: Array<{ prop: string; idx: number }> = [];
        if (t.pos !== false) kinds.push({ prop: 'position', idx: 0 });
        if (t.rot) kinds.push({ prop: 'rotation', idx: 1 });
        if (t.scale) kinds.push({ prop: 'scale', idx: 2 });
        for (const k of kinds) {
          const c = cur[k.idx];
          const d = defs[k.idx];
          if (c.x !== d.x || c.y !== d.y || c.z !== d.z) {
            sectionLines.push(`${t.label}.${k.prop}.set(${fmt(c.x)}, ${fmt(c.y)}, ${fmt(c.z)});`);
          }
        }
      }
      if (sectionLines.length) {
        anyChange = true;
        lines.push('', `// ── ${s.title} ──`, ...sectionLines);
      }
    }
    if (!anyChange) lines.push('', '// (nothing changed yet — drag a slider)');
    exportBox.value = lines.join('\n');
  };

  // ---- Control builders ----
  const numberRow = (
    label: string,
    get: () => number,
    set: (v: number) => void,
    min: number,
    max: number,
    step: number,
  ): HTMLElement => {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'grid', gridTemplateColumns: '76px 1fr 52px', gap: '6px', alignItems: 'center', margin: '3px 0' } as CSSStyleDeclaration);
    const lab = document.createElement('span');
    lab.textContent = label;
    lab.style.opacity = '0.85';
    lab.style.overflow = 'hidden';
    lab.style.textOverflow = 'ellipsis';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(get());
    slider.style.width = '100%';

    const num = document.createElement('input');
    num.type = 'number';
    num.step = String(step);
    num.value = fmt(get());
    Object.assign(num.style, {
      width: '52px', background: 'rgba(0,0,0,0.35)', color: '#fff',
      border: '1px solid rgba(255,255,255,0.2)', borderRadius: '5px', padding: '2px 4px',
      font: '11px ui-monospace, monospace',
    } as CSSStyleDeclaration);

    const apply = (v: number, from: 'slider' | 'num'): void => {
      if (Number.isNaN(v)) return;
      set(v);
      if (from !== 'slider') slider.value = String(v);
      if (from !== 'num') num.value = fmt(v);
      rebuildExport();
    };
    slider.addEventListener('input', () => apply(parseFloat(slider.value), 'slider'));
    num.addEventListener('input', () => apply(parseFloat(num.value), 'num'));

    row.append(lab, slider, num);
    return row;
  };

  // ---- Build sections ----
  for (const s of spec.sections) {
    const det = document.createElement('details');
    det.open = true;
    Object.assign(det.style, { marginBottom: '6px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px' } as CSSStyleDeclaration);
    const sum = document.createElement('summary');
    sum.textContent = s.title;
    Object.assign(sum.style, { cursor: 'pointer', fontWeight: '700', color: '#ffd9a8', margin: '2px 0 4px' } as CSSStyleDeclaration);
    det.append(sum);

    for (const sc of s.scalars ?? []) {
      det.append(numberRow(sc.label, () => sc.get(), (v) => sc.set(v), sc.min, sc.max, sc.step));
    }
    for (const t of s.transforms ?? []) {
      const grp = document.createElement('div');
      grp.style.margin = '4px 0 6px';
      const gl = document.createElement('div');
      gl.textContent = t.label;
      Object.assign(gl.style, { color: '#a8d8ff', fontWeight: '700', margin: '2px 0' } as CSSStyleDeclaration);
      grp.append(gl);
      const kinds: Array<{ prop: 'position' | 'rotation' | 'scale'; span: number; step: number }> = [];
      if (t.pos !== false) kinds.push({ prop: 'position', span: 80, step: 0.5 });
      if (t.rot) kinds.push({ prop: 'rotation', span: Math.PI, step: 0.02 });
      if (t.scale) kinds.push({ prop: 'scale', span: 3, step: 0.05 });
      for (const k of kinds) {
        for (const ax of AXES) {
          const base = (t.target[k.prop] as Vec3Like)[ax];
          const lo = k.prop === 'scale' ? 0.05 : base - k.span;
          const hi = base + k.span;
          const tag = k.prop === 'position' ? '' : k.prop === 'rotation' ? '↻' : '⤢';
          grp.append(
            numberRow(
              `${tag}${ax}`,
              () => (t.target[k.prop] as Vec3Like)[ax],
              (v) => { (t.target[k.prop] as Vec3Like)[ax] = v; },
              lo,
              hi,
              k.step,
            ),
          );
        }
      }
      det.append(grp);
    }
    body.append(det);
  }

  // ---- Footer actions ----
  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' } as CSSStyleDeclaration);

  const resetAll = mkButton('♻ Reset all', () => {
    for (const [sc, def] of scalarDefaults) sc.set(def);
    for (const [t, defs] of transformDefaults) {
      (['position', 'rotation', 'scale'] as const).forEach((prop, i) => {
        const v = t.target[prop] as Vec3Like;
        v.x = defs[i].x; v.y = defs[i].y; v.z = defs[i].z;
      });
    }
    // Repaint every slider/number from the restored live values.
    syncInputs();
    rebuildExport();
  });

  const copyBtn = mkButton('📋 Copy code', async () => {
    try {
      await navigator.clipboard.writeText(exportBox.value);
      copyBtn.textContent = '✓ Copied!';
      window.setTimeout(() => (copyBtn.textContent = '📋 Copy code'), 1200);
    } catch {
      exportBox.select();
      document.execCommand?.('copy');
    }
  });

  actions.append(copyBtn, resetAll);
  for (const a of spec.actions ?? []) actions.append(mkButton(a.label, () => { a.run(); syncInputs(); rebuildExport(); }));
  body.append(actions, exportBox);

  // Re-read every slider/number from its live source (used after Reset / actions).
  function syncInputs(): void {
    // Rebuild is cheap and correctness-proof: re-derive values by walking the
    // spec again in DOM order. Rows were appended in the same order, so we can
    // pair inputs to sources by re-collecting getters.
    const getters: Array<() => number> = [];
    for (const s of spec.sections) {
      for (const sc of s.scalars ?? []) getters.push(() => sc.get());
      for (const t of s.transforms ?? []) {
        const kinds: Array<'position' | 'rotation' | 'scale'> = [];
        if (t.pos !== false) kinds.push('position');
        if (t.rot) kinds.push('rotation');
        if (t.scale) kinds.push('scale');
        for (const prop of kinds) for (const ax of AXES) getters.push(() => (t.target[prop] as Vec3Like)[ax]);
      }
    }
    const rows = body.querySelectorAll('div[style*="grid-template-columns"]');
    rows.forEach((row, i) => {
      const g = getters[i];
      if (!g) return;
      const slider = row.querySelector('input[type=range]') as HTMLInputElement | null;
      const num = row.querySelector('input[type=number]') as HTMLInputElement | null;
      if (slider) slider.value = String(g());
      if (num) num.value = fmt(g());
    });
  }

  rebuildExport();
  document.body.append(root);

  return {
    dispose(): void {
      root.remove();
    },
  };
}

function mkButton(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  Object.assign(b.style, {
    background: 'rgba(236,72,153,0.85)', color: '#fff', border: 'none',
    borderRadius: '7px', padding: '5px 9px', font: '11px/1 ui-monospace, monospace',
    fontWeight: '700', cursor: 'pointer',
  } as CSSStyleDeclaration);
  b.addEventListener('click', onClick);
  return b;
}
