import { Box3, Group, MathUtils, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const bounds = new Box3();
const size = new Vector3();
const center = new Vector3();

export interface VehicleModelOptions {
  targetLength?: number;
  yawDegrees?: number;
}

export async function loadVehicleModel(
  url: string,
  options: VehicleModelOptions = {}
): Promise<Group> {
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;

  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  bounds.getSize(size);

  const sourceLength = Math.max(size.x, size.z);
  if (!Number.isFinite(sourceLength) || sourceLength <= 0) {
    throw new Error(`Vehicle model has invalid bounds: ${url}`);
  }

  const targetLength = options.targetLength ?? 5.2;
  const yawDegrees = options.yawDegrees ?? 0;
  const normalizedScale = targetLength / sourceLength;
  const sourceSize = size.toArray();

  model.scale.multiplyScalar(normalizedScale);
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  bounds.getCenter(center);
  model.position.sub(center);
  model.updateMatrixWorld(true);

  const root = new Group();
  root.name = 'toyota-ae86-visual';
  root.rotation.y = MathUtils.degToRad(yawDegrees);
  root.userData.vehicleModel = {
    url,
    sourceSize,
    normalizedScale,
    targetLength,
    yawDegrees,
    forwardAxis: '-Z'
  };
  root.add(model);

  return root;
}
