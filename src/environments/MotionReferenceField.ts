import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
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
import {
  createProceduralCityGroundMaterial,
  createProceduralCityMaterial,
  proceduralCityShaderVersion
} from '../shaders/proceduralCity';

export const motionReferenceVersion = 'motion-reference-2026-07-16.1';

const cityBlockSize = 160;
const cityChunkSize = cityBlockSize * 4;
const cityGroundCoverage = 14000;
const cityGroundSegments = 128;
const cityGroundShape = 'circle' as const;

type CityDistrict = 0 | 1 | 2 | 3;

const downtownDistrict: CityDistrict = 0;
const commercialDistrict: CityDistrict = 1;
const residentialDistrict: CityDistrict = 2;
const landmarkDistrict: CityDistrict = 3;
const cityDistrictNames = ['downtown', 'commercial', 'residential', 'landmark'] as const;
const cityDistrictPattern: readonly CityDistrict[] = [
  downtownDistrict,
  commercialDistrict,
  residentialDistrict,
  downtownDistrict,
  landmarkDistrict,
  residentialDistrict,
  commercialDistrict,
  downtownDistrict,
  commercialDistrict,
  residentialDistrict
];

const cityBuildingSlotOffsets = [
  [-240, -240],
  [80, -240],
  [-80, -80],
  [240, -80],
  [-240, 80],
  [80, 80],
  [-80, 240],
  [240, 240]
] as const;

interface MotionReferenceProfile {
  moteCount: number;
  wispCount: number;
  markerPairCount: number;
  buildingCount: number;
  cityChunkCount: number;
  buildingsPerChunk: number;
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
  tierScale: Vector3;
  rotation: Quaternion;
  seed: number;
  district: CityDistrict;
}

interface CityChunkState {
  position: Vector3;
  forward: Vector3;
  landmarkTop: Vector3;
  side: -1 | 1;
  district: CityDistrict;
  seed: number;
  firstBuilding: number;
  buildingCount: number;
  landmarkActive: boolean;
}

interface DistrictMassingProfile {
  width: readonly [number, number];
  height: readonly [number, number];
  depth: readonly [number, number];
  tierRatio: readonly [number, number];
  tierInset: readonly [number, number];
}

const motionReferenceProfiles: Record<QualityLevel, MotionReferenceProfile> = {
  low: {
    moteCount: 96,
    wispCount: 18,
    markerPairCount: 26,
    buildingCount: 48,
    cityChunkCount: 8,
    buildingsPerChunk: 6
  },
  medium: {
    moteCount: 144,
    wispCount: 26,
    markerPairCount: 34,
    buildingCount: 64,
    cityChunkCount: 8,
    buildingsPerChunk: 8
  },
  high: {
    moteCount: 192,
    wispCount: 34,
    markerPairCount: 42,
    buildingCount: 80,
    cityChunkCount: 10,
    buildingsPerChunk: 8
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
const districtBuildingColors: Record<CityDistrict, readonly Color[]> = {
  [downtownDistrict]: [new Color('#111b26'), new Color('#1b1627'), new Color('#10252c')],
  [commercialDistrict]: [new Color('#21182b'), new Color('#14262d'), new Color('#251a2b')],
  [residentialDistrict]: [new Color('#27212c'), new Color('#1e292d'), new Color('#2a2028')],
  [landmarkDistrict]: [new Color('#101d2a'), new Color('#26162e'), new Color('#10272e')]
};
const districtMassingProfiles: Record<CityDistrict, DistrictMassingProfile> = {
  [downtownDistrict]: {
    width: [42, 76],
    height: [300, 540],
    depth: [44, 82],
    tierRatio: [0.22, 0.38],
    tierInset: [0.55, 0.76]
  },
  [commercialDistrict]: {
    width: [62, 108],
    height: [220, 390],
    depth: [56, 112],
    tierRatio: [0.18, 0.3],
    tierInset: [0.62, 0.82]
  },
  [residentialDistrict]: {
    width: [78, 132],
    height: [130, 260],
    depth: [68, 128],
    tierRatio: [0.12, 0.23],
    tierInset: [0.7, 0.88]
  },
  [landmarkDistrict]: {
    width: [48, 88],
    height: [280, 480],
    depth: [48, 92],
    tierRatio: [0.2, 0.34],
    tierInset: [0.54, 0.75]
  }
};

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
  private readonly buildings: InstancedMesh<BoxGeometry, ShaderMaterial>;
  private readonly buildingTiers: InstancedMesh<BoxGeometry, ShaderMaterial>;
  private readonly buildingCaps: InstancedMesh<BoxGeometry, MeshBasicMaterial>;
  private readonly buildingSpires: InstancedMesh<CylinderGeometry, MeshBasicMaterial>;
  private readonly buildingMaterial: ShaderMaterial;
  private readonly cityGround: Mesh<CircleGeometry, ShaderMaterial>;
  private readonly cityGroundMaterial: ShaderMaterial;
  private readonly buildingSeedAttribute: InstancedBufferAttribute;
  private readonly buildingTierSeedAttribute: InstancedBufferAttribute;
  private readonly buildingDistrictAttribute: InstancedBufferAttribute;
  private readonly buildingTierDistrictAttribute: InstancedBufferAttribute;
  private readonly buildingStates: BuildingState[];
  private readonly cityChunks: CityChunkState[];
  private readonly cityChunkRecycleFlags: boolean[];
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
  private cityChunkRecycleCount = 0;
  private speedRatio = 0;
  private cityGroundY = 0;

  constructor(scene: Scene, options: MotionReferenceFieldOptions) {
    this.scene = scene;
    this.profile = motionReferenceProfiles[options.quality];
    if (
      this.profile.cityChunkCount * this.profile.buildingsPerChunk !==
      this.profile.buildingCount
    ) {
      throw new Error('City profile building capacity must be composed of complete chunks.');
    }
    if (this.profile.buildingsPerChunk > cityBuildingSlotOffsets.length) {
      throw new Error('City profile exceeds the available building slots per chunk.');
    }
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

    const cityGroundGeometry = new CircleGeometry(
      cityGroundCoverage * 0.5,
      cityGroundSegments
    );
    this.cityGroundMaterial = createProceduralCityGroundMaterial();
    this.cityGround = new Mesh(cityGroundGeometry, this.cityGroundMaterial);
    this.cityGround.name = 'FarFieldCityGround';
    this.cityGround.rotation.x = -Math.PI * 0.5;
    this.cityGround.frustumCulled = false;
    this.cityGround.renderOrder = -1;
    this.root.add(this.cityGround);

    const buildingGeometry = new BoxGeometry(1, 1, 1);
    this.buildingSeedAttribute = new InstancedBufferAttribute(
      new Float32Array(this.profile.buildingCount),
      1
    );
    this.buildingDistrictAttribute = new InstancedBufferAttribute(
      new Float32Array(this.profile.buildingCount),
      1
    );
    buildingGeometry.setAttribute('aBuildingSeed', this.buildingSeedAttribute);
    buildingGeometry.setAttribute('aDistrictType', this.buildingDistrictAttribute);
    this.buildingMaterial = createProceduralCityMaterial();
    this.buildings = new InstancedMesh(
      buildingGeometry,
      this.buildingMaterial,
      this.profile.buildingCount
    );
    this.buildings.name = 'FarFieldCityMainBodies';
    this.buildings.instanceMatrix.setUsage(DynamicDrawUsage);
    this.buildings.frustumCulled = false;
    this.buildingStates = Array.from({ length: this.profile.buildingCount }, () => ({
      position: new Vector3(),
      scale: new Vector3(1, 1, 1),
      tierScale: new Vector3(1, 1, 1),
      rotation: new Quaternion(),
      seed: 0,
      district: downtownDistrict
    }));
    this.cityChunks = Array.from({ length: this.profile.cityChunkCount }, (_, index) =>
      createCityChunkState(index, this.profile.buildingsPerChunk)
    );
    this.cityChunkRecycleFlags = Array.from(
      { length: this.profile.cityChunkCount },
      () => false
    );
    this.root.add(this.buildings);

    const tierGeometry = new BoxGeometry(1, 1, 1);
    this.buildingTierSeedAttribute = new InstancedBufferAttribute(
      new Float32Array(this.profile.buildingCount),
      1
    );
    this.buildingTierDistrictAttribute = new InstancedBufferAttribute(
      new Float32Array(this.profile.buildingCount),
      1
    );
    tierGeometry.setAttribute('aBuildingSeed', this.buildingTierSeedAttribute);
    tierGeometry.setAttribute('aDistrictType', this.buildingTierDistrictAttribute);
    this.buildingTiers = new InstancedMesh(
      tierGeometry,
      this.buildingMaterial,
      this.profile.buildingCount
    );
    this.buildingTiers.name = 'FarFieldCityUpperTiers';
    this.buildingTiers.instanceMatrix.setUsage(DynamicDrawUsage);
    this.buildingTiers.frustumCulled = false;
    this.root.add(this.buildingTiers);

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

    const spireGeometry = new CylinderGeometry(1.2, 2.6, 1, 8, 1, false);
    const spireMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: true
    });
    this.buildingSpires = new InstancedMesh(
      spireGeometry,
      spireMaterial,
      this.profile.cityChunkCount
    );
    this.buildingSpires.name = 'FarFieldCityLandmarkSpires';
    this.buildingSpires.instanceMatrix.setUsage(DynamicDrawUsage);
    this.buildingSpires.frustumCulled = false;
    this.buildingSpires.renderOrder = 1;
    this.root.add(this.buildingSpires);

    this.geometries.push(
      moteGeometry,
      wispGeometry,
      markerGeometry,
      cityGroundGeometry,
      buildingGeometry,
      tierGeometry,
      capGeometry,
      spireGeometry
    );
    this.materials.push(
      this.moteMaterial,
      this.wispMaterial,
      markerMaterial,
      this.cityGroundMaterial,
      this.buildingMaterial,
      capMaterial,
      spireMaterial
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
      this.cityGroundY = vehicleState.position.y - 600;
      this.populate(vehicleState);
      this.initialized = true;
    }

    this.cityGround.position.set(
      vehicleState.position.x,
      this.cityGroundY - 1.5,
      vehicleState.position.z
    );
    this.updateMotes(vehicleState);
    this.updateWisps(camera, vehicleState);
    this.updateRouteMarkers(vehicleState);
    this.updateCity(vehicleState);

    this.moteMaterial.uniforms.uTime.value = elapsed;
    this.moteMaterial.uniforms.uSpeed.value = this.speedRatio;
    this.wispMaterial.uniforms.uTime.value = elapsed;
    this.wispMaterial.uniforms.uSpeed.value = this.speedRatio;
    this.buildingMaterial.uniforms.uTime.value = elapsed;

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

    const districtCounts: Record<(typeof cityDistrictNames)[number], number> = {
      downtown: 0,
      commercial: 0,
      residential: 0,
      landmark: 0
    };
    for (const chunk of this.cityChunks) {
      districtCounts[cityDistrictNames[chunk.district]] += 1;
    }
    let overlappingChunkPairs = 0;
    for (let left = 0; left < this.cityChunks.length; left += 1) {
      for (let right = left + 1; right < this.cityChunks.length; right += 1) {
        const leftChunk = this.cityChunks[left];
        const rightChunk = this.cityChunks[right];
        if (
          leftChunk.position.x === rightChunk.position.x &&
          leftChunk.position.z === rightChunk.position.z
        ) {
          overlappingChunkPairs += 1;
        }
      }
    }
    const matrix = new Matrix4();
    let nonFiniteInstanceMatrices = 0;
    for (const mesh of [
      this.buildings,
      this.buildingTiers,
      this.buildingCaps,
      this.buildingSpires
    ]) {
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, matrix);
        if (matrix.elements.some((value) => !Number.isFinite(value))) {
          nonFiniteInstanceMatrices += 1;
        }
      }
    }
    const chunkLayout = this.cityChunks.map((chunk, index) => {
      const relative = new Vector3().copy(chunk.position).sub(this.vehiclePosition);
      return {
        index,
        side: chunk.side,
        district: cityDistrictNames[chunk.district],
        ahead: relative.dot(this.forward),
        lateral: relative.dot(this.right),
        directionAlignment: chunk.forward.dot(this.forward)
      };
    });

    return {
      version: motionReferenceVersion,
      initialized: this.initialized,
      speedRatio: this.speedRatio,
      recycleCount: this.recycleCount,
      counts: {
        near: this.profile.moteCount + this.profile.wispCount,
        mid: this.profile.markerPairCount * 2,
        far: this.profile.buildingCount * 3 + this.profile.cityChunkCount
      },
      city: {
        shaderVersion: proceduralCityShaderVersion,
        shaderCompiles: Number(this.buildingMaterial.userData.compileCount ?? 0),
        groundShaderCompiles: Number(this.cityGroundMaterial.userData.compileCount ?? 0),
        instanceLayers: 4,
        renderLayers: 5,
        groundY: this.cityGroundY,
        blockSize: cityBlockSize,
        groundCoverage: cityGroundCoverage,
        groundShape: cityGroundShape,
        groundSegments: cityGroundSegments,
        chunkSize: cityChunkSize,
        chunkCount: this.profile.cityChunkCount,
        buildingsPerChunk: this.profile.buildingsPerChunk,
        chunkRecycleCount: this.cityChunkRecycleCount,
        districtCounts,
        landmarkCount: this.cityChunks.filter((chunk) => chunk.landmarkActive).length,
        overlappingChunkPairs,
        nonFiniteInstanceMatrices,
        chunkLayout
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

    for (let index = 0; index < this.cityChunks.length; index += 1) {
      const ahead = 720 + Math.floor(index / 2) * cityChunkSize;
      this.spawnCityChunk(this.cityChunks[index], vehicleState, index, ahead);
    }
    this.markCityInstancesDirty();
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
    let maxAheadLeft = 520;
    let maxAheadRight = 520;
    let recycleTotal = 0;

    for (let index = 0; index < this.cityChunks.length; index += 1) {
      const chunk = this.cityChunks[index];
      this.relative.copy(chunk.position).sub(vehicleState.position);
      const ahead = this.relative.dot(this.forward);
      const staleDirection = chunk.forward.dot(this.forward) < 0.68;
      const shouldRecycle =
        ahead < -cityChunkSize * 0.75 ||
        this.relative.lengthSq() > 4800 * 4800 ||
        (staleDirection && ahead < 1600);

      this.cityChunkRecycleFlags[index] = shouldRecycle;
      if (shouldRecycle) {
        recycleTotal += 1;
      } else if (chunk.side === -1) {
        maxAheadLeft = Math.max(maxAheadLeft, ahead);
      } else {
        maxAheadRight = Math.max(maxAheadRight, ahead);
      }
    }

    if (recycleTotal > Math.max(2, Math.floor(this.cityChunks.length / 3))) {
      maxAheadLeft = 520;
      maxAheadRight = 520;
    }

    let changed = false;
    let recycledLeft = 0;
    let recycledRight = 0;
    for (let index = 0; index < this.cityChunks.length; index += 1) {
      if (!this.cityChunkRecycleFlags[index]) {
        continue;
      }

      const chunk = this.cityChunks[index];
      let ahead: number;
      if (chunk.side === -1) {
        maxAheadLeft += cityChunkSize;
        ahead = maxAheadLeft;
        recycledLeft += 1;
      } else {
        maxAheadRight += cityChunkSize;
        ahead = maxAheadRight;
        recycledRight += 1;
      }

      if (ahead > 3600) {
        const sideOrder = chunk.side === -1 ? recycledLeft : recycledRight;
        ahead = 720 + (sideOrder - 1) * cityChunkSize;
      }

      this.spawnCityChunk(chunk, vehicleState, index, ahead);
      this.cityChunkRecycleCount += 1;
      this.recycleCount += chunk.buildingCount;
      changed = true;
    }

    if (changed) {
      this.markCityInstancesDirty();
    }
  }

  private spawnCityChunk(
    chunk: CityChunkState,
    vehicleState: VehicleState,
    chunkIndex: number,
    ahead: number
  ): void {
    chunk.position
      .copy(vehicleState.position)
      .addScaledVector(this.forward, ahead)
      .addScaledVector(this.right, chunk.side * 420);
    chunk.position.x = snapToChunkCenter(chunk.position.x);
    chunk.position.y = this.cityGroundY;
    chunk.position.z = snapToChunkCenter(chunk.position.z);
    this.relative.copy(chunk.position).sub(vehicleState.position);
    if (this.relative.dot(this.right) * chunk.side < 260) {
      if (Math.abs(this.right.x) >= Math.abs(this.right.z)) {
        chunk.position.x += Math.sign(this.right.x) * chunk.side * cityChunkSize;
      } else {
        chunk.position.z += Math.sign(this.right.z) * chunk.side * cityChunkSize;
      }
    }

    for (let attempt = 0; attempt < this.cityChunks.length; attempt += 1) {
      const overlapsActiveChunk = this.cityChunks.some(
        (other, otherIndex) =>
          otherIndex !== chunkIndex &&
          !this.cityChunkRecycleFlags[otherIndex] &&
          other.position.x === chunk.position.x &&
          other.position.z === chunk.position.z
      );
      if (!overlapsActiveChunk) {
        break;
      }

      if (Math.abs(this.forward.x) >= Math.abs(this.forward.z)) {
        chunk.position.x += Math.sign(this.forward.x) * cityChunkSize;
      } else {
        chunk.position.z += Math.sign(this.forward.z) * cityChunkSize;
      }
    }
    chunk.forward.copy(this.forward);
    chunk.district = cityDistrictPattern[chunkIndex % cityDistrictPattern.length];
    chunk.seed = this.random();
    chunk.landmarkActive = chunk.district === landmarkDistrict;
    chunk.landmarkTop.set(chunk.position.x, this.cityGroundY, chunk.position.z);

    for (let localIndex = 0; localIndex < chunk.buildingCount; localIndex += 1) {
      const globalIndex = chunk.firstBuilding + localIndex;
      const building = this.buildingStates[globalIndex];
      this.spawnBuilding(building, chunk, localIndex, globalIndex);
      this.writeBuildingInstances(globalIndex, building);
    }

    this.writeLandmarkSpire(chunkIndex, chunk);
    this.cityChunkRecycleFlags[chunkIndex] = false;
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
    chunk: CityChunkState,
    localIndex: number,
    globalIndex: number
  ): void {
    const profile = districtMassingProfiles[chunk.district];
    const isLandmark = chunk.landmarkActive && localIndex === 0;
    const width = isLandmark
      ? this.randomRange(62, 82)
      : this.randomRange(profile.width[0], profile.width[1]);
    const height = isLandmark
      ? this.randomRange(650, 760)
      : this.randomRange(profile.height[0], profile.height[1]);
    const depth = isLandmark
      ? this.randomRange(62, 86)
      : this.randomRange(profile.depth[0], profile.depth[1]);
    const tierHeightRatio = isLandmark
      ? this.randomRange(0.28, 0.36)
      : this.randomRange(profile.tierRatio[0], profile.tierRatio[1]);
    const tierInsetX = this.randomRange(profile.tierInset[0], profile.tierInset[1]);
    const tierInsetZ = this.randomRange(profile.tierInset[0], profile.tierInset[1]);
    const bodyHeight = height * (1 - tierHeightRatio);
    const tierHeight = height - bodyHeight;
    const gridRotation = this.random() < 0.38 ? Math.PI * 0.5 : 0;
    const slot = cityBuildingSlotOffsets[localIndex];

    building.position
      .set(chunk.position.x + slot[0], this.cityGroundY + bodyHeight * 0.5, chunk.position.z + slot[1]);
    building.scale.set(width, bodyHeight, depth);
    building.tierScale.set(width * tierInsetX, tierHeight, depth * tierInsetZ);
    building.rotation.setFromAxisAngle(worldUp, gridRotation);
    building.seed = this.random();
    building.district = chunk.district;

    if (isLandmark) {
      chunk.landmarkTop
        .copy(building.position)
        .addScaledVector(worldUp, building.scale.y * 0.5 + building.tierScale.y);
    }

    const palette = districtBuildingColors[building.district];
    const colorIndex = Math.min(
      palette.length - 1,
      Math.floor(this.random() * palette.length)
    );
    this.buildings.setColorAt(globalIndex, palette[colorIndex]);
    this.buildingTiers.setColorAt(
      globalIndex,
      palette[(colorIndex + (localIndex % 3 === 0 ? 1 : 0)) % palette.length]
    );
    const capColor = building.district === commercialDistrict
      ? warmLight
      : building.district === residentialDistrict
        ? roseLight
        : coolLight;
    this.buildingCaps.setColorAt(globalIndex, capColor);
    this.buildingSeedAttribute.setX(globalIndex, building.seed);
    this.buildingTierSeedAttribute.setX(globalIndex, building.seed);
    this.buildingDistrictAttribute.setX(globalIndex, building.district);
    this.buildingTierDistrictAttribute.setX(globalIndex, building.district);
  }

  private writeLandmarkSpire(index: number, chunk: CityChunkState): void {
    if (!chunk.landmarkActive) {
      this.dummy.position.set(chunk.position.x, this.cityGroundY - 1000, chunk.position.z);
      this.dummy.quaternion.identity();
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.buildingSpires.setMatrixAt(index, this.dummy.matrix);
      this.buildingSpires.setColorAt(index, coolLight);
      return;
    }

    const spireHeight = 130 + chunk.seed * 80;
    this.dummy.position
      .copy(chunk.landmarkTop)
      .addScaledVector(worldUp, spireHeight * 0.5 + 3);
    this.dummy.quaternion.identity();
    this.dummy.scale.set(1, spireHeight, 1);
    this.dummy.updateMatrix();
    this.buildingSpires.setMatrixAt(index, this.dummy.matrix);
    this.buildingSpires.setColorAt(index, chunk.seed > 0.5 ? coolLight : warmLight);
  }

  private markCityInstancesDirty(): void {
    this.buildings.instanceMatrix.needsUpdate = true;
    this.buildingTiers.instanceMatrix.needsUpdate = true;
    this.buildingCaps.instanceMatrix.needsUpdate = true;
    this.buildingSpires.instanceMatrix.needsUpdate = true;
    this.buildingSeedAttribute.needsUpdate = true;
    this.buildingTierSeedAttribute.needsUpdate = true;
    this.buildingDistrictAttribute.needsUpdate = true;
    this.buildingTierDistrictAttribute.needsUpdate = true;

    for (const mesh of [
      this.buildings,
      this.buildingTiers,
      this.buildingCaps,
      this.buildingSpires
    ]) {
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }
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
      .addScaledVector(worldUp, building.scale.y * 0.5 + building.tierScale.y * 0.5);
    this.dummy.quaternion.copy(building.rotation);
    this.dummy.scale.copy(building.tierScale);
    this.dummy.updateMatrix();
    this.buildingTiers.setMatrixAt(index, this.dummy.matrix);

    this.dummy.position
      .copy(building.position)
      .addScaledVector(worldUp, building.scale.y * 0.5 + building.tierScale.y + 1.7);
    this.dummy.quaternion.copy(building.rotation);
    this.dummy.scale.set(building.tierScale.x * 0.52, 1.3, building.tierScale.z * 0.52);
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

function createCityChunkState(index: number, buildingsPerChunk: number): CityChunkState {
  return {
    position: new Vector3(),
    forward: new Vector3(0, 0, -1),
    landmarkTop: new Vector3(),
    side: index % 2 === 0 ? -1 : 1,
    district: cityDistrictPattern[index % cityDistrictPattern.length],
    seed: 0,
    firstBuilding: index * buildingsPerChunk,
    buildingCount: buildingsPerChunk,
    landmarkActive: false
  };
}

function smoothstep(value: number, min: number, max: number): number {
  const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return normalized * normalized * (3 - 2 * normalized);
}

function snapToChunkCenter(value: number): number {
  return Math.floor(value / cityChunkSize) * cityChunkSize + cityChunkSize * 0.5;
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
