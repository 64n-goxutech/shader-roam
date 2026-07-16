import { Box3, MathUtils, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';

export const ae86WheelNodeNames = [
  'Circle005_10',
  'Circle001_11',
  'Circle002_12',
  'Circle003_13'
] as const;

interface WheelBinding {
  node: Object3D;
  baseQuaternion: Quaternion;
  radius: number;
  spinSign: 1 | -1;
  spinRadians: number;
}

const fullTurn = Math.PI * 2;
const localSpinAxis = new Vector3(1, 0, 0);
const fallbackWheelRadius = 0.36;

export class VehicleWheelAnimator {
  readonly wheelNodes: readonly Object3D[];

  private readonly expectedNodeNames: readonly string[];
  private readonly missingNodeNames: string[] = [];
  private readonly bindings: WheelBinding[] = [];
  private readonly spinQuaternion = new Quaternion();

  constructor(
    modelRoot: Object3D,
    expectedNodeNames: readonly string[] = ae86WheelNodeNames
  ) {
    this.expectedNodeNames = expectedNodeNames;
    modelRoot.updateWorldMatrix(true, true);

    const axleReference = modelRoot.parent ?? modelRoot;
    const referenceQuaternion = axleReference.getWorldQuaternion(new Quaternion());
    const referenceAxis = localSpinAxis.clone().applyQuaternion(referenceQuaternion).normalize();

    for (const nodeName of expectedNodeNames) {
      const node = modelRoot.getObjectByName(nodeName);
      if (!node) {
        this.missingNodeNames.push(nodeName);
        continue;
      }

      const nodeAxis = localSpinAxis
        .clone()
        .applyQuaternion(node.getWorldQuaternion(new Quaternion()))
        .normalize();

      this.bindings.push({
        node,
        baseQuaternion: node.quaternion.clone(),
        radius: measureWheelRadius(node),
        spinSign: nodeAxis.dot(referenceAxis) >= 0 ? 1 : -1,
        spinRadians: 0
      });
    }

    this.wheelNodes = this.bindings.map((binding) => binding.node);
  }

  update(dt: number, linearSpeed: number): void {
    if (!Number.isFinite(dt) || !Number.isFinite(linearSpeed) || dt <= 0) {
      return;
    }

    const travelDistance = linearSpeed * dt;
    for (const binding of this.bindings) {
      binding.spinRadians = MathUtils.euclideanModulo(
        binding.spinRadians + travelDistance / binding.radius,
        fullTurn
      );
      this.spinQuaternion.setFromAxisAngle(
        localSpinAxis,
        binding.spinRadians * binding.spinSign
      );
      binding.node.quaternion.copy(binding.baseQuaternion).multiply(this.spinQuaternion);
    }
  }

  getDiagnostics() {
    return {
      active: this.bindings.length > 0,
      expectedNodeNames: [...this.expectedNodeNames],
      foundNodeNames: this.bindings.map((binding) => binding.node.name),
      missingNodeNames: [...this.missingNodeNames],
      wheels: this.bindings.map((binding) => ({
        name: binding.node.name,
        radius: binding.radius,
        spinSign: binding.spinSign,
        spinRadians: binding.spinRadians
      }))
    };
  }
}

function measureWheelRadius(node: Object3D): number {
  const localBounds = new Box3().makeEmpty();
  const geometryBounds = new Box3();
  const relativeMatrix = new Matrix4();
  const inverseWheelMatrix = new Matrix4().copy(node.matrixWorld).invert();

  node.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    child.geometry.computeBoundingBox();
    if (!child.geometry.boundingBox) {
      return;
    }

    relativeMatrix.multiplyMatrices(inverseWheelMatrix, child.matrixWorld);
    geometryBounds.copy(child.geometry.boundingBox).applyMatrix4(relativeMatrix);
    localBounds.union(geometryBounds);
  });

  if (localBounds.isEmpty()) {
    return fallbackWheelRadius;
  }

  const size = localBounds.getSize(new Vector3());
  const worldScale = node.getWorldScale(new Vector3());
  const diameterY = Math.abs(size.y * worldScale.y);
  const diameterZ = Math.abs(size.z * worldScale.z);
  const radius = (diameterY + diameterZ) * 0.25;

  return Number.isFinite(radius) && radius > 0 ? radius : fallbackWheelRadius;
}
