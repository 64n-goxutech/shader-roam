import './style.css';
import { Experience } from './engine/Experience';
import { defaultExperienceConfig } from './config/experienceConfig';
import { coreRenderDiagnosticsVersion } from './diagnostics/renderDiagnostics';

interface ShaderRoamDebugApi {
  version: string;
  dump: () => ReturnType<Experience['dumpDiagnostics']>;
  snapshot: () => ReturnType<Experience['getDiagnostics']>;
}

declare global {
  interface Window {
    __shaderRoamDebug: ShaderRoamDebugApi;
  }
}

console.info('[ShaderRoam][bootstrap] Module loaded.', {
  diagnosticsVersion: coreRenderDiagnosticsVersion,
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
  config: defaultExperienceConfig
});

experience.start();

window.__shaderRoamDebug = {
  version: coreRenderDiagnosticsVersion,
  dump: () => experience.dumpDiagnostics(),
  snapshot: () => experience.getDiagnostics()
};

console.info('[ShaderRoam][bootstrap] Debug API ready.', {
  api: 'window.__shaderRoamDebug',
  commands: {
    dump: 'window.__shaderRoamDebug.dump()',
    snapshot: 'window.__shaderRoamDebug.snapshot()'
  }
});
