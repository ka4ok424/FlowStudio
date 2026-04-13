/** Widget values stored per node */
export interface BaseWidgetValues {
  _previewUrl?: string;
  _preview?: string;
  _history?: string[];
  _historyIndex?: number;
  _genTime?: number;
  _lastSeed?: number;
  _pendingPromptId?: string | null;
  _lastInputHash?: string;
  _refCount?: number;
  _maskUrl?: string;
  portraitUrl?: string;
}

export interface GenerationWidgetValues extends BaseWidgetValues {
  model?: string;
  steps?: number;
  cfg?: number;
  seed?: string;
  width?: number;
  height?: number;
  denoise?: number;
  negativePrompt?: string;
  sampler?: string;
  scheduler?: string;
}

export interface LtxVideoWidgetValues extends GenerationWidgetValues {
  frames?: number;
  fps?: number;
  stg?: number;
  maxShift?: number;
  baseShift?: number;
  frameStrength?: number;
  maxLength?: number;
}

export interface InpaintWidgetValues extends GenerationWidgetValues {
  modelType?: string;
  samPrompt?: string;
}

export interface RemoveBgWidgetValues extends BaseWidgetValues {
  model?: string;
}

export interface EnhanceWidgetValues extends BaseWidgetValues {
  scale?: number;
  steps?: number;
  restoration?: number;
  cfg?: number;
  prompt?: string;
  negPrompt?: string;
  colorFix?: string;
  seed?: string;
}

/** ComfyUI workflow format */
export interface ComfyWorkflow {
  [nodeId: string]: {
    class_type: string;
    inputs: Record<string, any>;
  };
}

/** Properties component props */
export interface PropsComponentProps {
  nodeId: string;
  data: any;
}
