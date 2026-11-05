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
      if (!material || !("color" in material) || !isBodyPaint(modelId, material.name || "")) continue;
      const surface = material as InstanceType<ThreeNS["MeshPhysicalMaterial"]>;
      surface.color.copy(color);
      surface.map = null;
      if (modelId === "cybertruck") {
        surface.metalness = 1;
        surface.roughness = 0.32;
      } else {
        surface.metalness = Math.max(surface.metalness ?? 0, 0.2);
        surface.roughness = Math.min(surface.roughness ?? 0.35, 0.45);
        if ("clearcoat" in surface) {
          surface.clearcoat = 1;
          surface.clearcoatRoughness = 0.1;
        }
      }
      surface.envMapIntensity = 1;
      surface.needsUpdate = true;
    }
  });
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
        import("three/examples/jsm/environments/RoomEnvironment.js"),
      ])
        .then(async ([THREE, gltfMod, meshopt, room]) => {
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
          renderer.toneMappingExposure = 1.05;
          const pmrem = new THREE.PMREMGenerator(renderer);
          const env = pmrem.fromScene(new room.RoomEnvironment(), 0.04).texture;
          const scene = new THREE.Scene();
          scene.environment = env;
          const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
          scene.add(new THREE.AmbientLight(0xffffff, 0.45));
          const key = new THREE.DirectionalLight(0xfff6ee, 2.4);
          key.position.set(4, 6, 3);
          scene.add(key);
          const rim = new THREE.DirectionalLight(0xb9c7dc, 1.2);
          rim.position.set(-4, 2.4, -3);
          scene.add(rim);

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
          camera.position.set(span * 0.72, size.y * 0.72, span * 1.05);
          camera.near = span / 200;
          camera.far = span * 20;
          camera.lookAt(0, size.y * 0.38, 0);
          camera.updateProjectionMatrix();

          const shadow = new THREE.Mesh(
            new THREE.CircleGeometry(span * 0.42, 48),
            new THREE.MeshBasicMaterial({ color: "#050506", transparent: true, opacity: 0.45 }),
          );
          shadow.rotation.x = -Math.PI / 2;
          shadow.position.y = 0.001;
          scene.add(shadow);

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
            shadow.geometry.dispose();
            (shadow.material as InstanceType<ThreeNS["Material"]>).dispose();
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
