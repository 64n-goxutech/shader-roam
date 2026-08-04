import { Vector2, WebGLRenderer } from 'three';

export const coreRenderDiagnosticsVersion = 'core-drive-render-2026-08-04.1';

export interface FramebufferPixelSample {
  name: string;
  pixel: [number, number];
  rgba: [number, number, number, number];
  hex: string;
}

export interface FramebufferReadback {
  drawingBufferSize: [number, number];
  samples: FramebufferPixelSample[];
  glError: number;
  error?: string;
}

interface InternalProgramDiagnostics {
  runnable?: boolean;
  programLog?: string;
  vertexShader?: { log?: string };
  fragmentShader?: { log?: string };
}

interface InternalWebGLProgram {
  id: number;
  name: string;
  usedTimes: number;
  program: unknown;
  diagnostics?: InternalProgramDiagnostics;
}

export function installRendererConsoleDiagnostics(
  renderer: WebGLRenderer,
  canvas: HTMLCanvasElement
): () => void {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const highFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);

  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (context, program, vertexShader, fragmentShader): void => {
    console.group('[ShaderRoam][WebGL][shader-error] Shader program failed to link');
    console.error('program', {
      glError: context.getError(),
      linkStatus: context.getProgramParameter(program, context.LINK_STATUS),
      validateStatus: context.getProgramParameter(program, context.VALIDATE_STATUS),
      programLog: context.getProgramInfoLog(program)
    });
    console.error('vertex shader', {
      log: context.getShaderInfoLog(vertexShader),
      source: context.getShaderSource(vertexShader)
    });
    console.error('fragment shader', {
      log: context.getShaderInfoLog(fragmentShader),
      source: context.getShaderSource(fragmentShader)
    });
    console.groupEnd();
  };

  console.groupCollapsed('[ShaderRoam][WebGL][init] Renderer and GPU capabilities');
  console.info('diagnostics version', coreRenderDiagnosticsVersion);
  console.info('context', {
    webgl2: renderer.capabilities.isWebGL2,
    contextAttributes: gl.getContextAttributes(),
    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER),
    version: gl.getParameter(gl.VERSION),
    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
  });
  console.info('limits', {
    precision: renderer.capabilities.precision,
    fragmentHighFloat: highFloat
      ? { precision: highFloat.precision, rangeMin: highFloat.rangeMin, rangeMax: highFloat.rangeMax }
      : null,
    maxTextures: renderer.capabilities.maxTextures,
    maxTextureSize: renderer.capabilities.maxTextureSize,
    maxAttributes: renderer.capabilities.maxAttributes,
    maxVaryings: renderer.capabilities.maxVaryings,
    maxVertexUniforms: renderer.capabilities.maxVertexUniforms,
    maxFragmentUniforms: renderer.capabilities.maxFragmentUniforms,
    maxSamples: renderer.capabilities.maxSamples
  });
  console.groupEnd();

  const handleContextLost = (event: Event): void => {
    const statusMessage = (event as WebGLContextEvent).statusMessage;
    console.error('[ShaderRoam][WebGL][context-lost]', { statusMessage, event });
  };
  const handleContextRestored = (): void => {
    console.warn('[ShaderRoam][WebGL][context-restored] WebGL context was restored.');
  };

  canvas.addEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextrestored', handleContextRestored);

  return (): void => {
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    renderer.debug.onShaderError = null;
  };
}

export function getRendererProgramDiagnostics(renderer: WebGLRenderer) {
  const gl = renderer.getContext();
  const programs = (renderer.info.programs ?? []) as unknown as InternalWebGLProgram[];

  return programs.map((program) => {
    const nativeProgram = program.program as WebGLProgram | null;
    let linkStatus: boolean | null = null;
    let activeUniforms: string[] = [];

    if (nativeProgram) {
      try {
        linkStatus = Boolean(gl.getProgramParameter(nativeProgram, gl.LINK_STATUS));
        const count = Number(gl.getProgramParameter(nativeProgram, gl.ACTIVE_UNIFORMS));
        activeUniforms = Array.from({ length: count }, (_, index) =>
          gl.getActiveUniform(nativeProgram, index)?.name ?? `<unknown-${index}>`
        );
      } catch (error) {
        console.error('[ShaderRoam][WebGL][program-inspection-error]', error);
      }
    }

    return {
      id: program.id,
      name: program.name,
      usedTimes: program.usedTimes,
      linkStatus,
      activeUniforms,
      diagnostics: program.diagnostics ?? null
    };
  });
}

export function getRendererDiagnostics(renderer: WebGLRenderer) {
  const cssSize = renderer.getSize(new Vector2());
  const drawingBufferSize = renderer.getDrawingBufferSize(new Vector2());

  return {
    pixelRatio: renderer.getPixelRatio(),
    cssSize: [cssSize.x, cssSize.y] as [number, number],
    drawingBufferSize: [drawingBufferSize.x, drawingBufferSize.y] as [number, number],
    outputColorSpace: renderer.outputColorSpace,
    render: { ...renderer.info.render },
    memory: { ...renderer.info.memory },
    programs: getRendererProgramDiagnostics(renderer)
  };
}

export function readFramebufferPixelSamples(renderer: WebGLRenderer): FramebufferReadback {
  const gl = renderer.getContext();
  const size = renderer.getDrawingBufferSize(new Vector2());
  const width = Math.max(1, Math.floor(size.x));
  const height = Math.max(1, Math.floor(size.y));
  const probes = [
    { name: 'center', x: 0.5, y: 0.5 },
    { name: 'upper-center', x: 0.5, y: 0.82 },
    { name: 'lower-center', x: 0.5, y: 0.18 },
    { name: 'center-left', x: 0.22, y: 0.5 },
    { name: 'center-right', x: 0.78, y: 0.5 }
  ] as const;

  try {
    const samples = probes.map((probe): FramebufferPixelSample => {
      const x = Math.min(width - 1, Math.max(0, Math.floor(probe.x * width)));
      const y = Math.min(height - 1, Math.max(0, Math.floor(probe.y * height)));
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const rgba: [number, number, number, number] = [pixel[0], pixel[1], pixel[2], pixel[3]];

      return {
        name: probe.name,
        pixel: [x, y],
        rgba,
        hex: `#${rgba
          .slice(0, 3)
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('')}`
      };
    });

    return {
      drawingBufferSize: [width, height],
      samples,
      glError: gl.getError()
    };
  } catch (error) {
    return {
      drawingBufferSize: [width, height],
      samples: [],
      glError: gl.getError(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
