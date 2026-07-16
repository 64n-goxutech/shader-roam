import {
  Color,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3
} from 'three';

export const proceduralCityShaderVersion = 'procedural-city-2026-07-15.3';

const proceduralCityVertexShader = /* glsl */ `
  attribute float aBuildingSeed;
  attribute float aDistrictType;

  varying vec3 vBuildingColor;
  varying vec3 vDimensions;
  varying vec3 vLocalNormal;
  varying vec3 vLocalPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying float vBuildingSeed;
  varying float vDistrictType;

  #include <fog_pars_vertex>

  void main() {
    vec4 instancePosition = instanceMatrix * vec4(position, 1.0);
    vec4 worldPosition = modelMatrix * instancePosition;
    vec4 mvPosition = viewMatrix * worldPosition;

    vBuildingColor = instanceColor;
    vDimensions = vec3(
      length(instanceMatrix[0].xyz),
      length(instanceMatrix[1].xyz),
      length(instanceMatrix[2].xyz)
    );
    vLocalNormal = normal;
    vLocalPosition = position;
    vWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vWorldPosition = worldPosition.xyz;
    vBuildingSeed = aBuildingSeed;
    vDistrictType = aDistrictType;

    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`;

const proceduralCityFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform vec3 uSunTint;
  uniform vec3 uWindowWarm;
  uniform vec3 uWindowCool;

  varying vec3 vBuildingColor;
  varying vec3 vDimensions;
  varying vec3 vLocalNormal;
  varying vec3 vLocalPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying float vBuildingSeed;
  varying float vDistrictType;

  #include <fog_pars_fragment>

  float hash21(vec2 point) {
    vec3 p3 = fract(vec3(point.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float districtMask(float district) {
    return 1.0 - step(0.25, abs(vDistrictType - district));
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float sunLight = max(dot(normal, normalize(uSunDirection)), 0.0);
    float skyLight = 0.38 + max(normal.y, 0.0) * 0.2;
    float heightLight = mix(0.78, 1.08, clamp(vLocalPosition.y + 0.5, 0.0, 1.0));
    vec3 color = vBuildingColor * (skyLight + sunLight * 0.72) * heightLight;

    float roof = step(0.55, vLocalNormal.y);
    float underside = step(vLocalNormal.y, -0.55);
    float sideAxis = step(0.5, abs(vLocalNormal.x));
    float commercial = districtMask(1.0);
    float residential = districtMask(2.0);
    float landmark = districtMask(3.0);
    float facadeWidth = mix(vDimensions.x, vDimensions.z, sideAxis);
    float facadeCoordinate = mix(vLocalPosition.x + 0.5, vLocalPosition.z + 0.5, sideAxis);
    float columnWidth = mix(6.2, 9.4, hash21(vec2(vBuildingSeed, 2.1)));
    float floorHeight = mix(5.0, 7.0, hash21(vec2(vBuildingSeed, 4.7)));
    columnWidth *= mix(1.0, 0.86, commercial) * mix(1.0, 1.12, residential) *
      mix(1.0, 0.8, landmark);
    floorHeight *= mix(1.0, 0.92, commercial) * mix(1.0, 1.08, residential);
    vec2 facadeGrid = vec2(
      facadeCoordinate * facadeWidth / columnWidth,
      (vLocalPosition.y + 0.5) * vDimensions.y / floorHeight
    );
    vec2 facadeCell = fract(facadeGrid);
    vec2 facadeIndex = floor(facadeGrid);

    float horizontalInset = mix(0.16, 0.24, hash21(vec2(vBuildingSeed, 8.3)));
    float verticalInset = mix(0.2, 0.3, hash21(vec2(vBuildingSeed, 9.9)));
    float windowShape =
      step(horizontalInset, facadeCell.x) *
      step(facadeCell.x, 1.0 - horizontalInset) *
      step(verticalInset, facadeCell.y) *
      step(facadeCell.y, 0.76);
    float streetLevel = step(1.0, facadeIndex.y);
    float facadeMask = (1.0 - roof) * (1.0 - underside);
    float windowRandom = hash21(facadeIndex + vec2(vBuildingSeed * 31.7, vBuildingSeed * 17.3));
    float floorOccupancy = hash21(vec2(facadeIndex.y, vBuildingSeed * 23.1));
    float litThreshold = mix(0.72, 0.86, hash21(vec2(vBuildingSeed, 13.2)));
    litThreshold = clamp(
      litThreshold - commercial * 0.08 + residential * 0.07 - landmark * 0.035,
      0.58,
      0.92
    );
    float occupiedFloor = step(0.34, floorOccupancy);
    float litWindow =
      step(litThreshold, windowRandom) *
      occupiedFloor *
      windowShape *
      streetLevel *
      facadeMask;

    float windowTemperature = hash21(facadeIndex.yx + vec2(vBuildingSeed * 7.9));
    vec3 windowColor = mix(uWindowWarm, uWindowCool, step(0.78, windowTemperature));
    float slowPulse = 0.96 + 0.04 * sin(uTime * 0.22 + vBuildingSeed * 19.0);
    float glassWindow = windowShape * streetLevel * facadeMask;
    color = mix(color, color + uWindowCool * 0.09, glassWindow * 0.44);
    color += windowColor * litWindow * mix(1.45, 2.45, windowRandom) * slowPulse;

    float landmarkAccent = 1.0 - smoothstep(
      0.025,
      0.075,
      abs(fract(facadeGrid.x / 4.0) - 0.5)
    );
    color += uWindowCool * landmarkAccent * landmark * facadeMask * 0.15;

    float floorJoint = 1.0 - smoothstep(0.03, 0.085, min(facadeCell.y, 1.0 - facadeCell.y));
    float columnJoint = 1.0 - smoothstep(0.025, 0.065, min(facadeCell.x, 1.0 - facadeCell.x));
    float structuralJoint = max(floorJoint, columnJoint) * facadeMask;
    color *= 1.0 - structuralJoint * 0.16;

    float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
    color += uSunTint * sunLight * 0.045;
    color += mix(uWindowCool, uWindowWarm, sunLight) * rim * 0.08;
    color *= mix(1.0, 0.72, underside);
    color *= mix(1.0, 1.16, roof);

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createProceduralCityMaterial(): ShaderMaterial {
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSunDirection: { value: new Vector3(0.32, 0.18, -0.93).normalize() },
        uSunTint: { value: new Color('#ff865c') },
        uWindowWarm: { value: new Color('#ffbf78') },
        uWindowCool: { value: new Color('#78d7ed') }
      }
    ]),
    vertexShader: proceduralCityVertexShader,
    fragmentShader: proceduralCityFragmentShader,
    fog: true
  });

  material.name = 'ProceduralCityFacadeMaterial';
  material.userData.shaderVersion = proceduralCityShaderVersion;
  material.userData.compileCount = 0;
  material.onBeforeCompile = (parameters): void => {
    material.userData.compileCount += 1;
    console.groupCollapsed('[ShaderRoam][ProceduralCity][shader-compile] Facade shader prepared');
    console.info('compile', {
      compileCount: material.userData.compileCount,
      shaderVersion: proceduralCityShaderVersion,
      uniforms: Object.keys(parameters.uniforms),
      features: {
        buildingSeed: parameters.vertexShader.includes('aBuildingSeed'),
        districtType: parameters.vertexShader.includes('aDistrictType'),
        instancing: parameters.vertexShader.includes('instanceMatrix'),
        proceduralWindows: parameters.fragmentShader.includes('litWindow'),
        fog: parameters.fragmentShader.includes('fogFactor')
      }
    });
    console.groupEnd();
  };

  return material;
}

const proceduralCityGroundVertexShader = /* glsl */ `
  varying vec3 vGroundWorldPosition;

  #include <fog_pars_vertex>

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;

    vGroundWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`;

const proceduralCityGroundFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uBlockColor;
  uniform vec3 uRoadColor;
  uniform vec3 uRoadWarm;
  uniform vec3 uRoadCool;

  varying vec3 vGroundWorldPosition;

  #include <fog_pars_fragment>

  float hash21(vec2 point) {
    vec3 p3 = fract(vec3(point.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float gridLine(float coordinate, float spacing, float halfWidth, float softness) {
    float distanceToLine = abs(fract(coordinate / spacing + 0.5) - 0.5) * spacing;
    return 1.0 - smoothstep(halfWidth, halfWidth + softness, distanceToLine);
  }

  void main() {
    vec2 world = vGroundWorldPosition.xz;
    float viewDistance = length(cameraPosition.xz - world);
    float localDetail = 1.0 - smoothstep(1450.0, 2850.0, viewDistance);

    float majorRoad = max(
      gridLine(world.x, 640.0, 28.0, 3.0),
      gridLine(world.y, 640.0, 28.0, 3.0)
    );
    float localStreet = max(
      gridLine(world.x, 160.0, 8.0, 2.0),
      gridLine(world.y, 160.0, 8.0, 2.0)
    ) * localDetail;
    float road = max(majorRoad, localStreet);

    vec2 blockIndex = floor(world / 160.0);
    float blockVariation = hash21(blockIndex);
    vec3 blockColor = uBlockColor * mix(0.82, 1.16, blockVariation);
    vec3 color = mix(blockColor, uRoadColor, road);

    float majorLaneX = gridLine(world.x, 640.0, 1.2, 1.5);
    float majorLaneZ = gridLine(world.y, 640.0, 1.2, 1.5);
    float localLaneX = gridLine(world.x, 160.0, 0.7, 1.2) * localDetail;
    float localLaneZ = gridLine(world.y, 160.0, 0.7, 1.2) * localDetail;
    float laneDashX = step(0.2, fract(world.y / 48.0)) * step(fract(world.y / 48.0), 0.68);
    float laneDashZ = step(0.2, fract(world.x / 48.0)) * step(fract(world.x / 48.0), 0.68);
    color += uRoadWarm * majorLaneX * laneDashX * 0.22;
    color += uRoadCool * majorLaneZ * laneDashZ * 0.2;
    color += uRoadWarm * localLaneX * 0.035;
    color += uRoadCool * localLaneZ * 0.03;

    float blockEdge = max(
      gridLine(world.x - 12.0, 160.0, 1.0, 1.5),
      gridLine(world.y - 12.0, 160.0, 1.0, 1.5)
    ) * localDetail * (1.0 - road);
    color += mix(uRoadCool, uRoadWarm, blockVariation) * blockEdge * 0.025;

    gl_FragColor = vec4(color, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createProceduralCityGroundMaterial(): ShaderMaterial {
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uBlockColor: { value: new Color('#10151d') },
        uRoadColor: { value: new Color('#17141f') },
        uRoadWarm: { value: new Color('#ff8f5f') },
        uRoadCool: { value: new Color('#73c9dc') }
      }
    ]),
    vertexShader: proceduralCityGroundVertexShader,
    fragmentShader: proceduralCityGroundFragmentShader,
    fog: true
  });

  material.name = 'ProceduralCityGroundMaterial';
  material.userData.shaderVersion = proceduralCityShaderVersion;
  material.userData.compileCount = 0;
  material.onBeforeCompile = (parameters): void => {
    material.userData.compileCount += 1;
    console.groupCollapsed('[ShaderRoam][ProceduralCity][shader-compile] Ground shader prepared');
    console.info('compile', {
      compileCount: material.userData.compileCount,
      shaderVersion: proceduralCityShaderVersion,
      uniforms: Object.keys(parameters.uniforms),
      features: {
        worldGrid: parameters.fragmentShader.includes('gridLine'),
        roadHierarchy: parameters.fragmentShader.includes('majorRoad'),
        detailFade: parameters.fragmentShader.includes('localDetail'),
        fog: parameters.fragmentShader.includes('fogFactor')
      }
    });
    console.groupEnd();
  };

  return material;
}
