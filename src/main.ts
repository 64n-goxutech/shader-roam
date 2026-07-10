import './style.css';
import { Experience } from './engine/Experience';
import { defaultExperienceConfig } from './config/experienceConfig';
import { sunsetRenderDiagnosticsVersion } from './diagnostics/renderDiagnostics';
import type { AtmosphereDebugMode } from './shaders/sunsetSky';

interface ShaderRoamDebugApi {
  version: string;
  dump: () => ReturnType<Experience['dumpDiagnostics']>;
  snapshot: () => ReturnType<Experience['getDiagnostics']>;
  setAtmosphereDebugMode: (mode: AtmosphereDebugMode) => void;
}

declare global {
  interface Window {
    __shaderRoamDebug: ShaderRoamDebugApi;
  }
}

console.info('[ShaderRoam][bootstrap] Module loaded.', {
  diagnosticsVersion: sunsetRenderDiagnosticsVersion,
  moduleUrl: import.meta.url,
  mode: import.meta.env.MODE,
  dev: import.meta.env.DEV,
  page: window.location.href
});

window.addEventListener('error', (event) => {
  console.error('[ShaderRoam][window:error]', {
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[ShaderRoam][window:unhandledrejection]', event.reason);
});

const canvas = document.querySelector<HTMLCanvasElement>('#scene');

if (!canvas) {
  throw new Error('Missing #scene canvas.');
}

const experience = new Experience({
  canvas,
  config: defaultExperienceConfig,
  hud: {
    speed: document.querySelector<HTMLElement>('#hud-speed'),
    altitude: document.querySelector<HTMLElement>('#hud-altitude'),
    environment: document.querySelector<HTMLElement>('#hud-environment')
  }
});

experience.start();

window.__shaderRoamDebug = {
  version: sunsetRenderDiagnosticsVersion,
  dump: () => experience.dumpDiagnostics(),
  snapshot: () => experience.getDiagnostics(),
  setAtmosphereDebugMode: (mode) => experience.setAtmosphereDebugMode(mode)
};

console.info('[ShaderRoam][bootstrap] Debug API ready.', {
  api: 'window.__shaderRoamDebug',
  commands: {
    dump: 'window.__shaderRoamDebug.dump()',
    normal: 'window.__shaderRoamDebug.setAtmosphereDebugMode(0)',
    cloudLayerIntersection: 'window.__shaderRoamDebug.setAtmosphereDebugMode(1)',
    integratedCloudOpacity: 'window.__shaderRoamDebug.setAtmosphereDebugMode(2)'
  }
});
