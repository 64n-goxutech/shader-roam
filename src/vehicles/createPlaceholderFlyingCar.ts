import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D
} from 'three';

export function createPlaceholderFlyingCar(): Object3D {
  const root = new Group();
  root.name = 'placeholder-flying-car';

  const bodyMaterial = new MeshStandardMaterial({
    color: new Color('#e9edf0'),
    roughness: 0.34,
    metalness: 0.52
  });

  const accentMaterial = new MeshStandardMaterial({
    color: new Color('#ff6a3d'),
    roughness: 0.38,
    metalness: 0.2,
    emissive: new Color('#5c160d'),
    emissiveIntensity: 1.4
  });

  const glassMaterial = new MeshStandardMaterial({
    color: new Color('#17202d'),
    roughness: 0.18,
    metalness: 0.68
  });

  const tireMaterial = new MeshStandardMaterial({
    color: new Color('#101116'),
    roughness: 0.82,
    metalness: 0.08
  });

  const body = new Mesh(new BoxGeometry(2.15, 0.56, 4.4), bodyMaterial);
  body.position.y = 0.02;
  root.add(body);

  const cabin = new Mesh(new BoxGeometry(1.72, 0.58, 1.88), glassMaterial);
  cabin.position.set(0, 0.54, 0.3);
  root.add(cabin);

  const frontGlow = new Mesh(new BoxGeometry(1.65, 0.14, 0.08), accentMaterial);
  frontGlow.position.set(0, 0.04, -2.23);
  root.add(frontGlow);

  const rearGlow = new Mesh(new BoxGeometry(1.5, 0.12, 0.08), accentMaterial);
  rearGlow.position.set(0, 0.06, 2.23);
  root.add(rearGlow);

  for (const x of [-1.08, 1.08]) {
    for (const z of [-1.36, 1.36]) {
      const wheel = new Mesh(new CylinderGeometry(0.42, 0.42, 0.34, 20), tireMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, -0.28, z);
      root.add(wheel);
    }
  }

  return root;
}
