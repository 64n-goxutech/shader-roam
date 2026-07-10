import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector3
} from 'three';
import type { QualityLevel, VehicleState } from '../engine/types';

export const motionReferenceVersion = 'motion-reference-2026-07-10.2';

interface MotionReferenceProfile {
  moteCount: number;
  wispCount: number;
  markerPairCount: number;
  buildingCount: number;
}

interface WispState {
  position: Vector3;
  width: number;
  length: number;
  angleOffset: number;
}

interface RouteState {
  position: Vector3;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  rotation: Quaternion;
}

interface BuildingState {
  position: Vector3;
  scale: Vector3;
  rotation: Quaternion;
}

const motionReferenceProfiles: Record<QualityLevel, MotionReferenceProfile> = {
  low: {
    moteCount: 96,
    wispCount: 18,
    markerPairCount: 26,
    buildingCount: 48
  },
  medium: {
    moteCount: 144,
    wispCount: 26,
    markerPairCount: 34,
    buildingCount: 64
  },
  high: {
    moteCount: 192,
    wispCount: 34,
    markerPairCount: 42,
    buildingCount: 82
  }
};

const localForward = new Vector3(0, 0, -1);
const localRight = new Vector3(1, 0, 0);
const worldUp = new Vector3(0, 1, 0);
const localZ = new Vector3(0, 0, 1);

const warmLight = new Color('#ffb06f');
const coolLight = new Color('#7fd5e8');
const roseLight = new Color('#e98aa8');
const cloudWarm = new Color('#cf806f');
const cloudCool = new Color('#718aa0');
const buildingColors = [new Color('#171522'), new Color('#21182b'), new Color('#10242a')];

export interface MotionReferenceFieldOptions {
  quality: QualityLevel;
}

export class MotionReferenceField {
  readonly root = new Group();

  private readonly scene: Scene;
  private readonly profile: MotionReferenceProfile;
  private readonly motes: Points<BufferGeometry, ShaderMaterial>;
  private readonly motePositions: Float32Array;
  private readonly motePositionAttribute: BufferAttribute;
  private readonly moteMaterial: ShaderMaterial;
  private readonly wisps: InstancedMesh<PlaneGeometry, ShaderMaterial>;
  private readonly wispMaterial: ShaderMaterial;
  private readonly wispStates: WispState[];
  private readonly routeMarkers: InstancedMesh<BoxGeometry, MeshBasicMaterial>;
  private readonly markerStates: RouteState[];
  private readonly markerRecycleFlags: boolean[];
  private readonly buildings: InstancedMesh<BoxGeometry, MeshBasicMaterial>;
  private readonly buildingCaps: InstancedMesh<BoxGeometry, MeshBasicMaterial>;
  private readonly buildingStates: BuildingState[];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];

  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly relative = new Vector3();
  private readonly cameraRelative = new Vector3();
  private readonly inverseCameraRotation = new Quaternion();
  private readonly billboardRotation = new Quaternion();
  private readonly rollRotation = new Quaternion();
  private readonly frameMatrix = new Matrix4();
  private readonly frameRotation = new Quaternion();
  private readonly dummy = new Object3D();
  private readonly tempPosition = new Vector3();
  private readonly vehiclePosition = new Vector3();

  private initialized = false;
  private randomState = 0x6d2b79f5;
  private recycleCount = 0;
  private speedRatio = 0;

  constructor(scene: Scene, options: MotionReferenceFieldOptions) {
    this.scene = scene;
    this.profile = motionReferenceProfiles[options.quality];
    this.root.name = 'MotionReferenceField';

    const moteGeometry = new BufferGeometry();
    this.motePositions = new Float32Array(this.profile.moteCount * 3);
    this.motePositionAttribute = new BufferAttribute(this.motePositions, 3);
    moteGeometry.setAttribute('position', this.motePositionAttribute);

    const moteScale = new Float32Array(this.profile.moteCount);
    const motePhase = new Float32Array(this.profile.moteCount);
    const moteWarmth = new Float32Array(this.profile.moteCount);
    for (let index = 0; index < this.profile.moteCount; index += 1) {
      moteScale[index] = this.randomRange(4, 10);
      motePhase[index] = this.randomRange(0, Math.PI * 2);
      moteWarmth[index] = this.random();
    }
    moteGeometry.setAttribute('aScale', new BufferAttribute(moteScale, 1));
    moteGeometry.setAttribute('aPhase', new BufferAttribute(motePhase, 1));
    moteGeometry.setAttribute('aWarmth', new BufferAttribute(moteWarmth, 1));
    this.moteMaterial = createMoteMaterial();
    this.motes = new Points(moteGeometry, this.moteMaterial);
    this.motes.name = 'NearFlowLightMotes';
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 3;
    this.root.add(this.motes);

    const wispGeometry = new PlaneGeometry(1, 1);
    this.wispMaterial = createWispMaterial();
    this.wisps = new InstancedMesh(wispGeometry, this.wispMaterial, this.profile.wispCount);
    this.wisps.name = 'NearFlowCloudWisps';
    this.wisps.instanceMatrix.setUsage(DynamicDrawUsage);
    this.wisps.frustumCulled = false;
    this.wisps.renderOrder = 2;
    this.wispStates = Array.from({ length: this.profile.wispCount }, () => ({
      position: new Vector3(),
      width: 1,
      length: 1,
      angleOffset: 0
    }));
    for (let index = 0; index < this.profile.wispCount; index += 1) {
      this.wisps.setColorAt(index, index % 3 === 0 ? cloudWarm : cloudCool);
    }
    this.root.add(this.wisps);

    const markerGeometry = new BoxGeometry(1, 1, 1);
    const markerMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    this.routeMarkers = new InstancedMesh(
      markerGeometry,
      markerMaterial,
      this.profile.markerPairCount * 2
    );
    this.routeMarkers.name = 'MidFieldRouteMarkers';
    this.routeMarkers.instanceMatrix.setUsage(DynamicDrawUsage);
    this.routeMarkers.frustumCulled = false;
    this.routeMarkers.renderOrder = 1;
    this.markerStates = Array.from({ length: this.profile.markerPairCount }, createRouteState);
    this.markerRecycleFlags = Array.from(
      { length: this.profile.markerPairCount },
      () => false
    );
    this.root.add(this.routeMarkers);

    const buildingGeometry = new BoxGeometry(1, 1, 1);
    const buildingMaterial = new MeshBasicMaterial({ color: 0xffffff, fog: true });
    this.buildings = new InstancedMesh(
      buildingGeometry,
      buildingMaterial,
      this.profile.buildingCount
    );
    this.buildings.name = 'FarFieldCitySilhouette';
    this.buildings.instanceMatrix.setUsage(DynamicDrawUsage);
    this.buildings.frustumCulled = false;
    this.buildingStates = Array.from({ length: this.profile.buildingCount }, () => ({
      position: new Vector3(),
      scale: new Vector3(1, 1, 1),
      rotation: new Quaternion()
    }));
    this.root.add(this.buildings);

    const capGeometry = new BoxGeometry(1, 1, 1);
    const capMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: true
    });
    this.buildingCaps = new InstancedMesh(capGeometry, capMaterial, this.profile.buildingCount);
    this.buildingCaps.name = 'FarFieldCityRoofLights';
    this.buildingCaps.instanceMatrix.setUsage(DynamicDrawUsage);
    this.buildingCaps.frustumCulled = false;
    this.buildingCaps.renderOrder = 1;
    this.root.add(this.buildingCaps);

    this.geometries.push(
      moteGeometry,
      wispGeometry,
      markerGeometry,
      buildingGeometry,
      capGeometry
    );
    this.materials.push(
      this.moteMaterial,
      this.wispMaterial,
      markerMaterial,
      buildingMaterial,
      capMaterial
    );

    this.scene.add(this.root);

    console.info('[ShaderRoam][MotionReferenceField][init]', {
      version: motionReferenceVersion,
      quality: options.quality,
      profile: this.profile,
      drawLayers: this.root.children.map((child) => child.name)
    });
  }

  update(
    dt: number,
    elapsed: number,
    camera: PerspectiveCamera,
    vehicleState: VehicleState
  ): void {
    this.updateTravelFrame(vehicleState);
    this.vehiclePosition.copy(vehicleState.position);
    this.speedRatio = smoothstep(vehicleState.speed, 38, 260);

    if (!this.initialized) {
      this.populate(vehicleState);
      this.initialized = true;
    }

    this.updateMotes(vehicleState);
    this.updateWisps(camera, vehicleState);
    this.updateRouteMarkers(vehicleState);
    this.updateCity(vehicleState);

    this.moteMaterial.uniforms.uTime.value = elapsed;
    this.moteMaterial.uniforms.uSpeed.value = this.speedRatio;
    this.wispMaterial.uniforms.uTime.value = elapsed;
    this.wispMaterial.uniforms.uSpeed.value = this.speedRatio;

    void dt;
  }

  getDiagnostics() {
    const farthestMarker = this.markerStates.reduce(
      (farthest, state) =>
        this.relative.copy(state.position).sub(this.vehiclePosition).dot(this.forward) >
        this.tempPosition.copy(farthest.position).sub(this.vehiclePosition).dot(this.forward)
          ? state
          : farthest,
      this.markerStates[0]
    );

    return {
      version: motionReferenceVersion,
      initialized: this.initialized,
      speedRatio: this.speedRatio,
      recycleCount: this.recycleCount,
      counts: {
        near: this.profile.moteCount + this.profile.wispCount,
        mid: this.profile.markerPairCount * 2,
        far: this.profile.buildingCount * 2
      },
      routeAnchor: farthestMarker?.position.toArray() ?? null
    };
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }

  private populate(vehicleState: VehicleState): void {
    for (let index = 0; index < this.profile.moteCount; index += 1) {
      this.spawnMote(index, vehicleState, this.randomRange(18, 240));
    }
    this.motePositionAttribute.needsUpdate = true;

    for (const wisp of this.wispStates) {
      this.spawnWisp(wisp, vehicleState, this.randomRange(30, 300));
    }

    for (let index = 0; index < this.markerStates.length; index += 1) {
      this.spawnRouteState(this.markerStates[index], vehicleState, 24 + index * 48, 24, 11);
      this.writeMarkerPair(index, this.markerStates[index]);
    }
    this.routeMarkers.instanceMatrix.needsUpdate = true;
    if (this.routeMarkers.instanceColor) {
      this.routeMarkers.instanceColor.needsUpdate = true;
    }

    for (let index = 0; index < this.buildingStates.length; index += 1) {
      this.spawnBuilding(this.buildingStates[index], vehicleState, index);
      this.writeBuildingInstances(index, this.buildingStates[index]);
    }
    this.buildings.instanceMatrix.needsUpdate = true;
    this.buildingCaps.instanceMatrix.needsUpdate = true;
    if (this.buildings.instanceColor) {
      this.buildings.instanceColor.needsUpdate = true;
    }
    if (this.buildingCaps.instanceColor) {
      this.buildingCaps.instanceColor.needsUpdate = true;
    }
  }

  private updateTravelFrame(vehicleState: VehicleState): void {
    if (vehicleState.velocity.lengthSq() > 0.0001) {
      this.forward.copy(vehicleState.velocity).normalize();
    } else {
      this.forward.copy(localForward).applyQuaternion(vehicleState.rotation).normalize();
    }

    this.right.crossVectors(this.forward, worldUp);
    if (this.right.lengthSq() < 0.001) {
      this.right.copy(localRight).applyQuaternion(vehicleState.rotation);
    }
    this.right.normalize();
    this.up.crossVectors(this.right, this.forward).normalize();
  }

  private updateMotes(vehicleState: VehicleState): void {
    let changed = false;
    for (let index = 0; index < this.profile.moteCount; index += 1) {
      this.readMotePosition(index, this.tempPosition);
      this.relative.copy(this.tempPosition).sub(vehicleState.position);
      const ahead = this.relative.dot(this.forward);
      const lateral = Math.abs(this.relative.dot(this.right));
      const vertical = Math.abs(this.relative.dot(this.up));

      if (ahead < -24 || ahead > 270 || lateral > 105 || vertical > 72) {
        this.spawnMote(index, vehicleState, this.randomRange(130, 255));
        this.recycleCount += 1;
        changed = true;
      }
    }

    if (changed) {
      this.motePositionAttribute.needsUpdate = true;
    }
  }

  private updateWisps(camera: PerspectiveCamera, vehicleState: VehicleState): void {
    this.inverseCameraRotation.copy(camera.quaternion).invert();

    for (let index = 0; index < this.wispStates.length; index += 1) {
      const wisp = this.wispStates[index];
      this.relative.copy(wisp.position).sub(vehicleState.position);
      const ahead = this.relative.dot(this.forward);
      const lateral = Math.abs(this.relative.dot(this.right));
      const vertical = Math.abs(this.relative.dot(this.up));

      if (ahead < -45 || ahead > 340 || lateral > 145 || vertical > 100) {
        this.spawnWisp(wisp, vehicleState, this.randomRange(180, 325));
        this.recycleCount += 1;
      }

      this.cameraRelative.copy(wisp.position).sub(camera.position).applyQuaternion(this.inverseCameraRotation);
      const radialAngle = Math.atan2(this.cameraRelative.y, this.cameraRelative.x);
      this.rollRotation.setFromAxisAngle(localZ, radialAngle + wisp.angleOffset);
      this.billboardRotation.copy(camera.quaternion).multiply(this.rollRotation);
      this.dummy.position.copy(wisp.position);
      this.dummy.quaternion.copy(this.billboardRotation);
      this.dummy.scale.set(wisp.length * (0.78 + this.speedRatio * 0.82), wisp.width, 1);
      this.dummy.updateMatrix();
      this.wisps.setMatrixAt(index, this.dummy.matrix);
    }

    this.wisps.instanceMatrix.needsUpdate = true;
  }

  private updateRouteMarkers(vehicleState: VehicleState): void {
    let maxAhead = 24;
    let recycleTotal = 0;
    for (let index = 0; index < this.markerStates.length; index += 1) {
      const marker = this.markerStates[index];
      this.relative.copy(marker.position).sub(vehicleState.position);
      const ahead = this.relative.dot(this.forward);
      const staleDirection = marker.forward.dot(this.forward) < 0.16;
      const shouldRecycle =
        ahead < -35 ||
        this.relative.lengthSq() > 1900 * 1900 ||
        (staleDirection && ahead < 220);
      this.markerRecycleFlags[index] = shouldRecycle;
      if (shouldRecycle) {
        recycleTotal += 1;
      } else {
        maxAhead = Math.max(maxAhead, ahead);
      }
    }

    if (recycleTotal > 1) {
      maxAhead = 24;
    }

    let changed = false;
    let recycledThisFrame = 0;
    for (let index = 0; index < this.markerStates.length; index += 1) {
      if (!this.markerRecycleFlags[index]) {
        continue;
      }

      const marker = this.markerStates[index];
      maxAhead += this.randomRange(42, 54);
      if (maxAhead > 1550) {
        maxAhead = 72 + recycledThisFrame * 48;
      }
      this.spawnRouteState(marker, vehicleState, maxAhead, 28, 13);
      this.writeMarkerPair(index, marker);
      this.recycleCount += 1;
      recycledThisFrame += 1;
      changed = true;
    }

    if (changed) {
      this.routeMarkers.instanceMatrix.needsUpdate = true;
      if (this.routeMarkers.instanceColor) {
        this.routeMarkers.instanceColor.needsUpdate = true;
      }
    }
  }

  private updateCity(vehicleState: VehicleState): void {
    let changed = false;
    for (let index = 0; index < this.buildingStates.length; index += 1) {
      const building = this.buildingStates[index];
      this.relative.copy(building.position).sub(vehicleState.position);
      const ahead = this.relative.dot(this.forward);
      if (ahead < -650 || this.relative.lengthSq() > 3500 * 3500) {
        this.spawnBuilding(building, vehicleState, index);
        this.writeBuildingInstances(index, building);
        this.recycleCount += 1;
        changed = true;
      }
    }

    if (changed) {
      this.buildings.instanceMatrix.needsUpdate = true;
      this.buildingCaps.instanceMatrix.needsUpdate = true;
      if (this.buildings.instanceColor) {
        this.buildings.instanceColor.needsUpdate = true;
      }
      if (this.buildingCaps.instanceColor) {
        this.buildingCaps.instanceColor.needsUpdate = true;
      }
    }
  }

  private spawnMote(index: number, vehicleState: VehicleState, ahead: number): void {
    const spread = 0.35 + ahead / 250;
    this.tempPosition
      .copy(vehicleState.position)
      .addScaledVector(this.forward, ahead)
      .addScaledVector(this.right, this.randomRange(-74, 74) * spread)
      .addScaledVector(this.up, this.randomRange(-45, 45) * spread);
    this.writeMotePosition(index, this.tempPosition);
  }

  private spawnWisp(wisp: WispState, vehicleState: VehicleState, ahead: number): void {
    const side = this.random() < 0.5 ? -1 : 1;
    const lateral = side * this.randomRange(24, 118);
    wisp.position
      .copy(vehicleState.position)
      .addScaledVector(this.forward, ahead)
      .addScaledVector(this.right, lateral)
      .addScaledVector(this.up, this.randomRange(-68, 62));
    wisp.width = this.randomRange(2.8, 8.5);
    wisp.length = this.randomRange(11, 28);
    wisp.angleOffset = this.randomRange(-0.16, 0.16);
  }

  private spawnRouteState(
    state: RouteState,
    vehicleState: VehicleState,
    ahead: number,
    lateralRange: number,
    verticalRange: number
  ): void {
    state.position
      .copy(vehicleState.position)
      .addScaledVector(this.forward, ahead)
      .addScaledVector(this.right, this.randomRange(-lateralRange, lateralRange))
      .addScaledVector(this.up, this.randomRange(-verticalRange, verticalRange));
    state.forward.copy(this.forward);
    state.right.copy(this.right);
    state.up.copy(this.up);
    state.rotation.copy(this.rotationFromFrame(state.forward, state.right, state.up));
  }

  private spawnBuilding(
    building: BuildingState,
    vehicleState: VehicleState,
    index: number
  ): void {
    const ahead = this.randomRange(560, 2550);
    const side = index % 2 === 0 ? -1 : 1;
    const lateral = side * this.randomRange(260, 880);
    const width = this.randomRange(28, 88);
    const height = this.randomRange(110, 430) * (0.72 + ahead / 5000);
    const depth = this.randomRange(30, 105);
    const baseY = vehicleState.position.y - this.randomRange(540, 620);

    building.position
      .copy(vehicleState.position)
      .addScaledVector(this.forward, ahead)
      .addScaledVector(this.right, lateral);
    building.position.y = baseY + height * 0.5;
    building.scale.set(width, height, depth);
    building.rotation.setFromAxisAngle(worldUp, this.randomRange(-Math.PI, Math.PI));

    this.buildings.setColorAt(index, buildingColors[index % buildingColors.length]);
    this.buildingCaps.setColorAt(index, index % 3 === 0 ? coolLight : roseLight);
  }

  private writeMarkerPair(index: number, marker: RouteState): void {
    const firstInstance = index * 2;
    for (const side of [-1, 1]) {
      this.dummy.position
        .copy(marker.position)
        .addScaledVector(marker.right, side * 13.5)
        .addScaledVector(marker.up, -9.5);
      this.dummy.quaternion.copy(marker.rotation);
      this.dummy.scale.set(0.24, 0.18, 9.5);
      this.dummy.updateMatrix();
      const instanceIndex = firstInstance + (side === -1 ? 0 : 1);
      this.routeMarkers.setMatrixAt(instanceIndex, this.dummy.matrix);
      this.routeMarkers.setColorAt(instanceIndex, side === -1 ? warmLight : coolLight);
    }
  }

  private writeBuildingInstances(index: number, building: BuildingState): void {
    this.dummy.position.copy(building.position);
    this.dummy.quaternion.copy(building.rotation);
    this.dummy.scale.copy(building.scale);
    this.dummy.updateMatrix();
    this.buildings.setMatrixAt(index, this.dummy.matrix);

    this.dummy.position
      .copy(building.position)
      .addScaledVector(worldUp, building.scale.y * 0.5 + 2.5);
    this.dummy.scale.set(building.scale.x * 0.58, 2.2, building.scale.z * 0.58);
    this.dummy.updateMatrix();
    this.buildingCaps.setMatrixAt(index, this.dummy.matrix);
  }

  private rotationFromFrame(forward: Vector3, right: Vector3, up: Vector3): Quaternion {
    this.tempPosition.copy(forward).negate();
    this.frameMatrix.makeBasis(right, up, this.tempPosition);
    return this.frameRotation.setFromRotationMatrix(this.frameMatrix);
  }

  private readMotePosition(index: number, target: Vector3): Vector3 {
    const offset = index * 3;
    return target.set(
      this.motePositions[offset],
      this.motePositions[offset + 1],
      this.motePositions[offset + 2]
    );
  }

  private writeMotePosition(index: number, position: Vector3): void {
    const offset = index * 3;
    this.motePositions[offset] = position.x;
    this.motePositions[offset + 1] = position.y;
    this.motePositions[offset + 2] = position.z;
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }

  private randomRange(min: number, max: number): number {
    return min + (max - min) * this.random();
  }
}

function createRouteState(): RouteState {
  return {
    position: new Vector3(),
    forward: new Vector3(0, 0, -1),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    rotation: new Quaternion()
  };
}

function smoothstep(value: number, min: number, max: number): number {
  const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return normalized * normalized * (3 - 2 * normalized);
}

function createMoteMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 0 }
    },
    vertexShader: /* glsl */ `
      attribute float aScale;
      attribute float aPhase;
      attribute float aWarmth;

      uniform float uTime;
      uniform float uSpeed;

      varying float vAlpha;
      varying vec3 vColor;

      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float viewDepth = max(1.0, -viewPosition.z);
        float pulse = 0.72 + sin(uTime * 2.2 + aPhase) * 0.28;
        float distanceFade = 1.0 - smoothstep(175.0, 270.0, length(viewPosition.xyz));

        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(aScale * (0.82 + uSpeed * 0.9) * 52.0 / viewDepth, 1.2, 10.0);
        vAlpha = pulse * distanceFade * (0.45 + uSpeed * 0.42);
        vColor = mix(vec3(0.48, 0.84, 0.94), vec3(1.0, 0.63, 0.34), aWarmth);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      varying float vAlpha;
      varying vec3 vColor;

      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float distanceToCenter = length(point);
        float softDisc = 1.0 - smoothstep(0.08, 0.5, distanceToCenter);
        float core = 1.0 - smoothstep(0.0, 0.13, distanceToCenter);
        gl_FragColor = vec4(vColor + core * 0.45, softDisc * vAlpha);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
}

function createWispMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vViewDepth;

      void main() {
        vUv = uv;
        vColor = instanceColor;
        vec4 viewPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vViewDepth = max(0.0, -viewPosition.z);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      uniform float uTime;
      uniform float uSpeed;

      varying vec2 vUv;
      varying vec3 vColor;
      varying float vViewDepth;

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32);
        return fract(point.x * point.y);
      }

      void main() {
        vec2 point = vUv * 2.0 - 1.0;
        float grain = hash21(floor(vUv * 18.0));
        float body = 1.0 - smoothstep(0.22, 1.0, length(vec2(point.x, point.y * 1.42)));
        float split = 0.7 +
          0.3 * sin(point.x * 10.0 + point.y * 3.0 + grain * 4.0 + uTime * 0.18);
        float distanceFade = smoothstep(4.0, 24.0, vViewDepth) *
          (1.0 - smoothstep(250.0, 360.0, vViewDepth));
        float alpha = body * split * distanceFade * (0.16 + uSpeed * 0.22);
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    side: DoubleSide,
    blending: NormalBlending,
    depthWrite: false,
    toneMapped: false
  });
}
