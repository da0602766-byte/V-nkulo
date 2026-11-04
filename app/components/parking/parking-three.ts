import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { ParkingScene } from "../../lib/parking-scene";

export type SceneRenderOptions = {
  scene: ParkingScene;
  selected: string[];
  states: Record<string, string>;
  editing: boolean;
  top: boolean;
  move: boolean;
  snap: boolean;
  onSelect: (id: string, add: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onError: () => void;
};
export function mountParkingRenderer(
  host: HTMLElement,
  initial: SceneRenderOptions,
) {
  let options = initial,
    signature = "",
    frame = 0,
    disposed = false,
    sceneGroup = new THREE.Group(),
    surface: THREE.CanvasTexture | null = null;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor("#f1f1f8", 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "Maquete do estacionamento. Use a lista para navegação por teclado.",
  );
  const world = new THREE.Scene();
  world.add(sceneGroup);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 6000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.minDistance = 8;
  controls.maxDistance = 2200;
  controls.enablePan = true;
  const ambient = new THREE.HemisphereLight("#ffffff", "#7f8797", 2);
  world.add(ambient);
  const sun = new THREE.DirectionalLight("#fff4dd", 3);
  sun.position.set(-30, 80, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.001;
  world.add(sun);
  world.add(sun.target);
  const geometries = {
    box: new RoundedBoxGeometry(1, 1, 1, 2, 0.08),
    sphere: new THREE.IcosahedronGeometry(1, 2),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  };
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: string) => {
    let m = materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      materials.set(color, m);
    }
    return m;
  };
  const ring = new THREE.Mesh(
    geometries.box,
    new THREE.MeshBasicMaterial({
      color: "#8b5cf6",
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  world.add(ring);
  ring.visible = false;
  let animateUntil = 0;
  let cameraMotion: {
    start: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    targetFrom: THREE.Vector3;
    targetTo: THREE.Vector3;
  } | null = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const invalidate = () => {
    if (!disposed && !frame && document.visibilityState === "visible")
      frame = requestAnimationFrame(() => {
        frame = 0;
        const now = performance.now();
        if (cameraMotion) {
          const t = Math.min(1, (now - cameraMotion.start) / 280),
            ease = 1 - (1 - t) ** 3;
          camera.position.lerpVectors(cameraMotion.from, cameraMotion.to, ease);
          controls.target.lerpVectors(
            cameraMotion.targetFrom,
            cameraMotion.targetTo,
            ease,
          );
          controls.update();
          if (t === 1) cameraMotion = null;
        }
        (ring.material as THREE.MeshBasicMaterial).opacity =
          animateUntil > now
            ? 0.18 + 0.16 * (1 - (animateUntil - now) / 220)
            : 0.34;
        renderer.render(world, camera);
        if (now < animateUntil || cameraMotion) invalidate();
      });
  };
  controls.addEventListener("change", invalidate);
  const resize = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  function reset() {
    cameraMotion = null;
    const s = options.scene;
    resize();
    const radius = Math.hypot(s.width, s.depth) / 2;
    const distance =
      (radius /
        Math.sin((camera.fov * Math.PI) / 360) /
        Math.min(1, camera.aspect)) *
      1.1;
    const a = (s.angle * Math.PI) / 180;
    controls.target.set(s.width / 2, 0, s.depth / 2);
    const direction = new THREE.Vector3(
      Math.sin(a) * 0.65,
      1,
      Math.cos(a) * 0.65,
    ).normalize();
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    controls.enableRotate = !options.top;
    controls.update();
    invalidate();
  }

  function rebuild() {
    world.remove(sceneGroup);
    sceneGroup.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    sceneGroup = new THREE.Group();
    world.add(sceneGroup);
    surface?.dispose();
    const s = options.scene,
      canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2048;
    const ctx = canvas.getContext("2d")!;
    const sx = canvas.width / s.width,
      sy = canvas.height / s.depth;
    ctx.fillStyle = s.ground;
    ctx.fillRect(0, 0, 2048, 2048);
    for (let i = 0; i < 18000; i++) {
      ctx.fillStyle = i % 2 ? "#ffffff08" : "#00000009";
      ctx.fillRect((i * 173) % 2048, (i * 467) % 2048, 2, 2);
    }
    ctx.scale(sx, sy);
    const batches = new Map<
      string,
      {
        geometry: keyof typeof geometries;
        color: string;
        matrices: THREE.Matrix4[];
      }
    >();
    const temp = new THREE.Object3D();
    const add = (
      geometry: keyof typeof geometries,
      color: string,
      x: number,
      h: number,
      y: number,
      w: number,
      height: number,
      d: number,
      r = 0,
    ) => {
      const key = geometry + color;
      let batch = batches.get(key);
      if (!batch) {
        batch = { geometry, color, matrices: [] };
        batches.set(key, batch);
      }
      temp.position.set(x, h, y);
      temp.rotation.set(0, (-r * Math.PI) / 180, 0);
      temp.scale.set(w, height, d);
      temp.updateMatrix();
      batch.matrices.push(temp.matrix.clone());
    };
    add(
      "box",
      "#bdc3cf",
      s.width / 2,
      -0.28,
      s.depth / 2,
      s.width + 0.8,
      0.5,
      s.depth + 0.8,
    );
    // Ground markings share one texture; repeated models share instanced geometry.
    for (const o of [...s.objects].sort(
      (a, b) => Number(a.kind === "space") - Number(b.kind === "space"),
    )) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate((o.rotation * Math.PI) / 180);
      const w = o.width,
        d = o.depth;
      if (o.kind === "space") {
        const state = options.states[o.id] || "available";
        ctx.fillStyle =
          o.spaceType === "PCD"
            ? "#376eaf"
            : state === "reserved"
              ? "#8a6d35"
              : state === "blocked"
                ? "#555967"
                : "#4c545d";
        ctx.fillRect(-w / 2, -d / 2, w, d);
        ctx.strokeStyle = "#f2f2ee";
        ctx.lineWidth = 0.07;
        ctx.strokeRect(-w / 2, -d / 2, w, d);
        ctx.fillStyle =
          state === "occupied"
            ? "#b5bdce"
            : state === "reserved"
              ? "#f4bc55"
              : state === "blocked"
                ? "#bec1c9"
                : "#9edc9a";
        ctx.beginPath();
        ctx.arc(0, 0, 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = "bold .55px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(o.name, 0, d / 2 - 0.35, w - 0.2);
        if (o.spaceType === "PCD")
          ctx.fillText("PCD", 0, -d / 2 + 0.7, w - 0.2);
        if (state === "occupied") {
          ctx.fillStyle = "#00000035";
          ctx.beginPath();
          ctx.ellipse(0.2, 0.1, w * 0.48, d * 0.43, 0, 0, Math.PI * 2);
          ctx.fill();
          const r = (o.rotation * Math.PI) / 180,
            part = (
              color: string,
              dx: number,
              dz: number,
              h: number,
              pw: number,
              ph: number,
              pd: number,
            ) =>
              add(
                "box",
                color,
                o.x + dx * Math.cos(r) - dz * Math.sin(r),
                h,
                o.y + dx * Math.sin(r) + dz * Math.cos(r),
                pw,
                ph,
                pd,
                o.rotation,
              );
          const palette = ["#dce2e9", "#718ca7", "#525f73", "#d2c9bd"];
          const paint =
            o.color === "#e4e7ee"
              ? palette[o.id.charCodeAt(o.id.length - 1) % palette.length]
              : o.color;
          part("#202732", 0, 0, 0.3, w * 0.76, 0.32, d * 0.75);
          part(paint, 0, 0, 0.64, w * 0.78, 0.65, d * 0.74);
          part("#243c53", 0, 0, 1.04, w * 0.63, 0.5, d * 0.38);
          part(paint, 0, 0.03, 1.3, w * 0.58, 0.09, d * 0.25);
          for (const side of [-1, 1])
            for (const end of [-1, 1])
              part(
                "#20252c",
                side * w * 0.38,
                end * d * 0.23,
                0.29,
                0.23,
                0.48,
                0.6,
              );
          for (const side of [-1, 1]) {
            part(
              "#f8f0cc",
              side * w * 0.23,
              -d * 0.37,
              0.68,
              w * 0.19,
              0.12,
              0.06,
            );
            part(
              "#b45158",
              side * w * 0.23,
              d * 0.37,
              0.68,
              w * 0.18,
              0.12,
              0.06,
            );
          }
        }
      } else if (
        o.kind === "road" ||
        o.kind === "crosswalk" ||
        o.kind === "arrow"
      ) {
        ctx.fillStyle = o.color;
        if (o.kind === "crosswalk") {
          for (let x = -w / 2; x < w / 2; x += 0.7)
            ctx.fillRect(x, -d / 2, 0.35, d);
        } else if (o.kind === "arrow") {
          ctx.beginPath();
          ctx.moveTo(0, -d / 2);
          ctx.lineTo(w / 2, 0);
          ctx.lineTo(w / 5, 0);
          ctx.lineTo(w / 5, d / 2);
          ctx.lineTo(-w / 5, d / 2);
          ctx.lineTo(-w / 5, 0);
          ctx.lineTo(-w / 2, 0);
          ctx.closePath();
          ctx.fill();
        } else ctx.fillRect(-w / 2, -d / 2, w, d);
      } else if (o.kind === "tree") {
        ctx.fillStyle = "#00000028";
        ctx.beginPath();
        ctx.ellipse(0.5, 0.6, w * 0.7, d * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        add(
          "cylinder",
          "#826749",
          o.x,
          o.height * 0.28,
          o.y,
          0.3,
          o.height * 0.55,
          0.3,
        );
        add(
          "sphere",
          o.color,
          o.x,
          o.height * 0.72,
          o.y,
          w * 0.55,
          o.height * 0.4,
          d * 0.55,
        );
        add(
          "sphere",
          "#76a36a",
          o.x + w * 0.15,
          o.height * 0.9,
          o.y,
          w * 0.35,
          o.height * 0.25,
          d * 0.35,
        );
      } else if (o.kind === "lamp") {
        add("cylinder", o.color, o.x, o.height / 2, o.y, w, o.height, d);
        add("box", "#fff2ca", o.x, o.height, o.y, 1, 0.2, 0.6, o.rotation);
      } else if (o.kind === "sign") {
        add(
          "cylinder",
          "#8c95a5",
          o.x,
          o.height / 2,
          o.y,
          0.15,
          o.height,
          0.15,
        );
        add("box", o.color, o.x, o.height, o.y, w, 0.8, d, o.rotation);
        ctx.fillStyle = "#fff";
        ctx.font = ".7px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(o.name, 0, d + 1, 8);
      } else {
        add("box", o.color, o.x, o.height / 2, o.y, w, o.height, d, o.rotation);
        if (o.kind === "planter")
          add(
            "box",
            "#648f55",
            o.x,
            o.height + 0.1,
            o.y,
            w * 0.9,
            0.2,
            d * 0.8,
            o.rotation,
          );
      }
      ctx.restore();
    }
    surface = new THREE.CanvasTexture(canvas);
    surface.colorSpace = THREE.SRGBColorSpace;
    surface.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(s.width, s.depth),
      new THREE.MeshStandardMaterial({ map: surface, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(s.width / 2, 0.005, s.depth / 2);
    ground.receiveShadow = true;
    sceneGroup.add(ground);
    for (const batch of batches.values()) {
      const mesh = new THREE.InstancedMesh(
        geometries[batch.geometry],
        material(batch.color),
        batch.matrices.length,
      );
      batch.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      sceneGroup.add(mesh);
    }
    ambient.intensity = s.light * 1.5;
    sun.intensity = s.light * 2;
    sun.position.set(s.width / 2 - 35, 100, s.depth / 2 + 30);
    sun.target.position.set(s.width / 2, 0, s.depth / 2);
    const bound = Math.max(s.width, s.depth);
    sun.shadow.camera.left = -bound;
    sun.shadow.camera.right = bound;
    sun.shadow.camera.top = bound;
    sun.shadow.camera.bottom = -bound;
    sun.shadow.camera.far = 2000;
    sun.shadow.camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }
  const ray = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    point = new THREE.Vector3();
  function groundPoint(e: PointerEvent) {
    camera.updateMatrixWorld();
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    return ray.ray.intersectPlane(plane, point)
      ? { x: point.x, y: point.z }
      : null;
  }
  function hit(p: { x: number; y: number }) {
    return [...options.scene.objects].reverse().find((o) => {
      if (!options.editing && o.kind !== "space") return false;
      const r = (-o.rotation * Math.PI) / 180,
        x = p.x - o.x,
        y = p.y - o.y;
      return (
        Math.abs(x * Math.cos(r) - y * Math.sin(r)) <= o.width / 2 &&
        Math.abs(x * Math.sin(r) + y * Math.cos(r)) <= o.depth / 2
      );
    });
  }
  let drag: {
    pointerId: number;
    id: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    x: number;
    y: number;
    moving: boolean;
  } | null = null;
  const down = (e: PointerEvent) => {
    cameraMotion = null;
    if (!e.isPrimary) {
      if (drag?.moving) e.stopImmediatePropagation();
      else drag = null;
      return;
    }
    if (e.button !== 0) return;
    const p = groundPoint(e),
      o = p && hit(p);
    if (!o || !p) return;
    const moving = options.editing && options.move && !o.locked;
    drag = {
      pointerId: e.pointerId,
      id: o.id,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: p.x - o.x,
      offsetY: p.y - o.y,
      x: o.x,
      y: o.y,
      moving,
    };
    if (moving) {
      controls.enabled = false;
      renderer.domElement.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
    }
  };
  const move = (e: PointerEvent) => {
    if (drag && drag.pointerId !== e.pointerId) return;
    if (!drag?.moving) {
      const p = groundPoint(e),
        o = p && hit(p);
      const labels: Record<string, string> = {
        available: "Disponível",
        reserved: "Reservada",
        occupied: "Ocupada",
        blocked: "Bloqueada",
      };
      renderer.domElement.title = o
        ? `${o.name}${o.kind === "space" ? " · " + (labels[options.states[o.id]] || "Disponível") : ""}`
        : "";
      return;
    }
    const p = groundPoint(e);
    if (!p) return;
    const round = (n: number) => (options.snap ? Math.round(n * 2) / 2 : n);
    drag.x = Math.max(
      0,
      Math.min(options.scene.width, round(p.x - drag.offsetX)),
    );
    drag.y = Math.max(
      0,
      Math.min(options.scene.depth, round(p.y - drag.offsetY)),
    );
    ring.visible = true;
    ring.position.set(drag.x, 0.08, drag.y);
    invalidate();
  };
  const up = (e: PointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const d = drag;
    drag = null;
    controls.enabled = true;
    const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5;
    if (d.moving && moved) options.onMove(d.id, d.x, d.y);
    else if (!moved) options.onSelect(d.id, e.shiftKey);
    invalidate();
  };
  const cancel = (e: PointerEvent) => {
    if (drag && drag.pointerId !== e.pointerId) return;
    drag = null;
    controls.enabled = true;
    update(options);
  };
  const lost = (e: Event) => {
    e.preventDefault();
    options.onError();
  };
  renderer.domElement.addEventListener("pointerdown", down, true);
  renderer.domElement.addEventListener("pointermove", move);
  renderer.domElement.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("pointercancel", cancel);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", invalidate);
  function update(next: SceneRenderOptions) {
    const resetCamera =
      options.top !== next.top ||
      options.scene.width !== next.scene.width ||
      options.scene.depth !== next.scene.depth ||
      options.scene.angle !== next.scene.angle;
    if (options.selected.join() !== next.selected.join() && !reduced)
      animateUntil = performance.now() + 220;
    options = next;
    const sig = JSON.stringify([next.scene, next.states]);
    if (sig !== signature) {
      signature = sig;
      sceneGroup.traverse((o) => {
        if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      rebuild();
    }
    const selected = next.scene.objects.find((o) =>
      next.selected.includes(o.id),
    );
    ring.visible = !!selected;
    if (selected) {
      ring.position.set(selected.x, 0.08, selected.y);
      ring.scale.set(selected.width + 0.15, 0.08, selected.depth + 0.15);
      ring.rotation.y = (-selected.rotation * Math.PI) / 180;
    }
    if (resetCamera) reset();
    invalidate();
  }
  update(initial);
  reset();
  return {
    update,
    reset,
    focus: () => {
      const o = options.scene.objects.find((o) =>
        options.selected.includes(o.id),
      );
      if (!o) return;
      const targetTo = new THREE.Vector3(o.x, 0, o.y);
      const to = camera.position
        .clone()
        .sub(controls.target)
        .normalize()
        .multiplyScalar(Math.max(20, o.width * 3, o.depth * 3))
        .add(targetTo);
      if (reduced) {
        controls.target.copy(targetTo);
        camera.position.copy(to);
        controls.update();
      } else
        cameraMotion = {
          start: performance.now(),
          from: camera.position.clone(),
          to,
          targetFrom: controls.target.clone(),
          targetTo,
        };
      invalidate();
    },
    zoom: (factor: number) => {
      camera.position
        .sub(controls.target)
        .multiplyScalar(factor)
        .add(controls.target);
      controls.update();
      invalidate();
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", invalidate);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", down, true);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", cancel);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      sceneGroup.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
        else if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (!Array.isArray(o.material)) o.material.dispose();
        }
      });
      Object.values(geometries).forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      (ring.material as THREE.Material).dispose();
      surface?.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
