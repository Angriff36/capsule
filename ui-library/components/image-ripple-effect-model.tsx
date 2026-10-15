import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject, ReactElement } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useFBO, useTexture } from "@react-three/drei";
import * as THREE from "three";
import brushUrl from "../assets/brush.png";
import { fragment, vertex } from "./image-ripple-effect-shaders";

export interface Dimension {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface MousePosition {
  x: number;
  y: number;
}

const PICTURES = [
  "https://images.unsplash.com/photo-1761882725885-d3d8bd2032d1?q=80&w=687&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1761078980679-e89e25fe279b?q=80&w=687&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1761775915848-467e41c1c4db?q=80&w=689&auto=format&fit=crop",
];

function buildImages(
  viewport: { width: number; height: number },
  textures: THREE.Texture[],
) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    viewport.width / -2,
    viewport.width / 2,
    viewport.height / 2,
    viewport.height / -2,
    -1000,
    1000,
  );
  camera.position.z = 2;
  scene.add(camera);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const group = new THREE.Group();
  const xs = [-0.25, 0, 0.25];
  textures.forEach((map, i) => {
    const image = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ map }),
    );
    image.position.x = xs[i] * viewport.width;
    image.position.y = 0;
    image.position.z = 1;
    image.scale.x = viewport.width / 5;
    image.scale.y = viewport.width / 4;
    group.add(image);
  });
  scene.add(group);
  return { scene, camera };
}

const MAX = 100;

export default function Model({
  device,
  mouse,
}: {
  device: Dimension;
  mouse: MutableRefObject<MousePosition>;
}) {
  const { viewport, camera } = useThree();
  const brush = useTexture(brushUrl);
  const pictures = useTexture(PICTURES);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const prevMouse = useRef({ x: 0, y: 0 });
  const currentWave = useRef(0);
  const scene = useMemo(() => new THREE.Scene(), []);

  const uniforms = useRef({
    uDisplacement: { value: null as THREE.Texture | null },
    uTexture: { value: null as THREE.Texture | null },
    winResolution: { value: new THREE.Vector2(0, 0) },
  });

  const fboBase = useFBO(device.width, device.height);
  const fboTexture = useFBO(device.width, device.height);

  const { scene: imageScene, camera: imageCamera } = useMemo(
    () => buildImages(viewport, pictures),
    [viewport, pictures],
  );

  const meshes = useMemo<ReactElement[]>(
    () =>
      Array.from({ length: MAX }).map((_, i) => (
        <mesh
          key={i}
          position={[0, 0, 0]}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          rotation={[0, 0, Math.random()]}
          visible={false}
        >
          <planeGeometry args={[60, 60, 1, 1]} />
          <meshBasicMaterial transparent={true} map={brush} />
        </mesh>
      )),
    [brush],
  );

  useEffect(() => {
    const refs = meshRefs.current;
    return () => {
      refs.forEach((mesh) => mesh?.removeFromParent());
    };
  }, []);

  function setNewWave(x: number, y: number, wave: number) {
    const mesh = meshRefs.current[wave];
    if (mesh) {
      mesh.position.x = x;
      mesh.position.y = y;
      mesh.visible = true;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      mesh.scale.x = 1.75;
      mesh.scale.y = 1.75;
    }
  }

  function trackMousePos(x: number, y: number) {
    if (
      Math.abs(x - prevMouse.current.x) > 0.1 ||
      Math.abs(y - prevMouse.current.y) > 0.1
    ) {
      currentWave.current = (currentWave.current + 1) % MAX;
      setNewWave(x, y, currentWave.current);
    }
    prevMouse.current = { x, y };
  }

  useFrame(({ gl, scene: finalScene }) => {
    const x = mouse.current.x - device.width / 2;
    const y = -mouse.current.y + device.height / 2;
    trackMousePos(x, y);
    meshRefs.current.forEach((mesh) => {
      if (mesh && mesh.visible) {
        const material = mesh.material as THREE.MeshBasicMaterial;
        mesh.rotation.z += 0.025;
        material.opacity *= 0.95;
        mesh.scale.x = 0.98 * mesh.scale.x + 0.155;
        mesh.scale.y = 0.98 * mesh.scale.y + 0.155;
      }
    });

    if (device.width > 0 && device.height > 0) {
      // Render to base texture with meshes
      gl.setRenderTarget(fboBase);
      gl.clear();
      meshRefs.current.forEach((mesh) => {
        if (mesh && mesh.visible) scene.add(mesh);
      });
      gl.render(scene, camera);
      meshRefs.current.forEach((mesh) => {
        if (mesh && mesh.visible) scene.remove(mesh);
      });
      uniforms.current.uTexture.value = fboTexture.texture;

      gl.setRenderTarget(fboTexture);
      gl.render(imageScene, imageCamera);
      uniforms.current.uDisplacement.value = fboBase.texture;

      gl.setRenderTarget(null);
      gl.render(finalScene, camera);

      uniforms.current.winResolution.value = new THREE.Vector2(
        device.width,
        device.height,
      ).multiplyScalar(device.pixelRatio);
    }
  }, 1);

  return (
    <group>
      {meshes}
      <mesh>
        <planeGeometry args={[device.width, device.height, 1, 1]} />
        <shaderMaterial
          vertexShader={vertex}
          fragmentShader={fragment}
          transparent={true}
          uniforms={uniforms.current}
        ></shaderMaterial>
      </mesh>
    </group>
  );
}
