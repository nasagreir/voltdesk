"use client";

import { useEffect, useRef, useState } from "react";
import type { ModelId } from "@/lib/car-photos";

type ThreeNS = typeof import("three");

/** Published body size in meters. Width is without mirrors. */
interface Tesla {
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  frontOverhang: number;
  wheelR: number;
  /** Fraction of length where the windshield starts. */
  hood: number;
  /** Fraction of length where the roof peaks. */
  crown: number;
  /** Fraction of length where the rear glass starts to fall. */
  roofEnd: number;
  /** 0 is a fastback. 1 keeps a tall hatch. */
  hatch: number;
  wedge: boolean;
}

const CARS: Record<ModelId, Tesla> = {
  "model-3": {
    length: 4.72,
    width: 1.85,
    height: 1.441,
    wheelbase: 2.875,
    frontOverhang: 0.86,
    wheelR: 0.334,
    hood: 0.37,
    crown: 0.54,
    roofEnd: 0.74,
    hatch: 0.12,
    wedge: false,
  },
  "model-y": {
    length: 4.79,
    width: 1.921,
    height: 1.624,
    wheelbase: 2.89,
    frontOverhang: 0.87,
    wheelR: 0.356,
    hood: 0.33,
    crown: 0.5,
    roofEnd: 0.76,
    hatch: 0.62,
    wedge: false,
  },
  "model-s": {
    length: 5.021,
    width: 1.987,
    height: 1.431,
    wheelbase: 2.96,
    frontOverhang: 0.97,
    wheelR: 0.34,
    hood: 0.39,
    crown: 0.56,
    roofEnd: 0.76,
    hatch: 0.18,
    wedge: false,
  },
  "model-x": {
    length: 5.036,
    width: 2.007,
    height: 1.68,
    wheelbase: 2.965,
    frontOverhang: 0.96,
    wheelR: 0.368,
    hood: 0.34,
    crown: 0.5,
    roofEnd: 0.75,
    hatch: 0.7,
    wedge: false,
  },
  cybertruck: {
    length: 5.683,
    width: 2.032,
    height: 1.791,
    wheelbase: 3.635,
    frontOverhang: 0.98,
    wheelR: 0.445,
    hood: 0.27,
    crown: 0.42,
    roofEnd: 0.64,
    hatch: 1,
    wedge: true,
  },
};

const SCALE = 0.5;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

function smooth(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / Math.max(1e-4, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function arch(t: number, center: number, radius: number) {
  const u = Math.abs(t - center) / radius;
  if (u >= 1) return 0;
  return Math.sqrt(1 - u * u);
}

function halfWidth(car: Tesla, t: number) {
  const full = car.width / 2;
  const front = car.frontOverhang / car.length;
  const rear = (car.frontOverhang + car.wheelbase) / car.length;
  const radius = (car.wheelR * 1.05) / car.length;
  const flare = Math.max(arch(t, front, radius), arch(t, rear, radius)) * 0.04;
  if (car.wedge) {
    const nose = t < 0.08 ? lerp(full * 0.35, full, smooth(0, 0.08, t)) : full;
    const tail = t > 0.9 ? lerp(full, full * 0.9, smooth(0.9, 1, t)) : nose;
    return tail + flare;
  }
  if (t < 0.045) return lerp(full * 0.28, full * 0.62, smooth(0, 0.045, t));
  if (t < 0.16) return lerp(full * 0.62, full, smooth(0.045, 0.16, t));
  if (t < 0.84) return full + flare;
  if (t < 0.96) return lerp(full, full * 0.8, smooth(0.84, 0.96, t));
  return lerp(full * 0.8, full * 0.42, smooth(0.96, 1, t));
}

function roofY(car: Tesla, t: number) {
  const nose = car.wedge ? 0.55 : 0.5;
  const hood = car.height * (car.wedge ? 0.58 : 0.64);
  const roof = car.height - 0.03;
  const tail = car.height * (0.56 + 0.28 * car.hatch);
  if (car.wedge) {
    if (t < car.hood) return lerp(0.62, car.height * 0.72, t / car.hood);
    if (t < car.crown) return lerp(car.height * 0.72, roof, smooth(car.hood, car.crown, t));
    if (t < car.roofEnd) return roof;
    return lerp(roof, car.height * 0.7, smooth(car.roofEnd, 1, t));
  }
  if (t < 0.05) return lerp(0.38, nose, t / 0.05);
  if (t < car.hood) return lerp(nose, hood, smooth(0.05, car.hood, t));
  if (t < car.crown) return lerp(hood, roof, smooth(car.hood, car.crown, t));
  if (t < car.roofEnd) return roof;
  return lerp(roof, tail, smooth(car.roofEnd, 0.99, t));
}

function chinY(car: Tesla, t: number) {
  const front = car.frontOverhang / car.length;
  const rear = (car.frontOverhang + car.wheelbase) / car.length;
  const radius = (car.wheelR * 0.92) / car.length;
  const lift = Math.max(arch(t, front, radius), arch(t, rear, radius)) * car.wheelR * 0.78;
  return 0.14 + lift;
}

function beltY(car: Tesla, t: number) {
  const roof = roofY(car, t);
  const line = car.height * (car.wedge ? 0.62 : 0.7);
  return Math.min(roof - 0.05, Math.max(chinY(car, t) + 0.18, line));
}

interface Point {
  y: number;
  z: number;
  glass: boolean;
}

function trackOf(car: Tesla) {
  return car.width / 2 - car.wheelR * 0.36;
}

function halfSection(car: Tesla, t: number): Point[] {
  const width = halfWidth(car, t);
  const roof = roofY(car, t);
  const chin = 0.17;
  const cabin = t > car.hood + 0.015 && t < car.roofEnd + 0.04;
  const front = car.frontOverhang / car.length;
  const rear = (car.frontOverhang + car.wheelbase) / car.length;
  const axle = Math.max(arch(t, front, (car.wheelR * 1.15) / car.length), arch(t, rear, (car.wheelR * 1.15) / car.length));
  const track = trackOf(car);
  const radius = car.wheelR * 0.9;
  const points: Point[] = [{ y: chin, z: 0, glass: false }];
  if (car.wedge) {
    points.push(
      { y: chin, z: width * 0.92, glass: false },
      { y: lerp(chin, roof, 0.45), z: width, glass: false },
      { y: lerp(chin, roof, 0.62), z: width, glass: false },
      { y: roof, z: width * 0.42, glass: false },
      { y: roof, z: 0, glass: false },
    );
    return points;
  }
  const inner = Math.min(width * 0.55, Math.max(0.08, track - radius));
  points.push({ y: chin, z: inner * 0.5, glass: false });
  const opened = axle > 0.2 && width > track;
  const outer = Math.min(width * 0.98, track + radius * 0.25);
  for (let i = 0; i <= 7; i += 1) {
    const u = i / 7;
    const z = lerp(inner, opened ? outer : width * 0.92, u);
    const dz = (z - track) / radius;
    const dome = Math.sqrt(Math.max(0, 1 - Math.min(1, dz * dz)));
    const along = chin + 0.06 + u * (roof - chin) * 0.08;
    const over = car.wheelR * 0.25 + dome * radius;
    points.push({ y: opened ? lerp(along, over, axle) : along, z, glass: false });
  }
  points.push(
    { y: lerp(chin, roof, 0.38), z: width, glass: false },
    { y: lerp(chin, roof, 0.52), z: width, glass: false },
    { y: lerp(chin, roof, cabin ? 0.64 : 0.8), z: width * 0.99, glass: false },
    { y: lerp(chin, roof, 0.8), z: width * (cabin ? 0.7 : 0.4), glass: cabin },
    { y: lerp(chin, roof, 0.92), z: width * (cabin ? 0.38 : 0.16), glass: cabin },
    { y: roof, z: 0, glass: cabin },
  );
  return points;
}

function loop(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) out.push(point);
  for (let i = points.length - 2; i >= 1; i -= 1) out.push({ ...points[i], z: -points[i].z });
  return out;
}

function loft(THREE: ThreeNS, car: Tesla) {
  const stations = car.wedge ? 48 : 96;
  const rings: Point[][] = [];
  for (let i = 0; i <= stations; i += 1) rings.push(loop(halfSection(car, i / stations)));
  const around = rings[0].length;
  const positions: number[] = [];
  for (let i = 0; i <= stations; i += 1) {
    const x = (i / stations - 0.5) * car.length;
    for (const point of rings[i]) positions.push(x, point.y, point.z);
  }
  const paint: number[] = [];
  const glass: number[] = [];
  const clad: number[] = [];
  const push = (bucket: number[], a: number, b: number, c: number, d: number) => {
    bucket.push(a, c, b, b, c, d);
  };
  for (let i = 0; i < stations; i += 1) {
    for (let p = 0; p < around; p += 1) {
      const a = i * around + p;
      const b = i * around + ((p + 1) % around);
      const c = (i + 1) * around + p;
      const d = (i + 1) * around + ((p + 1) % around);
      const glassFace = rings[i][p].glass && rings[i][(p + 1) % around].glass;
      const low =
        rings[i][p].y < 0.28 &&
        rings[i][(p + 1) % around].y < 0.28 &&
        rings[i + 1][p].y < 0.3;
      if (glassFace) push(glass, a, b, c, d);
      else if (low && !car.wedge) push(clad, a, b, c, d);
      else push(paint, a, b, c, d);
    }
  }
  const cap = (station: number, inward: number, bucket: number[]) => {
    const base = station * around;
    let cy = 0;
    for (let p = 0; p < around; p += 1) cy += positions[(base + p) * 3 + 1];
    const center = positions.length / 3;
    positions.push(positions[base * 3] + inward, cy / around, 0);
    for (let p = 0; p < around; p += 1) {
      const a = base + p;
      const b = base + ((p + 1) % around);
      if (inward > 0) bucket.push(center, a, b);
      else bucket.push(center, b, a);
    }
  };
  cap(0, 0.004, paint);
  cap(stations, -0.004, paint);
  const indices = [...paint, ...glass, ...clad];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.addGroup(0, paint.length, 0);
  geometry.addGroup(paint.length, glass.length, 1);
  geometry.addGroup(paint.length + glass.length, clad.length, 2);
  geometry.computeVertexNormals();
  return geometry;
}

function buildCar(THREE: ThreeNS, modelId: ModelId, hex: string) {
  const car = CARS[modelId];
  const group = new THREE.Group();
  const bins: Array<{ dispose: () => void }> = [];
  function keep<T extends { dispose: () => void }>(item: T): T {
    bins.push(item);
    return item;
  }
  const paint = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex),
    metalness: car.wedge ? 1 : 0.25,
    roughness: car.wedge ? 0.34 : 0.22,
    clearcoat: car.wedge ? 0.25 : 1,
    clearcoatRoughness: car.wedge ? 0.25 : 0.08,
    envMapIntensity: 1,
  });
  keep(paint);
  if (car.wedge) paint.flatShading = true;
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#0e141b"),
    metalness: 0.05,
    roughness: 0.02,
    transparent: true,
    opacity: 0.94,
    envMapIntensity: 1.4,
  });
  const cladMat = new THREE.MeshStandardMaterial({ color: "#1a1c1f", roughness: 0.62, metalness: 0.2 });
  keep(glassMat);
  keep(cladMat);
  const body = new THREE.Mesh(keep(loft(THREE, car)), [paint, glassMat, cladMat]);
  group.add(body);

  const black = new THREE.MeshStandardMaterial({ color: "#141416", roughness: 0.55, metalness: 0.15 });
  const lamp = new THREE.MeshStandardMaterial({
    color: "#f7f9ff",
    emissive: "#f4f7ff",
    emissiveIntensity: 2.2,
    roughness: 0.25,
  });
  const tail = new THREE.MeshStandardMaterial({
    color: "#6a1020",
    emissive: "#e31937",
    emissiveIntensity: 1.6,
    roughness: 0.35,
  });
  keep(black);
  keep(lamp);
  keep(tail);
  const noseX = -car.length / 2;
  const tailX = car.length / 2;
  const head = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.045, car.width * 0.5)), lamp);
  head.position.set(noseX + car.length * 0.09, car.height * 0.44, 0);
  const rear = new THREE.Mesh(keep(new THREE.BoxGeometry(0.04, 0.032, car.width * 0.55)), tail);
  rear.position.set(tailX - car.length * 0.055, car.height * (0.5 + 0.05 * car.hatch), 0);
  const intake = new THREE.Mesh(keep(new THREE.BoxGeometry(0.1, 0.1, car.width * 0.42)), black);
  intake.position.set(noseX + 0.1, 0.32, 0);
  group.add(head, rear, intake);

  const mirror = keep(new THREE.BoxGeometry(0.14, 0.07, 0.08));
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(mirror, black);
    pod.position.set(noseX + car.length * (car.hood + 0.02), beltY(car, car.hood) + 0.02, side * (car.width / 2 - 0.01));
    group.add(pod);
  }

  const rubber = new THREE.MeshStandardMaterial({ color: "#1a1a1c", roughness: 0.72, metalness: 0.05 });
  const alloy = new THREE.MeshStandardMaterial({ color: "#d5d8dc", metalness: 0.92, roughness: 0.22 });
  const capMat = new THREE.MeshStandardMaterial({ color: "#2a2c30", metalness: 0.6, roughness: 0.35 });
  keep(rubber);
  keep(alloy);
  keep(capMat);
  const tireProfile: Array<InstanceType<ThreeNS["Vector2"]>> = [];
  const tread = car.wheelR * 0.2;
  for (let i = 0; i <= 14; i += 1) {
    const a = -Math.PI / 2 + (Math.PI * i) / 14;
    tireProfile.push(new THREE.Vector2(car.wheelR - 0.012 + Math.cos(a) * 0.018, Math.sin(a) * tread));
  }
  const tireGeom = keep(new THREE.LatheGeometry(tireProfile, 48));
  const discGeom = keep(new THREE.CylinderGeometry(car.wheelR * 0.64, car.wheelR * 0.64, 0.04, 40));
  const spokeGeom = keep(new THREE.BoxGeometry(car.wheelR * 0.5, 0.035, 0.05));
  const capGeom = keep(new THREE.CylinderGeometry(car.wheelR * 0.14, car.wheelR * 0.14, 0.05, 24));
  const front = car.frontOverhang - car.length / 2;
  const rearAxle = front + car.wheelbase;
  const track = trackOf(car);
  for (const x of [front, rearAxle]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(tireGeom, rubber);
      const disc = new THREE.Mesh(discGeom, alloy);
      const cap = new THREE.Mesh(capGeom, capMat);
      tire.rotation.x = Math.PI / 2;
      disc.rotation.x = Math.PI / 2;
      cap.rotation.x = Math.PI / 2;
      disc.position.z = side * 0.045;
      cap.position.z = side * 0.06;
      wheel.add(tire, disc, cap);
      for (let spoke = 0; spoke < 5; spoke += 1) {
        const pivot = new THREE.Group();
        pivot.rotation.z = (spoke / 5) * Math.PI * 2;
        const blade = new THREE.Mesh(spokeGeom, alloy);
        blade.position.set(0, car.wheelR * 0.3, side * 0.04);
        pivot.add(blade);
        wheel.add(pivot);
      }
      wheel.position.set(x, car.wheelR, side * track);
      group.add(wheel);
    }
  }

  const shadow = new THREE.Mesh(
    keep(new THREE.CircleGeometry(car.length * 0.42, 48)),
    keep(new THREE.MeshBasicMaterial({ color: "#050506", transparent: true, opacity: 0.55 })),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);

  group.scale.setScalar(SCALE);
  return {
    group,
    dispose: () => bins.forEach((item) => item.dispose()),
    span: car.length * SCALE,
    eye: car.height * SCALE * 0.45,
  };
}

export function CarStage({
  modelId,
  color,
  name,
}: {
  modelId: ModelId;
  color: string;
  name: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    let stop = () => {};
    const timer = window.setTimeout(() => {
      void Promise.all([import("three"), import("three/examples/jsm/environments/RoomEnvironment.js")])
        .then(([THREE, room]) => {
          if (dead || !host.current) return;
          let renderer: InstanceType<ThreeNS["WebGLRenderer"]>;
          try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          } catch {
            setFailed(true);
            return;
          }
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.08;
          const pmrem = new THREE.PMREMGenerator(renderer);
          const env = pmrem.fromScene(new room.RoomEnvironment(), 0.04).texture;
          const scene = new THREE.Scene();
          scene.environment = env;
          const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
          scene.add(new THREE.AmbientLight(0xffffff, 0.35));
          const key = new THREE.DirectionalLight(0xfff6ee, 2.6);
          key.position.set(4, 6, 3);
          scene.add(key);
          const rim = new THREE.DirectionalLight(0xb9c7dc, 1.3);
          rim.position.set(-4, 2, -3);
          scene.add(rim);
          const built = buildCar(THREE, modelId, color);
          scene.add(built.group);
          camera.position.set(built.span * 0.7, built.span * 0.3, built.span * 0.82);
          camera.lookAt(0, built.eye, 0);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
          renderer.setClearColor(0x000000, 0);
          const canvas = renderer.domElement;
          canvas.className = "h-full w-full touch-none";
          canvas.setAttribute("aria-label", `${name} 3D model`);
          host.current.replaceChildren(canvas);

          let yaw = 0.62;
          let pitch = 0.06;
          let dragging = false;
          let lastX = 0;
          let lastY = 0;
          let still = 0;

          const fit = () => {
            const node = host.current;
            if (!node) return;
            const width = node.clientWidth;
            const height = node.clientHeight;
            if (width < 2 || height < 2) return;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
          };
          fit();
          const observer = new ResizeObserver(fit);
          observer.observe(host.current);

          const down = (event: PointerEvent) => {
            dragging = true;
            still = 0;
            lastX = event.clientX;
            lastY = event.clientY;
            canvas.setPointerCapture(event.pointerId);
          };
          const move = (event: PointerEvent) => {
            if (!dragging) return;
            yaw += (event.clientX - lastX) * 0.008;
            pitch = Math.max(-0.25, Math.min(0.4, pitch + (event.clientY - lastY) * 0.004));
            lastX = event.clientX;
            lastY = event.clientY;
          };
          const up = () => {
            dragging = false;
            still = 0;
          };
          canvas.addEventListener("pointerdown", down);
          canvas.addEventListener("pointermove", move);
          canvas.addEventListener("pointerup", up);
          canvas.addEventListener("pointercancel", up);

          renderer.setAnimationLoop(() => {
            if (!dragging) {
              still += 1;
              if (still > 50) yaw += 0.003;
            }
            built.group.rotation.y = yaw;
            built.group.rotation.x = pitch;
            renderer.render(scene, camera);
          });

          stop = () => {
            observer.disconnect();
            canvas.removeEventListener("pointerdown", down);
            canvas.removeEventListener("pointermove", move);
            canvas.removeEventListener("pointerup", up);
            canvas.removeEventListener("pointercancel", up);
            renderer.setAnimationLoop(null);
            built.dispose();
            env.dispose();
            pmrem.dispose();
            renderer.dispose();
            canvas.remove();
          };
        })
        .catch(() => {
          if (!dead) setFailed(true);
        });
    }, 0);
    return () => {
      dead = true;
      window.clearTimeout(timer);
      stop();
    };
  }, [modelId, color, name]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        This browser could not start the 3D model.
      </div>
    );
  }

  return <div ref={host} className="h-full w-full" />;
}
