"use client";

import { useEffect, useRef, useState } from "react";
import type { ModelId } from "@/lib/car-photos";

type ThreeNS = typeof import("three");

const FILES: Record<ModelId, string> = {
  "model-3": "/models/model-3/model.glb",
  "model-y": "/models/model-y/model.glb",
  "model-s": "/models/model-s/model.glb",
  "model-x": "/models/model-x/model.glb",
  cybertruck: "/models/cybertruck/model.glb",
};

function isBodyPaint(modelId: ModelId, name: string) {
  const label = name.toLowerCase();
  if (/glass|window|tire|tyre|rim|wheel|interior|cockpit|intsub|light|lamp|led|chrome|logo|brake|caliper|stitch|carpet|speaker|screen|reflector|license|plate/.test(label)) {
    return false;
  }
  if (modelId === "model-3") return /hood|door|ln7/.test(label);
  if (modelId === "model-y") return label.includes("exterior_paint");
  if (modelId === "model-s") return label.includes("pearl_white_multi_coat");
  if (modelId === "model-x") return label.includes("carpaint");
  return label.includes("exterior_steel");
}

function applyPaint(THREE: ThreeNS, root: InstanceType<ThreeNS["Object3D"]>, modelId: ModelId, hex: string) {
  const color = new THREE.Color(hex);
  root.traverse((node) => {
    const mesh = node as InstanceType<ThreeNS["Mesh"]>;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    if (modelId === "cybertruck" && geometry) {
      const triangles = geometry.index ? geometry.index.count / 3 : (geometry.getAttribute("position")?.count ?? 0) / 3;
      if (triangles < 80) {
        mesh.visible = false;
        return;
      }
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material || !("color" in material)) continue;
      const label = (material.name || "").toLowerCase();
      if (isBodyPaint(modelId, material.name || "")) {
        const surface = material as InstanceType<ThreeNS["MeshPhysicalMaterial"]>;
        surface.color.copy(color);
        surface.map = null;
        if (modelId === "cybertruck") {
          surface.metalness = 1;
          surface.roughness = 0.22;
          surface.envMapIntensity = 1.5;
          surface.needsUpdate = true;
          continue;
        }
        const paint = new THREE.MeshPhysicalMaterial({
          color,
          metalness: 0.2,
          roughness: 0.34,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
          envMapIntensity: 1.25,
          normalMap: "normalMap" in surface ? surface.normalMap : null,
          normalScale: "normalScale" in surface ? surface.normalScale : undefined,
        });
        if (Array.isArray(mesh.material)) {
          const slot = mesh.material.indexOf(material);
          if (slot >= 0) mesh.material[slot] = paint;
        } else {
          mesh.material = paint;
        }
        continue;
      }
      if (!("envMapIntensity" in material)) continue;
      const finish = material as InstanceType<ThreeNS["MeshStandardMaterial"]>;
      if (/glass|window/.test(label)) {
        finish.envMapIntensity = 1.8;
        finish.roughness = Math.min(finish.roughness ?? 0.08, 0.06);
      } else if (/chrome|rim|wheel_finish|logo/.test(label) && !/tire|tyre/.test(label)) {
        finish.envMapIntensity = 1.45;
        finish.metalness = Math.max(finish.metalness ?? 0, 0.86);
        finish.roughness = Math.min(finish.roughness ?? 0.3, 0.26);
      }
      finish.needsUpdate = true;
    }
  });
}

function studioEnvironment(THREE: ThreeNS) {
  const scene = new THREE.Scene();
  const owned: Array<{ dispose: () => void }> = [];
  const keep = <T extends { dispose: () => void }>(item: T) => {
    owned.push(item);
    return item;
  };
  scene.add(
    new THREE.Mesh(
      keep(new THREE.SphereGeometry(16, 24, 16)),
      keep(new THREE.MeshBasicMaterial({ color: 0x222833, side: THREE.BackSide })),
    ),
  );
  const softbox = (width: number, height: number, depth: number, color: number, intensity: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(
      keep(new THREE.BoxGeometry(width, height, depth)),
      keep(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 1 })),
    );
    mesh.position.set(x, y, z);
    scene.add(mesh);
  };
  softbox(9, 0.45, 2.4, 0xffffff, 6, 0, 5.5, 0.4);
  softbox(0.5, 4.5, 2.2, 0xfff4e8, 5, -4.6, 2.4, 2.8);
  softbox(4.5, 0.4, 1.3, 0xd7e6f8, 4, 1.2, 3.2, -4.6);
  return { scene, dispose: () => owned.forEach((item) => item.dispose()) };
}

function visibleBounds(THREE: ThreeNS, root: InstanceType<ThreeNS["Object3D"]>) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    const mesh = node as InstanceType<ThreeNS["Mesh"]>;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (!bounds) return;
    box.union(bounds.clone().applyMatrix4(mesh.matrixWorld));
  });
  return box;
}

function sitOnGround(THREE: ThreeNS, root: InstanceType<ThreeNS["Object3D"]>) {
  let box = visibleBounds(THREE, root);
  let size = box.getSize(new THREE.Vector3());
  if (size.y >= size.x && size.y >= size.z) root.rotateX(Math.PI / 2);
  box = visibleBounds(THREE, root);
  size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  return size;
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
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    let stop = () => {};
    const timer = window.setTimeout(() => {
      void Promise.all([
        import("three"),
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js"),
      ])
        .then(async ([THREE, gltfMod, meshopt]) => {
          if (dead || !host.current) return;
          let renderer: InstanceType<ThreeNS["WebGLRenderer"]>;
          try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          } catch {
            setStatus("failed");
            return;
          }
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.08;
          const studio = studioEnvironment(THREE);
          const pmrem = new THREE.PMREMGenerator(renderer);
          const env = pmrem.fromScene(studio.scene, 0.03).texture;
          studio.dispose();
          const scene = new THREE.Scene();
          scene.environment = env;
          scene.environmentIntensity = 1;
          const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
          scene.add(new THREE.HemisphereLight(0xe7eef6, 0x1a1e26, 0.16));

          const loader = new gltfMod.GLTFLoader();
          await meshopt.MeshoptDecoder.ready;
          loader.setMeshoptDecoder(meshopt.MeshoptDecoder);
          const gltf = await loader.loadAsync(FILES[modelId]).catch(() => null);
          if (dead || !host.current) {
            renderer.dispose();
            env.dispose();
            pmrem.dispose();
            return;
          }
          if (!gltf) {
            renderer.dispose();
            env.dispose();
            pmrem.dispose();
            setStatus("failed");
            return;
          }
          applyPaint(THREE, gltf.scene, modelId, color);
          const size = sitOnGround(THREE, gltf.scene);
          const turntable = new THREE.Group();
          turntable.add(gltf.scene);
          scene.add(turntable);
          const span = Math.max(size.x, size.z);
          const key = new THREE.DirectionalLight(0xfffaf6, 0.7);
          key.position.set(span * 0.85, span * 1.25, span * 0.7);
          const rimLight = new THREE.DirectionalLight(0xd5e3f6, 0.55);
          rimLight.position.set(-span * 0.35, span * 0.9, -span * 1.2);
          scene.add(key, rimLight);
          camera.position.set(span * 0.72, size.y * 0.72, span * 1.05);
          camera.near = span / 200;
          camera.far = span * 20;
          camera.lookAt(0, size.y * 0.38, 0);
          camera.updateProjectionMatrix();

          const blot = document.createElement("canvas");
          blot.width = 256;
          blot.height = 256;
          const ink = blot.getContext("2d");
          if (ink) {
            const shade = ink.createRadialGradient(128, 128, 24, 128, 128, 128);
            shade.addColorStop(0, "rgba(0,0,0,0.72)");
            shade.addColorStop(0.45, "rgba(0,0,0,0.28)");
            shade.addColorStop(1, "rgba(0,0,0,0)");
            ink.fillStyle = shade;
            ink.fillRect(0, 0, 256, 256);
          }
          const floor = new THREE.Mesh(
            new THREE.CircleGeometry(span * 0.58, 48),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blot), transparent: true, depthWrite: false }),
          );
          floor.rotation.x = -Math.PI / 2;
          floor.position.y = 0.001;
          scene.add(floor);

          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
          renderer.setClearColor(0x000000, 0);
          const canvas = renderer.domElement;
          canvas.className = "h-full w-full touch-none";
          canvas.setAttribute("aria-label", `${name} 3D model`);
          host.current.replaceChildren(canvas);
          setStatus("ready");

          let yaw = 0.55;
          let pitch = 0.04;
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
            pitch = Math.max(-0.35, Math.min(0.45, pitch + (event.clientY - lastY) * 0.004));
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
            turntable.rotation.order = "YXZ";
            turntable.rotation.y = yaw;
            turntable.rotation.x = pitch;
            renderer.render(scene, camera);
          });
          stop = () => {
            observer.disconnect();
            canvas.removeEventListener("pointerdown", down);
            canvas.removeEventListener("pointermove", move);
            canvas.removeEventListener("pointerup", up);
            canvas.removeEventListener("pointercancel", up);
            renderer.setAnimationLoop(null);
            gltf.scene.traverse((node) => {
              const mesh = node as InstanceType<ThreeNS["Mesh"]>;
              if (!mesh.isMesh) return;
              mesh.geometry?.dispose();
              const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              materials.forEach((material) => material?.dispose());
            });
            floor.geometry.dispose();
            const floorMaterial = floor.material as InstanceType<ThreeNS["MeshBasicMaterial"]>;
            floorMaterial.map?.dispose();
            floorMaterial.dispose();
            env.dispose();
            pmrem.dispose();
            renderer.dispose();
            canvas.remove();
          };
        })
        .catch(() => {
          if (!dead) setStatus("failed");
        });
    }, 0);
    return () => {
      dead = true;
      window.clearTimeout(timer);
      stop();
    };
  }, [modelId, color, name]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full" />
      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {status === "failed" ? "This browser could not load the 3D model." : "Loading the model."}
        </div>
      )}
    </div>
  );
}
