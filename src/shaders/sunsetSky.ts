import { Vector2, Vector3 } from 'three';

export type AtmosphereDebugMode = 0 | 1 | 2;

export const sunsetSkyShaderVersion = 'sunset-sky-2026-07-16.2';

export const sunsetCloudLayerBounds = {
  bottom: 120,
  top: 1160
} as const;

export const sunsetCloudProfile = {
  coverageStart: 0.48,
  coverageEnd: 0.64,
  billowStart: 0.3,
  billowEnd: 0.72,
  billowFloor: 0.58,
  detailInfluence: 0.08,
  extinction: 0.0015,
  coreShadowStart: 0.18,
  coreShadowEnd: 0.72,
  coreShadowStrength: 0.32
} as const;

export const sunsetSkyUniforms = {
  iTime: { value: 0 },
  iResolution: { value: new Vector2(1, 1) },
  uCameraPosition: { value: new Vector3() },
  vehiclePosition: { value: new Vector3() },
  sunDirection: { value: new Vector3(0.32, 0.18, -0.93).normalize() },
  uAtmosphereDebugMode: { value: 0 as AtmosphereDebugMode }
};

export const sunsetSkyQualityDefines = {
  low: {
    CLOUD_MARCH_STEPS: 12,
    CLOUD_FBM_OCTAVES: 3,
    CLOUD_FAR_DISTANCE: '3200.0',
    CLOUD_DETAIL_LIGHTING: 0
  },
  medium: {
    CLOUD_MARCH_STEPS: 18,
    CLOUD_FBM_OCTAVES: 3,
    CLOUD_FAR_DISTANCE: '4200.0',
    CLOUD_DETAIL_LIGHTING: 0
  },
  high: {
    CLOUD_MARCH_STEPS: 28,
    CLOUD_FBM_OCTAVES: 4,
    CLOUD_FAR_DISTANCE: '5200.0',
    CLOUD_DETAIL_LIGHTING: 1
  }
} as const;

export const sunsetSkyVertexShader = /* glsl */ `
  uniform vec3 uCameraPosition;

  varying vec3 vWorldDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(worldPosition.xyz - uCameraPosition);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const sunsetSkyFragmentShader = /* glsl */ `
  precision highp float;

  uniform float iTime;
  uniform vec2 iResolution;
  uniform vec3 uCameraPosition;
  uniform vec3 vehiclePosition;
  uniform vec3 sunDirection;
  uniform int uAtmosphereDebugMode;

  varying vec3 vWorldDirection;

  #ifndef CLOUD_MARCH_STEPS
  #define CLOUD_MARCH_STEPS 12
  #endif

  #ifndef CLOUD_FBM_OCTAVES
  #define CLOUD_FBM_OCTAVES 3
  #endif

  #ifndef CLOUD_FAR_DISTANCE
  #define CLOUD_FAR_DISTANCE 3200.0
  #endif

  #ifndef CLOUD_DETAIL_LIGHTING
  #define CLOUD_DETAIL_LIGHTING 0
  #endif

  const float CLOUD_BOTTOM = ${sunsetCloudLayerBounds.bottom.toFixed(1)};
  const float CLOUD_TOP = ${sunsetCloudLayerBounds.top.toFixed(1)};
  const float FAR_DISTANCE = CLOUD_FAR_DISTANCE;
  const float CLOUD_COVERAGE_START = ${sunsetCloudProfile.coverageStart.toFixed(2)};
  const float CLOUD_COVERAGE_END = ${sunsetCloudProfile.coverageEnd.toFixed(2)};
  const float CLOUD_BILLOW_START = ${sunsetCloudProfile.billowStart.toFixed(2)};
  const float CLOUD_BILLOW_END = ${sunsetCloudProfile.billowEnd.toFixed(2)};
  const float CLOUD_BILLOW_FLOOR = ${sunsetCloudProfile.billowFloor.toFixed(2)};
  const float CLOUD_DETAIL_INFLUENCE = ${sunsetCloudProfile.detailInfluence.toFixed(2)};
  const float CLOUD_EXTINCTION = ${sunsetCloudProfile.extinction.toFixed(4)};
  const float CLOUD_CORE_SHADOW_START = ${sunsetCloudProfile.coreShadowStart.toFixed(2)};
  const float CLOUD_CORE_SHADOW_END = ${sunsetCloudProfile.coreShadowEnd.toFixed(2)};
  const float CLOUD_CORE_SHADOW_STRENGTH = ${sunsetCloudProfile.coreShadowStrength.toFixed(2)};

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);

    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, u.x);
    float nx10 = mix(n010, n110, u.x);
    float nx01 = mix(n001, n101, u.x);
    float nx11 = mix(n011, n111, u.x);
    float nxy0 = mix(nx00, nx10, u.y);
    float nxy1 = mix(nx01, nx11, u.y);

    return mix(nxy0, nxy1, u.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float weightSum = 0.0;
    float amplitude = 0.55;
    float frequency = 1.0;

    #if CLOUD_FBM_OCTAVES >= 1
    value += amplitude * valueNoise(p * frequency);
    weightSum += amplitude;
    frequency *= 2.03;
    amplitude *= 0.52;
    p += vec3(13.7, 5.1, 9.2);
    #endif

    #if CLOUD_FBM_OCTAVES >= 2
    value += amplitude * valueNoise(p * frequency);
    weightSum += amplitude;
    frequency *= 2.03;
    amplitude *= 0.52;
    p += vec3(13.7, 5.1, 9.2);
    #endif

    #if CLOUD_FBM_OCTAVES >= 3
    value += amplitude * valueNoise(p * frequency);
    weightSum += amplitude;
    frequency *= 2.03;
    amplitude *= 0.52;
    p += vec3(13.7, 5.1, 9.2);
    #endif

    #if CLOUD_FBM_OCTAVES >= 4
    value += amplitude * valueNoise(p * frequency);
    weightSum += amplitude;
    frequency *= 2.03;
    amplitude *= 0.52;
    p += vec3(13.7, 5.1, 9.2);
    #endif

    #if CLOUD_FBM_OCTAVES >= 5
    value += amplitude * valueNoise(p * frequency);
    weightSum += amplitude;
    #endif

    return value / max(weightSum, 0.0001);
  }

  float cloudHeightMask(float y) {
    float bottom = smoothstep(CLOUD_BOTTOM, CLOUD_BOTTOM + 160.0, y);
    float top = 1.0 - smoothstep(CLOUD_TOP - 180.0, CLOUD_TOP, y);
    return bottom * top;
  }

  float cloudDensity(vec3 worldPos) {
    vec3 wind = vec3(iTime * 9.0, 0.0, iTime * 26.0);
    vec3 p = worldPos + wind;

    float large = fbm(p * 0.0009 + vec3(0.0, 4.7, 0.0));
    float medium = fbm(p * 0.0022 + vec3(7.0, 2.0, 11.0));

    float shape = large * 0.72 + medium * 0.28;

    #if CLOUD_DETAIL_LIGHTING == 1
    float detail = fbm(p * 0.0065 + vec3(21.0, 3.0, 4.0));
    shape += (detail - 0.5) * CLOUD_DETAIL_INFLUENCE;
    #endif

    float coverage = smoothstep(CLOUD_COVERAGE_START, CLOUD_COVERAGE_END, shape);
    float billow = mix(
      CLOUD_BILLOW_FLOOR,
      1.0,
      smoothstep(CLOUD_BILLOW_START, CLOUD_BILLOW_END, medium)
    );
    float heightMask = cloudHeightMask(worldPos.y);

    return clamp(coverage * billow * heightMask, 0.0, 1.0);
  }

  bool cloudSegment(vec3 ro, vec3 rd, out float t0, out float t1) {
    float invY = 1.0 / max(abs(rd.y), 0.0001) * sign(rd.y);
    float a = (CLOUD_BOTTOM - ro.y) * invY;
    float b = (CLOUD_TOP - ro.y) * invY;
    t0 = max(0.0, min(a, b));
    t1 = min(FAR_DISTANCE, max(a, b));

    if (abs(rd.y) < 0.0001) {
      t0 = 0.0;
      t1 = FAR_DISTANCE;
      return ro.y > CLOUD_BOTTOM && ro.y < CLOUD_TOP;
    }

    return t1 > t0;
  }

  vec3 skyColor(vec3 rd) {
    vec3 horizon = vec3(0.96, 0.27, 0.11);
    vec3 upperSky = vec3(0.28, 0.11, 0.36);
    vec3 zenith = vec3(0.07, 0.08, 0.20);
    vec3 sky = mix(horizon, upperSky, smoothstep(-0.08, 0.72, rd.y));
    sky = mix(sky, zenith, smoothstep(0.42, 1.0, rd.y));

    float horizonBand = exp(-abs(rd.y) * 8.0);
    sky += vec3(0.36, 0.06, 0.025) * horizonBand;

    float sunDot = max(dot(rd, normalize(sunDirection)), 0.0);
    sky += vec3(1.0, 0.24, 0.05) * pow(sunDot, 9.0) * 0.72;
    sky += vec3(1.0, 0.82, 0.46) * pow(sunDot, 360.0) * 3.2;

    return sky;
  }

  vec4 marchClouds(vec3 ro, vec3 rd, vec3 bg) {
    float t0;
    float t1;

    if (!cloudSegment(ro, rd, t0, t1)) {
      return vec4(bg, 0.0);
    }

    float travel = t1 - t0;
    float stepSize = travel / float(CLOUD_MARCH_STEPS);
    float jitter = hash13(vec3(gl_FragCoord.xy, 17.0)) * stepSize;
    float t = t0 + jitter;

    vec3 color = vec3(0.0);
    float alpha = 0.0;
    vec3 sunDir = normalize(sunDirection);

    for (int i = 0; i < CLOUD_MARCH_STEPS; i++) {
      vec3 pos = ro + rd * t;
      float density = cloudDensity(pos);

      if (density > 0.015) {

        #if CLOUD_DETAIL_LIGHTING == 1
        float ahead = cloudDensity(pos + sunDir * 120.0);
        float light = clamp((density - ahead) * 2.0 + 0.52, 0.18, 1.0);
        #else
        float heightLight = smoothstep(CLOUD_BOTTOM, CLOUD_TOP, pos.y);
        float forwardLight = pow(max(dot(rd, sunDir), 0.0), 2.0);
        float light = clamp(0.50 + heightLight * 0.22 + forwardLight * 0.18, 0.28, 0.94);
        #endif

        float coreShadow = smoothstep(
          CLOUD_CORE_SHADOW_START,
          CLOUD_CORE_SHADOW_END,
          density
        ) * CLOUD_CORE_SHADOW_STRENGTH;
        light = clamp(light - coreShadow, 0.14, 1.0);

        float silver = pow(max(dot(rd, sunDir), 0.0), 4.0) * (0.42 - coreShadow * 0.45);

        vec3 shadow = vec3(0.12, 0.09, 0.24);
        vec3 lit = vec3(1.0, 0.63, 0.36);
        vec3 cloudCol = mix(shadow, lit, light);
        cloudCol += vec3(1.0, 0.55, 0.18) * silver;

        float fog = 1.0 - exp(-0.00012 * t);
        cloudCol = mix(cloudCol, bg, fog * 0.45);

        float sampleAlpha = 1.0 - exp(-density * stepSize * CLOUD_EXTINCTION);
        sampleAlpha *= 1.0 - alpha;
        color += cloudCol * sampleAlpha;
        alpha += sampleAlpha;

        if (alpha > 0.985) {
          break;
        }
      }

      t += stepSize;
      if (t > t1) {
        break;
      }
    }

    vec3 finalColor = mix(bg, color / max(alpha, 0.0001), alpha);
    return vec4(finalColor, alpha);
  }

  void main() {
    vec3 rd = normalize(vWorldDirection);
    vec3 ro = uCameraPosition;

    vec3 bg = skyColor(rd);

    if (uAtmosphereDebugMode == 1) {
      float debugT0;
      float debugT1;
      bool intersectsCloudLayer = cloudSegment(ro, rd, debugT0, debugT1);
      float travelRatio = intersectsCloudLayer
        ? clamp((debugT1 - debugT0) / FAR_DISTANCE, 0.0, 1.0)
        : 0.0;
      vec3 debugColor = intersectsCloudLayer
        ? mix(vec3(0.04, 0.16, 0.34), vec3(0.12, 1.0, 0.28), travelRatio)
        : vec3(1.0, 0.04, 0.04);
      gl_FragColor = vec4(debugColor, 1.0);
      return;
    }

    vec4 clouds = marchClouds(ro, rd, bg);

    if (uAtmosphereDebugMode == 2) {
      gl_FragColor = vec4(vec3(clouds.a), 1.0);
      return;
    }

    float horizonMist = (1.0 - smoothstep(0.02, 0.24, abs(rd.y))) * 0.30;
    vec3 color = mix(clouds.rgb, vec3(0.98, 0.37, 0.18), horizonMist);

    color = pow(color, vec3(0.92));
    gl_FragColor = vec4(color, 1.0);
  }
`;
