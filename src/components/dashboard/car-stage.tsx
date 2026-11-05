"use client";

import { useEffect, useRef, useState } from "react";
import type { ModelId } from "@/lib/car-photos";

type ThreeNS = typeof import("three");

interface Spec {
  length: number;
  width: number;
  body: number;
  cabin: number;
  nose: number;
  tail: number;
  wheel: number;
  wedge: boolean;
}

const SPECS: Record<ModelId, Spec> = {
  "model-3": { length: 2.32, width: 1.02, body: 0.42, cabin: 0.36, nose: 0.34, tail: 0.28, wheel: 0.27, wedge: false },
  "model-y": { length: 2.26, width: 1.08, body: 0.5, cabin: 0.42, nose: 0.3, tail: 0.24, wheel: 0.3, wedge: false },
  "model-s": { length: 2.55, width: 1.04, body: 0.4, cabin: 0.34, nose: 0.36, tail: 0.3, wheel: 0.27, wedge: false },
  "model-x": { length: 2.48, width: 1.1, body: 0.5, cabin: 0.4, nose: 0.32, tail: 0.26, wheel: 0.3, wedge: false },
  cybertruck: { length: 2.62, width: 1.14, body: 0.58, cabin: 0.42, nose: 0.2, tail: 0.36, wheel: 0.34, wedge: true },
};

function profile(THREE: ThreeNS, spec: Spec) {
  const half = spec.length / 2;
  const floor = spec.wheel * 0.55;
  const belt = floor + spec.body;
  const roof = belt + spec.cabin * 0.72;
  const nose = -half;
  const tail = half;
  const hood = nose + spec.length * spec.nose;
  const roofStart = hood + spec.length * 0.12;
  const roofEnd = tail - spec.length * spec.tail;
  const shape = new THREE.Shape();
  if (spec.wedge) {
    shape.moveTo(nose, floor);
    shape.lineTo(nose + 0.12, belt * 0.92);
    shape.lineTo(hood, belt);
    shape.lineTo(roofStart, roof);
    shape.lineTo(roofEnd, roof);
    shape.lineTo(tail - 0.05, belt * 0.78);
    shape.lineTo(tail, floor + 0.06);
    shape.lineTo(nose, floor);
    return shape;
  }
  shape.moveTo(nose, floor);
  shape.lineTo(nose + 0.05, belt * 0.62);
  shape.quadraticCurveTo(hood - 0.2, belt, hood, belt);
  shape.quadraticCurveTo(roofStart - 0.08, belt + 0.02, roofStart, roof * 0.96);
  shape.lineTo(roofEnd, roof);
  shape.quadraticCurveTo(roofEnd + 0.16, roof * 0.72, tail - 0.04, belt * 0.82);
  shape.lineTo(tail, floor + 0.05);
  shape.lineTo(nose, floor);
  return shape;
}

function buildCar(THREE: ThreeNS, modelId: ModelId, hex: string) {
  const spec = SPECS[modelId];
  const group = new THREE.Group();
  const bins: Array<{ dispose: () => void }> = [];
  function keep<T extends { dispose: () => void }>(item: T): T {
    bins.push(item);
    return item;
  }
  const paint = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex),
    metalness: spec.wedge ? 0.9 : 0.45,
    roughness: spec.wedge ? 0.32 : 0.2,
    clearcoat: spec.wedge ? 0.2 : 0.85,
    clearcoatRoughness: 0.18,
  });
  keep(paint);
  const bodyGeom = new THREE.ExtrudeGeometry(profile(THREE, spec), {
    depth: spec.width,
    bevelEnabled: !spec.wedge,
    bevelThickness: 0.035,
    bevelSize: 0.045,
    bevelSegments: 2,
    curveSegments: spec.wedge ? 1 : 10,
  });
  bodyGeom.translate(0, 0, -spec.width / 2);
  keep(bodyGeom);
  const body = new THREE.Mesh(bodyGeom, paint);
  group.add(body);

  const glass = new THREE.MeshStandardMaterial({
    color: 0x102028,
    metalness: 0.7,
    roughness: 0.08,
    transparent: true,
    opacity: 0.72,
  });
  keep(glass);
  const cabin = new THREE.Mesh(
    keep(new THREE.BoxGeometry(spec.length * (spec.wedge ? 0.34 : 0.4), spec.cabin * 0.48, spec.width * 0.78)),
    glass,
  );
  cabin.position.set(spec.length * (spec.wedge ? -0.02 : 0.02), spec.wheel * 0.55 + spec.body + spec.cabin * 0.22, 0);
  group.add(cabin);

  const lamp = new THREE.MeshStandardMaterial({ color: 0xf4f7ff, emissive: 0xdbe7ff, emissiveIntensity: 0.8 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8d1020, emissive: 0xe31937, emissiveIntensity: 0.7 });
  keep(lamp);
  keep(tail);
  const head = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.06, spec.width * 0.72)), lamp);
  head.position.set(-spec.length / 2 + 0.04, spec.wheel * 0.55 + spec.body * 0.72, 0);
  const rear = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.05, spec.width * 0.7)), tail);
  rear.position.set(spec.length / 2 - 0.03, spec.wheel * 0.55 + spec.body * 0.7, 0);
  group.add(head, rear);

  const tireMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.7, metalness: 0.1 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.85, roughness: 0.25 });
  keep(tireMat);
  keep(rimMat);
  const tireGeom = new THREE.CylinderGeometry(spec.wheel, spec.wheel, 0.16, 28);
  const rimGeom = new THREE.CylinderGeometry(spec.wheel * 0.62, spec.wheel * 0.62, 0.17, 20);
  tireGeom.rotateX(Math.PI / 2);
  rimGeom.rotateX(Math.PI / 2);
  keep(tireGeom);
  keep(rimGeom);
  const axle = spec.length * 0.31;
  const track = spec.width / 2 + 0.02;
  for (const x of [-axle, axle]) {
    for (const z of [-track, track]) {
      const tire = new THREE.Mesh(tireGeom, tireMat);
      const rim = new THREE.Mesh(rimGeom, rimMat);
      tire.position.set(x, spec.wheel, z);
      rim.position.set(x, spec.wheel, z);
      group.add(tire, rim);
    }
  }

  const ground = new THREE.Mesh(
    keep(new THREE.CircleGeometry(spec.length * 0.85, 40)),
    keep(new THREE.MeshBasicMaterial({ color: 0x16161a })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.01;
  group.add(ground);
  return { group, dispose: () => bins.forEach((item) => item.dispose()) };
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
      void import("three")
        .then((THREE) => {
          if (dead || !host.current) return;
          let renderer: InstanceType<ThreeNS["WebGLRenderer"]>;
          try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          } catch {
            setFailed(true);
            return;
          }
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
          camera.position.set(3.15, 1.45, 3.35);
          camera.lookAt(0, 0.55, 0);
          scene.add(new THREE.AmbientLight(0xffffff, 0.7));
          const key = new THREE.DirectionalLight(0xffffff, 2.4);
          key.position.set(4, 7, 3);
          scene.add(key);
          const rim = new THREE.DirectionalLight(0x9eb6d8, 1.5);
          rim.position.set(-5, 2.2, -3);
          scene.add(rim);
          const built = buildCar(THREE, modelId, color);
          scene.add(built.group);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
          renderer.setClearColor(0x000000, 0);
          const canvas = renderer.domElement;
          canvas.className = "h-full w-full touch-none";
          canvas.setAttribute("aria-label", `${name} 3D model`);
          host.current.replaceChildren(canvas);

          let yaw = 0.7;
          let pitch = 0.08;
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
            pitch = Math.max(-0.2, Math.min(0.45, pitch + (event.clientY - lastY) * 0.005));
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
              if (still > 50) yaw += 0.0035;
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
