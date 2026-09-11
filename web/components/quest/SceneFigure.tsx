"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The `scene` figure kind (8 September 2026): a small 3D scene the child drags to rotate,
 * for the few ideas that are genuinely three-dimensional and that a still or a 2D animation
 * cannot carry. Each scene type is built in code here, never authored as free geometry, so a
 * scene is always exactly the thing the step talks about:
 *
 *   net-cube : a cube net folding into the cube; the slider is the fold, 0 flat to 1 closed.
 *   walker   : the printed quadruped: body, four two-joint legs, the support polygon on the
 *              floor and the centre of mass above it; the slider is the gait phase, and the
 *              lifted foot leaves the polygon while the mass stays inside it.
 *   arm      : a three joint arm on a base; the slider is the reach, and the label under it
 *              says what the servo can still lift at that distance (torque over lever arm).
 *
 * Drag rotates, the slider drives the one parameter that matters. No autoplay: the child
 * turns it. Screenshots see the first pose.
 */
type Params = { t: number };
type Build = { group: THREE.Group; update: (p: Params) => string };

const PALETTE = { sand: 0xe8dcc4, ink: 0x3a3a3a, accent: 0xf2c14e, green: 0x5f7c4f, rust: 0xa33a2a, paper: 0xfffdf7, muted: 0xa8a093 };

function mat(color: number, opts: { flat?: boolean; opacity?: number } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, transparent: opts.opacity !== undefined, opacity: opts.opacity ?? 1, side: THREE.DoubleSide, flatShading: opts.flat ?? false });
}

function buildNetCube(): Build {
  const g = new THREE.Group();
  const s = 1;
  const face = () => new THREE.Mesh(new THREE.PlaneGeometry(s, s), mat(PALETTE.accent));
  const edge = (m: THREE.Mesh) => {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: PALETTE.ink }));
    m.add(e);
    return m;
  };
  // A cross net: the centre square, four flaps on its edges, and the lid beyond the north
  // flap. Every flap is an orientation group (turned to face its edge) holding a hinge group
  // whose local x axis is the fold line, so one rotation.x folds all of them the same way.
  const centre = edge(face());
  centre.rotation.x = -Math.PI / 2;
  g.add(centre);
  const flap = (parent: THREE.Object3D, yaw: number, offset: THREE.Vector3) => {
    const orient = new THREE.Group();
    orient.position.copy(offset);
    orient.rotation.y = yaw;
    const hinge = new THREE.Group();
    const f = edge(face());
    f.rotation.x = -Math.PI / 2;
    f.position.set(0, 0, -s / 2);
    hinge.add(f);
    orient.add(hinge);
    parent.add(orient);
    return hinge;
  };
  const n = flap(g, 0, new THREE.Vector3(0, 0, -s / 2));
  const so = flap(g, Math.PI, new THREE.Vector3(0, 0, s / 2));
  const w = flap(g, Math.PI / 2, new THREE.Vector3(-s / 2, 0, 0));
  const e = flap(g, -Math.PI / 2, new THREE.Vector3(s / 2, 0, 0));
  const lid = flap(n, 0, new THREE.Vector3(0, 0, -s));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat(PALETTE.sand, { opacity: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  g.add(floor);
  g.position.y = -0.4;
  return {
    group: g,
    update: ({ t }) => {
      const a = (Math.PI / 2) * t;
      for (const h of [n, so, w, e, lid]) h.rotation.x = a;
      const faces = Math.round(t * 5);
      return t < 0.02 ? "Flat: six squares in a cross." : t > 0.98 ? "Closed: the six squares are the cube's six faces." : `Folding: ${faces} of the five hinges bending at once.`;
    },
  };
}

function buildWalker(): Build {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.2), mat(PALETTE.paper));
  body.position.y = 1.2;
  g.add(body);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), mat(PALETTE.sand, { opacity: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  const legs: Array<{ hip: THREE.Group; knee: THREE.Group; foot: THREE.Vector3; side: number }> = [];
  const corners: Array<[number, number]> = [[-0.9, -0.55], [0.9, -0.55], [-0.9, 0.55], [0.9, 0.55]];
  for (const [x, z] of corners) {
    const hip = new THREE.Group();
    hip.position.set(x, 1.05, z);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), mat(PALETTE.accent));
    upper.position.y = -0.3;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -0.6;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), mat(PALETTE.accent));
    lower.position.y = -0.3;
    knee.add(lower);
    hip.add(knee);
    body.parent?.add(hip);
    g.add(hip);
    legs.push({ hip, knee, foot: new THREE.Vector3(), side: Math.sign(z) });
  }
  const com = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), mat(PALETTE.rust));
  g.add(com);
  const comShadow = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), mat(PALETTE.rust));
  comShadow.rotation.x = -Math.PI / 2;
  comShadow.position.y = 0.005;
  g.add(comShadow);
  const supportGeo = new THREE.BufferGeometry();
  const support = new THREE.LineLoop(supportGeo, new THREE.LineBasicMaterial({ color: PALETTE.green }));
  support.position.y = 0.01;
  g.add(support);
  const legOrder = [0, 3, 1, 2]; // creep gait: one foot up at a time
  g.position.y = -0.7;
  return {
    group: g,
    update: ({ t }) => {
      const phase = t * 4;
      const lifting = Math.min(3, Math.floor(phase));
      const within = phase - lifting;
      const liftedLeg = t >= 0.999 || t <= 0.001 ? -1 : legOrder[lifting];
      const down: THREE.Vector3[] = [];
      legs.forEach((leg, i) => {
        const lift = i === liftedLeg ? Math.sin(within * Math.PI) : 0;
        // The hip splays a little outward; lifting is mostly the knee folding, mirrored front
        // and back so both pairs bend the same way relative to the body.
        leg.hip.rotation.x = leg.side * 0.25 + lift * leg.side * 0.35;
        leg.knee.rotation.x = -leg.side * 0.5 - lift * leg.side * 1.1;
        const fp = new THREE.Vector3(0, -0.6, 0);
        leg.knee.localToWorld(fp);
        g.worldToLocal(fp);
        leg.foot.copy(fp);
        if (i !== liftedLeg) down.push(new THREE.Vector3(fp.x, 0, fp.z));
      });
      // Support polygon: the feet on the floor, in hull order for four (a rectangle) or three.
      const pts = down.length === 4 ? [down[0], down[1], down[3], down[2]] : down;
      supportGeo.setFromPoints(pts);
      const cx = down.reduce((a, p) => a + p.x, 0) / down.length;
      const cz = down.reduce((a, p) => a + p.z, 0) / down.length;
      // The body leans a little toward the standing feet before a foot lifts.
      const leanX = liftedLeg < 0 ? 0 : (cx - 0) * 0.5;
      const leanZ = liftedLeg < 0 ? 0 : (cz - 0) * 0.5;
      body.position.x = leanX;
      body.position.z = leanZ;
      com.position.set(leanX, 1.2, leanZ);
      comShadow.position.set(leanX, 0.006, leanZ);
      return liftedLeg < 0
        ? "All four feet down: the support is the whole rectangle."
        : `Foot ${lifting + 1} of 4 lifted: three feet make a triangle, and the red mass shifts to stay inside it.`;
    },
  };
}

function buildArm(spec: Record<string, unknown>): Build {
  const g = new THREE.Group();
  const torque = Number(spec.torqueKgCm) || 2.2;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 32), mat(PALETTE.muted));
  g.add(base);
  const shoulder = new THREE.Group();
  shoulder.position.y = 0.15;
  g.add(shoulder);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.18), mat(PALETTE.accent));
  upper.position.y = 0.65;
  shoulder.add(upper);
  const elbow = new THREE.Group();
  elbow.position.y = 1.3;
  shoulder.add(elbow);
  const fore = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.16), mat(PALETTE.accent));
  fore.position.y = 0.6;
  elbow.add(fore);
  const wrist = new THREE.Group();
  wrist.position.y = 1.2;
  elbow.add(wrist);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), mat(PALETTE.green));
  grip.position.y = 0.12;
  wrist.add(grip);
  const mass = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), mat(PALETTE.rust));
  mass.position.y = 0.4;
  wrist.add(mass);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), mat(PALETTE.sand, { opacity: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.15;
  g.add(floor);
  g.position.y = -1.1;
  return {
    group: g,
    update: ({ t }) => {
      // t 0: folded up close to the shoulder; t 1: stretched straight out.
      shoulder.rotation.z = -(0.15 + t * 1.35);
      elbow.rotation.z = (1 - t) * 1.6;
      const reachCm = Math.round(2 + t * 18);
      const holdG = Math.round((torque / reachCm) * 1000);
      return `Reach ${reachCm} cm: a ${torque} kg-cm servo can still hold about ${holdG >= 1000 ? `${(holdG / 1000).toFixed(1)} kg` : `${holdG} g`}.`;
    },
  };
}

const BUILDERS: Record<string, (spec: Record<string, unknown>) => Build> = { "net-cube": () => buildNetCube(), walker: () => buildWalker(), arm: buildArm };
const SLIDER_LABEL: Record<string, string> = { "net-cube": "Fold", walker: "Step", arm: "Reach" };

export function SceneFigure({ spec, alt }: { spec: Record<string, unknown>; alt: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(typeof spec.start === "number" ? Number(spec.start) : 0);
  const [note, setNote] = useState("");
  const buildRef = useRef<Build | null>(null);
  const type = String(spec.type ?? "");

  useEffect(() => {
    const el = host.current;
    const make = BUILDERS[type];
    if (!el || !make) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 16 / 10, 0.1, 100);
    camera.position.set(3.6, 2.6, 4.2);
    camera.lookAt(0, 0.2, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const built = make(spec);
    buildRef.current = built;
    const pivot = new THREE.Group();
    pivot.add(built.group);
    scene.add(pivot);
    setNote(built.update({ t }));

    let dragging = false, lastX = 0, lastY = 0, yaw = 0.6, pitch = type === "walker" ? 0.12 : 0.35;
    const applyRot = () => { pivot.rotation.y = yaw; pivot.rotation.x = pitch; };
    applyRot();
    const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.01;
      pitch = Math.max(-0.2, Math.min(1.2, pitch + (e.clientY - lastY) * 0.01));
      lastX = e.clientX; lastY = e.clientY;
      applyRot();
    };
    const up = () => { dragging = false; };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);

    const resize = () => {
      const w = el.clientWidth || 360;
      const h = el.clientHeight || 225;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    let raf = 0;
    const loop = () => { renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      renderer.dispose();
      el.removeChild(renderer.domElement);
      buildRef.current = null;
    };
    // The scene is built once per type; the slider drives it through buildRef below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    if (buildRef.current) setNote(buildRef.current.update({ t }));
  }, [t]);

  if (!BUILDERS[type]) return <p className="tr-step__note">{alt}</p>;
  return (
    <figure className="tr-figure tr-figure--wide">
      <div className="tr-scene" ref={host} role="img" aria-label={alt} />
      <div className="tr-scene__controls">
        <label htmlFor={`scene-${type}`}>{SLIDER_LABEL[type] ?? "Move"}</label>
        <input id={`scene-${type}`} type="range" min={0} max={1} step={0.01} value={t} onChange={(e) => setT(Number(e.target.value))} />
      </div>
      <figcaption className="tr-figure__caption">
        <span className="tr-figure__caption-text">{note}</span>
      </figcaption>
      <p className="tr-scene__hint">Drag the picture to turn it. Slide to move it.</p>
    </figure>
  );
}
